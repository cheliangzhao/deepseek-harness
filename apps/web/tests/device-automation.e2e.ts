// Assembled keyless browser scenario for the device automation workspace. It
// boots the shipped Loader composition and uses a process fixture only at the
// external DevEco CLI boundary, so the click crosses the real client bundle,
// Connection trust fence, Host provider, and subprocess service.
import { copyFile, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/device-automation', import.meta.url))
const ARGV_EXPECTED = join(SNAPSHOT_DIR, 'tap-argv.expected.json')
const PREPARATION_PROGRESS_EXPECTED = join(SNAPSHOT_DIR, 'preparation-progress.expected.md')
const HARMONY_READY_EXPECTED = join(SNAPSHOT_DIR, 'harmony-ready.expected.md')
const FILE_EXPECTED = join(SNAPSHOT_DIR, 'file-open.expected.txt')
const CLI_MISSING_EXPECTED = join(SNAPSHOT_DIR, 'cli-missing.expected.md')
const TEST_SUBMITTED_EXPECTED = join(SNAPSHOT_DIR, 'test-submitted.expected.md')
const TEST_RUN_FIXTURE = join(SNAPSHOT_DIR, 'test-run.jsonl')
const SCREEN = fileURLToPath(new URL('../../../examples/device-automation/tests/fixtures/screen.png', import.meta.url))
const CLI_FIXTURE = fileURLToPath(new URL('./fixtures/device-automation-devecocli.mjs', import.meta.url))
const MODE = webSnapshotMode()
const SESSION_ID = 'device-automation-web-e2e'

/** Closed seed whose automation identity reveals the globally mounted workspace. */
function seedLog(): string {
  const createdAt = 1784974100000
  return [
    JSON.stringify({ type: 'session', version: 0, id: '{{sessionId}}', createdAt, cwd: '{{cwd}}' }),
    JSON.stringify({ type: 'turn/start', seq: 0, time: createdAt, data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user', rpcId: 'seed' } } } }),
    JSON.stringify({ type: 'user/message', seq: 1, time: createdAt + 1, data: { content: [{ type: 'text', text: 'Open device automation.' }], source: { kind: 'user', rpcId: 'seed' } }, surfaceOp: 'append' }),
    JSON.stringify({ type: 'session/title', seq: 2, time: createdAt + 2, data: { title: 'Device automation session', messageSeqs: [1], source: { kind: 'fallback' } } }),
    JSON.stringify({ type: 'turn/end', seq: 3, time: createdAt + 3, data: { turn: 1, reason: { kind: 'completed' } } }),
  ].join('\n')
}

describe('web e2e: device automation workspace', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let binDirectory: string
  let callLog: string
  let previousPath: string | undefined
  let previousLog: string | undefined
  let previousScreen: string | undefined
  const sessionEvents: SessionEvent[] = []

  beforeAll(async () => {
    binDirectory = await mkdtemp(join(tmpdir(), 'dsh-device-automation-bin-'))
    const executable = join(binDirectory, 'devecocli')
    callLog = join(binDirectory, 'calls.jsonl')
    await copyFile(CLI_FIXTURE, executable)
    await chmod(executable, 0o755)
    previousPath = process.env.PATH
    previousLog = process.env.DEVICE_AUTOMATION_TEST_LOG
    previousScreen = process.env.DEVICE_AUTOMATION_TEST_SCREEN
    process.env.PATH = previousPath === undefined ? binDirectory : `${binDirectory}${delimiter}${previousPath}`
    process.env.DEVICE_AUTOMATION_TEST_LOG = callLog
    process.env.DEVICE_AUTOMATION_TEST_SCREEN = SCREEN

    scaffold = await launchWebScaffold(MODE === 'record' ? {} : { replayFixture: TEST_RUN_FIXTURE })
    scaffold.ctx.on('session/event', (session, event) => {
      if (session.id === SESSION_ID) sessionEvents.push(event)
    })
    expect(await scaffold.ctx.agentPresets.resolve('automation')).toMatchObject({
      id: 'automation',
      trust: 'user',
    })
    await writeFile(join(scaffold.workspaceCwd, 'automation-sample.txt'), 'device automation workspace\n', 'utf8')
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
      if (previousLog === undefined) delete process.env.DEVICE_AUTOMATION_TEST_LOG
      else process.env.DEVICE_AUTOMATION_TEST_LOG = previousLog
      if (previousScreen === undefined) delete process.env.DEVICE_AUTOMATION_TEST_SCREEN
      else process.env.DEVICE_AUTOMATION_TEST_SCREEN = previousScreen
      await rm(binDirectory, { recursive: true, force: true })
    }
  })

  it('maps a browser image point to the retained PNG and snapshots the emitted click argv', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-device-automation-tap'))
    await page.getByText('Standard mode', { exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.getByRole('tab', { name: 'Automation tests', exact: true }).count()).toBe(0)
    expect(await page.getByRole('complementary', { name: 'Device automation', exact: true }).count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.style
      .getPropertyValue('--dsh-device-automation-sidebar-width'))).toBe('')

    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    const sidebar = page.getByRole('complementary', { name: 'Device automation', exact: true })
    await sidebar.waitFor({ timeout: 15_000 })
    await sidebar.getByText('Automation test mode', { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByRole('tab', { name: 'Automation tests', exact: true }).waitFor({ timeout: 10_000 })
    await sidebar.getByRole('progressbar', {
      name: 'Synchronizing HarmonyOS automation skills…', exact: true,
    }).waitFor({ timeout: 10_000 })
    await compareOrRefreshGolden(
      PREPARATION_PROGRESS_EXPECTED,
      await captureStableAria(
        page,
        '[data-dsh-device-automation-host] [role="status"]',
        scaffold.workspaceCwd,
      ),
      MODE,
    )
    await sidebar.getByRole('status', {
      name: 'HarmonyOS automation is ready', exact: true,
    }).waitFor({ timeout: 10_000 })
    await compareOrRefreshGolden(
      HARMONY_READY_EXPECTED,
      await captureStableAria(
        page,
        '[data-dsh-device-automation-host] [data-dsh-harmony-ready]',
        scaffold.workspaceCwd,
      ),
      MODE,
    )
    const image = page.getByRole('img', { name: 'Current automated device screen', exact: true })
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
    await compareOrRefreshGolden(
      ARGV_EXPECTED,
      JSON.stringify(calls, null, 2).replaceAll(scaffold.harnessHome, '{{harnessHome}}'),
      MODE,
    )
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it('reserves the collapsed entry beside the Session log utility', async () => {
    const sidebar = page.getByRole('complementary', { name: 'Device automation', exact: true })
    await sidebar.getByRole('button', { name: 'Close device automation', exact: true }).click()
    const openButton = page.getByRole('button', { name: 'Device automation', exact: true })
    const sessionLog = page.getByRole('button', { name: 'Session log', exact: true })
    await openButton.waitFor({ timeout: 10_000 })
    await sessionLog.waitFor({ timeout: 10_000 })
    await expect.poll(() => page.locator('[data-slot="conversation.session.header"] > header')
      .evaluate(element => getComputedStyle(element).paddingRight), { timeout: 10_000 }).toBe('52px')

    const openBounds = await openButton.boundingBox()
    const logBounds = await sessionLog.boundingBox()
    expect(openBounds).not.toBeNull()
    expect(logBounds).not.toBeNull()
    expect(openBounds!.x - (logBounds!.x + logBounds!.width)).toBeGreaterThanOrEqual(8)
    const openCenter = openBounds!.y + openBounds!.height / 2
    const logCenter = logBounds!.y + logBounds!.height / 2
    expect(Math.abs(openCenter - logCenter)).toBeLessThanOrEqual(0.5)

    await openButton.click()
    await sidebar.waitFor({ state: 'visible', timeout: 10_000 })
  })

  it('opens a workspace file through the shipped Files surface', async () => {
    const filesTab = page.getByRole('button', { name: 'Files', exact: true })
    await filesTab.click()
    const fileRow = page.getByRole('treeitem', { name: /automation-sample\.txt/ })
    await fileRow.waitFor({ timeout: 15_000 })
    await fileRow.click()
    const content = page.locator('pre').filter({ hasText: 'device automation workspace' })
    await content.waitFor({ timeout: 15_000 })
    await compareOrRefreshGolden(FILE_EXPECTED, (await content.textContent() ?? '').trimEnd(), MODE)
  })

  it('selects a test case and records the submitted automation task', async () => {
    const testsTab = page.getByRole('tab', { name: 'Automation tests', exact: true })
    await testsTab.click()
    const fileRow = page.getByRole('treeitem', { name: /automation-sample\.txt/ })
    await fileRow.waitFor({ timeout: 15_000 })
    await fileRow.click()
    await page.getByRole('button', { name: 'Run test', exact: true }).click()
    await page.getByRole('status').getByText('Test submitted', { exact: true }).waitFor({ timeout: 15_000 })

    await expect.poll(() => sessionEvents.flatMap(event => event.type === 'user/message'
      ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : [])
      : []).some(text => text.includes(
      'Run the automation test case at workspace-relative path "automation-sample.txt".',
    )), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => sessionEvents.some(event => event.type === 'turn/end'
      && event.data.turn === 2
      && event.data.reason.kind === 'completed'), { timeout: 15_000 }).toBe(true)
    await compareOrRefreshGolden(
      TEST_SUBMITTED_EXPECTED,
      await captureStableAria(page, '[aria-label="Automation tests"]', scaffold.workspaceCwd),
      MODE,
    )
  })

  it('shows installation guidance when DevEco CLI is unavailable', async () => {
    const emptyPath = await mkdtemp(join(tmpdir(), 'dsh-device-automation-empty-path-'))
    const savedPath = process.env.PATH
    let missingScaffold: WebScaffold | undefined
    let missingPage: Page | undefined
    try {
      process.env.PATH = emptyPath
      missingScaffold = await launchWebScaffold()
      await seedSession(missingScaffold, seedLog(), `${SESSION_ID}-missing-cli`, 'automation')
      missingPage = await newEnglishPage(browser)
      await missingPage.goto(missingScaffold.baseUrl, { waitUntil: 'load' })
      await missingPage.locator('[role="treeitem"]').first().click()
      await missingPage.locator('[role="treeitem"]').nth(1).click()
      const alert = missingPage.getByRole('alert')
      await alert.getByText('DevEco CLI is required', { exact: true }).waitFor({ timeout: 15_000 })
      expect(await alert.getByText('npm install --global @deveco/deveco-cli', { exact: true }).count()).toBe(1)
      expect(await alert.getByRole('link', { name: 'Download DevEco CLI' }).getAttribute('href'))
        .toBe('https://www.npmjs.com/package/@deveco/deveco-cli')
      const snapshot = await captureStableAria(missingPage, '[role="alert"]', missingScaffold.workspaceCwd)
      await compareOrRefreshGolden(CLI_MISSING_EXPECTED, snapshot, MODE)
    } finally {
      await missingPage?.close()
      await missingScaffold?.close()
      if (savedPath === undefined) delete process.env.PATH
      else process.env.PATH = savedPath
      await rm(emptyPath, { recursive: true, force: true })
    }
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'cli-missing.expected.md',
      'file-open.expected.txt',
      'harmony-ready.expected.md',
      'preparation-progress.expected.md',
      'tap-argv.expected.json',
      'test-submitted.expected.md',
      'test-run.jsonl',
    ])
  })
})
