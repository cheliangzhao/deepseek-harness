/** Files and live-device presentation for an automation session. */
import { useEffect, useState } from 'react'
import {
  IconChevronLeftOutline14,
  IconChecklistOutline14,
  IconFolderClose16,
  IconFollowsystemOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceAutomationKey } from './locales.ts'
import { WorkspaceFileTree } from './file-tree.tsx'
import css from './panel.module.css'

export interface ScreenshotFrame {
  readonly source: string
  readonly refreshAfterMs: number
}

/** Provider preparation state returned by the trusted Host. */
export type PreparationResult =
  | { readonly status: 'ready' }
  | {
    readonly status: 'action-required'
    readonly action: 'install-cli'
    readonly command: string
    readonly url: string
  }

/** Point-in-time Host preparation progress used while `prepare` is pending. */
export type PreparationProgress =
  | { readonly phase: 'idle' | 'checking-cli' | 'ready' | 'failed' | 'action-required' }
  | {
    readonly phase: 'syncing-skills'
    readonly completed: number
    readonly total: number
    readonly skill: string
  }

export interface FileEntry {
  readonly name: string
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly size?: number
}

export interface DirectoryListing {
  readonly cwd: string
  readonly path: string
  readonly entries: readonly FileEntry[]
  readonly truncated: boolean
}

export interface OpenedFile {
  readonly name: string
  readonly path: string
  readonly content: string
}

type Translate = (key: DeviceAutomationKey) => string
const HARMONY_READY_DURATION_MS = 1_200

type PreparationState =
  | { phase: 'checking'; progress?: Extract<PreparationProgress, { phase: 'syncing-skills' }> }
  | { phase: 'celebrating' }
  | { phase: 'ready' }
  | { phase: 'action-required'; command: string; url: string }
  | { phase: 'failed' }

/**
 * Convert a browser click to coordinates within the contained device image.
 * @param image - rendered image element.
 * @param clientX - viewport click x coordinate.
 * @param clientY - viewport click y coordinate.
 * @returns relative image coordinates, or `undefined` outside image content.
 */
export function relativeTapPosition(
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | undefined {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) return undefined
  const bounds = image.getBoundingClientRect()
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const x = clientX - bounds.left - (bounds.width - width) / 2
  const y = clientY - bounds.top - (bounds.height - height) / 2
  if (x < 0 || x >= width || y < 0 || y >= height) return undefined
  return { x: x / width, y: y / height }
}

/**
 * Render the device screen with visibility-aware, completion-driven polling.
 * @param props - translated copy and device operations.
 * @returns the live device surface.
 */
export function DevicePreviewPanel({ t, capture, tap }: {
  t: Translate
  capture: (signal: AbortSignal) => Promise<ScreenshotFrame>
  tap: (position: { x: number; y: number }) => Promise<void>
}) {
  const [revision, setRevision] = useState(0)
  const [source, setSource] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const [ready, setReady] = useState(false)
  const [tapping, setTapping] = useState(false)
  const [visible, setVisible] = useState(!document.hidden)

  useEffect(() => {
    const onVisibility = (): void => { setVisible(!document.hidden) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  useEffect(() => {
    if (!visible || tapping) return
    const controller = new AbortController()
    let timer: number | undefined
    void capture(controller.signal).then(
      (frame) => {
        if (controller.signal.aborted) return
        setSource(`${frame.source}#${revision}`)
        setUnavailable(false)
        setReady(false)
        timer = window.setTimeout(() => { setRevision(current => current + 1) }, frame.refreshAfterMs)
      },
      () => {
        if (controller.signal.aborted) return
        setUnavailable(true)
        setReady(false)
        timer = window.setTimeout(() => { setRevision(current => current + 1) }, 100)
      },
    )
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [capture, revision, tapping, visible])

  return <div className={css.viewport}>
    {source !== undefined && <img
      className={css.preview}
      data-hidden={unavailable || undefined}
      data-interactive={ready || undefined}
      src={source}
      alt={t('imageAlt')}
      draggable={false}
      onLoad={() => { setUnavailable(false); setReady(true) }}
      onError={() => { setUnavailable(true); setReady(false) }}
      onClick={(event) => {
        if (!ready || tapping) return
        const position = relativeTapPosition(event.currentTarget, event.clientX, event.clientY)
        if (position === undefined) return
        setTapping(true)
        void tap(position).finally(() => {
          setReady(false)
          setTapping(false)
          setRevision(current => current + 1)
        })
      }}
    />}
    {(unavailable || source === undefined) && <div className={css.unavailable} role="status">
      <span className={css.emptyIcon} aria-hidden="true"><IconFollowsystemOutline16 size={24} /></span>
      <strong>{t('noDevice')}</strong>
      <span>{t('noDeviceHint')}</span>
    </div>}
  </div>
}

/**
 * Read-only directory navigator and UTF-8 file viewer.
 * @param props - session identity, copy, and file operations.
 * @returns the file navigation surface.
 */
export function FilesPanel({ sessionId, t, list, read }: {
  sessionId: string
  t: Translate
  list: (sessionId: string, path: string | undefined, signal: AbortSignal) => Promise<DirectoryListing>
  read: (sessionId: string, path: string, signal: AbortSignal) => Promise<OpenedFile>
}) {
  const [file, setFile] = useState<OpenedFile>()
  const [fileError, setFileError] = useState<string>()
  const [openingPath, setOpeningPath] = useState<string>()

  useEffect(() => {
    if (openingPath === undefined) return
    const controller = new AbortController()
    setFileError(undefined)
    void read(sessionId, openingPath, controller.signal).then(setFile, () => {
      if (!controller.signal.aborted) setFileError(t('fileError'))
    })
    return () => { controller.abort() }
  }, [openingPath, read, sessionId, t])

  const openFile = (path: string): void => { setOpeningPath(path) }

  if (file !== undefined) {
    return <section className={css.filesPane}>
      <div className={css.fileBar}>
        <button type="button" className={css.backButton} onClick={() => { setFile(undefined); setOpeningPath(undefined) }} aria-label={t('back')}>
          <IconChevronLeftOutline14 />
        </button>
        <div className={css.fileIdentity}><strong>{file.name}</strong><span>{file.path}</span></div>
      </div>
      <pre className={css.fileContent}>{file.content}</pre>
    </section>
  }

  return <section className={css.filesPane}>
    <div className={css.fileBar}>
      <div className={css.fileIdentity}>
        <strong>.</strong>
        <span>{t('workspaceFiles')}</span>
      </div>
    </div>
    {fileError !== undefined && <div className={css.inlineError} role="alert">{fileError}</div>}
    <WorkspaceFileTree sessionId={sessionId} t={t} list={list} selectedPath={undefined} onFile={(entry) => { openFile(entry.path) }} />
  </section>
}

/**
 * Combined automation workspace with only Files and Device surfaces.
 * @param props - session identity and injected operations.
 * @returns the two-tab automation workspace.
 */
export function DeviceAutomationPanel({ sessionId, t, prepare, preparationProgress, capture, tap, list, read }: {
  sessionId: string
  t: Translate
  prepare: (signal: AbortSignal) => Promise<PreparationResult>
  preparationProgress: (signal: AbortSignal) => Promise<PreparationProgress>
  capture: (signal: AbortSignal) => Promise<ScreenshotFrame>
  tap: (position: { x: number; y: number }) => Promise<void>
  list: (sessionId: string, path: string | undefined, signal: AbortSignal) => Promise<DirectoryListing>
  read: (sessionId: string, path: string, signal: AbortSignal) => Promise<OpenedFile>
}) {
  const [tab, setTab] = useState<'files' | 'device'>('device')
  const [attempt, setAttempt] = useState(0)
  const [preparation, setPreparation] = useState<PreparationState>({ phase: 'checking' })

  useEffect(() => {
    const controller = new AbortController()
    let settled = false
    let pollTimer: number | undefined
    setPreparation({ phase: 'checking' })
    const poll = async (): Promise<void> => {
      try {
        const progress = await preparationProgress(controller.signal)
        if (controller.signal.aborted || settled) return
        if (progress.phase === 'syncing-skills') {
          setPreparation({ phase: 'checking', progress })
        }
      } catch {
        // Progress is advisory; the prepare request owns readiness and failure reporting.
        if (controller.signal.aborted || settled) return
      }
      pollTimer = window.setTimeout(() => { void poll() }, 200)
    }
    void poll()
    void prepare(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      settled = true
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
      setPreparation(result.status === 'ready'
        ? { phase: 'celebrating' }
        : { phase: 'action-required', command: result.command, url: result.url })
    }, () => {
      if (!controller.signal.aborted) {
        settled = true
        if (pollTimer !== undefined) window.clearTimeout(pollTimer)
        setPreparation({ phase: 'failed' })
      }
    })
    return () => {
      settled = true
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
      controller.abort()
    }
  }, [attempt, prepare, preparationProgress])

  useEffect(() => {
    if (preparation.phase !== 'celebrating') return
    const timer = window.setTimeout(() => {
      setPreparation({ phase: 'ready' })
    }, HARMONY_READY_DURATION_MS)
    return () => { window.clearTimeout(timer) }
  }, [preparation.phase])

  return <div className={css.workspace}>
    <header className={css.workspaceHeader}>
      <div className={css.workspaceTitle}>
        <span className={css.workspaceMark} aria-hidden="true"><IconChecklistOutline14 size={16} /></span>
        <strong>{t('title')}</strong>
      </div>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['files', 'device'] as const).map(id => <button
          type="button"
          key={id}
          data-active={tab === id || undefined}
          onClick={() => { setTab(id) }}
        >
          <span aria-hidden="true">{id === 'files' ? <IconFolderClose16 /> : <IconFollowsystemOutline16 />}</span>
          {t(id)}
        </button>)}
      </nav>
    </header>
    <div className={css.workspaceBody}>
      {preparation.phase !== 'ready'
        ? <PreparationPanel
          preparation={preparation}
          retry={() => { setAttempt(value => value + 1) }}
          t={t}
        />
        : tab === 'files'
          ? <FilesPanel sessionId={sessionId} t={t} list={list} read={read} />
          : <DevicePreviewPanel t={t} capture={capture} tap={tap} />}
    </div>
  </div>
}

function PreparationPanel({ preparation, retry, t }: {
  preparation:
    | { phase: 'checking'; progress?: Extract<PreparationProgress, { phase: 'syncing-skills' }> }
    | { phase: 'celebrating' }
    | { phase: 'action-required'; command: string; url: string }
    | { phase: 'failed' }
  retry: () => void
  t: Translate
}) {
  if (preparation.phase === 'checking') {
    const progress = preparation.progress
    return <div className={css.preparation} role="status">
      <span className={css.preparationSpinner} aria-hidden="true" />
      <strong>{t(progress === undefined ? 'checkingEnvironment' : 'syncingSkills')}</strong>
      {progress === undefined
        ? <span>{t('checkingCli')}</span>
        : <>
          <span>{t('skillProgress')
            .replace('{completed}', String(progress.completed))
            .replace('{total}', String(progress.total))}</span>
          <span
            className={css.preparationProgress}
            role="progressbar"
            aria-label={t('syncingSkills')}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
          >
            <span style={{ width: `${progress.completed / progress.total * 100}%` }} />
          </span>
          <code className={css.preparationCurrentSkill}>{progress.skill}</code>
        </>}
    </div>
  }
  if (preparation.phase === 'celebrating') {
    return <div
      className={`${css.preparation} ${css.harmonyReady}`}
      role="status"
      aria-label={t('harmonyReady')}
      data-dsh-harmony-ready
    >
      <span className={css.harmonyReadyMark} aria-hidden="true">
        <span className={css.harmonyOrbit} />
        <span className={`${css.harmonyOrbit} ${css.harmonyOrbitInner}`} />
        <span className={css.harmonyReadyCore}><IconChecklistOutline14 size={20} /></span>
      </span>
      <strong>{t('harmonyReady')}</strong>
      <span>{t('harmonyReadyHint')}</span>
    </div>
  }
  if (preparation.phase === 'action-required') {
    return <div className={css.preparation} role="alert">
      <span className={css.emptyIcon} aria-hidden="true"><IconFollowsystemOutline16 size={24} /></span>
      <strong>{t('cliMissing')}</strong>
      <span>{t('cliMissingHint')}</span>
      <code>{preparation.command}</code>
      <div className={css.preparationActions}>
        <a href={preparation.url} target="_blank" rel="noreferrer">{t('downloadCli')}</a>
        <button type="button" onClick={retry}>{t('retry')}</button>
      </div>
    </div>
  }
  return <div className={css.preparation} role="alert">
    <strong>{t('skillSyncFailed')}</strong>
    <span>{t('skillSyncFailedHint')}</span>
    <div className={css.preparationActions}>
      <button type="button" onClick={retry}>{t('retry')}</button>
    </div>
  </div>
}
