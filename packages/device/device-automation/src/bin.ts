#!/usr/bin/env node
/** Published executable for explicit automation Preset installation. */

import { runDeviceAutomationCli } from './cli.ts'

/* v8 ignore start -- published-entry wrapper; packed-install.e2e executes lib/bin.js */
try {
  process.exitCode = await runDeviceAutomationCli(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
/* v8 ignore stop */
