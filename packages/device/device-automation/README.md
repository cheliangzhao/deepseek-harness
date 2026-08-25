# @fadinglight/dsh-device-automation

English | [中文](README.zh.md)

Installable Bundle for HarmonyOS development automation. Its [`cordis.patch.yml`](cordis.patch.yml) mounts the platform-neutral [`device-automation-runtime`](../device-automation-runtime/README.md), the [`harmonyos`](../device-automation-harmonyos/README.md) Provider, the browser [`Files + Device`](../../client/ui-device-automation/README.md) Consumer, and this package's registrar for the bundled `automation` preset.

The Bundle is the publishing and installation unit. Its `@fadinglight/*` packages publish independently from the repository's `@deepseek-ai/*` release family. The shipped Web profile depends on this aggregate package instead of registering its three internal packages. Android and iOS support can add Providers to the same runtime without changing the browser-to-Host request vocabulary; deployments with several Providers configure the runtime's `defaultProvider` or later add a browser selector.

## Configuration

The bundled patch selects `harmonyos`, advertises a 100 ms post-capture refresh delay, limits opened files to 1 MiB, and returns at most 1000 entries per directory. A later profile patch may replace those runtime values and configure the HarmonyOS Provider's executable or device serial.

The packaged preset carries its DevEco CLI skill and scans the plugin-owned `$DSH_HOME/device-automation/skills` root. On the first automation workspace mount, the HarmonyOS Provider checks DevEco CLI and synchronizes its testing and fault or performance analysis skills into that root before device controls start. The aggregate depends on the HarmonyOS UI test tool named by its composition. The publish-path rehearsal packs the aggregate and its internal packages, installs only the aggregate tarball as a direct dependency of a fresh DSH profile, and verifies the installed patch, preset files, effect-owned root registration, runtime, HarmonyOS Provider, and browser UI.

## Model Experience

Indirectly, through the bundled `automation` preset, whose own plugins register the HarmonyOS testing persona, `devecocli` tool, packaged DevEco CLI skill, and synchronized testing and diagnostics skill root only for sessions that select that mode.

#### KV Cache effect

The selected preset is mounted before the agent's first request and remains prefix-stable for that agent. Selecting another mode produces that session's independent prefix.

## Known Limitations and Deferred Work

- The published Bundle currently includes only the HarmonyOS Provider.
- Android and iOS Providers are not implemented yet.
