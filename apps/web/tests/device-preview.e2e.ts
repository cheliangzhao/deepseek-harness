// Assembled keyless browser scenario for the automation device preview. It
// boots the shipped Loader composition and uses a process fixture only at the
// external DevEco CLI boundary, so the click crosses the real client bundle,
// Connection trust fence, Host provider, and subprocess service.
import { copyFile, chmod, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/device-preview', import.meta.url))
const ARGV_EXPECTED = join(SNAPSHOT_DIR, 'tap-argv.expected.json')
const SCREEN = fileURLToPath(new URL('../../../examples/device-automation/tests/fixtures/screen.png', import.meta.url))
const CLI_FIXTURE = fileURLToPath(new URL('./fixtures/device-preview-devecocli.mjs', import.meta.url))
const SHIPPED_PRESETS = fileURLToPath(new URL('../../cli/config/agent-presets', import.meta.url))
const MODE = webSnapshotMode()
const SESSION_ID = 'device-preview-web-e2e'

/** Closed seed whose preset mounts the device-preview Host and Client plugins. */
function seedLog(): string {
  const createdAt = 1784974100000
  return [
    JSON.stringify({ type: 'session', version: 0, id: '{{sessionId}}', createdAt, cwd: '{{cwd}}' }),
    JSON.stringify({ type: 'turn/start', seq: 0, time: createdAt, data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user', rpcId: 'seed' } } } }),
    JSON.stringify({ type: 'user/message', seq: 1, time: createdAt + 1, data: { content: [{ type: 'text', text: 'Open the device preview.' }], source: { kind: 'user', rpcId: 'seed' } }, surfaceOp: 'append' }),
    JSON.stringify({ type: 'session/title', seq: 2, time: createdAt + 2, data: { title: 'Device preview session', messageSeqs: [1], source: { kind: 'fallback' } } }),
    JSON.stringify({ type: 'turn/end', seq: 3, time: createdAt + 3, data: { turn: 1, reason: { kind: 'completed' } } }),
  ].join('\n')
}

describe('web e2e: device preview tap reaches DevEco CLI', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let binDirectory: string
  let callLog: string
  let previousPath: string | undefined
  let previousLog: string | undefined
  let previousScreen: string | undefined

  beforeAll(async () => {
    binDirectory = await mkdtemp(join(tmpdir(), 'dsh-device-preview-bin-'))
    const executable = join(binDirectory, 'devecocli')
    callLog = join(binDirectory, 'calls.jsonl')
    await copyFile(CLI_FIXTURE, executable)
    await chmod(executable, 0o755)
    previousPath = process.env.PATH
    previousLog = process.env.DEVICE_PREVIEW_TEST_LOG
    previousScreen = process.env.DEVICE_PREVIEW_TEST_SCREEN
    process.env.PATH = previousPath === undefined ? binDirectory : `${binDirectory}${delimiter}${previousPath}`
    process.env.DEVICE_PREVIEW_TEST_LOG = callLog
    process.env.DEVICE_PREVIEW_TEST_SCREEN = SCREEN

    scaffold = await launchWebScaffold({
      agentPresets: { roots: [{ path: SHIPPED_PRESETS, trust: 'system' }], default: 'standard' },
    })
    await seedSession(scaffold, seedLog(), SESSION_ID, 'automation')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    try {
      await browser?.close()
      await scaffold?.close()
    } finally {
      if (previousPath === undefined) delete process.env.PATH
      else process.env.PATH = previousPath
      if (previousLog === undefined) delete process.env.DEVICE_PREVIEW_TEST_LOG
      else process.env.DEVICE_PREVIEW_TEST_LOG = previousLog
      if (previousScreen === undefined) delete process.env.DEVICE_PREVIEW_TEST_SCREEN
      else process.env.DEVICE_PREVIEW_TEST_SCREEN = previousScreen
      await rm(binDirectory, { recursive: true, force: true })
    }
  })

  it('maps a browser image point to the retained PNG and snapshots the emitted click argv', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-device-preview-tap'))
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    const deviceButton = page.getByRole('button', { name: 'Device', exact: true })
    await deviceButton.waitFor({ timeout: 15_000 })
    await deviceButton.click()
    const image = page.getByRole('img', { name: 'Current HarmonyOS device screen', exact: true })
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    }).toBe(4)
    const firstSource = await image.getAttribute('src')

    const bounds = await image.boundingBox()
    expect(bounds).not.toBeNull()
    await image.click({ position: { x: bounds!.width * 0.625, y: bounds!.height * 7 / 12 } })
    await expect.poll(() => readFile(callLog, 'utf8').catch(() => ''), { timeout: 15_000 })
      .toContain('["ui","click","2","3"]')
    await expect.poll(() => image.evaluate((element, previousSource) => {
      const current = element as HTMLImageElement
      return current.getAttribute('src') !== previousSource && current.complete && current.naturalWidth === 4
    }, firstSource), { timeout: 15_000 }).toBe(true)

    const calls = (await readFile(callLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as string[])
    await compareOrRefreshGolden(ARGV_EXPECTED, JSON.stringify(calls, null, 2), MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['tap-argv.expected.json'])
  })
})
