import { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle, ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs'
import { FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import { Session, SessionId, type SessionStore } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeviceAutomationRuntime, { type DeviceAutomationProvider } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function target(path: string): FsTarget {
  return { targetKey: FsTargetKey(path), displayPath: path }
}

async function mount(config: ConstructorParameters<typeof DeviceAutomationRuntime>[1] = {}, direct = false) {
  const ctx = new Context()
  contexts.push(ctx)
  let handler: ConnectionRpcHandler | undefined
  const connection: HostConnectionHandle = {
    rpc: {
      handle: (_channel, registered) => { handler = registered; return async () => {} },
      intercept: () => async () => {},
    },
  }
  const sessionId = SessionId('automation-session')
  const session = Session.create(sessionId, undefined, {
    version: 0, id: sessionId, createdAt: 1, cwd: '/repo',
  })
  const fs = {
    resolve: async (path: string, options?: { cwd?: string }) => target(path === '.' ? options?.cwd ?? '/repo' : path),
    processPath: (value: FsTarget) => value.displayPath,
    contains: (parent: FsTarget, child: FsTarget) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
    stat: async (value: FsTarget) => value.displayPath.endsWith('.ts')
      ? { version: 'v1', type: 'file' as const, size: 17 }
      : { version: 'v1', type: 'directory' as const },
    listDir: async () => [
      { name: 'src', type: 'directory' as const, target: target('/repo/src') },
      { name: 'index.ts', type: 'file' as const, target: target('/repo/index.ts'), size: 17 },
    ],
    readBytes: async () => new TextEncoder().encode('export const x = 1'),
  } as unknown as FileSystem
  const getSession = vi.fn((id: SessionId) => id === sessionId ? session : undefined)
  const sessions = { get: getSession } as unknown as SessionStore
  ctx.provide('connection', connection)
  ctx.provide('fs', fs)
  ctx.provide('sessions', sessions)
  if (direct) new DeviceAutomationRuntime(ctx, config)
  else await ctx.plugin(DeviceAutomationRuntime, config)
  if (handler === undefined) throw new Error('RPC handler was not registered')
  return { ctx, runtime: ctx.deviceAutomation, call: handler, fs, getSession }
}

function stubProvider(name = 'stub'): DeviceAutomationProvider {
  return {
    name,
    platform: name,
    screenshot: vi.fn(async () => ({ mediaType: 'image/png' as const, bytes: Uint8Array.of(1), width: 1, height: 1 })),
    tap: vi.fn(async () => {}),
  }
}

async function expectRpcError(
  call: ConnectionRpcHandler,
  endpoint: string,
  payload: unknown,
  code: string,
  message: string,
  signal = new AbortController().signal,
): Promise<void> {
  const result = await call(endpoint, payload, signal)
  expect(result).toMatchObject({ ok: false, error: { code } })
  if (result.ok) throw new Error(`${endpoint} unexpectedly succeeded`)
  expect(result.error.message).toContain(message)
}

describe('DeviceAutomationRuntime', () => {
  it('selects the configured provider for screenshots and taps', async () => {
    const { runtime, call } = await mount({ defaultProvider: 'harmonyos', refreshMs: 100 })
    const tap = vi.fn(async () => {})
    runtime.registerProvider({
      name: 'harmonyos', platform: 'harmonyos', tap,
      screenshot: async () => ({ mediaType: 'image/png', bytes: Uint8Array.of(1, 2, 3), width: 4, height: 6 }),
    })
    const signal = new AbortController().signal
    await expect(call('screenshot', {}, signal)).resolves.toEqual({
      ok: true,
      value: {
        provider: 'harmonyos', platform: 'harmonyos', mediaType: 'image/png',
        data: 'AQID', width: 4, height: 6, refreshAfterMs: 100,
      },
    })
    await expect(call('tap', { x: 0.5, y: 0.25 }, signal)).resolves.toEqual({ ok: true, value: null })
    expect(tap).toHaveBeenCalledWith({ x: 0.5, y: 0.25 }, signal)
  })

  it('rejects duplicate providers and malformed tap payloads', async () => {
    const { runtime, call } = await mount()
    const provider: DeviceAutomationProvider = {
      name: 'stub', platform: 'stub', screenshot: vi.fn(), tap: vi.fn(),
    }
    runtime.registerProvider(provider)
    expect(() => { runtime.registerProvider(provider) }).toThrow('already registered')
    await expect(call('tap', { x: 1, y: 0 }, new AbortController().signal)).resolves.toMatchObject({
      ok: false, error: { code: 'bad-request' },
    })
  })

  it('lists providers and removes registrations with their owning effect', async () => {
    await mount({}, true)
    const { runtime, call } = await mount()
    expect(() => { runtime.registerProvider(stubProvider('')) }).toThrow('non-empty')
    const dispose = runtime.registerProvider(stubProvider('alpha'))
    runtime.registerProvider(stubProvider('beta'))
    await expect(call('providers', {}, new AbortController().signal)).resolves.toEqual({
      ok: true,
      value: { providers: [{ name: 'alpha', platform: 'alpha' }, { name: 'beta', platform: 'beta' }] },
    })
    dispose()
    expect(runtime.listProviders()).toEqual([{ name: 'beta', platform: 'beta' }])
  })

  it('reports provider selection and operation failures through RPC', async () => {
    const first = await mount()
    await expectRpcError(first.call, 'screenshot', {}, 'internal', 'no device automation provider')
    first.runtime.registerProvider(stubProvider('alpha'))
    await expect(first.call('screenshot', {}, new AbortController().signal)).resolves.toMatchObject({
      ok: true, value: { provider: 'alpha' },
    })
    await expectRpcError(first.call, 'screenshot', { provider: 'missing' }, 'internal', 'unavailable')
    await expect(first.call('tap', { provider: 'alpha', x: 0, y: 0 }, new AbortController().signal)).resolves.toEqual({ ok: true, value: null })
    first.runtime.registerProvider(stubProvider('beta'))
    await expectRpcError(first.call, 'screenshot', {}, 'internal', 'multiple device automation providers')
    await expectRpcError(first.call, 'unknown', {}, 'bad-request', 'unknown device automation operation')

    const second = await mount({ defaultProvider: 'broken' })
    second.runtime.registerProvider({
      ...stubProvider('broken'),
      screenshot: vi.fn(async () => { throw 'provider failure' }),
    })
    await expectRpcError(second.call, 'screenshot', {}, 'internal', 'provider failure')
  })

  it('rejects malformed wire payloads', async () => {
    const { runtime, call } = await mount()
    runtime.registerProvider(stubProvider())
    const signal = new AbortController().signal
    await expectRpcError(call, 'screenshot', null, 'bad-request', 'must be an object', signal)
    await expectRpcError(call, 'screenshot', { provider: '' }, 'bad-request', 'non-empty string', signal)
    await expectRpcError(call, 'screenshot', { provider: 1 }, 'bad-request', 'non-empty string', signal)
    for (const payload of [
      { x: '0', y: 0 }, { x: 0, y: '0' }, { x: Number.NaN, y: 0 }, { x: 0, y: Number.POSITIVE_INFINITY },
      { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
    ]) {
      await expectRpcError(call, 'tap', payload, 'bad-request', 'tap coordinates', signal)
    }
    await expectRpcError(call, 'files/list', {}, 'bad-request', 'sessionId', signal)
    await expectRpcError(call, 'files/list', { sessionId: '' }, 'bad-request', 'sessionId', signal)
    await expectRpcError(call, 'files/list', { sessionId: 'automation-session', path: '' }, 'bad-request', 'path', signal)
    await expectRpcError(call, 'files/list', { sessionId: 'automation-session', path: 1 }, 'bad-request', 'path', signal)
    await expectRpcError(call, 'files/read', { sessionId: 'automation-session' }, 'bad-request', 'requires a path', signal)
  })

  it('lists and reads only paths contained by the live session workspace', async () => {
    const { call } = await mount({ maxFileBytes: 1024, maxDirectoryEntries: 10 })
    const signal = new AbortController().signal
    await expect(call('files/list', { sessionId: 'automation-session' }, signal)).resolves.toMatchObject({
      ok: true,
      value: { cwd: '/repo', path: '/repo', entries: [{ name: 'src' }, { name: 'index.ts' }] },
    })
    await expect(call('files/read', { sessionId: 'automation-session', path: '/repo/index.ts' }, signal)).resolves.toEqual({
      ok: true,
      value: { name: 'index.ts', path: '/repo/index.ts', content: 'export const x = 1' },
    })
    const outside = await call('files/read', { sessionId: 'automation-session', path: '/outside.ts' }, signal)
    expect(outside).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    if (outside.ok) throw new Error('outside-workspace read unexpectedly succeeded')
    expect(outside.error.message).toContain('outside')
  })

  it('bounds directory listings and rejects non-directory targets', async () => {
    const { call, fs } = await mount({ maxDirectoryEntries: 1 })
    const signal = new AbortController().signal
    await expect(call('files/list', { sessionId: 'automation-session' }, signal)).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ name: 'src' }], truncated: true },
    })
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({ version: FsVersion('v1'), type: 'file', size: 1 })
    await expectRpcError(call, 'files/list', { sessionId: 'automation-session' }, 'internal', 'not a directory', signal)
  })

  it('rejects unreadable files and sessions without live workspaces', async () => {
    const { call, fs, getSession } = await mount()
    const signal = new AbortController().signal
    vi.spyOn(fs, 'stat').mockResolvedValueOnce({ version: FsVersion('v1'), type: 'directory' })
    await expectRpcError(call, 'files/read', { sessionId: 'automation-session', path: '/repo/index.ts' }, 'internal', 'not a regular file', signal)
    vi.spyOn(fs, 'readBytes').mockResolvedValueOnce(Uint8Array.of(0xff))
    await expectRpcError(call, 'files/read', { sessionId: 'automation-session', path: '/repo/index.ts' }, 'internal', 'not UTF-8', signal)
    getSession.mockReturnValueOnce(undefined)
    await expectRpcError(call, 'files/list', { sessionId: 'missing' }, 'internal', 'no live workspace', signal)
  })

  it('returns cancellation when the request signal aborts', async () => {
    const { runtime, call } = await mount()
    const controller = new AbortController()
    runtime.registerProvider({
      ...stubProvider(),
      screenshot: vi.fn(async () => {
        controller.abort()
        throw new Error('stopped')
      }),
    })
    await expectRpcError(call, 'screenshot', {}, 'cancelled', 'cancelled', controller.signal)
  })
})
