/** One model-facing, allow-listed `devecocli` command runner. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
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
const ALLOWED_COMMANDS = new Set(['device', 'ui', 'log', 'build', 'run', 'check', 'docs'])

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
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
  graceMs: z.number().default(DEFAULT_GRACE_MS),
  maxOutputBytes: z.number().default(DEFAULT_MAX_OUTPUT_BYTES),
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
    throw new DevEcoCliError('devecocli command must begin with device, ui, log, build, run, check, or docs', 'DEVECO_CLI_COMMAND_REJECTED')
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
      async execute(args, exec) { return runDevEcoCli(ctx, config, args.argv, exec.signal) },
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
 * @returns collected process output and exit facts.
 */
export async function runDevEcoCli(
  ctx: Context,
  config: Config,
  requestedArgv: readonly string[],
  signal: AbortSignal,
): Promise<DevEcoCliResult> {
  const argv = validateDevEcoCliArgv(requestedArgv)
  const executable = config.devecoCliExecutable ?? await ctx.subprocess.resolveExecutable('devecocli', undefined, signal)
  const timeout = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const combined = AbortSignal.any([signal, timeout])
  let handle: SubprocessHandle
  try {
    handle = ctx.subprocess.spawn({
      argv: [executable, ...argv], cwd: process.cwd(), signal: combined, graceMs: config.graceMs ?? DEFAULT_GRACE_MS,
      stdio: { stdin: 'ignore', stdout: { maxBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES }, stderr: { maxBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES } },
    } satisfies SubprocessSpawnSpec)
  } catch (cause) {
    throw new DevEcoCliError('devecocli could not start', 'DEVECO_CLI_SPAWN_FAILED', { cause })
  }
  let outcome
  try { outcome = await handle.done } catch (cause) { throw new DevEcoCliError('devecocli could not start', 'DEVECO_CLI_SPAWN_FAILED', { cause }) }
  if (outcome.exitCode === null) throw new DevEcoCliError(timeout.aborted && !signal.aborted ? 'devecocli timed out' : 'devecocli was cancelled', timeout.aborted && !signal.aborted ? 'DEVECO_CLI_TIMEOUT' : 'DEVECO_CLI_CANCELLED')
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

/** Output schema and plain-text tool presentation. */
function commandOutput() {
  return {
    schema: { type: 'object' as const, additionalProperties: false as const, properties: {
      argv: { type: 'array' as const, required: true as const, items: { type: 'string' as const } }, stdout: { type: 'string' as const, required: true as const }, stderr: { type: 'string' as const, required: true as const }, exitCode: { type: 'number' as const, required: true as const }, stdoutTruncated: { type: 'boolean' as const, required: true as const }, stderrTruncated: { type: 'boolean' as const, required: true as const },
    } },
    render: (_args: unknown, value: { stdout: string; stderr: string; exitCode: number }) => [{ type: 'text' as const, text: value.stdout || value.stderr || `exit ${value.exitCode}` }],
    presentationMeta: (_args: unknown, value: unknown) => value as import('@deepseek-ai/dsh-tools').JsonValue,
  }
}
