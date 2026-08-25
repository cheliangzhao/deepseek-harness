/** Installable device automation Bundle and bundled agent-preset registrar. */
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-presets'

export const name = 'device-automation-bundle'
export const inject = ['agentPresets']

const PRESET_ROOT = fileURLToPath(new URL('../presets/', import.meta.url))

/**
 * Register the Bundle's read-only automation mode with the host preset roster.
 * @param ctx - host context carrying the preset roster.
 * @returns nothing; the registration follows this plugin's effect lifecycle.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.agentPresets.registerSystemRoot(PRESET_ROOT),
    'device-automation: bundled preset root',
  )
}
