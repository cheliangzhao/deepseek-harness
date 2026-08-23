/** Automation-preset-only HTTP provider for a current HarmonyOS screen image. */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'

export const name = 'harmony-screen-preview'
export const inject = ['subprocess', 'webServer']
const PATH = '/api/device-preview/screenshot'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

/** Screenshot-provider configuration. */
export interface Config {
  devecoCliExecutable?: string
  deviceSerial?: string
  maxBytes?: number
  timeoutMs?: number
}
export const Config: z<Config> = z.object({
  devecoCliExecutable: z.string(),
  deviceSerial: z.string(),
  maxBytes: z.natural().default(DEFAULT_MAX_BYTES),
  timeoutMs: z.natural().min(1).default(DEFAULT_TIMEOUT_MS),
})

/** Serve one fresh, validated PNG for each request. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-harmony-preview-'))
  const current = join(directory, 'current.png')
  let inFlight: Promise<Preview> | undefined
  const capture = (): Promise<Preview> => {
    inFlight ??= takeScreenshot(ctx, config, directory, current).finally(() => { inFlight = undefined })
    return inFlight
  }
  await ctx.effect(async () => {
    const removeRoute = ctx.webServer.register({ kind: 'exact', path: PATH, handler: async (request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return }
      try {
        const preview = await capture()
        if (request.headers['if-none-match'] === preview.etag) { response.writeHead(304, cacheHeaders(preview)); response.end(); return }
        response.writeHead(200, { ...cacheHeaders(preview), 'content-type': 'image/png', 'content-length': String(preview.bytes.length) })
        response.end(request.method === 'HEAD' ? undefined : preview.bytes)
      } catch (error) {
        response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        response.end(error instanceof Error ? error.message : 'device screenshot failed')
      }
    } })
    return removeRoute
  }, 'harmony-screen-preview: route')
  ctx.effect(() => () => rm(directory, { recursive: true, force: true }), 'harmony-screen-preview: temporary screenshots')
}

interface Preview { bytes: Buffer; etag: string; modified: Date }
async function takeScreenshot(ctx: Context, config: Config, directory: string, current: string): Promise<Preview> {
  const staging = join(directory, `capture-${crypto.randomUUID()}.png`)
  const result = await runCli(ctx, config, ['ui', 'screenshot', ...config.deviceSerial === undefined ? [] : ['--device', config.deviceSerial], '--path', staging], directory)
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
async function runCli(ctx: Context, config: Config, args: string[], cwd = process.cwd()): Promise<CliResult> {
  const executable = config.devecoCliExecutable ?? await ctx.subprocess.resolveExecutable('devecocli', undefined, AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  const handle = ctx.subprocess.spawn({ argv: [executable, ...args], cwd, signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS), graceMs: 3_000, stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } } satisfies SubprocessSpawnSpec)
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0)?.text ?? ''
  const stderr = handle.collected.stderr?.readFrom(0)?.text ?? ''
  return { stdout, stderr, exitCode: outcome.exitCode ?? -1 }
}
