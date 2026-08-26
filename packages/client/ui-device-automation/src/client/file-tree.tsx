/** Read-only workspace tree shared by Files and automation test selection. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  IconCodeOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconTriangleRightFill14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceAutomationKey } from './locales.ts'
import type { DirectoryListing, FileEntry } from './panel.tsx'
import css from './panel.module.css'

type Translate = (key: DeviceAutomationKey) => string

/** Inputs for the shared workspace file tree. */
export interface WorkspaceFileTreeProps {
  readonly sessionId: string
  readonly t: Translate
  readonly list: (
    sessionId: string,
    path: string | undefined,
    signal: AbortSignal,
  ) => Promise<DirectoryListing>
  readonly selectedPath: string | undefined
  readonly onFile: (entry: FileEntry, cwd: string) => void
}

/**
 * Render a lazy workspace tree and report selected regular files.
 * @param props - session identity, file operation, selection, and copy.
 * @returns the workspace tree with contained loading and failure states.
 */
export function WorkspaceFileTree({ sessionId, t, list, selectedPath, onFile }: WorkspaceFileTreeProps) {
  const [root, setRoot] = useState<DirectoryListing>()
  const [directories, setDirectories] = useState<ReadonlyMap<string, DirectoryListing>>(new Map())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const controller = new AbortController()
    setRoot(undefined)
    setDirectories(new Map())
    setExpanded(new Set())
    setLoading(new Set())
    setErrors(new Map())
    void list(sessionId, undefined, controller.signal).then((value) => {
      if (!controller.signal.aborted) setRoot(value)
    }, () => {
      if (!controller.signal.aborted) setErrors(new Map([['__root__', t('directoryError')]]))
    })
    return () => {
      controller.abort()
      for (const pending of controllers.current.values()) pending.abort()
      controllers.current.clear()
    }
  }, [list, sessionId, t])

  const toggleDirectory = (path: string): void => {
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
      if (!controller.signal.aborted) setErrors(current => new Map(current).set(path, t('directoryError')))
    }).finally(() => {
      controllers.current.delete(path)
      if (controller.signal.aborted) return
      setLoading((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
    })
  }

  if (errors.get('__root__') !== undefined) {
    return <div className={css.inlineError} role="alert">{errors.get('__root__')}</div>
  }
  if (root === undefined) return <div className={css.treeMessage}>{t('loading')}</div>
  return <div className={css.fileTree} role="tree" aria-label={root.path}>
    <TreeDirectory
      listing={root}
      cwd={root.cwd}
      depth={1}
      expanded={expanded}
      loading={loading}
      directories={directories}
      errors={errors}
      selectedPath={selectedPath}
      onDirectory={toggleDirectory}
      onFile={onFile}
      t={t}
    />
  </div>
}

function TreeDirectory({
  listing, cwd, depth, expanded, loading, directories, errors, selectedPath, onDirectory, onFile, t,
}: {
  listing: DirectoryListing
  cwd: string
  depth: number
  expanded: ReadonlySet<string>
  loading: ReadonlySet<string>
  directories: ReadonlyMap<string, DirectoryListing>
  errors: ReadonlyMap<string, string>
  selectedPath: string | undefined
  onDirectory: (path: string) => void
  onFile: (entry: FileEntry, cwd: string) => void
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
          aria-selected={entry.type === 'file' ? selectedPath === entry.path : undefined}
          data-selected={entry.type === 'file' && selectedPath === entry.path || undefined}
          className={css.fileRow}
          style={{ '--tree-depth': depth } as CSSProperties}
          onClick={() => {
            if (entry.type === 'directory') onDirectory(entry.path)
            else onFile(entry, cwd)
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
          cwd={cwd}
          depth={depth + 1}
          expanded={expanded}
          loading={loading}
          directories={directories}
          errors={errors}
          selectedPath={selectedPath}
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
