# @deepseek-ai/dsh-device-automation

English | [中文](README.zh.md)

Installable Bundle for HarmonyOS development automation. Its [`cordis.patch.yml`](cordis.patch.yml) mounts the platform-neutral [`device-automation-runtime`](../device-automation-runtime/README.md), the [`harmonyos`](../device-automation-harmonyos/README.md) Provider, and the browser [`Files + Device`](../../client/ui-device-automation/README.md) Consumer.

The Bundle is the publishing and installation unit. Android and iOS support can add Providers to the same runtime without changing the browser-to-Host request vocabulary; deployments with several Providers configure the runtime's `defaultProvider` or later add a browser selector.

## Configuration

The bundled patch selects `harmonyos`, advertises a 100 ms post-capture refresh delay, limits opened files to 1 MiB, and returns at most 1000 entries per directory. A later profile patch may replace those runtime values and configure the HarmonyOS Provider's executable or device serial.

## Model Experience

None, as this Bundle contributes no model-visible content. The automation preset independently mounts the HarmonyOS UI test tool and DevEco CLI skill.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The published Bundle currently includes only the HarmonyOS Provider.
- Android and iOS Providers are not implemented yet.
