/** Automation-session Files + Device details workspace and header entry point. */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { createElement } from 'react'
import { DeviceAutomationPanel } from './panel.tsx'
import type { DirectoryListing, OpenedFile, ScreenshotFrame } from './panel.tsx'
import { DeviceAutomationAction } from './DevicePreviewAction.tsx'
import { en, zh, type DeviceAutomationKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    deviceAutomation: DeviceAutomationKey
  }
}

const NS = 'deviceAutomation'
const CHANNEL = '/device-automation'
export const inject = ['slots', 'locale', 'layout', 'detailsPanels', 'sessions', 'connection']

/**
 * Register the automation workspace and its session-header shortcut.
 * @param ctx - client context carrying slots, session state, and Connection.
 * @returns nothing; registrations are effect-owned.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-device-automation: dictionaries')
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle
  const capture = async (signal: AbortSignal): Promise<ScreenshotFrame> => {
    const value = await call(connection, 'screenshot', {}, signal)
    const record = objectValue(value, 'screenshot response')
    const mediaType = stringValue(record.mediaType, 'mediaType')
    const data = stringValue(record.data, 'data')
    const refreshAfterMs = numberValue(record.refreshAfterMs, 'refreshAfterMs')
    return { source: `data:${mediaType};base64,${data}`, refreshAfterMs }
  }
  const tap = async (position: { x: number; y: number }): Promise<void> => {
    await call(connection, 'tap', position)
  }
  const list = async (
    sessionId: string,
    path: string | undefined,
    signal: AbortSignal,
  ): Promise<DirectoryListing> => {
    const value = await call(connection, 'files/list', {
      sessionId,
      ...path === undefined ? {} : { path },
    }, signal)
    return directoryListing(value)
  }
  const read = async (
    sessionId: string,
    path: string,
    signal: AbortSignal,
  ): Promise<OpenedFile> => {
    const record = objectValue(await call(connection, 'files/read', { sessionId, path }, signal), 'file response')
    return {
      name: stringValue(record.name, 'name'),
      path: stringValue(record.path, 'path'),
      content: stringValue(record.content, 'content'),
    }
  }
  ctx.effect(() => {
    const removePanel = ctx.detailsPanels.register({
      id: 'device-automation',
      render: sessionId => createElement(DeviceAutomationPanel, {
        key: sessionId, sessionId, t, capture, tap, list, read,
      }),
      visible: sessionId => isAutomationSession(ctx, sessionId),
    })
    const removeAction = ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'device-automation',
      order: 20,
      locale: NS,
      inject: () => ({
        toggle: () => {
          if (ctx.detailsPanels.active()?.id === 'device-automation') {
            ctx.detailsPanels.open('tool')
            ctx.layout.closeDetails()
            return
          }
          ctx.detailsPanels.open('device-automation')
          ctx.layout.openDetails()
        },
      }),
    }, DeviceAutomationAction)
    return () => { removeAction(); removePanel() }
  }, 'ui-device-automation: details workspace')
}

function isAutomationSession(ctx: ClientContext, sessionId: SessionId): boolean {
  return ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset === 'automation'
}

async function call(
  connection: ConnectionHandle,
  endpoint: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await connection.rpc.call(CHANNEL, endpoint, payload, signal)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  return value
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`)
  return value
}

function directoryListing(value: unknown): DirectoryListing {
  const record = objectValue(value, 'directory response')
  if (!Array.isArray(record.entries)) throw new Error('directory entries must be an array')
  return {
    cwd: stringValue(record.cwd, 'cwd'),
    path: stringValue(record.path, 'path'),
    truncated: record.truncated === true,
    entries: record.entries.map((entry) => {
      const item = objectValue(entry, 'directory entry')
      const type = stringValue(item.type, 'entry type')
      if (type !== 'file' && type !== 'directory') throw new Error(`unsupported directory entry type ${JSON.stringify(type)}`)
      return {
        name: stringValue(item.name, 'entry name'),
        path: stringValue(item.path, 'entry path'),
        type,
        ...item.size === undefined ? {} : { size: numberValue(item.size, 'entry size') },
      }
    }),
  }
}
