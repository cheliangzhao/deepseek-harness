/**
 * Installer for the `automation` Agent Preset carried by the device automation
 * Bundle. The published Bundle mounts Host and Client plugins through its
 * patch; this module copies the preset into the Harness home's writable roster
 * without requiring a newer `dsh-agent-presets` runtime API.
 * @module @fadinglight/dsh-device-automation
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm,
} from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const PACKAGE_NAME = '@fadinglight/dsh-device-automation'
const PRESET_ID = 'automation'
const USER_PRESET_DIR = '.agent-presets'
const OWNER_FILE = '.fadinglight-device-automation.json'
const OWNER_SCHEMA_VERSION = 1
const LOCK_WAIT_MS = 10_000
const SOURCE_PRESET_DIR = fileURLToPath(new URL('../presets/automation/', import.meta.url))
const PACKAGE_MANIFEST = fileURLToPath(new URL('../package.json', import.meta.url))

interface TreeDigest {
  directories: string[]
  files: Record<string, string>
}

interface OwnerRecord extends TreeDigest {
  owner: typeof PACKAGE_NAME
  packageVersion: string
  presetId: typeof PRESET_ID
  schemaVersion: typeof OWNER_SCHEMA_VERSION
}

/** Options shared by preset inspection and mutation operations. */
export interface AutomationPresetOptions {
  /** Explicit Harness home; omission resolves `$DSH_HOME`, then `~/.dsh`. */
  dshHome?: string
  /** Report the mutation without changing the filesystem. */
  dryRun?: boolean
}

/** Observed state of the user-installed automation preset. */
export type AutomationPresetStatus =
  | { state: 'absent'; path: string }
  | { state: 'foreign'; path: string; reason: string }
  | { state: 'modified'; path: string; installedVersion: string; reason: string }
  | { state: 'installed'; path: string; installedVersion: string; current: boolean }

/** Result of installing or updating the automation preset. */
export interface AutomationPresetInstallResult {
  /** Filesystem action taken, or reported when `dryRun` is true. */
  action: 'installed' | 'updated' | 'unchanged' | 'would-install' | 'would-update'
  /** Installed preset directory. */
  path: string
  /** Package version whose preset content is selected. */
  version: string
}

/** Result of uninstalling the automation preset. */
export interface AutomationPresetUninstallResult {
  /** Filesystem action taken, or reported when `dryRun` is true. */
  action: 'removed' | 'unchanged' | 'would-remove'
  /** Managed preset directory. */
  path: string
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

function sameTree(left: TreeDigest, right: TreeDigest): boolean {
  if (left.directories.length !== right.directories.length
    || left.directories.some((directory, index) => directory !== right.directories[index])) return false
  const leftFiles = Object.entries(left.files)
  const rightFiles = Object.entries(right.files)
  return leftFiles.length === rightFiles.length
    && leftFiles.every(([path, hash], index) => {
      const candidate = rightFiles[index]
      return candidate?.[0] === path && candidate[1] === hash
    })
}

async function digestTree(root: string, skipOwnerFile: boolean): Promise<TreeDigest> {
  const directories: string[] = []
  const files: Record<string, string> = {}
  async function walk(directory: string, segments: string[]): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (skipOwnerFile && segments.length === 0 && entry.name === OWNER_FILE) continue
      const absolute = join(directory, entry.name)
      const relative = [...segments, entry.name].join('/')
      if (entry.isSymbolicLink()) {
        throw new Error(`device-automation preset contains a symbolic link at ${absolute}`)
      }
      if (entry.isDirectory()) {
        directories.push(relative)
        await walk(absolute, [...segments, entry.name])
        continue
      }
      if (!entry.isFile()) {
        throw new Error(`device-automation preset contains an unsupported filesystem entry at ${absolute}`)
      }
      files[relative] = createHash('sha256').update(await readFile(absolute)).digest('hex')
    }
  }
  await walk(root, [])
  return { directories, files }
}

function parseOwnerRecord(value: unknown): OwnerRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate['schemaVersion'] !== OWNER_SCHEMA_VERSION
    || candidate['owner'] !== PACKAGE_NAME
    || candidate['presetId'] !== PRESET_ID
    || typeof candidate['packageVersion'] !== 'string'
    || !isStringArray(candidate['directories'])
    || typeof candidate['files'] !== 'object'
    || candidate['files'] === null
    || Array.isArray(candidate['files'])
    || Object.entries(candidate['files']).some(([path, hash]) => path.length === 0 || typeof hash !== 'string')) {
    return undefined
  }
  return {
    schemaVersion: OWNER_SCHEMA_VERSION,
    owner: PACKAGE_NAME,
    presetId: PRESET_ID,
    packageVersion: candidate['packageVersion'],
    directories: [...candidate['directories']],
    files: candidate['files'] as Record<string, string>,
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

async function packageVersion(): Promise<string> {
  const parsed = JSON.parse(await readFile(PACKAGE_MANIFEST, 'utf8')) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
    || typeof (parsed as Record<string, unknown>)['version'] !== 'string') {
    throw new Error(`device-automation: package manifest has no version at ${PACKAGE_MANIFEST}`)
  }
  return (parsed as { version: string }).version
}

function presetPath(options?: AutomationPresetOptions): string {
  return join(resolveDshHome(options?.dshHome), USER_PRESET_DIR, PRESET_ID)
}

async function sourceRecord(): Promise<OwnerRecord> {
  return {
    schemaVersion: OWNER_SCHEMA_VERSION,
    owner: PACKAGE_NAME,
    presetId: PRESET_ID,
    packageVersion: await packageVersion(),
    ...await digestTree(SOURCE_PRESET_DIR, false),
  }
}

async function inspectTarget(path: string, source?: OwnerRecord): Promise<AutomationPresetStatus> {
  let target
  try {
    target = await lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { state: 'absent', path }
    throw error
  }
  if (target.isSymbolicLink() || !target.isDirectory()) {
    return { state: 'foreign', path, reason: 'the target is not a real directory' }
  }
  let rawOwner: string
  try {
    rawOwner = await readFile(join(path, OWNER_FILE), 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { state: 'foreign', path, reason: `the directory is not owned by ${PACKAGE_NAME}` }
    }
    throw error
  }
  let parsedOwner: unknown
  try {
    parsedOwner = JSON.parse(rawOwner) as unknown
  } catch {
    return { state: 'foreign', path, reason: `the ownership record ${OWNER_FILE} is invalid JSON` }
  }
  const owner = parseOwnerRecord(parsedOwner)
  if (owner === undefined) {
    return { state: 'foreign', path, reason: `the ownership record ${OWNER_FILE} is invalid` }
  }
  let actual: TreeDigest
  try {
    actual = await digestTree(path, true)
  } catch (error) {
    return {
      state: 'modified', path, installedVersion: owner.packageVersion,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  if (!sameTree(owner, actual)) {
    return {
      state: 'modified', path, installedVersion: owner.packageVersion,
      reason: 'managed files or directories differ from the installed ownership record',
    }
  }
  const selected = source ?? await sourceRecord()
  return {
    state: 'installed', path, installedVersion: owner.packageVersion,
    current: owner.packageVersion === selected.packageVersion && sameTree(owner, selected),
  }
}

async function tightenModes(root: string): Promise<void> {
  await chmod(root, 0o700)
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) await tightenModes(path)
    else await chmod(path, 0o600)
  }
}

async function preparePreset(userRoot: string, owner: OwnerRecord): Promise<{ parent: string; staged: string }> {
  const parent = await mkdtemp(join(userRoot, '.automation-install-'))
  const staged = join(parent, PRESET_ID)
  try {
    await cp(SOURCE_PRESET_DIR, staged, { recursive: true, dereference: false, force: false, errorOnExist: true })
    await tightenModes(staged)
    await writeFileAtomic(join(staged, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, {
      mode: 0o600,
      dirMode: 0o700,
    })
    return { parent, staged }
  } catch (error) {
    await rm(parent, { recursive: true, force: true })
    throw error
  }
}

function mutationRefusal(
  operation: string,
  status: Extract<AutomationPresetStatus, { state: 'foreign' | 'modified' }>,
): Error {
  return new Error(`device-automation: refusing to ${operation} ${status.path}: ${status.reason}`)
}

/**
 * Inspect the user-installed automation preset without changing it.
 * @param options - optional Harness-home override.
 * @returns ownership, modification, and package-version state.
 */
export async function inspectAutomationPreset(options?: AutomationPresetOptions): Promise<AutomationPresetStatus> {
  return await inspectTarget(presetPath(options))
}

/**
 * Install or update the packaged automation preset in the Harness home's user
 * roster. A foreign, symlinked, or locally modified target is never replaced.
 * The update is serialized across processes and rolls the old directory back
 * when the replacement rename fails.
 * @param options - Harness-home override and optional dry-run mode.
 * @returns the completed or proposed action and selected package version.
 * @throws when ownership cannot be established, local content changed, or filesystem work fails.
 */
export async function installAutomationPreset(
  options?: AutomationPresetOptions,
): Promise<AutomationPresetInstallResult> {
  const path = presetPath(options)
  const owner = await sourceRecord()
  const initial = await inspectTarget(path, owner)
  if (initial.state === 'foreign' || initial.state === 'modified') throw mutationRefusal('install over', initial)
  if (initial.state === 'installed' && initial.current) {
    return { action: 'unchanged', path, version: owner.packageVersion }
  }
  if (options?.dryRun === true) {
    return {
      action: initial.state === 'absent' ? 'would-install' : 'would-update',
      path,
      version: owner.packageVersion,
    }
  }
  const userRoot = join(resolveDshHome(options?.dshHome), USER_PRESET_DIR)
  await mkdir(userRoot, { recursive: true, mode: 0o700 })
  return await withFileLock(path, async () => {
    const status = await inspectTarget(path, owner)
    if (status.state === 'foreign' || status.state === 'modified') throw mutationRefusal('install over', status)
    if (status.state === 'installed' && status.current) {
      return { action: 'unchanged', path, version: owner.packageVersion }
    }
    const prepared = await preparePreset(userRoot, owner)
    try {
      if (status.state === 'absent') {
        await rename(prepared.staged, path)
        return { action: 'installed', path, version: owner.packageVersion }
      }
      const backup = join(userRoot, `.automation-backup-${randomUUID()}`)
      await rename(path, backup)
      try {
        await rename(prepared.staged, path)
      } catch (replaceError) {
        try {
          await rename(backup, path)
        } catch (rollbackError) {
          throw new AggregateError(
            [replaceError, rollbackError],
            `device-automation: failed to replace ${path} and restore ${backup}`,
          )
        }
        throw replaceError
      }
      await rm(backup, { recursive: true, force: true })
      return { action: 'updated', path, version: owner.packageVersion }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true })
    }
  }, { waitMs: LOCK_WAIT_MS })
}

/**
 * Remove an unchanged automation preset owned by this package. Foreign or
 * locally modified directories are retained for manual recovery.
 * @param options - Harness-home override and optional dry-run mode.
 * @returns the completed or proposed removal action.
 * @throws when ownership cannot be established, local content changed, or filesystem work fails.
 */
export async function uninstallAutomationPreset(
  options?: AutomationPresetOptions,
): Promise<AutomationPresetUninstallResult> {
  const path = presetPath(options)
  const initial = await inspectTarget(path)
  if (initial.state === 'absent') return { action: 'unchanged', path }
  if (initial.state !== 'installed') throw mutationRefusal('remove', initial)
  if (options?.dryRun === true) return { action: 'would-remove', path }
  const userRoot = join(resolveDshHome(options?.dshHome), USER_PRESET_DIR)
  await mkdir(userRoot, { recursive: true, mode: 0o700 })
  return await withFileLock(path, async () => {
    const status = await inspectTarget(path)
    if (status.state === 'absent') return { action: 'unchanged', path }
    if (status.state !== 'installed') throw mutationRefusal('remove', status)
    await rm(path, { recursive: true, force: true })
    return { action: 'removed', path }
  }, { waitMs: LOCK_WAIT_MS })
}
