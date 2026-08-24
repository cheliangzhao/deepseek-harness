/** Files and live-device presentation for an automation session. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  IconChevronLeftOutline14,
  IconChecklistOutline14,
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconFollowsystemOutline16,
  IconTriangleRightFill14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceAutomationKey } from './locales.ts'
import css from './panel.module.css'

export interface ScreenshotFrame {
  readonly source: string
  readonly refreshAfterMs: number
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
  const [root, setRoot] = useState<DirectoryListing>()
  const [directories, setDirectories] = useState<ReadonlyMap<string, DirectoryListing>>(new Map())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [directoryErrors, setDirectoryErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [file, setFile] = useState<OpenedFile>()
  const [fileError, setFileError] = useState<string>()
  const [openingPath, setOpeningPath] = useState<string>()
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const controller = new AbortController()
    void list(sessionId, undefined, controller.signal).then((value) => {
      if (!controller.signal.aborted) setRoot(value)
    }, () => {
      if (!controller.signal.aborted) setDirectoryErrors(current => new Map(current).set('__root__', t('directoryError')))
    })
    return () => {
      controller.abort()
      for (const pending of controllers.current.values()) pending.abort()
    }
  }, [list, sessionId, t])

  useEffect(() => {
    if (openingPath === undefined) return
    const controller = new AbortController()
    setFileError(undefined)
    void read(sessionId, openingPath, controller.signal).then(setFile, () => {
      if (!controller.signal.aborted) setFileError(t('fileError'))
    })
    return () => { controller.abort() }
  }, [openingPath, read, sessionId, t])

  const expandDirectory = (path: string): void => {
    if (expanded.has(path)) {
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      return
    }
    setExpanded(current => new Set(current).add(path))
    if (directories.has(path) || controllers.current.has(path)) return
    const controller = new AbortController()
    controllers.current.set(path, controller)
    setLoading(current => new Set(current).add(path))
    void list(sessionId, path, controller.signal).then((value) => {
      if (!controller.signal.aborted) setDirectories(current => new Map(current).set(path, value))
    }, () => {
      if (!controller.signal.aborted) setDirectoryErrors(current => new Map(current).set(path, t('directoryError')))
    }).finally(() => {
      controllers.current.delete(path)
      setLoading((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
    })
  }

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
        <strong>{root === undefined ? t('loading') : '.'}</strong>
        <span>{root?.path ?? ''}</span>
      </div>
    </div>
    {directoryErrors.get('__root__') !== undefined && <div className={css.inlineError} role="alert">{directoryErrors.get('__root__')}</div>}
    {fileError !== undefined && <div className={css.inlineError} role="alert">{fileError}</div>}
    {root !== undefined && <div className={css.fileTree} role="tree" aria-label={root.path}>
      <TreeDirectory
        listing={root}
        depth={1}
        expanded={expanded}
        loading={loading}
        directories={directories}
        errors={directoryErrors}
        onDirectory={expandDirectory}
        onFile={openFile}
        t={t}
      />
    </div>}
  </section>
}

function TreeDirectory({ listing, depth, expanded, loading, directories, errors, onDirectory, onFile, t }: {
  listing: DirectoryListing
  depth: number
  expanded: ReadonlySet<string>
  loading: ReadonlySet<string>
  directories: ReadonlyMap<string, DirectoryListing>
  errors: ReadonlyMap<string, string>
  onDirectory: (path: string) => void
  onFile: (path: string) => void
  t: Translate
}) {
  const entries = [...listing.entries].sort((left, right) => left.type === right.type ? 0 : left.type === 'directory' ? -1 : 1)
  return <>
    {entries.map((entry) => {
      const directory = entry.type === 'directory' ? directories.get(entry.path) : undefined
      return <div className={css.treeBranch} key={entry.path}>
        <button
          type="button"
          role="treeitem"
          aria-level={depth}
          aria-expanded={entry.type === 'directory' ? expanded.has(entry.path) : undefined}
          className={css.fileRow}
          style={{ '--tree-depth': depth } as CSSProperties}
          onClick={() => {
            if (entry.type === 'directory') onDirectory(entry.path)
            else onFile(entry.path)
          }}
        >
          <span className={css.treeSlot} aria-hidden="true">
            {entry.type === 'directory'
              ? <>
                <span className={css.treeFolder} data-expanded={expanded.has(entry.path) || undefined}>
                  {expanded.has(entry.path) ? <IconFolderOpen16 /> : <IconFolderClose16 />}
                </span>
                <span className={css.treeChevron} data-expanded={expanded.has(entry.path) || undefined}>
                  <IconTriangleRightFill14 />
                </span>
              </>
              : <span className={css.fileGlyph}><IconCodeOutline16 /></span>}
          </span>
          <span>{entry.name}</span>
          {entry.size !== undefined && <small>{formatBytes(entry.size)}</small>}
        </button>
        {entry.type === 'directory' && expanded.has(entry.path) && loading.has(entry.path) && <div className={css.treeMessage}>{t('loading')}</div>}
        {entry.type === 'directory' && expanded.has(entry.path) && directory !== undefined && <TreeDirectory
          listing={directory}
          depth={depth + 1}
          expanded={expanded}
          loading={loading}
          directories={directories}
          errors={errors}
          onDirectory={onDirectory}
          onFile={onFile}
          t={t}
        />}
        {entry.type === 'directory' && expanded.has(entry.path) && errors.get(entry.path) !== undefined && <div className={css.inlineError} role="alert">{errors.get(entry.path)}</div>}
        {entry.type === 'directory' && expanded.has(entry.path) && directory?.entries.length === 0 && <div className={css.treeMessage}>{t('emptyDirectory')}</div>}
        {entry.type === 'directory' && expanded.has(entry.path) && directory?.truncated === true && <div className={css.treeMessage}>{t('truncated')}</div>}
      </div>
    })}
    {entries.length === 0 && <div className={css.emptyFiles}>{t('emptyDirectory')}</div>}
    {listing.truncated && <div className={css.truncated}>{t('truncated')}</div>}
  </>
}

/**
 * Combined automation workspace with only Files and Device surfaces.
 * @param props - session identity and injected operations.
 * @returns the two-tab automation workspace.
 */
export function DeviceAutomationPanel({ sessionId, t, capture, tap, list, read }: {
  sessionId: string
  t: Translate
  capture: (signal: AbortSignal) => Promise<ScreenshotFrame>
  tap: (position: { x: number; y: number }) => Promise<void>
  list: (sessionId: string, path: string | undefined, signal: AbortSignal) => Promise<DirectoryListing>
  read: (sessionId: string, path: string, signal: AbortSignal) => Promise<OpenedFile>
}) {
  const [tab, setTab] = useState<'files' | 'device'>('device')
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
      {tab === 'files'
        ? <FilesPanel sessionId={sessionId} t={t} list={list} read={read} />
        : <DevicePreviewPanel t={t} capture={capture} tap={tap} />}
    </div>
  </div>
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
