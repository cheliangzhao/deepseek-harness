/** Automation test-case selection and Session task submission view. */
import { useEffect, useRef, useState } from 'react'
import {
  IconChecklistOutline14,
  IconCodeOutline16,
  IconPlayOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { WorkspaceFileTree } from './file-tree.tsx'
import type { FileEntry, DirectoryListing } from './panel.tsx'
import css from './AutomationTestView.module.css'

/** Plain business operations injected into the automation test view. */
export interface AutomationTestViewInjected {
  readonly list: (
    sessionId: string,
    path: string | undefined,
    signal: AbortSignal,
  ) => Promise<DirectoryListing>
  readonly run: (path: string, signal: AbortSignal) => Promise<void>
}

type AutomationTestViewProps = PropsRuntime<'conversation.view'>
  & PropsLocale<'deviceAutomation'>
  & InjectFace<AutomationTestViewInjected>

interface SelectedTestCase {
  readonly name: string
  readonly path: string
  readonly relativePath: string
}

type RunState = 'idle' | 'submitting' | 'submitted' | 'failed'

/**
 * Render a workspace test-case picker and submit the chosen case to the Session.
 * @param props - framework Session data, localized copy, and injected operations.
 * @returns the automation test conversation view.
 */
export function AutomationTestView({ sessionId, t, list, run }: AutomationTestViewProps) {
  const [selected, setSelected] = useState<SelectedTestCase>()
  const [runState, setRunState] = useState<RunState>('idle')
  const activeRun = useRef<AbortController>()

  useEffect(() => () => { activeRun.current?.abort() }, [])

  const selectFile = (entry: FileEntry, cwd: string): void => {
    activeRun.current?.abort()
    activeRun.current = undefined
    setSelected({ name: entry.name, path: entry.path, relativePath: workspaceRelativePath(cwd, entry.path) })
    setRunState('idle')
  }

  const submit = (): void => {
    if (selected === undefined || runState === 'submitting') return
    const controller = new AbortController()
    activeRun.current?.abort()
    activeRun.current = controller
    setRunState('submitting')
    void run(selected.relativePath, controller.signal).then(() => {
      if (!controller.signal.aborted) setRunState('submitted')
    }, () => {
      if (!controller.signal.aborted) setRunState('failed')
    }).finally(() => {
      if (activeRun.current === controller) activeRun.current = undefined
    })
  }

  return <section className={css.view} aria-label={t('automationTests')}>
    <header className={css.header}>
      <span className={css.headerIcon} aria-hidden="true"><IconChecklistOutline14 size={16} /></span>
      <div>
        <h2>{t('automationTests')}</h2>
        <p>{t('testViewHint')}</p>
      </div>
    </header>
    <div className={css.body}>
      <aside className={css.browser} aria-label={t('testCases')}>
        <div className={css.panelHeader}>
          <strong>{t('testCases')}</strong>
          <span>{t('selectTestCase')}</span>
        </div>
        <WorkspaceFileTree
          sessionId={sessionId}
          t={t}
          list={list}
          selectedPath={selected?.path}
          onFile={selectFile}
        />
      </aside>
      <main className={css.runner}>
        {selected === undefined
          ? <div className={css.empty}>
            <span aria-hidden="true"><IconCodeOutline16 size={24} /></span>
            <strong>{t('noTestSelected')}</strong>
            <p>{t('noTestSelectedHint')}</p>
          </div>
          : <div className={css.caseCard}>
            <div className={css.caseHeading}>
              <span aria-hidden="true"><IconCodeOutline16 /></span>
              <div><strong>{selected.name}</strong><code>{selected.relativePath}</code></div>
            </div>
            <p>{t('runTestHint')}</p>
            <button
              type="button"
              className={css.runButton}
              disabled={runState === 'submitting'}
              onClick={submit}
            >
              {runState === 'submitting'
                ? <span className={css.spinner} aria-hidden="true" />
                : <IconPlayOutline16 />}
              {t(runState === 'submitting' ? 'submittingTest' : 'runTest')}
            </button>
            {runState === 'submitted' && <div className={css.status} data-kind="success" role="status">
              <strong>{t('testSubmitted')}</strong><span>{t('testSubmittedHint')}</span>
            </div>}
            {runState === 'failed' && <div className={css.status} data-kind="error" role="alert">
              <strong>{t('testSubmitFailed')}</strong><span>{t('testSubmitFailedHint')}</span>
            </div>}
          </div>}
      </main>
    </div>
  </section>
}

/**
 * Shorten a provider path against its workspace root on POSIX and Windows.
 * @param cwd - provider-normalized workspace root.
 * @param path - provider-normalized selected file path.
 * @returns a workspace-relative path, or the original path when unrelated.
 */
export function workspaceRelativePath(cwd: string, path: string): string {
  for (const separator of ['/', '\\']) {
    const prefix = cwd.endsWith(separator) ? cwd : `${cwd}${separator}`
    if (path.startsWith(prefix)) return path.slice(prefix.length).replaceAll('\\', '/')
  }
  return path
}
