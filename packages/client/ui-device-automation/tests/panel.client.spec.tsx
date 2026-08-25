// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  DeviceAutomationPanel,
  DevicePreviewPanel,
  FilesPanel,
  relativeTapPosition,
  type DirectoryListing,
  type PreparationResult,
} from '../src/client/panel.tsx'
import { zh, type DeviceAutomationKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

const t = (key: DeviceAutomationKey): string => zh[key]
const frame = { source: 'data:image/png;base64,AAAA', refreshAfterMs: 100 }
const idlePreparationProgress = async () => ({ phase: 'idle' as const })

async function finishHarmonyReadyAnimation(): Promise<void> {
  await screen.findByRole('status', { name: zh.harmonyReady })
  await waitFor(() => {
    expect(screen.queryByRole('status', { name: zh.harmonyReady })).toBeNull()
  }, { timeout: 2_000 })
}

describe('DevicePreviewPanel', () => {
  it('keeps polling after a failed capture and shows a recovered frame', async () => {
    vi.useFakeTimers()
    const capture = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(frame)
    render(<DevicePreviewPanel t={t} capture={capture} tap={vi.fn()} />)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('status').textContent).toContain(zh.noDevice)

    await act(async () => { vi.advanceTimersByTime(100); await Promise.resolve() })
    const image = screen.getByRole('img', { name: zh.imageAlt })
    fireEvent.load(image)
    expect(image.getAttribute('data-hidden')).toBeNull()
    expect(capture).toHaveBeenCalledTimes(2)
    await act(async () => { vi.advanceTimersByTime(100); await Promise.resolve() })
    expect(capture).toHaveBeenCalledTimes(3)
  })

  it('maps clicks to relative device coordinates', async () => {
    const tap = vi.fn(async () => {})
    render(<DevicePreviewPanel t={t} capture={vi.fn(async () => frame)} tap={tap} />)
    const image = await screen.findByRole('img', { name: zh.imageAlt })
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 200))
    fireEvent.load(image)
    fireEvent.click(image, { clientX: 110, clientY: 70 })
    await waitFor(() => { expect(tap).toHaveBeenCalledWith({ x: 0.5, y: 0.25 }) })
  })

  it('pauses capture while the document is hidden and resumes when visible', async () => {
    let hidden = true
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    const capture = vi.fn(async () => frame)
    render(<DevicePreviewPanel t={t} capture={capture} tap={vi.fn()} />)
    expect(capture).not.toHaveBeenCalled()
    hidden = false
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByRole('img', { name: zh.imageAlt })
    expect(capture).toHaveBeenCalledOnce()
  })

  it('ignores stale capture outcomes after unmount', async () => {
    let resolveCapture: ((value: typeof frame) => void) | undefined
    const capture = new Promise<typeof frame>((resolve) => { resolveCapture = resolve })
    const first = render(<DevicePreviewPanel t={t} capture={async () => capture} tap={vi.fn()} />)
    first.unmount()
    resolveCapture?.(frame)
    await act(async () => { await capture })

    let rejectCapture: ((reason: Error) => void) | undefined
    const failure = new Promise<typeof frame>((_resolve, reject) => { rejectCapture = reject })
    const second = render(<DevicePreviewPanel t={t} capture={async () => failure} tap={vi.fn()} />)
    second.unmount()
    rejectCapture?.(new Error('offline'))
    await act(async () => { await failure.catch(() => {}) })
  })

  it('hides broken frames and ignores unavailable or letterboxed clicks', async () => {
    const tap = vi.fn(async () => {})
    render(<DevicePreviewPanel t={t} capture={vi.fn(async () => frame)} tap={tap} />)
    const image = await screen.findByRole('img', { name: zh.imageAlt })
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 200))
    fireEvent.error(image)
    fireEvent.click(image, { clientX: 110, clientY: 70 })
    fireEvent.load(image)
    fireEvent.click(image, { clientX: 20, clientY: 70 })
    expect(tap).not.toHaveBeenCalled()
  })

  it('blocks duplicate taps until the active tap settles and refreshes afterward', async () => {
    let release: (() => void) | undefined
    const tap = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const capture = vi.fn(async () => ({ ...frame, refreshAfterMs: 60_000 }))
    render(<DevicePreviewPanel t={t} capture={capture} tap={tap} />)
    const image = await screen.findByRole('img', { name: zh.imageAlt })
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 100 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    fireEvent.load(image)
    fireEvent.click(image, { clientX: 50, clientY: 50 })
    fireEvent.click(image, { clientX: 50, clientY: 50 })
    expect(tap).toHaveBeenCalledOnce()
    await act(async () => { release?.(); await Promise.resolve() })
    await waitFor(() => { expect(capture).toHaveBeenCalledTimes(2) })
  })

  it('rejects clicks in letterboxing and images without dimensions', () => {
    const image = document.createElement('img')
    expect(relativeTapPosition(image, 1, 1)).toBeUndefined()
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 200))
    expect(relativeTapPosition(image, 20, 70)).toBeUndefined()
  })
})

describe('FilesPanel', () => {
  const root: DirectoryListing = {
    cwd: '/repo', path: '/repo', truncated: false,
    entries: [
      { name: 'src', path: '/repo/src', type: 'directory' },
      { name: 'README.md', path: '/repo/README.md', type: 'file', size: 12 },
    ],
  }

  it('opens directories and reads files without exposing edit controls', async () => {
    const list = vi.fn(async (_sessionId: string, path: string | undefined) => path === undefined
      ? root
      : { cwd: '/repo', path, entries: [{ name: 'index.ts', path: '/repo/src/index.ts', type: 'file' as const }], truncated: false })
    const read = vi.fn(async () => ({ name: 'index.ts', path: '/repo/src/index.ts', content: 'export const ready = true\n' }))
    render(<FilesPanel sessionId="s1" t={t} list={list} read={read} />)
    await screen.findByRole('treeitem', { name: /src/ })
    fireEvent.click(screen.getByRole('treeitem', { name: /src/ }))
    const file = await screen.findByRole('treeitem', { name: /index\.ts/ })
    fireEvent.click(file)
    await screen.findByText('export const ready = true')
    expect(read).toHaveBeenCalledWith('s1', '/repo/src/index.ts', expect.any(AbortSignal))
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: zh.back }))
    await screen.findByRole('treeitem', { name: /src/ })
  })

  it('places directories before files while preserving each group order', async () => {
    const listing: DirectoryListing = {
      cwd: '/repo', path: '/repo', truncated: false,
      entries: [
        { name: 'z-last.txt', path: '/repo/z-last.txt', type: 'file' },
        { name: 'src', path: '/repo/src', type: 'directory' },
        { name: 'a-first.txt', path: '/repo/a-first.txt', type: 'file' },
        { name: 'tests', path: '/repo/tests', type: 'directory' },
      ],
    }
    render(<FilesPanel sessionId="s1" t={t} list={vi.fn(async () => listing)} read={vi.fn()} />)
    await screen.findByRole('treeitem', { name: 'src' })
    const rows = await screen.findAllByRole('treeitem')
    expect(rows.map(row => row.textContent?.trim())).toEqual(['src', 'tests', 'z-last.txt', 'a-first.txt'])
  })

  it('expands nested directories lazily and renders empty and truncated branches', async () => {
    const nested: DirectoryListing = {
      cwd: '/repo/src', path: '/repo/src', truncated: false,
      entries: [{ name: 'nested', path: '/repo/src/nested', type: 'directory' }],
    }
    const list = vi.fn(async (_sessionId: string, path: string | undefined) => {
      if (path === undefined) return root
      if (path === '/repo/src') return nested
      return { cwd: path, path, truncated: true, entries: [] }
    })
    render(<FilesPanel sessionId="s1" t={t} list={list} read={vi.fn()} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /src/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: /nested/ }))
    expect((await screen.findAllByText(zh.emptyDirectory)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(zh.truncated).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('treeitem', { name: /nested/ }))
    fireEvent.click(screen.getByRole('treeitem', { name: /nested/ }))
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('shows loading and child directory failures', async () => {
    let rejectChild: ((reason: Error) => void) | undefined
    const child = new Promise<DirectoryListing>((_resolve, reject) => { rejectChild = reject })
    const list = vi.fn(async (_sessionId: string, path: string | undefined) => {
      if (path === undefined) return root
      return child
    })
    render(<FilesPanel sessionId="s1" t={t} list={list} read={vi.fn()} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /src/ }))
    expect(screen.getByText(zh.loading)).toBeTruthy()
    fireEvent.click(screen.getByRole('treeitem', { name: /src/ }))
    fireEvent.click(screen.getByRole('treeitem', { name: /src/ }))
    rejectChild?.(new Error('failed'))
    await act(async () => { await child.catch(() => {}) })
    expect((await screen.findByRole('alert')).textContent).toContain(zh.directoryError)
  })

  it('surfaces directory failures', async () => {
    render(<FilesPanel sessionId="s1" t={t} list={vi.fn(async () => { throw new Error('failed') })} read={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain(zh.directoryError)
  })

  it('surfaces file failures and ignores directory or file failures after unmount', async () => {
    const read = vi.fn(async () => { throw new Error('failed') })
    const view = render(<FilesPanel sessionId="s1" t={t} list={vi.fn(async () => root)} read={read} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /README\.md/ }))
    expect((await screen.findByRole('alert')).textContent).toContain(zh.fileError)
    view.unmount()

    let rejectList: ((reason: Error) => void) | undefined
    const pendingList = new Promise<DirectoryListing>((_resolve, reject) => { rejectList = reject })
    const listingView = render(<FilesPanel sessionId="s1" t={t} list={async () => pendingList} read={vi.fn()} />)
    listingView.unmount()
    rejectList?.(new Error('stale list'))
    await act(async () => { await pendingList.catch(() => {}) })

    let resolveList: ((value: DirectoryListing) => void) | undefined
    const pendingSuccess = new Promise<DirectoryListing>((resolve) => { resolveList = resolve })
    const successView = render(<FilesPanel sessionId="s1" t={t} list={async () => pendingSuccess} read={vi.fn()} />)
    successView.unmount()
    resolveList?.(root)
    await act(async () => { await pendingSuccess })

    let resolveChild: ((value: DirectoryListing) => void) | undefined
    const pendingChild = new Promise<DirectoryListing>((resolve) => { resolveChild = resolve })
    const childSuccessView = render(<FilesPanel
      sessionId="s1"
      t={t}
      list={async (_sessionId, path) => path === undefined ? root : pendingChild}
      read={vi.fn()}
    />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /src/ }))
    childSuccessView.unmount()
    resolveChild?.(root)
    await act(async () => { await pendingChild })

    let rejectChild: ((reason: Error) => void) | undefined
    const failedChild = new Promise<DirectoryListing>((_resolve, reject) => { rejectChild = reject })
    const childFailureView = render(<FilesPanel
      sessionId="s1"
      t={t}
      list={async (_sessionId, path) => path === undefined ? root : failedChild}
      read={vi.fn()}
    />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /src/ }))
    childFailureView.unmount()
    rejectChild?.(new Error('stale child list'))
    await act(async () => { await failedChild.catch(() => {}) })

    let rejectRead: ((reason: Error) => void) | undefined
    const pendingRead = new Promise<never>((_resolve, reject) => { rejectRead = reject })
    const fileView = render(<FilesPanel sessionId="s1" t={t} list={vi.fn(async () => root)} read={async () => pendingRead} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /README\.md/ }))
    fileView.unmount()
    rejectRead?.(new Error('stale read'))
    await act(async () => { await pendingRead.catch(() => {}) })
  })

  it('shows truncation and formats byte, kilobyte, and megabyte sizes', async () => {
    const listing: DirectoryListing = {
      cwd: '/repo',
      path: '/repo/src',
      truncated: true,
      entries: [
        { name: 'bytes', path: '/repo/src/bytes', type: 'file', size: 12 },
        { name: 'kilobytes', path: '/repo/src/kilobytes', type: 'file', size: 1024 },
        { name: 'megabytes', path: '/repo/src/megabytes', type: 'file', size: 1024 * 1024 },
      ],
    }
    render(<FilesPanel sessionId="s1" t={t} list={vi.fn(async () => listing)} read={vi.fn()} />)
    await screen.findByText('12 B')
    expect(screen.getByText('1 KB')).toBeTruthy()
    expect(screen.getByText('1.0 MB')).toBeTruthy()
    expect(screen.getByText(zh.truncated)).toBeTruthy()
  })
})

describe('DeviceAutomationPanel', () => {
  it('mounts only the selected Files or Device surface', async () => {
    const capture = vi.fn(async () => frame)
    const list = vi.fn(async () => ({ cwd: '/repo', path: '/repo', entries: [], truncated: false }))
    render(<DeviceAutomationPanel sessionId="s1" t={t} prepare={vi.fn(async () => ({ status: 'ready' as const }))} preparationProgress={idlePreparationProgress} capture={capture} tap={vi.fn()} list={list} read={vi.fn()} />)
    expect(screen.getByText('自动化测试模式')).toBeTruthy()
    await screen.findByText(zh.harmonyReady)
    expect(capture).not.toHaveBeenCalled()
    await finishHarmonyReadyAnimation()
    await waitFor(() => { expect(capture).toHaveBeenCalledOnce() })
    await screen.findByRole('img', { name: zh.imageAlt })
    fireEvent.click(screen.getByRole('button', { name: zh.files }))
    await screen.findByText(zh.emptyDirectory)
    expect(screen.queryByRole('img', { name: zh.imageAlt })).toBeNull()
  })

  it('blocks device polling until DevEco CLI is installed and skills synchronize', async () => {
    const capture = vi.fn(async () => frame)
    const prepare = vi.fn()
      .mockResolvedValueOnce({
        status: 'action-required', action: 'install-cli',
        command: 'npm install --global @deveco/deveco-cli',
        url: 'https://www.npmjs.com/package/@deveco/deveco-cli',
      })
      .mockResolvedValueOnce({ status: 'ready' })
    render(<DeviceAutomationPanel
      sessionId="s1"
      t={t}
      prepare={prepare}
      preparationProgress={idlePreparationProgress}
      capture={capture}
      tap={vi.fn()}
      list={vi.fn()}
      read={vi.fn()}
    />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(zh.cliMissing)
    expect(screen.getByText('npm install --global @deveco/deveco-cli')).toBeTruthy()
    expect(screen.getByRole('link', { name: zh.downloadCli }).getAttribute('href'))
      .toBe('https://www.npmjs.com/package/@deveco/deveco-cli')
    expect(capture).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: zh.retry }))
    await finishHarmonyReadyAnimation()
    await screen.findByRole('img', { name: zh.imageAlt })
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('offers a retry after skill synchronization fails', async () => {
    const prepare = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'ready' })
    render(<DeviceAutomationPanel
      sessionId="s1"
      t={t}
      prepare={prepare}
      preparationProgress={idlePreparationProgress}
      capture={vi.fn(async () => frame)}
      tap={vi.fn()}
      list={vi.fn()}
      read={vi.fn()}
    />)
    expect((await screen.findByRole('alert')).textContent).toContain(zh.skillSyncFailed)
    fireEvent.click(screen.getByRole('button', { name: zh.retry }))
    await finishHarmonyReadyAnimation()
    await screen.findByRole('img', { name: zh.imageAlt })
  })

  it('retries an interrupted skill synchronization automatically on the next mount', async () => {
    const prepare = vi.fn()
      .mockRejectedValueOnce(new Error('download interrupted'))
      .mockResolvedValueOnce({ status: 'ready' })
    const props = {
      sessionId: 's1', t, prepare, preparationProgress: idlePreparationProgress,
      capture: vi.fn(async () => frame), tap: vi.fn(), list: vi.fn(), read: vi.fn(),
    }
    const first = render(<DeviceAutomationPanel {...props} />)
    expect((await screen.findByRole('alert')).textContent).toContain(zh.skillSyncFailed)
    first.unmount()

    render(<DeviceAutomationPanel {...props} />)
    await screen.findByRole('status', { name: zh.harmonyReady })
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('shows the current skill synchronization progress below the spinner', async () => {
    let finish: (() => void) | undefined
    const prepare = vi.fn(() => new Promise<PreparationResult>((resolve) => {
      finish = () => { resolve({ status: 'ready' }) }
    }))
    render(<DeviceAutomationPanel
      sessionId="s1"
      t={t}
      prepare={prepare}
      preparationProgress={vi.fn(async () => ({
        phase: 'syncing-skills' as const,
        completed: 3,
        total: 10,
        skill: 'hmos-jscrash-analysis',
      }))}
      capture={vi.fn(async () => frame)}
      tap={vi.fn()}
      list={vi.fn()}
      read={vi.fn()}
    />)
    const bar = await screen.findByRole('progressbar', { name: zh.syncingSkills })
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(screen.getByText('已完成 3/10')).toBeTruthy()
    expect(screen.getByText('hmos-jscrash-analysis')).toBeTruthy()
    await act(async () => { finish?.(); await Promise.resolve() })
    await finishHarmonyReadyAnimation()
    await screen.findByRole('img', { name: zh.imageAlt })
  })
})
