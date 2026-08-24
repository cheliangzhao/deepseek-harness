/** Live screenshot presentation; the Host endpoint owns capture and device access. */
import { useEffect, useState } from 'react'
import css from './panel.module.css'

const REFRESH_MS = 100

/** Convert a browser click to the coordinates of the contained device image. */
function relativeTapPosition(image: HTMLImageElement, clientX: number, clientY: number): { x: number; y: number } | undefined {
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

/** Render the automation device's current screen with visibility-aware polling. */
export function DevicePreviewPanel({ t, tap }: {
  t: (key: import('./locales.ts').DevicePreviewKey) => string
  tap: (position: { x: number; y: number }) => Promise<void>
}) {
  const [revision, setRevision] = useState(0)
  const [settledRevision, setSettledRevision] = useState<number>()
  const [unavailable, setUnavailable] = useState(false)
  const [ready, setReady] = useState(false)
  const [tapping, setTapping] = useState(false)
  useEffect(() => {
    const refresh = (): void => {
      if (document.hidden || tapping || settledRevision !== revision) return
      setReady(false)
      setRevision(current => current + 1)
    }
    const timer = !tapping && settledRevision === revision
      ? window.setTimeout(refresh, REFRESH_MS)
      : undefined
    document.addEventListener('visibilitychange', refresh)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [revision, settledRevision, tapping])
  return <div className={css.viewport}>
    <img
      className={css.preview}
      data-hidden={unavailable || undefined}
      data-interactive={ready || undefined}
      src={`/api/device-preview/screenshot?rev=${revision}`}
      alt={t('imageAlt')}
      draggable={false}
      onLoad={() => { setUnavailable(false); setReady(true); setSettledRevision(revision) }}
      onError={() => { setUnavailable(true); setReady(false); setSettledRevision(revision) }}
      onClick={(event) => {
        if (!ready || tapping) return
        const position = relativeTapPosition(event.currentTarget, event.clientX, event.clientY)
        if (position === undefined) return
        setTapping(true)
        void tap(position).then(
          () => { setReady(false); setTapping(false); setRevision(current => current + 1) },
          () => { setReady(false); setTapping(false); setRevision(current => current + 1) },
        )
      }}
    />
    {unavailable && <div className={css.unavailable} role="status">
      <svg className={css.deviceIcon} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="8" y="3" width="16" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 25.5h6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 6l20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <strong>{t('noDevice')}</strong>
      <span>{t('noDeviceHint')}</span>
    </div>}
  </div>
}
