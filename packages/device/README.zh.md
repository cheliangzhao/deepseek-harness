# device

[English](README.md) | 中文

DeepSeek Harness 的跨平台设备自动化能力。该家族将可安装 Bundle、平台无关运行时、平台 Provider 与浏览器 Consumer 分离，使 Android 和 iOS 实现可在不替换 UI 协议的情况下加入。

| 包 | 角色 |
|---|---|
| [`device-automation/`](device-automation/README.zh.md) | 可安装 Bundle（`@fadinglight/dsh-device-automation`） |
| [`device-automation-runtime/`](device-automation-runtime/README.zh.md) | Service Definition 与 Host Consumer（`ctx.deviceAutomation`） |
| [`device-automation-harmonyos/`](device-automation-harmonyos/README.zh.md) | 基于 DevEco CLI 的 HarmonyOS Provider |

浏览器 Consumer 位于 [`client/ui-device-automation`](../client/ui-device-automation/README.zh.md)。面向模型的 HarmonyOS 命令访问仍位于 [`harmony/tool-harmonyos-uitest`](../harmony/tool-harmonyos-uitest/README.zh.md)。
