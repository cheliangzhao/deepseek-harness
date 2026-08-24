import { writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import * as ClientConnection from '@deepseek-ai/dsh-client-connection'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ScreenPreview from '../src/index.ts'
import { parsePngDimensions, parseTapPosition, type Config } from '../src/index.ts'

const FIXTURE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAATElEQVR4nBXIMQHAIAwAwUpDBAJ+RARDJDBEAkNE1Nu3ufGeQThIB+Xg9ZmEk3RSzo5FuEgX5erYhJt0U+6OQ3hID+XpuISX9FLePz4mrzppOSuH6AAAAABJRU5ErkJggg==', 'base64')
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const reader = (text = '', lossy = false) => ({ readFrom: () => ({ text, nextOffset: Buffer.byteLength(text), lossy }) })
const quietHandle = (done: SubprocessHandle['done'], collected: SubprocessHandle['collected'] = { stdout: reader(), stderr: reader() }): SubprocessHandle => ({
  pid: 1, stdin: undefined, stdout: undefined, stderr: undefined, collected, done,
  terminate: () => {}, waitForExit: async () => true,
})

interface FakeResponse {
  statusCode: number
  headers: Record<string, string | number | string[] | undefined>
  body?: Buffer | string
  response: ServerResponse
  writeHead(code: number, headers?: Record<string, string | number | string[] | undefined>): void
  write(chunk: Buffer | string | Uint8Array): boolean
  end(chunk?: Buffer | string): void
}

function fakeResponse(): FakeResponse {
  const chunks: Buffer[] = []
  const emitter = new EventEmitter()
  const recorder: Omit<FakeResponse, 'response'> & { writableEnded: boolean } = Object.assign(emitter, {
    statusCode: 0,
    headers: {},
    writableEnded: false,
    writeHead(code: number, headers: Record<string, string | number | string[] | undefined> = {}) {
      recorder.statusCode = code
      Object.assign(recorder.headers, headers)
    },
    write(chunk: Buffer | string | Uint8Array) { chunks.push(Buffer.from(chunk)); return true },
    end(chunk?: Buffer | string) {
      if (typeof chunk === 'string' && chunks.length === 0) recorder.body = chunk
      else {
        if (chunk !== undefined) chunks.push(Buffer.from(chunk))
        if (chunks.length > 0) recorder.body = Buffer.concat(chunks)
      }
      recorder.writableEnded = true
    },
  })
  return Object.assign(recorder, { response: recorder as unknown as ServerResponse })
}

function fakeRequest(
  method: string,
  chunks: (Buffer | string)[] = [],
  headers: Record<string, string | string[] | undefined> = {},
): IncomingMessage {
  const request = Readable.from(chunks.map(chunk => Buffer.from(chunk))) as unknown as IncomingMessage
  Object.assign(request, { method, headers, url: '/' })
  return request
}

interface RouteTable { routes: Map<string, WebRoute>; calls: string[][]; ctx: Context }

async function mount(
  config: Config,
  onSpawn: (spec: SubprocessSpawnSpec) => { exitCode: number | null } | Promise<{ exitCode: number | null }>,
): Promise<RouteTable> {
  const ctx = new Context()
  contexts.push(ctx)
  const routes = new Map<string, WebRoute>()
  const calls: string[][] = []
  const subprocess = {
    resolveExecutable: vi.fn(async () => '/fake/devecocli'),
    spawn: vi.fn((spec: SubprocessSpawnSpec) => {
      calls.push([...spec.argv])
      const outcome = onSpawn(spec)
      const done = outcome instanceof Promise
        ? outcome.then(value => ({ ...value, signal: null }))
        : Promise.resolve({ ...outcome, signal: null })
      return quietHandle(done)
    }),
  }
  ctx.provide('subprocess', subprocess)
  ctx.provide('webServer', {
    register: (route: WebRoute) => {
      if (routes.has(route.path)) throw new Error(`duplicate route ${route.path}`)
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    },
    registerUpgrade: () => () => {},
  })
  await ctx.plugin(ClientConnection)
  await ctx.plugin(ScreenPreview, config)
  return { routes, calls, ctx }
}

async function routeCall(
  routes: Map<string, WebRoute>,
  path: string,
  request: IncomingMessage,
  response: FakeResponse,
): Promise<FakeResponse> {
  const route = routes.get(path) ?? [...routes.values()]
    .filter(candidate => candidate.kind === 'prefix' && path.startsWith(`${candidate.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]
  if (route === undefined) throw new Error(`no route registered for ${path}`)
  request.url = path
  await route.handler(request, response.response)
  return response
}

async function tapCall(
  routes: Map<string, WebRoute>,
  payload: unknown,
  headers: Record<string, string | string[] | undefined> = {},
  endpoint = 'tap',
): Promise<FakeResponse> {
  const message = {
    type: 'client-request',
    rpcId: 'screen-preview-test',
    method: endpoint,
    payload,
  }
  return await routeCall(routes, `/device-preview/${endpoint}`, fakeRequest('POST', [JSON.stringify(message)], {
    host: '127.0.0.1:3080',
    'content-type': 'application/json',
    ...headers,
  }), fakeResponse())
}

function rpcResult(response: FakeResponse): { ok: boolean; value?: unknown; error?: { code: string; message: string } } {
  const body = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : response.body
  if (body === undefined) throw new Error('RPC response omitted its body')
  return (JSON.parse(body) as { result: { ok: boolean; value?: unknown; error?: { code: string; message: string } } }).result
}

/** Get the screenshot path from the CLI invocation that owns it. */
function screenshotPath(spec: SubprocessSpawnSpec): string {
  const path = spec.argv.at(spec.argv.indexOf('--path') + 1)
  if (path === undefined) throw new Error('screenshot command omitted --path')
  return path
}

/** Get the only expected command from an assertion's recorded invocations. */
function firstCall(calls: string[][]): string[] {
  const call = calls[0]
  if (call === undefined) throw new Error('expected a CLI invocation')
  return call
}

/** Spawn stub that writes the fixture PNG for screenshot commands and succeeds everywhere else. */
const screenshotSpawn = (spec: SubprocessSpawnSpec): { exitCode: number | null } => {
  if (spec.argv[2] === 'screenshot') {
    writeFileSync(screenshotPath(spec), FIXTURE_PNG)
  }
  return { exitCode: 0 }
}

describe('parsePngDimensions', () => {
  it('reads the IHDR width and height of a valid PNG', () => {
    expect(parsePngDimensions(FIXTURE_PNG)).toEqual({ width: 4, height: 6 })
  })

  it('rejects a truncated PNG', () => {
    expect(parsePngDimensions(FIXTURE_PNG.subarray(0, 20))).toBeUndefined()
  })

  it('rejects a buffer without the PNG signature', () => {
    const invalid = Buffer.from(FIXTURE_PNG)
    invalid[0] = 0
    expect(parsePngDimensions(invalid)).toBeUndefined()
  })
})

describe('parseTapPosition', () => {
  it('parses relative coordinates', () => {
    expect(parseTapPosition({ x: 0.5, y: 0.25 })).toEqual({ x: 0.5, y: 0.25 })
  })

  it('rejects non-objects, missing fields, and out-of-range values', () => {
    expect(parseTapPosition([0.5, 0.25])).toBe('invalid')
    expect(parseTapPosition({ x: 0.5 })).toBe('invalid')
    expect(parseTapPosition({ x: 1, y: 0.25 })).toBe('invalid')
    expect(parseTapPosition({ x: -0.1, y: 0.25 })).toBe('invalid')
    expect(parseTapPosition({ x: 'a', y: 0.25 })).toBe('invalid')
    expect(parseTapPosition(undefined)).toBe('invalid')
  })
})

describe('mounted routes', () => {
  it('serves a captured screenshot with cache headers', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['content-length']).toBe('133')
    expect(response.headers.etag).toMatch(/^"[0-9a-f]{64}"$/)
    expect(response.headers['last-modified']).toBeTruthy()
    expect(response.body).toEqual(FIXTURE_PNG)
    expect(calls).toHaveLength(1)
    expect(firstCall(calls)[0]).toBe('/fake/devecocli')
    expect(firstCall(calls).slice(1, 3)).toEqual(['ui', 'screenshot'])
    expect(firstCall(calls).at(-1)?.startsWith('/')).toBe(true)
  })

  it('serves HEAD without a body', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('HEAD'), fakeResponse())
    expect(response.statusCode).toBe(200)
    expect(response.body).toBeUndefined()
  })

  it('answers a matching If-None-Match with 304', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const first = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const etag = first.headers.etag
    expect(typeof etag).toBe('string')
    const second = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET', [], { 'if-none-match': etag as string }), fakeResponse())
    expect(second.statusCode).toBe(304)
    expect(second.body).toBeUndefined()
  })

  it('rejects methods other than GET and HEAD on the screenshot route', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('POST'), fakeResponse())
    expect(response.statusCode).toBe(405)
    expect(response.headers.allow).toBe('GET, HEAD')
  })

  it('merges concurrent screenshot requests into one capture', async () => {
    let release: (() => void) | undefined
    const deferred = new Promise<{ exitCode: number | null }>((resolve) => { release = () => { resolve({ exitCode: 0 }) } })
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      if (spec.argv[2] === 'screenshot') {
        writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return deferred
      }
      return { exitCode: 0 }
    })
    const first = routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const second = routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    release?.()
    const [firstResponse, secondResponse] = await Promise.all([first, second])
    expect(firstResponse.statusCode).toBe(200)
    expect(secondResponse.statusCode).toBe(200)
    expect(calls).toHaveLength(1)
  })

  it('recaptures after a completed capture instead of serving a stale image', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(calls).toHaveLength(2)
  })

  it('resolves the executable from the subprocess world when none is configured', async () => {
    const { routes, calls } = await mount({}, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(200)
    expect(firstCall(calls)[0]).toBe('/fake/devecocli')
  })

  it('passes a configured device serial to screenshot commands', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli', deviceSerial: 'SERIAL' }, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(200)
    expect(firstCall(calls).slice(3, 5)).toEqual(['--device', 'SERIAL'])
  })

  it('reports a capture failure as 503', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, () => ({ exitCode: 1 }))
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('devecocli could not capture the device screen')
  })

  it('reports a null exit status as a capture failure', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, () => ({ exitCode: null }))
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
  })

  it('rejects a non-PNG capture as 503', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      writeFileSync(screenshotPath(spec), 'not a png')
      return { exitCode: 0 }
    })
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('device screenshot is not a PNG image')
  })

  it('rejects an empty capture file as 503', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      writeFileSync(screenshotPath(spec), Buffer.alloc(0))
      return { exitCode: 0 }
    })
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('device screenshot has an invalid size')
  })

  it('rejects a capture above maxBytes as 503', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli', maxBytes: 64 }, screenshotSpawn)
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('device screenshot has an invalid size')
  })

  it('reports a spawn failure with the thrown error message', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, () => { throw new Error('spawn exploded') })
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('spawn exploded')
  })

  it('reports a non-Error spawn throw with the fallback message', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, () => { throw 'boom' })
    const response = await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    expect(response.statusCode).toBe(503)
    expect(response.body).toBe('device screenshot failed')
  })

  it('refuses a tap before any screenshot exists', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const response = await tapCall(routes, { x: 0.5, y: 0.5 })
    expect(response.statusCode).toBe(200)
    expect(rpcResult(response)).toMatchObject({ ok: false, error: { code: 'internal', message: 'no device screenshot yet' } })
    expect(calls).toHaveLength(0)
  })

  it('maps a tap to device pixels against the retained screenshot and clicks', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const response = await tapCall(routes, { x: 0.5, y: 0.5 })
    expect(response.statusCode).toBe(200)
    expect(rpcResult(response)).toEqual({ ok: true, value: null })
    expect(calls.at(-1)).toEqual(['/fake/devecocli', 'ui', 'click', '2', '3'])
  })

  it('passes a configured device serial to click commands', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli', deviceSerial: 'SERIAL' }, screenshotSpawn)
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    await tapCall(routes, { x: 0.25, y: 0.5 })
    expect(calls.at(-1)).toEqual(['/fake/devecocli', 'ui', 'click', '1', '3', '--device', 'SERIAL'])
  })

  it('rejects cross-site and non-JSON requests before clicking', async () => {
    const { routes, calls } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const crossSite = await tapCall(routes, { x: 0.5, y: 0.5 }, {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    })
    expect(crossSite.statusCode).toBe(403)

    const textPlain = await tapCall(routes, { x: 0.5, y: 0.5 }, {
      'content-type': 'text/plain',
    })
    expect(textPlain.statusCode).toBe(415)
    expect(calls).toHaveLength(1)
  })

  it('rejects malformed tap payloads and unknown operations through the RPC envelope', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    const malformed = await tapCall(routes, { x: 2, y: 0.5 })
    expect(rpcResult(malformed)).toMatchObject({ ok: false, error: { code: 'bad-request' } })
    const unknown = await tapCall(routes, {}, {}, 'swipe')
    expect(rpcResult(unknown)).toMatchObject({ ok: false, error: { code: 'bad-request' } })
  })

  it('reports a failed click as an RPC error', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      if (spec.argv[2] === 'screenshot') {
        writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return { exitCode: 0 }
      }
      return { exitCode: 1 }
    })
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const response = await tapCall(routes, { x: 0.5, y: 0.5 })
    expect(rpcResult(response)).toMatchObject({
      ok: false,
      error: { code: 'internal', message: 'devecocli could not tap the device screen' },
    })
  })

  it('reports a click spawn throw as an RPC error', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      if (spec.argv[2] === 'screenshot') {
        writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return { exitCode: 0 }
      }
      throw 'tap boom'
    })
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const response = await tapCall(routes, { x: 0.5, y: 0.5 })
    expect(rpcResult(response)).toMatchObject({ ok: false, error: { code: 'internal', message: 'device tap failed' } })
  })

  it('refuses a tap when the retained screenshot has no readable dimensions', async () => {
    const { routes } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      writeFileSync(screenshotPath(spec), PNG_SIGNATURE)
      return { exitCode: 0 }
    })
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const response = await tapCall(routes, { x: 0.5, y: 0.5 })
    expect(rpcResult(response)).toMatchObject({
      ok: false,
      error: { code: 'internal', message: 'device screenshot is not a readable PNG image' },
    })
  })

  it('removes the screenshot and tap registrations with the owning fiber', async () => {
    const { routes, ctx } = await mount({ devecoCliExecutable: '/fake/devecocli' }, screenshotSpawn)
    expect([...routes.keys()]).toEqual(['/api', '/api/device-preview/screenshot', '/device-preview'])
    await ctx.fiber.dispose()
    expect(routes.size).toBe(0)
  })

  it('rolls back the screenshot route when tap registration fails', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const routes = new Map<string, WebRoute>()
    ctx.provide('subprocess', {
      resolveExecutable: vi.fn(async () => '/fake/devecocli'),
      spawn: vi.fn(() => quietHandle(Promise.resolve({ exitCode: 0, signal: null }))),
    })
    ctx.provide('webServer', {
      register: (route: WebRoute) => { routes.set(route.path, route); return () => { routes.delete(route.path) } },
    })
    ctx.provide('connection', {
      rpc: { handle: () => { throw new Error('duplicate route /device-preview') } },
    })
    const fiber = ctx.plugin(ScreenPreview, { devecoCliExecutable: '/fake/devecocli' })
    await expect(fiber).rejects.toThrow('duplicate route /device-preview')
    expect(routes.has('/api/device-preview/screenshot')).toBe(false)
  })

  it('cancels the running tap, skips the queued tap, and awaits the running process on disposal', async () => {
    const tapDone = Promise.withResolvers<{ exitCode: number | null }>()
    let tapSignal: AbortSignal | undefined
    const { routes, calls, ctx } = await mount({ devecoCliExecutable: '/fake/devecocli' }, (spec) => {
      if (spec.argv[2] === 'screenshot') {
        writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return { exitCode: 0 }
      }
      tapSignal = spec.signal
      return tapDone.promise
    })
    await routeCall(routes, '/api/device-preview/screenshot', fakeRequest('GET'), fakeResponse())
    const running = tapCall(routes, { x: 0.5, y: 0.5 })
    const queued = tapCall(routes, { x: 0.25, y: 0.5 })
    await vi.waitFor(() => { expect(calls.filter(argv => argv[2] === 'click')).toHaveLength(1) })

    let disposed = false
    const disposal = ctx.fiber.dispose().then(() => { disposed = true })
    await vi.waitFor(() => { expect(tapSignal?.aborted).toBe(true) })
    expect(disposed).toBe(false)
    tapDone.resolve({ exitCode: null })
    await disposal
    await Promise.all([running, queued])
    expect(calls.filter(argv => argv[2] === 'click')).toHaveLength(1)
  })
})
