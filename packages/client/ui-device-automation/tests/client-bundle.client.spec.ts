// @vitest-environment jsdom
/** Built client artifact compatibility with the standalone sidebar portal. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { act, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'

const PLUGIN_ID = '@fadinglight/dsh-client-ui-device-automation'

interface Handoff { id: string; factory: (require: (specifier: string) => unknown) => Record<string, unknown> }
type Win = { __ModuleLoader__?: { load(handoff: Handoff): void } }

function readBundle(): string | undefined {
  try {
    return readFileSync(resolve('packages/client/ui-device-automation/lib/client.js'), 'utf8')
  } catch {
    return undefined
  }
}

afterEach(() => {
  delete (window as Win).__ModuleLoader__
  document.querySelectorAll('[data-dsh-device-automation-host], #root').forEach((element) => { element.remove() })
  document.documentElement.style.removeProperty('--dsh-device-automation-sidebar-width')
  document.body.removeAttribute('data-dsh-device-automation-open')
  document.body.removeAttribute('data-dsh-device-automation-collapsed')
  document.body.removeAttribute('data-dsh-device-automation-dragging')
  for (const element of document.querySelectorAll('style')) element.remove()
})

describe('tsdown client artifact', () => {
  const code = readBundle()

  async function loadArtifact(): Promise<{ exports: Record<string, unknown>; handoff: Handoff }> {
    let handoff: Handoff | undefined
    ;(window as Win).__ModuleLoader__ = { load: (value) => { handoff = value } }
    // This built-artifact fixture intentionally evaluates the browser bundle in the window scope.
    // oxlint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call
    new Function(code!)()
    expect(handoff).toBeDefined()
    const modules = new Map<string, unknown>([
      ['react', await import('react')],
      ['react/jsx-runtime', await import('react/jsx-runtime')],
      ['react-dom/client', await import('react-dom/client')],
      ['@deepseek-ai/dsh-client-ui-primitives', await import('@deepseek-ai/dsh-client-ui-primitives')],
    ])
    const exports = handoff!.factory((specifier) => {
      if (!modules.has(specifier)) throw new Error(`unexpected require: ${specifier}`)
      return modules.get(specifier)
    })
    return { exports, handoff: handoff! }
  }

  it.skipIf(code === undefined)('declares only services available in the published Web client', async () => {
    const { exports, handoff } = await loadArtifact()
    expect(handoff.id).toBe(PLUGIN_ID)
    expect(exports.inject).toEqual(['sessions', 'locale', 'connection', 'slots', 'conversation'])
  })

  it.skipIf(code === undefined)('shows only for the selected automation session, collapses, and disposes the sidebar', async () => {
    const { exports } = await loadArtifact()
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    slots.register({
      name: 'root',
      children: { 'conversation.view': { kind: 'list', scope: 'session' } },
    } as never, (() => null) as never)
    const listeners = new Set<() => void>()
    let state: {
      ids: string[]
      byId: Record<string, { agentPreset?: string }>
      current: string | undefined
      phase: 'ready'
      subagentsByParent: Record<string, never>
      jobsBySession: Record<string, never>
      currentAddress: undefined
    } = {
      ids: [], byId: {}, current: undefined, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    }
    const sessions = {
      list: {
        getSnapshot: () => state,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
      scope: () => ({ get: (name: string) => name === 'conversation' ? conversation : undefined }),
    }
    const conversation = { send: async () => {} }
    ctx.provide('locale', {
      register: () => () => {},
      bind: () => (key: string) => key,
    })
    ctx.provide('connection', { rpc: { call: async () => ({ ok: true, value: {} }) } })
    ctx.provide('sessions', sessions)
    ctx.provide('conversation', conversation)
    const app = document.createElement('div')
    app.id = 'root'
    document.body.appendChild(app)

    let fiber: ReturnType<Context['plugin']>
    await act(async () => {
      fiber = ctx.plugin(exports as { apply: (pluginCtx: Context) => void })
      await fiber.await()
    })
    const host = document.querySelector('[data-dsh-device-automation-host]')
    expect(host).not.toBeNull()
    expect(host?.childElementCount).toBe(0)
    expect(document.body.hasAttribute('data-dsh-device-automation-open')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--dsh-device-automation-sidebar-width')).toBe('')

    await act(async () => {
      state = { ...state, ids: ['s1'], byId: { s1: { agentPreset: 'standard' } }, current: 's1' }
      for (const listener of listeners) listener()
    })
    expect(host?.childElementCount).toBe(0)

    await act(async () => {
      state = { ...state, byId: { s1: { agentPreset: 'automation' } } }
      for (const listener of listeners) listener()
    })
    await waitFor(() => { expect(host?.textContent).toContain('title') })
    expect(slots.entries('conversation.view').map(entry => entry.options.id)).toEqual(['device-automation-tests'])
    expect(document.body.hasAttribute('data-dsh-device-automation-open')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--dsh-device-automation-sidebar-width')).toBe('420px')

    await act(async () => {
      state = { ...state, byId: { s1: { agentPreset: 'minimal' } } }
      for (const listener of listeners) listener()
    })
    await waitFor(() => {
      expect(host?.childElementCount).toBe(0)
      expect(document.documentElement.style.getPropertyValue('--dsh-device-automation-sidebar-width')).toBe('')
      expect(document.body.hasAttribute('data-dsh-device-automation-open')).toBe(false)
      expect(slots.entries('conversation.view')).toHaveLength(0)
    })

    await act(async () => {
      state = { ...state, byId: { s1: { agentPreset: 'automation' } } }
      for (const listener of listeners) listener()
    })
    await waitFor(() => { expect(host?.textContent).toContain('title') })

    fireEvent.click(host!.querySelector('button[aria-label="close"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--dsh-device-automation-sidebar-width')).toBe('0px')
      expect(document.body.hasAttribute('data-dsh-device-automation-collapsed')).toBe(true)
    })
    fireEvent.click(host!.querySelector('button[aria-label="open"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(document.body.hasAttribute('data-dsh-device-automation-open')).toBe(true)
      expect(document.body.hasAttribute('data-dsh-device-automation-collapsed')).toBe(false)
    })

    await act(async () => { await fiber!.dispose() })
    expect(document.querySelector('[data-dsh-device-automation-host]')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--dsh-device-automation-sidebar-width')).toBe('')
    expect(document.body.hasAttribute('data-dsh-device-automation-open')).toBe(false)
    expect(document.body.hasAttribute('data-dsh-device-automation-collapsed')).toBe(false)
    expect(listeners).toHaveLength(0)
    expect(slots.entries('conversation.view')).toHaveLength(0)
  })
})
