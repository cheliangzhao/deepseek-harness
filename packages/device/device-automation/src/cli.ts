/** Command-line interface for the packaged automation Preset installer. */

import {
  inspectAutomationPreset, installAutomationPreset, uninstallAutomationPreset,
} from './index.ts'

/** Writable streams used by {@link runDeviceAutomationCli}. */
export interface DeviceAutomationCliIo {
  /** Human-readable normal output. */
  stdout(message: string): void
  /** Usage and failure output. */
  stderr(message: string): void
}

const defaultIo: DeviceAutomationCliIo = {
  stdout: (message) => { process.stdout.write(`${message}\n`) },
  stderr: (message) => { process.stderr.write(`${message}\n`) },
}

function usage(io: DeviceAutomationCliIo): void {
  io.stderr('Usage: dsh-device-automation preset <install|status|uninstall> [--dry-run]')
}

/**
 * Run one device-automation CLI invocation.
 * @param args - arguments after the executable name.
 * @param io - output sinks; omission writes to process stdout and stderr.
 * @returns process exit code: zero for success, two for invalid usage, or one for unhealthy status.
 */
export async function runDeviceAutomationCli(
  args: readonly string[],
  io: DeviceAutomationCliIo = defaultIo,
): Promise<number> {
  const dryRun = args.includes('--dry-run')
  const positionals = args.filter(argument => argument !== '--dry-run')
  if (positionals[0] !== 'preset' || positionals.length !== 2
    || args.some(argument => argument.startsWith('-') && argument !== '--dry-run')) {
    usage(io)
    return 2
  }
  const command = positionals[1]
  if (command === 'status') {
    if (dryRun) {
      usage(io)
      return 2
    }
    const status = await inspectAutomationPreset()
    if (status.state === 'absent') {
      io.stdout(`Automation preset is not installed at ${status.path}`)
      return 1
    }
    if (status.state === 'foreign' || status.state === 'modified') {
      io.stderr(`Automation preset at ${status.path} is ${status.state}: ${status.reason}`)
      return 1
    }
    io.stdout(`Automation preset ${status.current ? 'is current' : 'needs an update'} at ${status.path} (${status.installedVersion})`)
    return 0
  }
  if (command === 'install') {
    const result = await installAutomationPreset({ dryRun })
    io.stdout(`Automation preset ${result.action} at ${result.path} (${result.version})`)
    return 0
  }
  if (command === 'uninstall') {
    const result = await uninstallAutomationPreset({ dryRun })
    io.stdout(`Automation preset ${result.action} at ${result.path}`)
    return 0
  }
  usage(io)
  return 2
}
