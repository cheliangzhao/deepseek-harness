/** Session-header shortcut visible only on automation sessions. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './panel.module.css'

export interface DevicePreviewActionInjected { toggle: () => void }
export type DevicePreviewActionProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'devicePreview'> & InjectFace<DevicePreviewActionInjected>

/** Open the device panel for an automation-preset session. */
export function DevicePreviewAction({ sessionId, useSessions, toggle, t }: DevicePreviewActionProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  if (preset !== 'automation') return null
  return (
    <Tooltip label={t('open')} delayMs={500}>
      <button type="button" className={css.iconButton} aria-label={t('open')} onClick={toggle}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
          <path d="M6.75 11.75h2.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      </button>
    </Tooltip>
  )
}
