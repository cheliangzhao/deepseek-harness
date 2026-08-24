# @deepseek-ai/dsh-device-automation

[English](README.md) | 中文

面向 HarmonyOS 开发自动化的可安装 Bundle。其 [`cordis.patch.yml`](cordis.patch.yml) 会挂载平台无关的 [`device-automation-runtime`](../device-automation-runtime/README.zh.md)、[`harmonyos`](../device-automation-harmonyos/README.zh.md) Provider，以及浏览器 [`文件 + 设备`](../../client/ui-device-automation/README.zh.md) Consumer。

该 Bundle 是发布与安装单元。Android 和 iOS 支持可向同一运行时添加 Provider，无需改变浏览器到 Host 的请求词汇；存在多个 Provider 的部署可配置运行时 `defaultProvider`，或在未来添加浏览器选择器。

## 配置

随包 patch 选择 `harmonyos`，下发 100 ms 的截图后刷新延迟，将打开文件限制为 1 MiB，并为每个目录最多返回 1000 个条目。后续 profile patch 可替换这些运行时值，并配置 HarmonyOS Provider 的可执行文件或设备序列号。

## 模型体验

无；该 Bundle 不贡献模型可见内容。automation preset 会独立挂载 HarmonyOS UI 测试工具与 DevEco CLI skill。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 当前发布的 Bundle 仅包含 HarmonyOS Provider。
- Android 与 iOS Provider 尚未实现。
