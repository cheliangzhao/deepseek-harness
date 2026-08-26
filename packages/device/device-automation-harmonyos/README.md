# @fadinglight/dsh-device-automation-harmonyos

English | [中文](README.zh.md)

HarmonyOS Service Provider for [`ctx.deviceAutomation`](../device-automation-runtime/README.md). It registers the `harmonyos` provider and translates platform-neutral screenshot and relative-tap requests into `devecocli ui screenshot` and `devecocli ui click` argv.

On its first preparation request, the provider resolves `devecocli`. A missing executable returns the official npm installation command and package URL without starting device work. An available CLI checks the atomically written `$DSH_HOME/device-automation/skills/.fadinglight-device-automation-skills.json` state and each required `SKILL.md`; matching Provider version, ordered Skill list, files, and synchronization age return ready without a subprocess or network request. Missing, unreadable, or mismatched state, or state older than the configured interval, runs `devecocli update` and then force-adds `hmos-local-test`, `hmos-instrument-test`, `hmos-cppcrash-analysis`, `hmos-jscrash-analysis`, `hmos-jsleak-analysis`, `hmos-memleak-analysis`, `hmos-native-memleak-analysis`, `hmos-fdleak-analysis`, `hmos-apifault-analysis`, and `hmos-appfreeze-analysis` into that directory. A missing Skill with otherwise current state only repairs the Skills and preserves the full-synchronization time. Before each Skill command starts, the Provider publishes the completed count, total count, and current Skill as read-only progress. It verifies each installed Skill before committing the state, so interrupted or incomplete attempts remain retryable. Concurrent requests share one preparation, and a successful result is reused for the provider lifetime.

The provider validates each screenshot as a non-empty bounded PNG, reads its native dimensions, and retains only the decoded dimensions and bytes needed for the current interaction. Screenshot and tap operations share one serial queue because DevEco CLI targets one authorized device. Disposal aborts active preparation or device commands, prevents queued work from starting, waits for both operation owners to settle, and then removes its temporary directory.

## Configuration

| Field | Meaning |
|---|---|
| `devecoCliExecutable` | Optional absolute DevEco CLI path; otherwise `ctx.subprocess` resolves `devecocli`. |
| `deviceSerial` | Optional authorized device serial passed as `--device`. |
| `maxBytes` | Maximum accepted encoded screenshot size; default 16 MiB. |
| `timeoutMs` | Screenshot or tap deadline; default 15 seconds. |
| `skillSyncTimeoutMs` | Deadline for each `devecocli update` or `devecocli skills add` command; default 120 seconds. |
| `fullSyncIntervalMs` | Maximum age of a complete DevEco CLI and Skill synchronization; default 7 days. |

## Model Experience

None, as this Provider registers no model-visible prompt or tool. The separate [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.md) owns model-facing DevEco CLI access.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Required synchronization needs the catalog used by the installed DevEco CLI.
- One provider instance controls one selected HarmonyOS device.
- Screenshot and tap are the only platform-neutral operations currently requested by the browser Consumer.
