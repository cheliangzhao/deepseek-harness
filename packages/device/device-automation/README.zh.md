# @fadinglight/dsh-device-automation

[English](README.md) | 中文

面向 HarmonyOS 开发自动化的可安装 Bundle。其 [`cordis.patch.yml`](cordis.patch.yml) 会挂载平台无关的 [`device-automation-runtime`](../device-automation-runtime/README.zh.md)、[`harmonyos`](../device-automation-harmonyos/README.zh.md) Provider、浏览器 [`文件 + 设备`](../../client/ui-device-automation/README.zh.md) Consumer，以及本包内随附 `automation` preset 的注册插件。

该 Bundle 是发布与安装单元。其 `@fadinglight/*` 包独立于仓库的 `@deepseek-ai/*` release family 发布。随附的 Web profile 依赖该聚合包，而不是直接注册其三个内部包。Android 和 iOS 支持可向同一运行时添加 Provider，无需改变浏览器到 Host 的请求词汇；存在多个 Provider 的部署可配置运行时 `defaultProvider`，或在未来添加浏览器选择器。

## 配置

随包 patch 选择 `harmonyos`，下发 100 ms 的截图后刷新延迟，将打开文件限制为 1 MiB，并为每个目录最多返回 1000 个条目。后续 profile patch 可替换这些运行时值，并配置 HarmonyOS Provider 的可执行文件或设备序列号。

随包 preset 携带 DevEco CLI skill，并扫描插件拥有的 `$DSH_HOME/device-automation/skills` 根目录。自动化工作区首次挂载时，HarmonyOS Provider 会检查 DevEco CLI，并在设备控制启动前把测试及故障或性能分析 skill 同步到该根目录。聚合包还依赖其组合中具名的 HarmonyOS UI 测试工具。发布路径演练会打包聚合包及其内部包，仅将聚合包 tarball 作为全新 DSH profile 的直接依赖安装，并验证已安装 patch、preset 文件、effect 拥有的根目录注册、运行时、HarmonyOS Provider 与浏览器 UI。

## 模型体验

间接影响；随包 `automation` preset 自身的插件只会为选择该模式的会话注册 HarmonyOS 测试 persona、`devecocli` 工具、随包 DevEco CLI skill，以及同步后的测试与诊断 skill 根目录。

#### KV Cache 影响

所选 preset 会在 agent 的首个请求前挂载，并对该 agent 保持前缀稳定。选择其他模式会为相应会话产生独立前缀。

## 已知限制与暂缓事项

- 当前发布的 Bundle 仅包含 HarmonyOS Provider。
- Android 与 iOS Provider 尚未实现。
