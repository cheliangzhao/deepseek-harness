# @fadinglight/dsh-device-automation

English | [中文](README.zh.md)

Installable Bundle for HarmonyOS development automation. Its [`cordis.patch.yml`](cordis.patch.yml) mounts the platform-neutral [`device-automation-runtime`](../device-automation-runtime/README.md), the [`harmonyos`](../device-automation-harmonyos/README.md) Provider, and the browser [`Files + Device`](../../client/ui-device-automation/README.md) Consumer. The packaged `dsh-device-automation` CLI installs the bundled `automation` preset into the user's preset roster without requiring an unreleased Agent Presets API.

The Bundle is the publishing and installation unit. Its `@fadinglight/*` packages publish independently from the repository's `@deepseek-ai/*` release family. The shipped Web profile depends on this aggregate package instead of registering its three internal packages. Android and iOS support can add Providers to the same runtime without changing the browser-to-Host request vocabulary; deployments with several Providers configure the runtime's `defaultProvider` or later add a browser selector.

## Installation

The macOS and Linux installer adds the Bundle to the Web profile and synchronizes the preset; its optional argument is an npm version or tag and defaults to the exact release `0.1.0-rc.13`. Pinning avoids a Profile's minimum-release-age policy resolving a fresh dist-tag to an older Bundle:

```sh
curl -fsSL https://raw.githubusercontent.com/cheliangzhao/deepseek-harness/main/packages/device/device-automation/scripts/install.sh | bash
```

The equivalent explicit commands, also used on Windows, are:

```sh
dsh plugin --profile web add @fadinglight/dsh-device-automation@0.1.0-rc.13
dsh plugin --profile web exec dsh-device-automation preset install
```

The second command copies the packaged files to `$DSH_HOME/.agent-presets/automation`, or `~/.dsh/.agent-presets/automation` when `DSH_HOME` is unset. It is idempotent and also performs upgrades. `preset status` reports absence, the installed version, local modification, or foreign ownership; `--dry-run` is accepted by `preset install` and `preset uninstall`.

```sh
dsh plugin --profile web exec dsh-device-automation preset status
dsh plugin --profile web exec dsh-device-automation preset install --dry-run
```

The installer records the package version and the exact managed file and directory hashes. It refuses to replace or remove a symlink, an unowned `automation` directory, or locally changed content. Uninstall the managed preset before removing the Bundle:

```sh
dsh plugin --profile web exec dsh-device-automation preset uninstall
dsh plugin --profile web remove @fadinglight/dsh-device-automation
```

Restart `dsh web` after changing Bundle membership. Existing sessions keep their mounted preset; newly created sessions discover the synchronized version. A deployment with `agent-presets.includeUserRoot: false` does not scan this user-installed preset.

## Configuration

The bundled patch selects `harmonyos`, advertises a 100 ms post-capture refresh delay, limits opened files to 1 MiB, and returns at most 1000 entries per directory. A later profile patch may replace those runtime values and configure the HarmonyOS Provider's executable or device serial.

The packaged preset carries its DevEco CLI skill and scans the plugin-owned `$DSH_HOME/device-automation/skills` root. On the first automation workspace mount, the HarmonyOS Provider reuses a complete versioned Skill synchronization state. Once per configured seven-day interval, it updates DevEco CLI and the declared Skills; a missing Skill is repaired without resetting that interval. The aggregate depends on the HarmonyOS UI test tool named by its composition. The publish-path rehearsal packs the aggregate and its internal packages, installs only the aggregate tarball as a direct dependency of a fresh DSH profile, runs the published preset CLI, and verifies the installed patch, managed user preset, runtime, HarmonyOS Provider, and browser UI.

## Model Experience

Indirectly, through the bundled `automation` preset, whose own plugins register the HarmonyOS testing persona, `devecocli` tool, packaged DevEco CLI skill, and synchronized testing and diagnostics skill root only for sessions that select that mode.

#### KV Cache effect

The selected preset is mounted before the agent's first request and remains prefix-stable for that agent. Selecting another mode produces that session's independent prefix.

## Known Limitations and Deferred Work

- The published Bundle currently includes only the HarmonyOS Provider.
- Android and iOS Providers are not implemented yet.
- Installing the Bundle without running `preset install` mounts its Host and Client plugins but does not add the automation mode.
