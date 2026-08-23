/** Package invariant companion. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'client-ui-device-preview-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {}
/** Register the package ownership companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-client-ui-device-preview', install))
