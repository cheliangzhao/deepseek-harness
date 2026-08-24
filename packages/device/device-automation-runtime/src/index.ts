/**
 * Platform-neutral device automation registry and trusted browser gateway.
 * Providers own platform commands; this service owns selection, RPC input,
 * and read-only workspace file access for the automation panel.
 * @module @fadinglight/dsh-device-automation-runtime
 */
import { basename } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-fs'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'

const RPC_CHANNEL = '/device-automation'
const DEFAULT_REFRESH_MS = 100
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024
const DEFAULT_MAX_DIRECTORY_ENTRIES = 1000

/** Opaque registry key for one platform provider. */
export type DeviceAutomationProviderName = Branded<'DeviceAutomationProviderName'>

/**
 * Brand a provider-owned registry name.
 * @param value - raw provider name.
 * @returns the same string with the provider-name brand.
 */
export function DeviceAutomationProviderName(value: string): DeviceAutomationProviderName {
  return value as DeviceAutomationProviderName
}

/** Relative coordinates within the last device screenshot. */
export interface RelativeTapPosition {
  /** Horizontal fraction in `[0, 1)`. */
  readonly x: number
  /** Vertical fraction in `[0, 1)`. */
  readonly y: number
}

/** Complete image returned by a platform provider. */
export interface DeviceScreenshot {
  /** Browser-decodable media type. */
  readonly mediaType: 'image/png'
  /** Complete encoded image bytes. */
  readonly bytes: Uint8Array
  /** Native image width in pixels. */
  readonly width: number
  /** Native image height in pixels. */
  readonly height: number
}

/** Provider role implemented by HarmonyOS, Android, or iOS adapters. */
export interface DeviceAutomationProvider {
  /** Unique registry name. */
  readonly name: string
  /** Stable platform label shown by clients. */
  readonly platform: string
  /**
   * Capture the current authorized device screen.
   * @param signal - caller cancellation.
   * @returns one complete validated screenshot.
   */
  screenshot(signal: AbortSignal): Promise<DeviceScreenshot>
  /**
   * Tap the current authorized device using relative screenshot coordinates.
   * @param position - point within the last screenshot.
   * @param signal - caller cancellation.
   * @returns completion after the platform operation settles.
   */
  tap(position: RelativeTapPosition, signal: AbortSignal): Promise<void>
}

/** Host gateway limits and provider selection. */
export interface Config {
  /** Provider selected when the client does not name one. */
  defaultProvider?: string
  /** Delay advertised between completed screenshot requests. */
  refreshMs?: number
  /** Largest workspace file returned to the browser. */
  maxFileBytes?: number
  /** Largest directory listing returned to the browser. */
  maxDirectoryEntries?: number
}

interface ResolvedConfig {
  readonly defaultProvider: string | undefined
  readonly refreshMs: number
  readonly maxFileBytes: number
  readonly maxDirectoryEntries: number
}

/** Registry and browser-facing consumer over platform device providers. */
export class DeviceAutomationRuntime extends Service {
  static inject = ['connection', 'fs', 'sessions']
  static Config: z<Config> = z.object({
    defaultProvider: z.string().min(1),
    refreshMs: z.natural().default(DEFAULT_REFRESH_MS),
    maxFileBytes: z.natural().min(1).default(DEFAULT_MAX_FILE_BYTES),
    maxDirectoryEntries: z.natural().min(1).default(DEFAULT_MAX_DIRECTORY_ENTRIES),
  })

  private readonly providers = new Map<DeviceAutomationProviderName, DeviceAutomationProvider>()
  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'deviceAutomation')
    this.config = {
      defaultProvider: config.defaultProvider,
      refreshMs: config.refreshMs ?? DEFAULT_REFRESH_MS,
      maxFileBytes: config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      maxDirectoryEntries: config.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES,
    }
    ctx.effect(() => ctx.connection.rpc.handle(
      RPC_CHANNEL,
      (endpoint, payload, signal) => this.handleRpc(endpoint, payload, signal),
      { authority: 'trusted-host' },
    ), 'device-automation: trusted browser gateway')
  }

  /**
   * Register one uniquely named platform provider for this effect scope.
   * @param provider - trusted same-process platform implementation.
   * @returns disposer removing exactly this provider.
   */
  registerProvider(provider: DeviceAutomationProvider): () => void {
    if (provider.name.length === 0) throw new Error('device automation provider name must be non-empty')
    const name = DeviceAutomationProviderName(provider.name)
    if (this.providers.has(name)) {
      throw new Error(`device automation provider ${JSON.stringify(provider.name)} is already registered`)
    }
    // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
    return this.ctx.effect(() => {
      this.providers.set(name, provider)
      return () => {
        this.providers.delete(name)
      }
    }, 'deviceAutomation.registerProvider()')
  }

  /**
   * List the currently registered platform providers.
   * @returns provider descriptors in registration order.
   */
  listProviders(): readonly { name: DeviceAutomationProviderName; platform: string }[] {
    return [...this.providers].map(([name, provider]) => ({ name, platform: provider.platform }))
  }

  private async handleRpc(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>> {
    try {
      if (endpoint === 'providers') return ok({ providers: this.listProviders() })
      if (endpoint === 'screenshot') {
        const provider = this.resolveProvider(parseOptionalProvider(payload))
        const screenshot = await provider.screenshot(signal)
        return ok({
          provider: provider.name,
          platform: provider.platform,
          mediaType: screenshot.mediaType,
          data: Buffer.from(screenshot.bytes).toString('base64'),
          width: screenshot.width,
          height: screenshot.height,
          refreshAfterMs: this.config.refreshMs,
        })
      }
      if (endpoint === 'tap') {
        const request = parseTapRequest(payload)
        await this.resolveProvider(request.provider).tap(request.position, signal)
        return ok(null)
      }
      if (endpoint === 'files/list') return ok(await this.listFiles(parseFileRequest(payload), signal))
      if (endpoint === 'files/read') return ok(await this.readFile(parseFileRequest(payload), signal))
      return badRequest(`unknown device automation operation ${JSON.stringify(endpoint)}`)
    } catch (error) {
      if (signal.aborted) return cancelled('device automation request cancelled')
      if (error instanceof RequestPayloadError) return badRequest(error.message)
      return internal(error instanceof Error ? error.message : String(error))
    }
  }

  private resolveProvider(requested: string | undefined): DeviceAutomationProvider {
    const selected = requested ?? this.config.defaultProvider
    if (selected !== undefined) {
      const provider = this.providers.get(DeviceAutomationProviderName(selected))
      if (provider === undefined) throw new Error(`device automation provider ${JSON.stringify(selected)} is unavailable`)
      return provider
    }
    if (this.providers.size === 1) return this.providers.values().next().value as DeviceAutomationProvider
    if (this.providers.size === 0) throw new Error('no device automation provider is registered')
    throw new Error('multiple device automation providers are registered; configure defaultProvider')
  }

  private async listFiles(request: FileRequest, signal: AbortSignal): Promise<{
    cwd: string
    path: string
    entries: readonly { name: string; path: string; type: 'file' | 'directory'; size?: number }[]
    truncated: boolean
  }> {
    const { cwd, target } = await this.resolveWorkspaceTarget(request, signal)
    const info = await this.ctx.fs.stat(target, signal)
    if (info?.type !== 'directory') throw new Error('requested workspace path is not a directory')
    const entries = (await this.ctx.fs.listDir(target, signal))
      .filter((entry): entry is typeof entry & { type: 'file' | 'directory' } => entry.type !== 'other')
    const visible = entries.slice(0, this.config.maxDirectoryEntries)
    return {
      cwd,
      path: this.ctx.fs.processPath(target),
      entries: visible.map(entry => ({
        name: entry.name,
        path: this.ctx.fs.processPath(entry.target),
        type: entry.type,
        ...entry.size === undefined ? {} : { size: entry.size },
      })),
      truncated: entries.length > visible.length,
    }
  }

  private async readFile(request: FileRequest, signal: AbortSignal): Promise<{
    name: string
    path: string
    content: string
  }> {
    if (request.path === undefined) throw new RequestPayloadError('files/read requires a path')
    const { target } = await this.resolveWorkspaceTarget(request, signal)
    const info = await this.ctx.fs.stat(target, signal)
    if (info?.type !== 'file') throw new Error('requested workspace path is not a regular file')
    const bytes = await this.ctx.fs.readBytes(target, signal, this.config.maxFileBytes)
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('requested workspace file is not UTF-8 text')
    }
    const path = this.ctx.fs.processPath(target)
    return { name: basename(path), path, content }
  }

  private async resolveWorkspaceTarget(request: FileRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    const session = this.ctx.sessions.get(SessionId(request.sessionId))
    const cwd = session?.header.cwd
    if (cwd === undefined) throw new Error(`session ${JSON.stringify(request.sessionId)} has no live workspace`)
    const root = await this.ctx.fs.resolve('.', { cwd, signal })
    const target = request.path === undefined
      ? root
      : await this.ctx.fs.resolve(request.path, { cwd, signal })
    if (!this.ctx.fs.contains(root, target)) throw new RequestPayloadError('requested path is outside the session workspace')
    return { cwd: this.ctx.fs.processPath(root), target }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    deviceAutomation: DeviceAutomationRuntime
  }
}

interface FileRequest { sessionId: string; path?: string }

class RequestPayloadError extends Error {}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

function parseRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new RequestPayloadError('request payload must be an object')
  }
  return payload
}

function parseOptionalProvider(payload: unknown): string | undefined {
  const record = parseRecord(payload)
  if (record.provider !== undefined && (typeof record.provider !== 'string' || record.provider.length === 0)) {
    throw new RequestPayloadError('provider must be a non-empty string')
  }
  return typeof record.provider === 'string' ? record.provider : undefined
}

function parseTapRequest(payload: unknown): { provider?: string; position: RelativeTapPosition } {
  const record = parseRecord(payload)
  const provider = parseOptionalProvider(record)
  const { x, y } = record
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || x >= 1 || y < 0 || y >= 1) {
    throw new RequestPayloadError('tap coordinates must be finite numbers in [0, 1)')
  }
  return { ...provider === undefined ? {} : { provider }, position: { x, y } }
}

function parseFileRequest(payload: unknown): FileRequest {
  const record = parseRecord(payload)
  if (typeof record.sessionId !== 'string' || record.sessionId.length === 0) {
    throw new RequestPayloadError('sessionId must be a non-empty string')
  }
  if (record.path !== undefined && (typeof record.path !== 'string' || record.path.length === 0)) {
    throw new RequestPayloadError('path must be a non-empty string when supplied')
  }
  return {
    sessionId: record.sessionId,
    ...typeof record.path === 'string' ? { path: record.path } : {},
  }
}

function ok(value: unknown): RpcResult<unknown> {
  return { ok: true, value }
}

function badRequest(message: string): RpcResult<unknown> {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

function cancelled(message: string): RpcResult<unknown> {
  return { ok: false, error: { code: 'cancelled', message, details: {} } }
}

function internal(message: string): RpcResult<unknown> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

export default DeviceAutomationRuntime
