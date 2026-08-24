#!/usr/bin/env node
/** Deterministic external DevEco CLI boundary for the assembled device-preview browser scenario. */

import { appendFile, copyFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

const args = process.argv.slice(2)
const operation = args[1]

if (operation === 'screenshot') {
  const source = process.env.DEVICE_PREVIEW_TEST_SCREEN
  const target = args[args.indexOf('--path') + 1]
  if (source === undefined || target === undefined) throw new Error('device-preview fixture: screenshot paths are missing')
  await setTimeout(600)
  await copyFile(source, target)
} else if (operation === 'click') {
  const log = process.env.DEVICE_PREVIEW_TEST_LOG
  if (log === undefined) throw new Error('device-preview fixture: click log is missing')
  await appendFile(log, `${JSON.stringify(args)}\n`)
} else {
  throw new Error(`device-preview fixture: unsupported argv ${JSON.stringify(args)}`)
}
