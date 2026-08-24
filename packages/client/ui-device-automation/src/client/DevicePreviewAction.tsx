/** Session-header shortcut visible only on automation sessions. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconFollowsystemOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './panel.module.css'

export interface DeviceAutomationActionInjected { toggle: () => void }
export type DeviceAutomationActionProps = PropsRuntime<'conversation.session.header.utilities'> & PropsLocale<'deviceAutomation'> & InjectFace<DeviceAutomationActionInjected>

/**
 * Open the automation workspace for an automation-preset session.
 * @param props - slot runtime, localized copy, and toggle action.
 * @returns the header action, or nothing outside automation sessions.
 */
export function DeviceAutomationAction({ sessionId, useSessions, toggle, t }: DeviceAutomationActionProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  if (preset !== 'automation') return null
  return (
    <Tooltip label={t('open')} delayMs={500}>
      <button type="button" className={css.iconButton} aria-label={t('open')} onClick={toggle}>
        <IconFollowsystemOutline16 />
      </button>
    </Tooltip>
  )
}
