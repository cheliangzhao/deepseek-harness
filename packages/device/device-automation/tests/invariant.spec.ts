import { describe, expect, it, vi } from 'vitest'
import * as invariant from '../src/invariant.ts'

describe('device automation Bundle invariant companion', () => {
  it('registers its package-owned no-op installer', async () => {
    const dispose = vi.fn()
    const register = vi.fn().mockReturnValue(dispose)
    const ctx = { invariants: { register } } as never
    await expect(invariant.apply(ctx)).resolves.toBe(dispose)
    expect(invariant.name).toBe('device-automation-bundle-invariant')
    expect(invariant.inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@fadinglight/dsh-device-automation', expect.any(Function))
    const install = register.mock.calls[0]?.[1] as (() => void) | undefined
    expect(install).toBeTypeOf('function')
    expect(() => install?.()).not.toThrow()
  })
})
