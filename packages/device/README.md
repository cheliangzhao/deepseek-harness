# device

English | [中文](README.zh.md)

Cross-platform device automation capability for DeepSeek Harness. The family separates the installable Bundle, platform-neutral runtime, platform Provider, and browser Consumer so Android and iOS implementations can join without replacing the UI protocol.

| Package | Role |
|---|---|
| [`device-automation/`](device-automation/README.md) | installable Bundle (`@deepseek-ai/dsh-device-automation`) |
| [`device-automation-runtime/`](device-automation-runtime/README.md) | Service Definition and Host Consumer (`ctx.deviceAutomation`) |
| [`device-automation-harmonyos/`](device-automation-harmonyos/README.md) | HarmonyOS Provider over DevEco CLI |

The browser Consumer lives in [`client/ui-device-automation`](../client/ui-device-automation/README.md). Model-facing HarmonyOS command access remains in [`harmony/tool-harmonyos-uitest`](../harmony/tool-harmonyos-uitest/README.md).
