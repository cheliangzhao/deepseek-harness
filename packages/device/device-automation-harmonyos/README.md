# @fadinglight/dsh-device-automation-harmonyos

English | [中文](README.zh.md)

HarmonyOS Service Provider for [`ctx.deviceAutomation`](../device-automation-runtime/README.md). It registers the `harmonyos` provider and translates platform-neutral screenshot and relative-tap requests into `devecocli ui screenshot` and `devecocli ui click` argv.

On its first preparation request, the provider resolves `devecocli`. A missing executable returns the official npm installation command and package URL without starting device work. An available CLI synchronizes `hmos-local-test`, `hmos-instrument-test`, `hmos-cppcrash-analysis`, `hmos-jscrash-analysis`, `hmos-jsleak-analysis`, `hmos-memleak-analysis`, `hmos-native-memleak-analysis`, `hmos-fdleak-analysis`, `hmos-apifault-analysis`, and `hmos-appfreeze-analysis` into `$DSH_HOME/device-automation/skills`. Before each command starts, the Provider publishes the completed count, total count, and current Skill as read-only progress. Concurrent requests share one synchronization, a successful result is reused for the provider lifetime, and a failed attempt is discarded. The next preparation request automatically reissues the idempotent forced additions, allowing an interrupted initial download to reuse installed Skills and finish without confirmation.

The provider validates each screenshot as a non-empty bounded PNG, reads its native dimensions, and retains only the decoded dimensions and bytes needed for the current interaction. Screenshot and tap operations share one serial queue because DevEco CLI targets one authorized device. Disposal aborts active preparation or device commands, prevents queued work from starting, waits for both operation owners to settle, and then removes its temporary directory.

## Configuration

| Field | Meaning |
|---|---|
| `devecoCliExecutable` | Optional absolute DevEco CLI path; otherwise `ctx.subprocess` resolves `devecocli`. |
| `deviceSerial` | Optional authorized device serial passed as `--device`. |
| `maxBytes` | Maximum accepted encoded screenshot size; default 16 MiB. |
| `timeoutMs` | Screenshot or tap deadline; default 15 seconds. |
| `skillSyncTimeoutMs` | Deadline for each `devecocli skills add` command; default 120 seconds. |

## Model Experience

None, as this Provider registers no model-visible prompt or tool. The separate [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.md) owns model-facing DevEco CLI access.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Skill synchronization requires network access to the catalog used by the installed DevEco CLI.
- One provider instance controls one selected HarmonyOS device.
- Screenshot and tap are the only platform-neutral operations currently requested by the browser Consumer.
