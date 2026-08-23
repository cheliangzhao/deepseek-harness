/** One model-facing, allow-listed `devecocli` command runner. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { deadline, MAX_TIMER_DELAY_MS, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-subprocess'

/** Cordis plugin name. */
export const name = 'tool-harmonyos-uitest'
/** Services used to invoke DevEco CLI and publish its guidance. */
export const inject = ['tools', 'subprocess', 'systemPrompt']

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_GRACE_MS = 3_000
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576
const DEVECO_CLI_TIMEOUT = 'DEVECO_CLI_TIMEOUT'

/** Top-level command families documented by the bundled DevEco CLI skill. */
export const SUPPORTED_DEVECO_COMMANDS = [
  'build', 'run', 'update', 'device', 'emulator', 'skills', 'log', 'create', 'init',
  'serve', 'docs', 'ui', 'auth', 'check', 'signature',
] as const

const ALLOWED_COMMANDS = new Set<string>(SUPPORTED_DEVECO_COMMANDS)

/** Execution limits and optional executable override. */
export interface Config {
  /** Enables the tool and its prompt guidance. */
  enabled?: boolean
  /** Explicit DevEco CLI executable; omitted resolves `devecocli` from PATH. */
  devecoCliExecutable?: string
  /** Maximum wall-clock time for one CLI process. */
  timeoutMs?: number
  /** Termination grace passed to the subprocess service. */
  graceMs?: number
  /** Retained diagnostic bytes for each process stream. */
  maxOutputBytes?: number
}

/** Config schema for the DevEco CLI tool. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  devecoCliExecutable: z.string(),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_TIMEOUT_MS),
  graceMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(DEFAULT_GRACE_MS),
  maxOutputBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_OUTPUT_BYTES),
})

/** Completed DevEco CLI command result. */
export interface DevEcoCliResult {
  readonly argv: string[]
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly stdoutTruncated: boolean
  readonly stderrTruncated: boolean
}

/** Typed failures for rejected, failed-to-start, timed-out, or cancelled calls. */
export class DevEcoCliError extends HarnessError {}

/**
 * Reject command families that are not a safe base capability.
 * @param argv - model-supplied DevEco CLI arguments excluding the executable.
 * @returns a mutable argv vector accepted by the runner.
 */
export function validateDevEcoCliArgv(argv: readonly string[]): string[] {
  const command = argv[0]
  if (command === undefined || !ALLOWED_COMMANDS.has(command)) {
    throw new DevEcoCliError(`devecocli command must begin with one of: ${SUPPORTED_DEVECO_COMMANDS.join(', ')}`, 'DEVECO_CLI_COMMAND_REJECTED')
  }
  if (argv.some(argument => argument.includes('\0'))) throw new DevEcoCliError('devecocli arguments cannot contain NUL', 'DEVECO_CLI_ARGUMENT_INVALID')
  return [...argv]
}

/** Register the generic DevEco CLI tool. Command knowledge lives in the installed skill. */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  ctx.effect(() => {
    const unregisterPrompt = ctx.systemPrompt.section({
      name: 'tool:devecocli', order: 110,
      text: 'Use devecocli for HarmonyOS device work. Consult the installed deveco-cli skill for supported commands and safe workflows. Pass every command argument as a separate argv item; do not use shell syntax.',
    })
    const unregisterTool = ctx.tools.register(defineTool({
      name: 'devecocli',
      description: 'Run an allow-listed DevEco CLI command with a plain argv vector.',
      parameters: { argv: { type: 'array', required: true, items: { type: 'string' } } },
      output: commandOutput(),
      async execute(args, exec) { return runDevEcoCli(ctx, config, args.argv, exec.signal, exec.agent?.session.header.cwd) },
    }))
    return () => { unregisterTool(); unregisterPrompt() }
  }, 'devecocli tool registration')
}

/**
 * Invoke one checked argv vector through the subprocess service.
 * @param ctx - plugin context supplying the subprocess service.
 * @param config - configured executable location and process limits.
 * @param requestedArgv - model-supplied CLI arguments excluding the executable.
 * @param signal - cancellation signal from the tool execution.
 * @param cwd - calling agent's workspace, or the process cwd when no agent is attached.
 * @returns collected process output and exit facts.
 */
export async function runDevEcoCli(
  ctx: Context,
  config: Config,
  requestedArgv: readonly string[],
  signal: AbortSignal,
  cwd?: string,
): Promise<DevEcoCliResult> {
  const argv = validateDevEcoCliArgv(requestedArgv)
  using d = deadline(signal, config.timeoutMs ?? DEFAULT_TIMEOUT_MS, DEVECO_CLI_TIMEOUT)
  let handle: SubprocessHandle
  try {
    const executable = config.devecoCliExecutable ?? await ctx.subprocess.resolveExecutable('devecocli', undefined, d.signal)
    handle = ctx.subprocess.spawn({
      argv: [executable, ...argv], cwd: cwd ?? process.cwd(), signal: d.signal, graceMs: config.graceMs ?? DEFAULT_GRACE_MS,
      stdio: { stdin: 'ignore', stdout: { maxBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES }, stderr: { maxBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES } },
    } satisfies SubprocessSpawnSpec)
  } catch (cause) {
    throw abortError(d.signal) ?? new DevEcoCliError('devecocli could not start', 'DEVECO_CLI_SPAWN_FAILED', { cause })
  }
  let outcome
  try { outcome = await handle.done } catch (cause) {
    throw abortError(d.signal) ?? new DevEcoCliError('devecocli could not start', 'DEVECO_CLI_SPAWN_FAILED', { cause })
  }
  if (outcome.exitCode === null) {
    throw abortError(d.signal) ?? new DevEcoCliError(`devecocli was terminated by ${outcome.signal ?? 'an unknown signal'}`, 'DEVECO_CLI_SIGNALLED')
  }
  const cancellation = abortError(d.signal)
  if (cancellation !== undefined) throw cancellation
  const stdout = handle.collected.stdout?.readFrom(0)
  const stderr = handle.collected.stderr?.readFrom(0)
  if (stdout === undefined || stderr === undefined) throw new DevEcoCliError('devecocli did not provide collected output', 'DEVECO_CLI_OUTPUT_UNAVAILABLE')
  return {
    argv,
    stdout: stdout.text,
    stderr: stderr.text,
    exitCode: outcome.exitCode,
    stdoutTruncated: stdout.lossy,
    stderrTruncated: stderr.lossy,
  }
}

/** Convert the owning deadline or caller cancellation into a model-facing error. */
function abortError(signal: AbortSignal): DevEcoCliError | undefined {
  if (timeoutOf(signal, DEVECO_CLI_TIMEOUT) !== undefined) return new DevEcoCliError('devecocli timed out', DEVECO_CLI_TIMEOUT)
  if (signal.aborted) return new DevEcoCliError('devecocli was cancelled', 'DEVECO_CLI_CANCELLED')
  return undefined
}

/** Output schema and plain-text tool presentation. */
function commandOutput() {
  return {
    schema: { type: 'object' as const, additionalProperties: false as const, properties: {
      argv: { type: 'array' as const, required: true as const, items: { type: 'string' as const } }, stdout: { type: 'string' as const, required: true as const }, stderr: { type: 'string' as const, required: true as const }, exitCode: { type: 'number' as const, required: true as const }, stdoutTruncated: { type: 'boolean' as const, required: true as const }, stderrTruncated: { type: 'boolean' as const, required: true as const },
    } },
    render: (_args: unknown, value: DevEcoCliResult) => [{ type: 'text' as const, text: renderCommandOutput(value) }],
    presentationMeta: (_args: unknown, value: unknown) => value as import('@deepseek-ai/dsh-tools').JsonValue,
  }
}

/** Preserve both process streams and tell the model when the retained tail is incomplete. */
function renderCommandOutput(value: Pick<DevEcoCliResult, 'stdout' | 'stderr' | 'exitCode' | 'stdoutTruncated' | 'stderrTruncated'>): string {
  const sections: string[] = []
  const add = (section: string): void => { sections.push(section.endsWith('\n') ? section : `${section}\n`) }
  if (value.stdout.length > 0) add(`stdout:\n${value.stdout}`)
  if (value.stderr.length > 0) add(`stderr:\n${value.stderr}`)
  if (value.stdoutTruncated) add('[stdout truncated; only the retained tail is shown]')
  if (value.stderrTruncated) add('[stderr truncated; only the retained tail is shown]')
  return sections.length > 0 ? sections.join('') : `exit ${value.exitCode}`
}
