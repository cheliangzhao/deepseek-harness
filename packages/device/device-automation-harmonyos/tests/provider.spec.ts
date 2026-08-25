import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { DeviceAutomationProvider } from '@fadinglight/dsh-device-automation-runtime'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as HarmonyProvider from '../src/index.ts'
import { parsePngDimensions } from '../src/index.ts'

const FIXTURE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAGCAYAAADkOT91AAAATElEQVR4nBXIMQHAIAwAwUpDBAJ+RARDJDBEAkNE1Nu3ufGeQThIB+Xg9ZmEk3RSzo5FuEgX5erYhJt0U+6OQ3hID+XpuISX9FLePz4mrzppOSuH6AAAAABJRU5ErkJggg==', 'base64')
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
const contexts: Context[] = []
const homes: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const reader = (text = '') => ({ readFrom: () => ({ text, nextOffset: Buffer.byteLength(text), lossy: false }) })

function quietHandle(done: SubprocessHandle['done'], collect = true): SubprocessHandle {
  return {
    pid: 1,
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    collected: collect ? { stdout: reader(), stderr: reader() } : {},
    done,
    terminate: () => {},
    waitForExit: async () => true,
  }
}

function screenshotPath(spec: SubprocessSpawnSpec): string {
  const path = spec.argv.at(spec.argv.indexOf('--path') + 1)
  if (path === undefined) throw new Error('screenshot command omitted --path')
  return path
}

interface MountOptions {
  onSpawn?: (spec: SubprocessSpawnSpec) => Promise<{ exitCode: number | null }>
  config?: HarmonyProvider.Config
  direct?: boolean
  collect?: boolean
  resolveExecutable?: () => Promise<string>
}

async function mount(options: MountOptions = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  const calls: string[][] = []
  let provider: DeviceAutomationProvider | undefined
  ctx.provide('deviceAutomation', {
    registerProvider: (candidate: DeviceAutomationProvider) => { provider = candidate; return () => { provider = undefined } },
  })
  ctx.provide('subprocess', {
    resolveExecutable: options.resolveExecutable ?? vi.fn(async () => '/resolved/devecocli'),
    spawn: vi.fn((spec: SubprocessSpawnSpec) => {
      calls.push([...spec.argv])
      const done = options.onSpawn?.(spec) ?? Promise.resolve({ exitCode: 0 })
      return quietHandle(done.then(value => ({ ...value, signal: null })), options.collect)
    }),
  })
  const config = options.config ?? { devecoCliExecutable: '/fake/devecocli' }
  if (options.direct === true) await HarmonyProvider.apply(ctx, config)
  else await ctx.plugin(HarmonyProvider, config)
  if (provider === undefined) throw new Error('provider was not registered')
  return { ctx, calls, provider }
}

describe('HarmonyOS device provider', () => {
  it('synchronizes the automation skills once before reporting ready', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-harmony-skills-'))
    homes.push(home)
    vi.stubEnv('DSH_HOME', home)
    const { calls, provider } = await mount()
    const signal = new AbortController().signal

    expect(provider.preparationProgress()).toEqual({ phase: 'idle' })
    await expect(Promise.all([provider.prepare(signal), provider.prepare(signal)]))
      .resolves.toEqual([{ status: 'ready' }, { status: 'ready' }])
    await expect(provider.prepare(signal)).resolves.toEqual({ status: 'ready' })
    expect(provider.preparationProgress()).toEqual({ phase: 'ready' })
    expect(calls).toEqual(AUTOMATION_MODE_SKILLS.map(skill => [
      '/fake/devecocli',
      'skills',
      'add',
      '--skill',
      skill,
      '--path',
      join(home, 'device-automation', 'skills'),
      '--force',
    ]))
  })

  it('reports the current skill while preparation is active', async () => {
    let release: (() => void) | undefined
    const first = new Promise<{ exitCode: number | null }>((resolve) => {
      release = () => { resolve({ exitCode: 0 }) }
    })
    const { provider } = await mount({ onSpawn: async spec => (
      spec.argv.includes('hmos-local-test') ? first : { exitCode: 0 }
    ) })
    const preparation = provider.prepare(new AbortController().signal)

    await vi.waitFor(() => {
      expect(provider.preparationProgress()).toEqual({
        phase: 'syncing-skills', completed: 0, total: AUTOMATION_MODE_SKILLS.length,
        skill: 'hmos-local-test',
      })
    })
    release?.()
    await expect(preparation).resolves.toEqual({ status: 'ready' })
    expect(provider.preparationProgress()).toEqual({ phase: 'ready' })
  })

  it('asks the browser to install DevEco CLI and restarts an interrupted synchronization idempotently', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-harmony-skills-'))
    homes.push(home)
    vi.stubEnv('DSH_HOME', home)
    const missing = await mount({
      config: {},
      resolveExecutable: vi.fn(async () => { throw new Error('not found') }),
    })
    await expect(missing.provider.prepare(new AbortController().signal)).resolves.toEqual({
      status: 'action-required',
      action: 'install-cli',
      command: 'npm install --global @deveco/deveco-cli',
      url: 'https://www.npmjs.com/package/@deveco/deveco-cli',
    })

    let interrupted = true
    const retrying = await mount({ onSpawn: async (spec) => {
      if (interrupted && spec.argv.includes('hmos-instrument-test')) {
        interrupted = false
        return { exitCode: 1 }
      }
      return { exitCode: 0 }
    } })
    await expect(retrying.provider.prepare(new AbortController().signal)).rejects.toThrow('could not synchronize')
    expect(retrying.provider.preparationProgress()).toEqual({ phase: 'failed' })
    await expect(retrying.provider.prepare(new AbortController().signal)).resolves.toEqual({ status: 'ready' })
    expect(retrying.calls.map(call => call.at(4))).toEqual([
      'hmos-local-test',
      'hmos-instrument-test',
      ...AUTOMATION_MODE_SKILLS,
    ])
  })

  it('captures a validated PNG and maps a relative tap to native pixels', async () => {
    const { calls, provider } = await mount({ onSpawn: async (spec) => {
      if (spec.argv[2] === 'screenshot') writeFileSync(screenshotPath(spec), FIXTURE_PNG)
      return { exitCode: 0 }
    } })
    const screenshot = await provider.screenshot(new AbortController().signal)
    expect(screenshot).toMatchObject({ mediaType: 'image/png', width: 4, height: 6 })

    await provider.tap({ x: 0.625, y: 0.5 }, new AbortController().signal)

    expect(calls.map(call => call.slice(1, 5))).toEqual([
      ['ui', 'screenshot', '--path', expect.any(String)],
      ['ui', 'click', '2', '3'],
    ])
  })

  it('serializes device operations and waits for the active command during disposal', async () => {
    let release: (() => void) | undefined
    const active = new Promise<{ exitCode: number | null }>((resolve) => { release = () => { resolve({ exitCode: 0 }) } })
    const { ctx, calls, provider } = await mount({ onSpawn: async (spec) => {
      if (spec.argv[2] === 'screenshot') {
        writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return active
      }
      return { exitCode: 0 }
    } })
    const screenshot = provider.screenshot(new AbortController().signal)
    await vi.waitFor(() => { expect(calls).toHaveLength(1) })
    const disposal = ctx.fiber.dispose()
    await Promise.resolve()
    expect(await Promise.race([disposal.then(() => 'disposed'), Promise.resolve('pending')])).toBe('pending')
    release?.()
    await expect(screenshot).resolves.toMatchObject({ width: 4, height: 6 })
    await disposal
  })

  it('rejects taps before the first screenshot', async () => {
    const { provider } = await mount()
    await expect(provider.tap({ x: 0.5, y: 0.5 }, new AbortController().signal))
      .rejects.toThrow('capture the device screen')
  })

  it('passes the selected device serial and resolves the default executable', async () => {
    const { calls, provider } = await mount({
      config: { deviceSerial: 'serial-1' },
      direct: true,
      collect: false,
      onSpawn: async (spec) => {
        if (spec.argv.includes('screenshot')) writeFileSync(screenshotPath(spec), FIXTURE_PNG)
        return { exitCode: 0 }
      },
    })
    await provider.screenshot(new AbortController().signal)
    await provider.tap({ x: 0, y: 0 }, new AbortController().signal)
    expect(calls).toEqual([
      ['/resolved/devecocli', 'ui', 'screenshot', '--device', 'serial-1', '--path', expect.any(String)],
      ['/resolved/devecocli', 'ui', 'click', '0', '0', '--device', 'serial-1'],
    ])
  })

  it('rejects failed commands and invalid screenshots while keeping the queue usable', async () => {
    let mode: 'exit' | 'empty' | 'invalid' | 'valid' | 'tap' = 'exit'
    const { provider } = await mount({ onSpawn: async (spec) => {
      if (spec.argv.includes('screenshot')) {
        if (mode === 'empty') writeFileSync(screenshotPath(spec), Buffer.alloc(0))
        if (mode === 'invalid') writeFileSync(screenshotPath(spec), Buffer.alloc(24, 1))
        if (mode === 'valid' || mode === 'tap') writeFileSync(screenshotPath(spec), FIXTURE_PNG)
      }
      return { exitCode: mode === 'exit' ? null : mode === 'tap' && spec.argv.includes('click') ? 1 : 0 }
    } })
    const signal = new AbortController().signal
    await expect(provider.screenshot(signal)).rejects.toThrow('could not capture')
    mode = 'empty'
    await expect(provider.screenshot(signal)).rejects.toThrow('invalid size')
    mode = 'invalid'
    await expect(provider.screenshot(signal)).rejects.toThrow('readable PNG')
    mode = 'valid'
    await expect(provider.screenshot(signal)).resolves.toMatchObject({ width: 4, height: 6 })
    mode = 'tap'
    await expect(provider.tap({ x: 0, y: 0 }, signal)).rejects.toThrow('could not tap')
  })

  it('rejects an operation cancelled before it starts', async () => {
    const { provider } = await mount()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(provider.screenshot(controller.signal)).rejects.toThrow('cancelled')
  })

  it('cleans up when provider registration fails', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('deviceAutomation', {
      registerProvider: () => { throw new Error('duplicate provider') },
    })
    ctx.provide('subprocess', {
      resolveExecutable: vi.fn(async () => '/resolved/devecocli'),
      spawn: vi.fn(),
    })
    await expect(HarmonyProvider.apply(ctx, {})).rejects.toThrow('duplicate provider')
  })
})

describe('parsePngDimensions', () => {
  it('reads valid dimensions and rejects invalid headers', () => {
    expect(parsePngDimensions(FIXTURE_PNG)).toEqual({ width: 4, height: 6 })
    expect(parsePngDimensions(FIXTURE_PNG.subarray(0, 20))).toBeUndefined()
    const invalid = Buffer.from(FIXTURE_PNG)
    invalid[0] = 0
    expect(parsePngDimensions(invalid)).toBeUndefined()
    const zeroWidth = Buffer.from(FIXTURE_PNG)
    zeroWidth.writeUInt32BE(0, 16)
    expect(parsePngDimensions(zeroWidth)).toBeUndefined()
    const zeroHeight = Buffer.from(FIXTURE_PNG)
    zeroHeight.writeUInt32BE(0, 20)
    expect(parsePngDimensions(zeroHeight)).toBeUndefined()
  })
})
