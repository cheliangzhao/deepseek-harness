/** Standalone Files + Device workspace mounted as a plugin-owned right sidebar. */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  DirectoryListing,
  OpenedFile,
  PreparationProgress,
  PreparationResult,
  ScreenshotFrame,
} from './panel.tsx'
import { en, zh, type DeviceAutomationKey } from './locales.ts'
import { DeviceAutomationSidebar } from './sidebar.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    deviceAutomation: DeviceAutomationKey
  }
}

const NS = 'deviceAutomation'
const CHANNEL = '/device-automation'
export const inject = ['sessions', 'locale', 'connection']

/**
 * Mount the automation workspace beside the Web application.
 * @param ctx - client context carrying sessions, locale, and Connection.
 * @returns nothing; the portal is effect-owned.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-device-automation: dictionaries')
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle
  const prepare = async (signal: AbortSignal): Promise<PreparationResult> => {
    const record = objectValue(await call(connection, 'prepare', {}, signal), 'preparation response')
    const status = stringValue(record.status, 'preparation status')
    if (status === 'ready') return { status }
    if (status !== 'action-required' || record.action !== 'install-cli') {
      throw new Error(`unsupported device automation preparation status ${JSON.stringify(status)}`)
    }
    return {
      status,
      action: 'install-cli',
      command: stringValue(record.command, 'installation command'),
      url: stringValue(record.url, 'installation URL'),
    }
  }
  const preparationProgress = async (signal: AbortSignal): Promise<PreparationProgress> => {
    const record = objectValue(
      await call(connection, 'preparation/progress', {}, signal),
      'preparation progress response',
    )
    const phase = stringValue(record.phase, 'preparation progress phase')
    if (phase === 'idle' || phase === 'checking-cli' || phase === 'ready'
      || phase === 'failed' || phase === 'action-required') return { phase }
    if (phase !== 'syncing-skills') {
      throw new Error(`unsupported device automation preparation progress ${JSON.stringify(phase)}`)
    }
    const completed = numberValue(record.completed, 'completed skill count')
    const total = numberValue(record.total, 'total skill count')
    const skill = stringValue(record.skill, 'current skill')
    if (!Number.isInteger(completed) || !Number.isInteger(total)
      || total < 1 || completed >= total || skill.length === 0) {
      throw new Error('invalid device automation skill synchronization progress')
    }
    return { phase, completed, total, skill }
  }
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
  const sessions = ctx.sessions
  ctx.effect(() => {
    const host = document.createElement('div')
    host.dataset.dshDeviceAutomationHost = ''
    let root: Root | undefined
    try {
      document.body.appendChild(host)
      root = createRoot(host)
      root.render(createElement(DeviceAutomationSidebar, {
        sessions, t, prepare, preparationProgress, capture, tap, list, read,
      }))
    } catch (error) {
      root?.unmount()
      host.remove()
      throw error
    }
    return () => {
      try {
        root.unmount()
      } finally {
        host.remove()
      }
    }
  }, 'ui-device-automation: sidebar portal')
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
