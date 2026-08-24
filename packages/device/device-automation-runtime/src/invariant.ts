/** Package invariant companion. @module @fadinglight/dsh-device-automation-runtime/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

export const name = 'device-automation-runtime-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {
  // No runtime invariant: provider availability is mutable and enforced when each request resolves.
}

/** Register device-automation package ownership. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@fadinglight/dsh-device-automation-runtime', install))
