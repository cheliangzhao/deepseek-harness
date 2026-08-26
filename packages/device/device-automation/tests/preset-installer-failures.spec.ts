import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const failures = vi.hoisted(() => ({
  copy: false,
  lstat: false,
  manifest: false,
  ownerRead: false,
  treeRead: false,
  replacement: false,
  rollback: false,
}))

function pathText(path: unknown): string | undefined {
  if (typeof path === 'string') return path
  if (path instanceof URL) return fileURLToPath(path)
  if (path instanceof Uint8Array) return Buffer.from(path).toString()
  return undefined
}

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    cp: async (...args: Parameters<typeof actual.cp>) => {
      if (failures.copy) throw new Error('injected copy failure')
      await actual.cp(...args)
    },
    lstat: async (path: Parameters<typeof actual.lstat>[0], ...args: unknown[]) => {
      if (failures.lstat && pathText(path)?.endsWith('/.agent-presets/automation')) {
        throw Object.assign(new Error('injected lstat failure'), { code: 'EACCES' })
      }
      return await actual.lstat(path, ...args as [])
    },
    readFile: async (path: Parameters<typeof actual.readFile>[0], ...args: unknown[]) => {
      if (failures.manifest && pathText(path)?.endsWith('/packages/device/device-automation/package.json')) return '{}'
      if (failures.ownerRead && pathText(path)?.endsWith('/.fadinglight-device-automation.json')) {
        throw Object.assign(new Error('injected owner read failure'), { code: 'EACCES' })
      }
      return await actual.readFile(path, ...args as [])
    },
    readdir: async (path: Parameters<typeof actual.readdir>[0], ...args: unknown[]) => {
      if (failures.treeRead && pathText(path)?.endsWith('/.agent-presets/automation')) {
        throw 'injected non-Error tree failure'
      }
      return await actual.readdir(path, ...args as [])
    },
    rename: async (oldPath: string, newPath: string) => {
      const oldName = basename(oldPath)
      const newName = basename(newPath)
      if (failures.replacement && oldName === 'automation' && newName === 'automation'
        && oldPath.includes('.automation-install-')) {
        throw new Error('injected replacement failure')
      }
      if (failures.rollback && oldName.startsWith('.automation-backup-') && newName === 'automation') {
        throw new Error('injected rollback failure')
      }
      await actual.rename(oldPath, newPath)
    },
  }
})

const {
  inspectAutomationPreset, installAutomationPreset,
} = await import('../src/index.ts')

const roots: string[] = []

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'device-automation-failure-'))
  roots.push(root)
  return root
}

async function markOutdated(root: string): Promise<void> {
  const ownerPath = join(root, '.agent-presets/automation/.fadinglight-device-automation.json')
  const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as Record<string, unknown>
  owner['packageVersion'] = 'outdated'
  await writeFile(ownerPath, JSON.stringify(owner))
}

afterEach(async () => {
  failures.copy = false
  failures.lstat = false
  failures.manifest = false
  failures.ownerRead = false
  failures.treeRead = false
  failures.replacement = false
  failures.rollback = false
  await Promise.all(roots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe('device automation preset failure recovery', () => {
  it('removes its staging directory when package copying fails', async () => {
    const root = await home()
    failures.copy = true
    await expect(installAutomationPreset({ dshHome: root })).rejects.toThrow('injected copy failure')
    expect(await readdir(join(root, '.agent-presets'))).toEqual([])
  })

  it('propagates package-manifest, target-stat, and ownership-read failures', async () => {
    const root = await home()
    failures.manifest = true
    await expect(installAutomationPreset({ dshHome: root })).rejects.toThrow('package manifest has no version')
    failures.manifest = false

    failures.lstat = true
    await expect(inspectAutomationPreset({ dshHome: root })).rejects.toThrow('injected lstat failure')
    failures.lstat = false

    await installAutomationPreset({ dshHome: root })
    failures.ownerRead = true
    await expect(inspectAutomationPreset({ dshHome: root })).rejects.toThrow('injected owner read failure')
    failures.ownerRead = false

    failures.treeRead = true
    await expect(inspectAutomationPreset({ dshHome: root })).resolves.toMatchObject({
      state: 'modified', reason: 'injected non-Error tree failure',
    })
  })

  it('restores the prior preset when replacement fails', async () => {
    const root = await home()
    await installAutomationPreset({ dshHome: root })
    await markOutdated(root)
    failures.replacement = true
    await expect(installAutomationPreset({ dshHome: root })).rejects.toThrow('injected replacement failure')
    await expect(inspectAutomationPreset({ dshHome: root })).resolves.toMatchObject({
      state: 'installed', installedVersion: 'outdated', current: false,
    })
  })

  it('reports replacement and rollback failures together', async () => {
    const root = await home()
    await installAutomationPreset({ dshHome: root })
    await markOutdated(root)
    failures.replacement = true
    failures.rollback = true
    const replacement = installAutomationPreset({ dshHome: root })
    await expect(replacement).rejects.toBeInstanceOf(AggregateError)
    await expect(replacement).rejects.toThrow('failed to replace')
    const error = await replacement.catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(AggregateError)
    if (error instanceof AggregateError) {
      expect(error.errors).toEqual([
        expect.objectContaining({ message: 'injected replacement failure' }),
        expect.objectContaining({ message: 'injected rollback failure' }),
      ])
    }
  })
})
