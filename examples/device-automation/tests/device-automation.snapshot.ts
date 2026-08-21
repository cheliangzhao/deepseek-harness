import { describe, expect, it } from 'vitest'
import { validateDevEcoCliArgv } from '@deepseek-ai/dsh-tool-harmonyos-uitest'

describe('device-automation keyless command transcript', () => {
  it('pins the generic DevEco CLI argv passed from skill guidance', () => {
    const transcript = [
      validateDevEcoCliArgv(['device', 'list', '--format', 'json']),
      validateDevEcoCliArgv(['ui', 'click', '261', '349', '--device', 'fixture-device']),
    ]
    expect(transcript).toMatchInlineSnapshot(`
      [
        [
          "device",
          "list",
          "--format",
          "json",
        ],
        [
          "ui",
          "click",
          "261",
          "349",
          "--device",
          "fixture-device",
        ],
      ]
    `)
  })
})
