/** Installable device automation Bundle; behavior is contributed by its patch rows. */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'device-automation-bundle'

/**
 * Bundle marker; the profile patch mounts the runtime, provider, and client.
 * @param _ctx - bundle marker context.
 * @returns nothing; the Loader applies `cordis.patch.yml` separately.
 */
export function apply(_ctx: Context): void {}
