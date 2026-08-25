// @vitest-environment jsdom
/** Built client artifact compatibility with the public conversation-view slot. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { afterEach, describe, expect, it } from 'vitest'

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
  for (const element of document.querySelectorAll('style')) element.remove()
})

describe('tsdown client artifact', () => {
  const code = readBundle()

  async function loadArtifact(): Promise<{ exports: Record<string, unknown>; handoff: Handoff }> {
    let handoff: Handoff | undefined
    ;(window as Win).__ModuleLoader__ = { load: (value) => { handoff = value } }
    // This built-artifact fixture intentionally evaluates the browser bundle in the window scope.
    new Function(code!)()
    expect(handoff).toBeDefined()
    const modules = new Map<string, unknown>([
      ['react', await import('react')],
      ['react/jsx-runtime', await import('react/jsx-runtime')],
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
    expect(exports.inject).toEqual(['slots', 'locale', 'connection'])
  })

  it.skipIf(code === undefined)('registers and disposes the automation conversation view', async () => {
    const { exports } = await loadArtifact()
    const ctx = new Context()
    const slots = new SlotRegistry(ctx)
    slots.register({
      name: 'root',
      children: { 'conversation.view': { kind: 'list', scope: 'session' } },
    }, (_props: { renderSlot?: unknown }) => null)
    ctx.provide('locale', {
      register: () => () => {},
      bind: () => (key: string) => key,
    })
    ctx.provide('connection', { rpc: { call: async () => ({ ok: true, value: {} }) } })

    const fiber = ctx.plugin(exports as { apply: (pluginCtx: Context) => void })
    await fiber.await()
    const entries = slots.entries('conversation.view')
    expect(entries.map(entry => entry.options.id)).toEqual(['device-automation'])
    expect(entries[0]?.options.label).toBeTypeOf('function')

    await fiber.dispose()
    expect(slots.entries('conversation.view')).toHaveLength(0)
  })
})
