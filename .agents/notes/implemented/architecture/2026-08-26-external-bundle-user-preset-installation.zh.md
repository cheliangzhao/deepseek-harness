# Agent Note: 外部 Bundle 将 preset 安装到用户 roster

Status: implemented

[English](2026-08-26-external-bundle-user-preset-installation.md) | 中文

## Problem

外部 Bundle 可以通过 `cordis.patch.yml` 贡献 Host 与 Client 配置行，但 DSH 0.1.1-rc.2 没有用于添加包相对 Agent Preset 根目录的公开操作。因此，发布在 npm 包内的 preset 目录对 roster 不可见。调用只存在于源码 checkout 的方法，会让插件在该源码中启动，却使同一个已发布包在全局安装的 DSH 版本下失败。

## Decision

`@fadinglight/dsh-device-automation` 继续在 npm payload 中携带 `presets/automation`，而 Bundle patch 只注册自动化运行时、HarmonyOS Provider 与浏览器 UI。它发布的 `dsh-device-automation preset install` 命令会把该 preset 复制到 `<dshHome>/.agent-presets/automation`，即 Agent Presets 推导出的用户根目录。包主入口导出相同的安装器操作供程序调用；任何 Bundle 配置行都不再调用 `agentPresets`。

安装目录携带所有权记录，其中包含 schema 版本、包版本、目录清单以及每个受管文件的 SHA-256 哈希。安装和更新使用排他的同级锁，在随机同级目录中准备仅所有者可访问的内容，并通过备份 rename 替换既有受管版本。替换失败时恢复原目录；替换与回滚同时失败时报告两个结果。目标是符号链接、非目录、缺少或包含无效所有权记录、增加了目录、修改了文件或含有不受支持的文件系统条目时，安装器会保留并报告，而不是覆盖。

安装操作幂等，同时负责升级。状态检查会区分未安装、外部所有权、本地修改、当前版本与过期版本。卸载只删除所有权记录属于本包且内容未变化的目录。macOS/Linux 脚本先使用默认的精确包版本执行官方 Profile 安装命令，再执行显式 preset 命令；调用方可以覆盖该版本。精确默认值可防止 Profile 的最短发布时间策略把刚更新的 dist-tag 解析为旧 Bundle。Windows 与诊断流程直接使用相同的两条命令。持久写入由 preset 命令而非 npm `postinstall` 负责，因此包管理器的脚本策略不会静默跳过它，命令进程也能解析预期的 `DSH_HOME`。

只有选择已安装 preset 后才会访问的包，也必须能从消费者 Profile 解析。因此，面向模型的 DevEco CLI 工具以 `@fadinglight/dsh-tool-harmonyos-uitest` 发布，并继续作为聚合包依赖，但不会成为 Bundle patch 中的配置行。复制后的 preset 只在自动化 Session 中加载该外部包；Web 组合仍然只注册运行时、HarmonyOS Provider 与浏览器 UI。

安装后的 preset 具有 `user` trust，在 roster 优先级中位于全部已配置根目录之后。现有 Session 保留已经挂载的 generation，后续 Session 发现同步后的目录。配置 `includeUserRoot: false` 的部署会按意图隐藏它。这个实现部分替代了更广泛的[鸿蒙自动化平台提案](../../proposed/feature/2026-08-21-harmony-automation-platform.zh.md)中的 preset 位置方案，并遵循既有的 [Harness-home 用户根决策](../bug-fix/2026-08-11-preset-authoring-agent-validates-its-own-composition.zh.md)。

## Verification

单元覆盖固定 dry run、幂等、升级、准确所有权检查、并发修改后复查、拒绝符号链接与外部目标、保留本地修改、清理 staging、替换回滚和卸载。打包安装演练只向干净 Profile 安装聚合 tarball，在普通 Node 下执行其构建后 CLI，并通过已发布的用户根机制解析复制出的模式与外部发布工具；组装浏览器覆盖使用同样的 `user` trust 分类。

## Alternatives considered

- **动态注册包拥有的系统根目录** — 这样可保持 preset 只读并避免复制，但所需的 `registerSystemRoot()` 方法不在已发布 DSH 运行时中。官方 API 与兼容版本下限发布后可以重新考虑；插件版本不能假定源码独有的方法存在。
- **从 npm `postinstall` 写入 preset** — 否决，因为 pnpm 可能阻止依赖生命周期脚本，安装阶段环境无法可靠识别预期 Harness home，移除 npm 包时也没有对称的清理 hook。
- **修改 `agent-presets.roots` 配置行** — 否决，因为 patch config 会替换整行而非深度合并，launcher 拥有其随附绝对根目录，静态 YAML 也无法可移植地表达包相对路径。
- **复制时不记录所有权元数据** — 否决，因为升级与卸载无法区分插件内容和用户的同名 preset，最终会覆盖或删除用户工作。

## Consequences

发布后的插件可以使用全局安装 DSH 0.1.1-rc.2 已有的 Agent Presets API。安装增加一步显式同步；只安装 Bundle 会挂载 Host 与 Client 角色，但不会新增模式。用户副本会占用少量 Harness-home 空间并且可以编辑，但任何编辑都会有意地把更新与删除责任转交给用户，直到用户协调或删除该目录。
