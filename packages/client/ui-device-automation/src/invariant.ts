/** Package invariant companion. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'client-ui-device-automation-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: the client catalog validates this package's slot contribution.
}
/** Register the package ownership companion. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-client-ui-device-automation', install))
