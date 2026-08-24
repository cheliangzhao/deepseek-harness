# @deepseek-ai/dsh-device-automation-harmonyos

English | [中文](README.zh.md)

HarmonyOS Service Provider for [`ctx.deviceAutomation`](../device-automation-runtime/README.md). It registers the `harmonyos` provider and translates platform-neutral screenshot and relative-tap requests into `devecocli ui screenshot` and `devecocli ui click` argv.

The provider validates each screenshot as a non-empty bounded PNG, reads its native dimensions, and retains only the decoded dimensions and bytes needed for the current interaction. Screenshot and tap operations share one serial queue because DevEco CLI targets one authorized device. Disposal aborts the active command, prevents queued work from starting, waits for the queue to settle, and then removes its temporary directory.

## Configuration

| Field | Meaning |
|---|---|
| `devecoCliExecutable` | Optional absolute DevEco CLI path; otherwise `ctx.subprocess` resolves `devecocli`. |
| `deviceSerial` | Optional authorized device serial passed as `--device`. |
| `maxBytes` | Maximum accepted encoded screenshot size; default 16 MiB. |
| `timeoutMs` | Screenshot or tap deadline; default 15 seconds. |

## Model Experience

None, as this Provider registers no model-visible prompt or tool. The separate [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.md) owns model-facing DevEco CLI access.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- One provider instance controls one selected HarmonyOS device.
- Screenshot and tap are the only platform-neutral operations currently requested by the browser Consumer.
