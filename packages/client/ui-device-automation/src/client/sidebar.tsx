/** Plugin-owned right-sidebar shell for device automation. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import {
  IconChecklistOutline14,
  IconCloseOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceAutomationKey } from './locales.ts'
import {
  DeviceAutomationPanel,
  type DirectoryListing,
  type OpenedFile,
  type PreparationProgress,
  type PreparationResult,
  type ScreenshotFrame,
} from './panel.tsx'
import css from './sidebar.module.css'

const WIDTH_KEY = 'dsh-device-automation:sidebar-width'
const AUTOMATION_PRESET_ID = 'automation'
const DEFAULT_WIDTH = 420
const MIN_WIDTH = 320

type Translate = (key: DeviceAutomationKey) => string

/** Inputs owned by the standalone sidebar shell. */
export interface DeviceAutomationSidebarProps {
  readonly sessions: ISessions
  readonly t: Translate
  readonly prepare: (signal: AbortSignal) => Promise<PreparationResult>
  readonly preparationProgress: (signal: AbortSignal) => Promise<PreparationProgress>
  readonly capture: (signal: AbortSignal) => Promise<ScreenshotFrame>
  readonly tap: (position: { x: number; y: number }) => Promise<void>
  readonly list: (sessionId: string, path: string | undefined, signal: AbortSignal) => Promise<DirectoryListing>
  readonly read: (sessionId: string, path: string, signal: AbortSignal) => Promise<OpenedFile>
}

/**
 * Render the automation portal against the current Session selection.
 * @param props - session source and trusted device operations.
 * @returns the fixed sidebar and its collapsed-state control.
 */
export function DeviceAutomationSidebar(props: DeviceAutomationSidebarProps) {
  const sessionList = props.sessions.list
  const subscribe = useCallback((listener: () => void) => sessionList.subscribe(listener), [sessionList])
  const getSnapshot = useCallback(() => sessionList.getSnapshot(), [sessionList])
  const listState = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(readStoredWidth)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startWidth: number }>()
  const sessionId = listState.current
  const automationSession = sessionId !== undefined
    && listState.byId[sessionId]?.agentPreset === AUTOMATION_PRESET_ID

  useEffect(() => {
    if (!automationSession) return
    const root = document.documentElement
    const body = document.body
    root.style.setProperty('--dsh-device-automation-sidebar-width', open ? `${width}px` : '0px')
    body.toggleAttribute('data-dsh-device-automation-open', open)
    body.toggleAttribute('data-dsh-device-automation-collapsed', !open)
    body.toggleAttribute('data-dsh-device-automation-dragging', dragging)
    return () => {
      root.style.removeProperty('--dsh-device-automation-sidebar-width')
      body.removeAttribute('data-dsh-device-automation-open')
      body.removeAttribute('data-dsh-device-automation-collapsed')
      body.removeAttribute('data-dsh-device-automation-dragging')
    }
  }, [automationSession, dragging, open, width])

  useEffect(() => {
    if (automationSession) return
    drag.current = undefined
    setDragging(false)
  }, [automationSession])

  useEffect(() => {
    if (!automationSession) return
    const clampToViewport = (): void => { setWidth(current => clampWidth(current)) }
    window.addEventListener('resize', clampToViewport)
    return () => { window.removeEventListener('resize', clampToViewport) }
  }, [automationSession])

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width }
    setDragging(true)
  }
  const resize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || drag.current === undefined) return
    setWidth(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX))
  }
  const finishResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = drag.current === undefined
      ? width
      : clampWidth(drag.current.startWidth + drag.current.startX - event.clientX)
    event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = undefined
    setWidth(next)
    setDragging(false)
    storeWidth(next)
  }
  const cancelResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    drag.current = undefined
    setDragging(false)
    storeWidth(width)
  }

  if (!automationSession) return null

  return <div className={css.host} data-open={open || undefined}>
    {!open && <button
      type="button"
      className={css.openButton}
      aria-label={props.t('open')}
      title={props.t('open')}
      onClick={() => { setOpen(true) }}
    >
      <IconChecklistOutline14 size={16} />
    </button>}
    <aside className={css.panel} style={{ width }} aria-label={props.t('open')} aria-hidden={!open}>
      <div
        className={css.resizeHandle}
        data-dragging={dragging || undefined}
        onPointerDown={beginResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
        onPointerCancel={cancelResize}
      />
      <button
        type="button"
        className={css.closeButton}
        aria-label={props.t('close')}
        title={props.t('close')}
        onClick={() => { setOpen(false) }}
      >
        <IconCloseOutline16 />
      </button>
      <DeviceAutomationPanel
        key={sessionId}
        sessionId={sessionId}
        t={props.t}
        prepare={props.prepare}
        preparationProgress={props.preparationProgress}
        capture={props.capture}
        tap={props.tap}
        list={props.list}
        read={props.read}
      />
    </aside>
  </div>
}

function clampWidth(width: number): number {
  return Math.min(Math.max(MIN_WIDTH, Math.round(width)), Math.max(MIN_WIDTH, window.innerWidth - 280))
}

function readStoredWidth(): number {
  try {
    const stored = Number.parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10)
    return clampWidth(Number.isFinite(stored) ? stored : DEFAULT_WIDTH)
  } catch {
    // Browser privacy modes may reject this non-essential UI preference read.
    return clampWidth(DEFAULT_WIDTH)
  }
}

function storeWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(width))
  } catch {
    // Browser privacy modes may reject this non-essential UI preference.
  }
}
