/** Live screenshot presentation; the Host endpoint owns capture and device access. */
import { useEffect, useState } from 'react'
import css from './panel.module.css'

const REFRESH_MS = 200

/** Render the automation device's current screen with visibility-aware polling. */
export function DevicePreviewPanel({ t }: { t: (key: import('./locales.ts').DevicePreviewKey) => string }) {
  const [revision, setRevision] = useState(() => Date.now())
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const refresh = (): void => { if (!document.hidden) setRevision(Date.now()) }
    const timer = window.setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return <div className={css.viewport}>
    <img
      className={css.preview}
      data-hidden={unavailable || undefined}
      src={`/api/device-preview/screenshot?rev=${revision}`}
      alt={t('imageAlt')}
      onLoad={() => { setUnavailable(false) }}
      onError={() => { setUnavailable(true) }}
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
