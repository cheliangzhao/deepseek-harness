import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/device-automation-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/cordis.yml', import.meta.url))
const overlayPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('device-automation Loader snapshot', () => {
  it('boots the real overlay, registers devecocli, and executes one deterministic command', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'device-automation',
      tempDirPrefix: 'device-automation-snapshot-',
      binScript: driver,
      libBinScript: driver,
      binArgs: [configPath, overlayPath],
      configPath,
      tsconfigPath,
    })
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toMatchInlineSnapshot(`
      {
        "prompt": "Use devecocli for HarmonyOS device work. Consult the installed deveco-cli skill for supported commands and safe workflows. Pass every command argument as a separate argv item; do not use shell syntax.",
        "result": {
          "content": [
            {
              "text": "stdout:
      device list
      ",
              "type": "text",
            },
          ],
          "isError": false,
          "value": {
            "argv": [
              "device",
              "list",
            ],
            "exitCode": 0,
            "stderr": "",
            "stderrTruncated": false,
            "stdout": "device list
      ",
            "stdoutTruncated": false,
          },
        },
        "schema": "devecocli",
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
