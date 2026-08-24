/** Package invariant companion. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
export const name = 'device-automation-harmonyos-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: effect-scoped provider registration owns the only mutable relationship.
}
/** Register package ownership. */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@fadinglight/dsh-device-automation-harmonyos', install))
