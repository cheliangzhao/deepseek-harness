# @fadinglight/dsh-device-automation

[English](README.md) | 中文

面向 HarmonyOS 开发自动化的可安装 Bundle。其 [`cordis.patch.yml`](cordis.patch.yml) 会挂载平台无关的 [`device-automation-runtime`](../device-automation-runtime/README.zh.md)、[`harmonyos`](../device-automation-harmonyos/README.zh.md) Provider 与浏览器 [`文件 + 设备`](../../client/ui-device-automation/README.zh.md) Consumer。随包的 `dsh-device-automation` CLI 会把 `automation` preset 安装到用户 preset roster，不依赖尚未发布的 Agent Presets API。

该 Bundle 是发布与安装单元。其 `@fadinglight/*` 包独立于仓库的 `@deepseek-ai/*` release family 发布。随附的 Web profile 依赖该聚合包，而不是直接注册其三个内部包。Android 和 iOS 支持可向同一运行时添加 Provider，无需改变浏览器到 Host 的请求词汇；存在多个 Provider 的部署可配置运行时 `defaultProvider`，或在未来添加浏览器选择器。

## 安装

macOS 与 Linux 安装脚本会把 Bundle 加入 Web profile 并同步 preset；可选参数是 npm 版本或 tag，默认使用精确版本 `0.1.0-rc.13`。固定版本可避免 Profile 的最短发布时间策略把刚更新的 dist-tag 解析为旧 Bundle：

```sh
curl -fsSL https://raw.githubusercontent.com/cheliangzhao/deepseek-harness/main/packages/device/device-automation/scripts/install.sh | bash
```

对应的显式命令如下，Windows 也使用这组命令：

```sh
dsh plugin --profile web add @fadinglight/dsh-device-automation@0.1.0-rc.13
dsh plugin --profile web exec dsh-device-automation preset install
```

第二条命令把随包文件复制到 `$DSH_HOME/.agent-presets/automation`；未设置 `DSH_HOME` 时使用 `~/.dsh/.agent-presets/automation`。该命令幂等，同时用于升级。`preset status` 会报告未安装、已安装版本、本地修改或外部所有权；`preset install` 与 `preset uninstall` 接受 `--dry-run`。

```sh
dsh plugin --profile web exec dsh-device-automation preset status
dsh plugin --profile web exec dsh-device-automation preset install --dry-run
```

安装器会记录包版本以及受管文件和目录的准确哈希。目标是符号链接、不属于本插件的 `automation` 目录或包含本地修改时，它拒绝替换或删除。移除 Bundle 前先卸载受管 preset：

```sh
dsh plugin --profile web exec dsh-device-automation preset uninstall
dsh plugin --profile web remove @fadinglight/dsh-device-automation
```

Bundle 成员变化后需重启 `dsh web`。现有 session 保留已经挂载的 preset，新建 session 会发现同步后的版本。将 `agent-presets.includeUserRoot` 配置为 `false` 的部署不会扫描这个用户安装的 preset。

## 配置

随包 patch 选择 `harmonyos`，下发 100 ms 的截图后刷新延迟，将打开文件限制为 1 MiB，并为每个目录最多返回 1000 个条目。后续 profile patch 可替换这些运行时值，并配置 HarmonyOS Provider 的可执行文件或设备序列号。

随包 preset 携带 DevEco CLI skill，并扫描插件拥有的 `$DSH_HOME/device-automation/skills` 根目录。自动化工作区首次挂载时，HarmonyOS Provider 会复用完整且带版本的 Skill 同步状态。每个配置的 7 天间隔到期后，它会更新 DevEco CLI 和声明的 Skills；仅某个 Skill 缺失时会修复该问题，但不会重置该间隔。聚合包还依赖其组合中具名的 HarmonyOS UI 测试工具。发布路径演练会打包聚合包及其内部包，仅将聚合包 tarball 作为全新 DSH profile 的直接依赖安装，执行发布后的 preset CLI，并验证已安装 patch、受管用户 preset、运行时、HarmonyOS Provider 与浏览器 UI。

## 模型体验

间接影响；随包 `automation` preset 自身的插件只会为选择该模式的会话注册 HarmonyOS 测试 persona、`devecocli` 工具、随包 DevEco CLI skill，以及同步后的测试与诊断 skill 根目录。

#### KV Cache 影响

所选 preset 会在 agent 的首个请求前挂载，并对该 agent 保持前缀稳定。选择其他模式会为相应会话产生独立前缀。

## 已知限制与暂缓事项

- 当前发布的 Bundle 仅包含 HarmonyOS Provider。
- Android 与 iOS Provider 尚未实现。
- 只安装 Bundle 而不运行 `preset install` 会挂载 Host 与 Client 插件，但不会新增自动化模式。
