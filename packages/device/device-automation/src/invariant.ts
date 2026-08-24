/** Package invariant companion. @module @fadinglight/dsh-device-automation/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

export const name = 'device-automation-bundle-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {
  // No runtime invariant: Loader composition validation owns the Bundle's patch rows.
}

/** Register device-automation Bundle ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@fadinglight/dsh-device-automation', install))
