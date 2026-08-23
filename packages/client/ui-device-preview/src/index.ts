/** Host registration for the browser-only device-preview module. */
import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name. */
export const name = 'client-ui-device-preview'

/** The host half has no services; the browser module supplies the panel. */
export function apply(_ctx: Context): void {}
