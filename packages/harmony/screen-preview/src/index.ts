/** Automation-preset-only HTTP provider for the current HarmonyOS screen image and taps on it. */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'

export const name = 'harmony-screen-preview'
export const inject = ['subprocess', 'webServer', 'connection']
const SCREENSHOT_PATH = '/api/device-preview/screenshot'
const TAP_CHANNEL = '/device-preview'
const TAP_ENDPOINT = 'tap'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

/** Screenshot-provider configuration. */
export interface Config {
  /** Optional absolute DevEco CLI executable path. */
  devecoCliExecutable?: string
  /** Optional serial of the authorized target device. */
  deviceSerial?: string
  /** Largest accepted screenshot in bytes. */
  maxBytes?: number
  /** Screenshot and click command deadline in milliseconds. */
  timeoutMs?: number
}
export const Config: z<Config> = z.object({
  devecoCliExecutable: z.string(),
  deviceSerial: z.string(),
  maxBytes: z.natural().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
})

/**
 * Outcome of parsing one tap request: the relative target position or a
 * named rejection for malformed input.
 */
export type TapPositionOutcome = { x: number; y: number } | 'invalid'

/**
 * Parse a decoded RPC payload into a relative screen position.
 * @param payload - decoded request payload from the Connection carrier.
 * @returns coordinates in `[0, 1)` per axis, or the named rejection.
 */
export function parseTapPosition(payload: unknown): TapPositionOutcome {
  if (typeof payload !== 'object' || payload === null || !('x' in payload) || !('y' in payload)) return 'invalid'
  const x = (payload as Record<string, unknown>).x
  const y = (payload as Record<string, unknown>).y
  if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x >= 1 || y < 0 || y >= 1) return 'invalid'
  return { x, y }
}

/**
 * Read pixel dimensions from a PNG header.
 * @param bytes - a complete PNG file.
 * @returns the IHDR width and height, or `undefined` when the signature or
 *          the header cannot be read.
 */
export function parsePngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return undefined
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** Serve one fresh, validated PNG per request and relay relative-position taps to the device. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-harmony-preview-'))
  const current = join(directory, 'current.png')
  const lifecycle = new AbortController()
  let inFlight: Promise<Preview> | undefined
  let lastPreview: Preview | undefined
  let deviceOperation: Promise<void> = Promise.resolve()
  const runExclusive = <T>(operation: (signal: AbortSignal) => Promise<T>, requestSignal?: AbortSignal): Promise<T> => {
    const signal = requestSignal === undefined
      ? lifecycle.signal
      : AbortSignal.any([lifecycle.signal, requestSignal])
    const start = (): Promise<T> => {
      signal.throwIfAborted()
      return operation(signal)
    }
    const result = deviceOperation.then(start, start)
    deviceOperation = result.then(() => undefined, () => undefined)
    return result
  }
  const capture = (): Promise<Preview> => {
    inFlight ??= runExclusive(signal => takeScreenshot(ctx, config, directory, current, signal))
      .finally(() => { inFlight = undefined })
    return inFlight
  }
  ctx.effect(() => () => rm(directory, { recursive: true, force: true }), 'harmony-screen-preview: temporary screenshots')
  ctx.effect(() => async () => {
    lifecycle.abort(new Error('harmony screen preview disposed'))
    await deviceOperation
  }, 'harmony-screen-preview: device operations')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: SCREENSHOT_PATH, handler: async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return }
    try {
      const preview = await capture()
      lastPreview = preview
      if (request.headers['if-none-match'] === preview.etag) { response.writeHead(304, cacheHeaders(preview)); response.end(); return }
      response.writeHead(200, { ...cacheHeaders(preview), 'content-type': 'image/png', 'content-length': String(preview.bytes.length) })
      response.end(request.method === 'HEAD' ? undefined : preview.bytes)
    } catch (error) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      response.end(error instanceof Error ? error.message : 'device screenshot failed')
    }
  } }), 'harmony-screen-preview: screenshot route')
  ctx.connection.rpc.handle(TAP_CHANNEL, async (endpoint, payload, requestSignal) => {
    if (endpoint !== TAP_ENDPOINT) {
      return { ok: false, error: { code: 'bad-request', message: `unknown device-preview operation ${JSON.stringify(endpoint)}`, details: { issues: [] } } }
    }
    const position = parseTapPosition(payload)
    if (position === 'invalid') {
      return { ok: false, error: { code: 'bad-request', message: 'tap payload must be {"x": number, "y": number} with both values in [0, 1)', details: { issues: [] } } }
    }
    const preview = lastPreview
    if (preview === undefined) {
      return { ok: false, error: { code: 'internal', message: 'no device screenshot yet', details: {} } }
    }
    const dimensions = parsePngDimensions(preview.bytes)
    if (dimensions === undefined) {
      return { ok: false, error: { code: 'internal', message: 'device screenshot is not a readable PNG image', details: {} } }
    }
    const x = Math.floor(position.x * dimensions.width)
    const y = Math.floor(position.y * dimensions.height)
    try {
      const result = await runExclusive(signal => runCli(ctx, config, ['ui', 'click', String(x), String(y), ...config.deviceSerial === undefined ? [] : ['--device', config.deviceSerial]], directory, signal), requestSignal)
      if (result.exitCode !== 0) {
        ctx.logger.warn(`device-preview: tap failed at device=(${x}, ${y}) exitCode=${result.exitCode}`)
        return { ok: false, error: { code: 'internal', message: 'devecocli could not tap the device screen', details: {} } }
      }
      return { ok: true, value: null }
    } catch (error) {
      if (requestSignal.aborted || lifecycle.signal.aborted) {
        return { ok: false, error: { code: 'cancelled', message: 'device tap cancelled', details: {} } }
      }
      ctx.logger.warn(`device-preview: tap failed at device=(${x}, ${y}): ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : 'device tap failed', details: {} } }
    }
  }, { authority: 'trusted-host' })
}

interface Preview { bytes: Buffer; etag: string; modified: Date }
async function takeScreenshot(ctx: Context, config: Config, directory: string, current: string, signal: AbortSignal): Promise<Preview> {
  const staging = join(directory, `capture-${crypto.randomUUID()}.png`)
  const result = await runCli(ctx, config, ['ui', 'screenshot', ...config.deviceSerial === undefined ? [] : ['--device', config.deviceSerial], '--path', staging], directory, signal)
  if (result.exitCode !== 0) throw new Error('devecocli could not capture the device screen')
  const info = await stat(staging)
  if (info.size === 0 || info.size > (config.maxBytes ?? DEFAULT_MAX_BYTES)) throw new Error('device screenshot has an invalid size')
  const bytes = await readFile(staging)
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('device screenshot is not a PNG image')
  await rename(staging, current)
  const modified = (await stat(current)).mtime
  return { bytes, modified, etag: `\"${createHash('sha256').update(bytes).digest('hex')}\"` }
}
function cacheHeaders(preview: Preview): Record<string, string> { return { etag: preview.etag, 'last-modified': preview.modified.toUTCString(), 'cache-control': 'private, max-age=0, must-revalidate' } }

interface CliResult { stdout: string; stderr: string; exitCode: number }
function collectedText(stream: SubprocessHandle['collected']['stdout']): string {
  return stream === undefined ? '' : stream.readFrom(0).text
}

async function runCli(ctx: Context, config: Config, args: string[], cwd: string, signal: AbortSignal): Promise<CliResult> {
  const operationSignal = AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS)])
  const executable = config.devecoCliExecutable ?? await ctx.subprocess.resolveExecutable('devecocli', undefined, operationSignal)
  const handle = ctx.subprocess.spawn({ argv: [executable, ...args], cwd, signal: operationSignal, graceMs: 3_000, stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } } satisfies SubprocessSpawnSpec)
  const outcome = await handle.done
  const stdout = collectedText(handle.collected.stdout)
  const stderr = collectedText(handle.collected.stderr)
  return { stdout, stderr, exitCode: outcome.exitCode ?? -1 }
}
