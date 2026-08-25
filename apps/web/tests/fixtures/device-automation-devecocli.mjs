#!/usr/bin/env node
/** Deterministic DevEco CLI boundary for the assembled device-automation browser scenario. */

import { appendFile, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const args = process.argv.slice(2)
const operation = args[1]

if (args[0] === 'skills' && operation === 'add') {
  const skill = args[args.indexOf('--skill') + 1]
  const root = args[args.indexOf('--path') + 1]
  if (skill === undefined || root === undefined) throw new Error('device-automation fixture: skill paths are missing')
  await mkdir(join(root, skill), { recursive: true })
  await writeFile(join(root, skill, 'SKILL.md'), `---\nname: ${skill}\ndescription: Test fixture\n---\n`)
  const log = process.env.DEVICE_AUTOMATION_TEST_LOG
  if (log === undefined) throw new Error('device-automation fixture: skill log is missing')
  await appendFile(log, `${JSON.stringify(args)}\n`)
  if (skill === 'hmos-local-test') await setTimeout(600)
} else if (operation === 'screenshot') {
  const source = process.env.DEVICE_AUTOMATION_TEST_SCREEN
  const target = args[args.indexOf('--path') + 1]
  if (source === undefined || target === undefined) throw new Error('device-automation fixture: screenshot paths are missing')
  await setTimeout(600)
  await copyFile(source, target)
} else if (operation === 'click') {
  const log = process.env.DEVICE_AUTOMATION_TEST_LOG
  if (log === undefined) throw new Error('device-automation fixture: click log is missing')
  await appendFile(log, `${JSON.stringify(args)}\n`)
} else {
  throw new Error(`device-automation fixture: unsupported argv ${JSON.stringify(args)}`)
}
