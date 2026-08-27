import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectAutomationPreset, installAutomationPreset, uninstallAutomationPreset,
} from '../src/index.ts'

const roots: string[] = []

async function temporaryHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'device-automation-preset-'))
  roots.push(root)
  return root
}

function target(home: string): string {
  return join(home, '.agent-presets', 'automation')
}

function ownerFile(home: string): string {
  return join(target(home), '.fadinglight-device-automation.json')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe('device automation preset installer', () => {
  it('installs, updates, reports, and removes its managed user preset', async () => {
    const home = await temporaryHome()
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toEqual({
      state: 'absent', path: target(home),
    })
    await expect(installAutomationPreset({ dshHome: home, dryRun: true })).resolves.toMatchObject({
      action: 'would-install', path: target(home),
    })
    await expect(lstat(target(home))).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(installAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      action: 'installed', path: target(home), version: '0.1.0-rc.14',
    })
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toEqual({
      state: 'installed', path: target(home), installedVersion: '0.1.0-rc.14', current: true,
    })
    expect(await readFile(join(target(home), 'preset.yml'), 'utf8')).toContain('name: 自动化测试模式')
    expect((await lstat(target(home))).mode & 0o777).toBe(0o700)
    expect((await lstat(join(target(home), 'preset.yml'))).mode & 0o777).toBe(0o600)
    await expect(installAutomationPreset({ dshHome: home })).resolves.toMatchObject({ action: 'unchanged' })

    const owner = JSON.parse(await readFile(ownerFile(home), 'utf8')) as Record<string, unknown>
    owner['packageVersion'] = '0.1.0-rc.1'
    await writeFile(ownerFile(home), `${JSON.stringify(owner, null, 2)}\n`)
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'installed', installedVersion: '0.1.0-rc.1', current: false,
    })
    await expect(installAutomationPreset({ dshHome: home, dryRun: true })).resolves.toMatchObject({
      action: 'would-update',
    })
    await expect(installAutomationPreset({ dshHome: home })).resolves.toMatchObject({ action: 'updated' })

    await expect(uninstallAutomationPreset({ dshHome: home, dryRun: true })).resolves.toEqual({
      action: 'would-remove', path: target(home),
    })
    await expect(uninstallAutomationPreset({ dshHome: home })).resolves.toEqual({
      action: 'removed', path: target(home),
    })
    await expect(uninstallAutomationPreset({ dshHome: home })).resolves.toEqual({
      action: 'unchanged', path: target(home),
    })
  })

  it('refuses a foreign target and an invalid ownership record', async () => {
    const home = await temporaryHome()
    await mkdir(target(home), { recursive: true })
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'foreign', reason: 'the directory is not owned by @fadinglight/dsh-device-automation',
    })
    await expect(installAutomationPreset({ dshHome: home })).rejects.toThrow('refusing to install over')
    await expect(uninstallAutomationPreset({ dshHome: home })).rejects.toThrow('refusing to remove')

    await writeFile(ownerFile(home), '{')
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'foreign', reason: 'the ownership record .fadinglight-device-automation.json is invalid JSON',
    })
    await writeFile(ownerFile(home), '{}')
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'foreign', reason: 'the ownership record .fadinglight-device-automation.json is invalid',
    })

    const invalidOwners: unknown[] = [
      null,
      [],
      1,
      { schemaVersion: 1 },
      { schemaVersion: 1, owner: '@fadinglight/dsh-device-automation' },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 1, directories: [], files: {},
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: 'bad', files: {},
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: [1], files: {},
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: [], files: null,
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: [], files: [],
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: [], files: { '': 'hash' },
      },
      {
        schemaVersion: 1, owner: '@fadinglight/dsh-device-automation', presetId: 'automation',
        packageVersion: 'x', directories: [], files: { file: 1 },
      },
    ]
    for (const invalidOwner of invalidOwners) {
      await writeFile(ownerFile(home), JSON.stringify(invalidOwner))
      await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({ state: 'foreign' })
    }

    await rm(target(home), { recursive: true })
    await writeFile(target(home), 'not a directory')
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'foreign', reason: 'the target is not a real directory',
    })
  })

  it('retains managed presets whose files or directory inventory changed', async () => {
    const home = await temporaryHome()
    await installAutomationPreset({ dshHome: home })
    await writeFile(join(target(home), 'preset.yml'), 'user change\n')
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'modified', reason: 'managed files or directories differ from the installed ownership record',
    })
    await expect(installAutomationPreset({ dshHome: home })).rejects.toThrow('refusing to install over')
    await expect(uninstallAutomationPreset({ dshHome: home })).rejects.toThrow('refusing to remove')

    await rm(target(home), { recursive: true })
    await installAutomationPreset({ dshHome: home })
    await mkdir(join(target(home), 'user-directory'))
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({ state: 'modified' })
  })

  it.skipIf(process.platform === 'win32')('treats symlinks as foreign or modified content', async () => {
    const home = await temporaryHome()
    await mkdir(join(home, '.agent-presets'), { recursive: true })
    await symlink(home, target(home), 'dir')
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'foreign', reason: 'the target is not a real directory',
    })

    await rm(target(home))
    await installAutomationPreset({ dshHome: home })
    await symlink(join(target(home), 'preset.yml'), join(target(home), 'linked-preset.yml'))
    const linkedStatus = await inspectAutomationPreset({ dshHome: home })
    expect(linkedStatus.state).toBe('modified')
    if (linkedStatus.state === 'modified') expect(linkedStatus.reason).toContain('contains a symbolic link')
  })

  it.skipIf(process.platform === 'win32')('rejects non-file entries in a managed directory', async () => {
    const home = await mkdtemp('/tmp/device-automation-')
    roots.push(home)
    await installAutomationPreset({ dshHome: home })
    const socket = join(target(home), 'unexpected.sock')
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socket, resolve)
    })
    try {
      const socketStatus = await inspectAutomationPreset({ dshHome: home })
      expect(socketStatus.state).toBe('modified')
      if (socketStatus.state === 'modified') expect(socketStatus.reason).toContain('unsupported filesystem entry')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  })

  it('serializes concurrent installers and leaves one current preset', async () => {
    const home = await temporaryHome()
    const results = await Promise.all([
      installAutomationPreset({ dshHome: home }),
      installAutomationPreset({ dshHome: home }),
    ])
    expect(results.map(result => result.action).sort()).toEqual(['installed', 'unchanged'])
    await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({
      state: 'installed', current: true,
    })
  })

  it('rechecks ownership after waiting for another installer', async () => {
    const home = await temporaryHome()
    const path = target(home)
    await mkdir(join(home, '.agent-presets'), { recursive: true })
    const lock = `${path}.lock`
    await writeFile(lock, 'held\n')
    const installing = installAutomationPreset({ dshHome: home })
    await new Promise(resolve => setTimeout(resolve, 100))
    await mkdir(path)
    await rm(lock)
    await expect(installing).rejects.toThrow('refusing to install over')
  })

  it('accepts removal completed by a concurrent owner while waiting', async () => {
    const home = await temporaryHome()
    const path = target(home)
    await installAutomationPreset({ dshHome: home })
    const lock = `${path}.lock`
    await writeFile(lock, 'held\n')
    const uninstalling = uninstallAutomationPreset({ dshHome: home })
    await new Promise(resolve => setTimeout(resolve, 100))
    await rm(path, { recursive: true })
    await rm(lock)
    await expect(uninstalling).resolves.toEqual({ action: 'unchanged', path })
  })

  it('rechecks ownership after waiting to uninstall', async () => {
    const home = await temporaryHome()
    const path = target(home)
    await installAutomationPreset({ dshHome: home })
    const lock = `${path}.lock`
    await writeFile(lock, 'held\n')
    const uninstalling = uninstallAutomationPreset({ dshHome: home })
    await new Promise(resolve => setTimeout(resolve, 100))
    await rm(path, { recursive: true })
    await mkdir(path)
    await rm(lock)
    await expect(uninstalling).rejects.toThrow('refusing to remove')
  })

  it.skipIf(process.platform === 'win32')('reports unreadable managed content as modified', async () => {
    const home = await temporaryHome()
    await installAutomationPreset({ dshHome: home })
    const composition = join(target(home), 'agent.cordis.yml')
    await chmod(composition, 0o000)
    try {
      await expect(inspectAutomationPreset({ dshHome: home })).resolves.toMatchObject({ state: 'modified' })
    } finally {
      await chmod(composition, 0o600)
    }
  })
})
