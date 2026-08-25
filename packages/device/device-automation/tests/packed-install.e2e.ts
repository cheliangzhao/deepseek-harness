/** Packed-plugin installation rehearsal against a fresh DSH profile. */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const builtBin = join(repoRoot, 'apps/cli/lib/bin.js')
const packageDirectories = [
  'packages/client/ui-device-automation',
  'packages/device/device-automation-runtime',
  'packages/device/device-automation-harmonyos',
  'packages/device/device-automation',
  'packages/harmony/tool-harmonyos-uitest',
  'packages/util/home-paths',
  'vendor/cosmokit',
  'vendor/schemastery',
] as const

const packable = existsSync(builtBin) && packageDirectories.every((directory) => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, directory, 'package.json'), 'utf8')) as { main?: string }
  return manifest.main !== undefined && existsSync(join(repoRoot, directory, manifest.main))
})

interface PackageManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
  name: string
}

function run(command: string, args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', timeout: 180_000 })
  expect(result.status, `${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`).toBe(0)
  return result.stdout
}

describe.skipIf(!packable)('device automation: packed installation', () => {
  it('installs the aggregate tarball into a clean DSH profile with its automation mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-device-automation-packed-'))
    try {
      const packDirectory = join(root, 'packs')
      const dshHome = join(root, 'home')
      const profileDirectory = join(dshHome, 'profiles', 'clean')
      mkdirSync(packDirectory, { recursive: true })
      mkdirSync(profileDirectory, { recursive: true })

      const tarballs = new Map<string, string>()
      for (const directory of packageDirectories) {
        const packageDirectory = join(repoRoot, directory)
        const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as PackageManifest
        const before = new Set(readdirSync(packDirectory))
        run('pnpm', ['pack', '--pack-destination', packDirectory], packageDirectory)
        const filename = readdirSync(packDirectory).find(entry => entry.endsWith('.tgz') && !before.has(entry))
        expect(filename, `${manifest.name} produced no tarball`).toBeDefined()
        tarballs.set(manifest.name, join(packDirectory, filename as string))
      }

      const overrideNames = [
        '@fadinglight/dsh-client-ui-device-automation',
        '@fadinglight/dsh-device-automation-runtime',
        '@fadinglight/dsh-device-automation-harmonyos',
        '@deepseek-ai/dsh-tool-harmonyos-uitest',
        '@deepseek-ai/dsh-home-paths',
        '@deepseek-ai/cosmokit',
        '@deepseek-ai/schemastery',
      ] as const
      writeFileSync(join(profileDirectory, 'package.json'), `${JSON.stringify({
        name: 'dsh-profile-clean',
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
      }, null, 2)}\n`)
      writeFileSync(join(profileDirectory, 'cordis.patch.yml'), '[]\n')
      writeFileSync(join(profileDirectory, 'pnpm-workspace.yaml'), [
        'packages:',
        '  - .',
        '',
        'nodeLinker: hoisted',
        'autoInstallPeers: false',
        '',
        'overrides:',
        ...overrideNames.map(name => `  '${name}': '${pathToFileURL(tarballs.get(name) as string).href}'`),
        '',
      ].join('\n'))

      const environment: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: dshHome }
      delete environment.NODE_OPTIONS
      const aggregateTarball = tarballs.get('@fadinglight/dsh-device-automation')
      expect(aggregateTarball).toBeDefined()
      run(process.execPath, [builtBin, 'plugin', '--profile', 'clean', 'add', '--offline', aggregateTarball as string], root, environment)

      const installedManifest = JSON.parse(readFileSync(join(profileDirectory, 'package.json'), 'utf8')) as PackageManifest
      expect(Object.keys(installedManifest.dependencies ?? {})).toEqual(['@fadinglight/dsh-device-automation'])
      expect(installedManifest.dsh?.profile?.bundles).toEqual([
        '@deepseek-ai/dsh-base',
        '@deepseek-ai/dsh-web-app',
        '@fadinglight/dsh-device-automation',
      ])

      const installedPatch = readFileSync(join(
        profileDirectory, 'node_modules/@fadinglight/dsh-device-automation/cordis.patch.yml',
      ), 'utf8')
      expect([...installedPatch.matchAll(/^\s+name: '([^']+)'$/gmu)].map(match => match[1])).toEqual([
        '@fadinglight/dsh-device-automation',
        '@fadinglight/dsh-device-automation-runtime',
        '@fadinglight/dsh-device-automation-harmonyos',
        '@fadinglight/dsh-client-ui-device-automation',
      ])

      const dumped = run(process.execPath, [builtBin, '--profile', 'clean', '--dump-default-config'], root, environment)
      expect(dumped).toContain('# == @fadinglight/dsh-device-automation')
      expect(dumped).toContain("name: '@fadinglight/dsh-device-automation'")
      expect(dumped).toContain("name: '@fadinglight/dsh-device-automation-runtime'")
      expect(dumped).toContain("name: '@fadinglight/dsh-device-automation-harmonyos'")
      expect(dumped).toContain("name: '@fadinglight/dsh-client-ui-device-automation'")

      const installedPackage = join(profileDirectory, 'node_modules/@fadinglight/dsh-device-automation')
      const registrarProbe = run(process.execPath, ['--input-type=module', '--eval', `
        const { readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const bundle = await import(${JSON.stringify(pathToFileURL(join(installedPackage, 'lib/index.js')).href)})
        let registeredRoot
        let disposed = false
        let dispose
        bundle.apply({
          agentPresets: {
            registerSystemRoot(path) {
              registeredRoot = path
              return () => { disposed = true }
            },
          },
          effect(register) { dispose = register() },
        })
        const metadata = readFileSync(join(registeredRoot, 'automation', 'preset.yml'), 'utf8')
        const composition = readFileSync(join(registeredRoot, 'automation', 'agent.cordis.yml'), 'utf8')
        const skill = readFileSync(join(registeredRoot, 'automation', 'skills', 'deveco-cli', 'SKILL.md'), 'utf8')
        dispose()
        console.log(JSON.stringify({ registeredRoot, metadata, composition, skill, disposed }))
      `], profileDirectory)
      const registered = JSON.parse(registrarProbe) as {
        registeredRoot: string
        metadata: string
        composition: string
        skill: string
        disposed: boolean
      }
      expect(realpathSync(registered.registeredRoot)).toBe(realpathSync(join(installedPackage, 'presets')))
      expect(registered.metadata).toContain('name: 自动化测试模式')
      expect(registered.composition).toContain("name: '@deepseek-ai/dsh-tool-harmonyos-uitest'")
      expect(registered.composition).toContain("'device-automation', 'skills'")
      expect(registered.skill).toContain('name: deveco-cli')
      expect(registered.disposed).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 300_000)
})
