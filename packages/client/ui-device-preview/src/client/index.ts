/** Automation-only device-preview details mode and its header entry point. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createElement } from 'react'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { DevicePreviewPanel } from './panel.tsx'
import { DevicePreviewAction } from './DevicePreviewAction.tsx'
import { en, zh, type DevicePreviewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { devicePreview: DevicePreviewKey } }

const NS = 'devicePreview'
export const inject = ['slots', 'locale', 'layout', 'detailsPanels', 'sessions']

/** Registers device-preview content and its session-header shortcut. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-device-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => {
    const removePanel = ctx.detailsPanels.register({ id: 'device-preview', render: () => createElement(DevicePreviewPanel, { t }), visible: sessionId => ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset === 'automation' })
    const removeAction = ctx.slots.register({
      name: 'conversation.session.header.utilities', id: 'device-preview', order: 20, locale: NS,
      inject: () => ({ toggle: () => {
        if (ctx.detailsPanels.active()?.id === 'device-preview') {
          ctx.detailsPanels.open('tool')
          ctx.layout.closeDetails()
          return
        }
        ctx.detailsPanels.open('device-preview')
        ctx.layout.openDetails()
      } }),
    }, DevicePreviewAction)
    return () => { removeAction(); removePanel() }
  }, 'ui-device-preview: details mode')
}
