/** Host registration for the browser-only device automation module. */
import type { Context } from '@deepseek-ai/cordis'

/** Cordis plugin name. */
export const name = 'client-ui-device-automation'

/** The host half has no services; the browser module supplies the panel. */
export function apply(_ctx: Context): void {}
