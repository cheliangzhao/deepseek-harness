/** HarmonyOS provider for the platform-neutral device automation service. */
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  DeviceAutomationPreparation,
  DeviceAutomationPreparationProgress,
  DeviceAutomationProvider,
  DeviceScreenshot,
  RelativeTapPosition,
} from '@fadinglight/dsh-device-automation-runtime'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'

export const name = 'device-automation-harmonyos'
export const inject = ['deviceAutomation', 'subprocess']

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_SKILL_SYNC_TIMEOUT_MS = 120_000
const AUTOMATION_MODE_SKILLS = [
  'hmos-local-test',
  'hmos-instrument-test',
  'hmos-cppcrash-analysis',
  'hmos-jscrash-analysis',
  'hmos-jsleak-analysis',
  'hmos-memleak-analysis',
  'hmos-native-memleak-analysis',
  'hmos-fdleak-analysis',
  'hmos-apifault-analysis',
  'hmos-appfreeze-analysis',
] as const
const DEVECO_CLI_INSTALL_COMMAND = 'npm install --global @deveco/deveco-cli'
const DEVECO_CLI_INSTALL_URL = 'https://www.npmjs.com/package/@deveco/deveco-cli'

/** HarmonyOS provider configuration. */
export interface Config {
  /** Optional absolute DevEco CLI executable path. */
  devecoCliExecutable?: string
  /** Optional serial of the authorized target device. */
  deviceSerial?: string
  /** Largest accepted screenshot in bytes. */
  maxBytes?: number
  /** Screenshot and click command deadline in milliseconds. */
  timeoutMs?: number
  /** Deadline for one HarmonyOS skill synchronization command. */
  skillSyncTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  devecoCliExecutable: z.string(),
  deviceSerial: z.string(),
  maxBytes: z.natural().min(1).default(DEFAULT_MAX_BYTES),
  timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
  skillSyncTimeoutMs: z.natural().min(1).default(DEFAULT_SKILL_SYNC_TIMEOUT_MS),
})

/**
 * Read pixel dimensions from a PNG header.
 * @param bytes - complete candidate PNG bytes.
 * @returns non-zero IHDR dimensions, or `undefined` for an invalid header.
 */
export function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length < 24 || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width === 0 || height === 0) return undefined
  return { width, height }
}

class HarmonyOsDeviceProvider implements DeviceAutomationProvider {
  readonly name = 'harmonyos'
  readonly platform = 'harmonyos'
  private readonly lifecycle = new AbortController()
  private operationTail: Promise<void> = Promise.resolve()
  private preparation: Promise<DeviceAutomationPreparation> | undefined
  private preparationProgressValue: DeviceAutomationPreparationProgress = { phase: 'idle' }
  private lastScreenshot: DeviceScreenshot | undefined

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly directory: string,
  ) {}

  preparationProgress(): DeviceAutomationPreparationProgress {
    return this.preparationProgressValue
  }

  async prepare(signal: AbortSignal): Promise<DeviceAutomationPreparation> {
    signal.throwIfAborted()
    let preparation = this.preparation
    if (preparation === undefined) {
      const operation = this.prepareOnce()
      this.preparation = operation
      preparation = operation
      void operation.then((result) => {
        if (result.status === 'ready') {
          this.preparationProgressValue = { phase: 'ready' }
        } else {
          this.preparationProgressValue = {
            phase: 'action-required',
            action: result.action,
            command: result.command,
            url: result.url,
          }
          if (this.preparation === operation) this.preparation = undefined
        }
      }, () => {
        this.preparationProgressValue = { phase: 'failed' }
        if (this.preparation === operation) this.preparation = undefined
      })
    }
    return waitForSignal(preparation, signal)
  }

  async screenshot(signal: AbortSignal): Promise<DeviceScreenshot> {
    const screenshot = await this.runExclusive(async (operationSignal) => {
      const path = join(this.directory, `capture-${crypto.randomUUID()}.png`)
      try {
        const result = await runCli(
          this.ctx,
          this.config,
          ['ui', 'screenshot', ...this.deviceArgs(), '--path', path],
          this.directory,
          operationSignal,
        )
        if (result.exitCode !== 0) throw new Error('devecocli could not capture the device screen')
        const info = await stat(path)
        if (info.size === 0 || info.size > (this.config.maxBytes ?? DEFAULT_MAX_BYTES)) {
          throw new Error('device screenshot has an invalid size')
        }
        const bytes = await readFile(path)
        const dimensions = parsePngDimensions(bytes)
        if (dimensions === undefined) throw new Error('device screenshot is not a readable PNG image')
        return { mediaType: 'image/png' as const, bytes, ...dimensions }
      } finally {
        await rm(path, { force: true })
      }
    }, signal)
    this.lastScreenshot = screenshot
    return screenshot
  }

  async tap(position: RelativeTapPosition, signal: AbortSignal): Promise<void> {
    const screenshot = this.lastScreenshot
    if (screenshot === undefined) throw new Error('capture the device screen before tapping it')
    const x = Math.floor(position.x * screenshot.width)
    const y = Math.floor(position.y * screenshot.height)
    await this.runExclusive(async (operationSignal) => {
      const result = await runCli(
        this.ctx,
        this.config,
        ['ui', 'click', String(x), String(y), ...this.deviceArgs()],
        this.directory,
        operationSignal,
      )
      if (result.exitCode !== 0) throw new Error('devecocli could not tap the device screen')
    }, signal)
  }

  async dispose(): Promise<void> {
    const preparation = this.preparation
    this.lifecycle.abort(new Error('HarmonyOS device automation provider disposed'))
    await this.operationTail
    await preparation?.catch(() => {})
    await rm(this.directory, { recursive: true, force: true })
  }

  private async prepareOnce(): Promise<DeviceAutomationPreparation> {
    this.preparationProgressValue = { phase: 'checking-cli' }
    let executable: string
    try {
      executable = this.config.devecoCliExecutable
        ?? await this.ctx.subprocess.resolveExecutable('devecocli', undefined, this.lifecycle.signal)
    } catch {
      this.lifecycle.signal.throwIfAborted()
      return {
        status: 'action-required',
        action: 'install-cli',
        command: DEVECO_CLI_INSTALL_COMMAND,
        url: DEVECO_CLI_INSTALL_URL,
      }
    }

    const skillDirectory = dshHomePath('device-automation', 'skills')
    await mkdir(skillDirectory, { recursive: true })
    for (const [index, skill] of AUTOMATION_MODE_SKILLS.entries()) {
      this.preparationProgressValue = {
        phase: 'syncing-skills',
        completed: index,
        total: AUTOMATION_MODE_SKILLS.length,
        skill,
      }
      const result = await runCli(
        this.ctx,
        this.config,
        ['skills', 'add', '--skill', skill, '--path', skillDirectory, '--force'],
        this.directory,
        this.lifecycle.signal,
        this.config.skillSyncTimeoutMs ?? DEFAULT_SKILL_SYNC_TIMEOUT_MS,
        executable,
      )
      if (result.exitCode !== 0) {
        throw new Error(`devecocli could not synchronize automation skill ${JSON.stringify(skill)}`)
      }
    }
    return { status: 'ready' }
  }

  private deviceArgs(): string[] {
    return this.config.deviceSerial === undefined ? [] : ['--device', this.config.deviceSerial]
  }

  private runExclusive<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    const operationSignal = AbortSignal.any([this.lifecycle.signal, signal])
    const start = async (): Promise<T> => {
      operationSignal.throwIfAborted()
      return operation(operationSignal)
    }
    const result = this.operationTail.then(start, start)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

/**
 * Register one lifecycle-owned HarmonyOS device provider.
 * @param ctx - context carrying device automation and subprocess services.
 * @param config - executable, device, image, and timeout settings.
 * @returns completion after the provider owns its temporary directory.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-harmony-device-'))
  const provider = new HarmonyOsDeviceProvider(ctx, config, directory)
  try {
    const unregister = ctx.deviceAutomation.registerProvider(provider)
    ctx.effect(() => async () => {
      unregister()
      await provider.dispose()
    }, 'device-automation-harmonyos: provider operations')
  } catch (error) {
    await provider.dispose()
    throw error
  }
}

interface CliResult { stdout: string; stderr: string; exitCode: number }

function collectedText(stream: SubprocessHandle['collected']['stdout']): string {
  return stream === undefined ? '' : stream.readFrom(0).text
}

async function runCli(
  ctx: Context,
  config: Config,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  executableOverride?: string,
): Promise<CliResult> {
  const operationSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(timeoutMs),
  ])
  const executable = executableOverride ?? config.devecoCliExecutable
    ?? await ctx.subprocess.resolveExecutable('devecocli', undefined, operationSignal)
  const handle = ctx.subprocess.spawn({
    argv: [executable, ...args],
    cwd,
    signal: operationSignal,
    graceMs: 3_000,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: 65_536 },
      stderr: { maxBytes: 65_536 },
    },
  } satisfies SubprocessSpawnSpec)
  const outcome = await handle.done
  return {
    stdout: collectedText(handle.collected.stdout),
    stderr: collectedText(handle.collected.stderr),
    exitCode: outcome.exitCode ?? -1,
  }
}

function waitForSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => { reject(asError(signal.reason, 'device automation preparation cancelled')) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      signal.removeEventListener('abort', abort)
      reject(asError(signal.reason, 'device automation preparation cancelled'))
      return
    }
    void operation.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value) },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(asError(error, 'device automation preparation failed')) },
    )
  })
}

function asError(value: unknown, fallback: string): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string') return new Error(value)
  return new Error(fallback, { cause: value })
}
