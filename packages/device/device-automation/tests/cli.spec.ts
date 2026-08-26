import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDeviceAutomationCli, type DeviceAutomationCliIo } from '../src/cli.ts'

const roots: string[] = []

async function cliHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'device-automation-cli-'))
  roots.push(home)
  vi.stubEnv('DSH_HOME', home)
  return home
}

function capture(): { io: DeviceAutomationCliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: {
      stdout: (message) => { stdout.push(message) },
      stderr: (message) => { stderr.push(message) },
    },
  }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe('dsh-device-automation CLI', () => {
  it('rejects invalid commands and dry-run status', async () => {
    const output = capture()
    await expect(runDeviceAutomationCli([], output.io)).resolves.toBe(2)
    await expect(runDeviceAutomationCli(['preset', 'unknown'], output.io)).resolves.toBe(2)
    await expect(runDeviceAutomationCli(['preset', 'status', '--dry-run'], output.io)).resolves.toBe(2)
    await expect(runDeviceAutomationCli(['preset', 'status', '--unknown'], output.io)).resolves.toBe(2)
    expect(output.stderr).toHaveLength(4)
    expect(output.stderr.every(line => line.startsWith('Usage:'))).toBe(true)
  })

  it('installs, reports, and uninstalls through DSH_HOME', async () => {
    const home = await cliHome()
    const output = capture()
    await expect(runDeviceAutomationCli(['preset', 'status'], output.io)).resolves.toBe(1)
    await expect(runDeviceAutomationCli(['preset', 'install', '--dry-run'], output.io)).resolves.toBe(0)
    await expect(runDeviceAutomationCli(['preset', 'install'], output.io)).resolves.toBe(0)
    await expect(runDeviceAutomationCli(['preset', 'status'], output.io)).resolves.toBe(0)
    await expect(runDeviceAutomationCli(['preset', 'uninstall', '--dry-run'], output.io)).resolves.toBe(0)
    await expect(runDeviceAutomationCli(['preset', 'uninstall'], output.io)).resolves.toBe(0)
    expect(output.stdout).toEqual(expect.arrayContaining([
      expect.stringContaining('not installed'),
      expect.stringContaining('would-install'),
      expect.stringContaining('installed at'),
      expect.stringContaining('is current'),
      expect.stringContaining('would-remove'),
      expect.stringContaining('removed'),
    ]))
    await expect(readFile(join(home, '.agent-presets', 'automation', 'preset.yml')))
      .rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports outdated, foreign, and modified installations', async () => {
    const home = await cliHome()
    const output = capture()
    await runDeviceAutomationCli(['preset', 'install'], output.io)
    const root = join(home, '.agent-presets', 'automation')
    const ownerPath = join(root, '.fadinglight-device-automation.json')
    const owner = JSON.parse(await readFile(ownerPath, 'utf8')) as Record<string, unknown>
    owner['packageVersion'] = 'old'
    await writeFile(ownerPath, JSON.stringify(owner))
    await expect(runDeviceAutomationCli(['preset', 'status'], output.io)).resolves.toBe(0)
    expect(output.stdout.at(-1)).toContain('needs an update')

    await writeFile(join(root, 'preset.yml'), 'changed\n')
    await expect(runDeviceAutomationCli(['preset', 'status'], output.io)).resolves.toBe(1)
    expect(output.stderr.at(-1)).toContain('is modified')

    await rm(root, { recursive: true })
    await mkdir(root)
    await expect(runDeviceAutomationCli(['preset', 'status'], output.io)).resolves.toBe(1)
    expect(output.stderr.at(-1)).toContain('is foreign')
  })

  it('uses process streams when custom IO is omitted', async () => {
    await cliHome()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await expect(runDeviceAutomationCli(['preset', 'status'])).resolves.toBe(1)
    await expect(runDeviceAutomationCli([])).resolves.toBe(2)
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('not installed'))
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
  })
})
