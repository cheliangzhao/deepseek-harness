# Agent Note: 鸿蒙自动化测试平台

Status: proposed

[English](2026-08-21-harmony-automation-platform.md) | 中文

## Problem

测试工程师需要在 `dsh` 里对连接的鸿蒙手机执行测试用例：以自然语言加结构化 YAML 输入用例，由 agent 在设备上执行，失败项汇总为 bug 单列表展示在 Web 界面右边栏并支持导出。目前 `dsh` 没有设备驱动能力、没有 bug 上报词表，也没有与 standard/code/minimal/cordis 并列的「自动化测试模式」。用户还希望右边栏能实时预览设备画面。

## Proposal

按既有能力缝模板（`packages/web/`）在 `packages/harmony/` 下新增鸿蒙设备能力族；新增 bug 上报工具并接入 session projection；新增接管 Web `details` 槽位的客户端面板；新增 `automation` agent preset；新增画面预览端点。分四个阶段，每阶段一个可合并 PR。

### P1 — DevEco CLI 能力层

- `packages/harmony/tool-uitest` — 一个模型可见的 `devecocli` 工具。它接受普通 argv 向量，用于 `device`、`ui`、`log`、`build`、`run`、`check` 和 `docs` 命令族；命令知识由已安装的 `deveco-cli` skill 提供。
- 示例 leaf `examples/device-automation/` 使用 keyless argv transcript，并完成组、TypeScript reference、包列表和示例依赖登记。

### P2 — bug 单、右边栏面板、导出

- `packages/harmony/harmony-tool-bug-report` — `bug_report` 工具：结构化 bug（严重级/标题/步骤/预期/实际/证据引用）经 `presentationMeta` 投射进 `tool/result.meta`，因此**不加 `SessionEventMap` 成员、两个 SDK 都不动**。同包注册 host projection 定义 `bugList`（仿 `packages/llm/token-meter`）：按 callId 折叠 `tool/result` 事件（幂等、latest-wins），`stateVersion: 1`，客户端安全类型在 `src/client.ts`。
- `packages/client/ui-bug-report` — 客户端插件以 priority -1 接管 `details` 槽位（单槽遮蔽：移除 ui-conversation 的 `details` 注册；插件重新声明 `conversation.details.tool` 子座保留工具详情；共享聊天选择 store 经 `IConversation` 服务暴露——合法的跨包通道）。面板分页：bug 列表（`useProjection('bugList')`、严重级徽章、证据链接、导出按钮）与工具详情。
- 导出：host 路由 `GET /api/bugs.export?sessionId=`（冷会话从日志重放纯折叠——「模型可见 ⟺ 已记录」成立），客户端下载仿 `session-log-export` 的 controller。

### P3 — 自动化测试模式 preset

- `packages/device/device-automation/presets/automation/agent.cordis.yml` — standard 基座加 harmony 行；**发布服务的行必须放 `isolate` realm 组**（presets 插件拒绝根 realm 的服务行）；测试 persona。`preset.yml`：`name: 自动化测试模式`、`order: 5`。Bundle 的显式 CLI 按[外部 Bundle preset 安装决策](../../implemented/architecture/2026-08-26-external-bundle-user-preset-installation.zh.md)将其复制到用户 roster。
- `packages/client/ui-agent-preset/src/client/locales.ts` — `presetAutomationName/Description` 键、中英文案、`BUILT_IN_PRESET_KEYS` 条目；e2e/snapshot 更新。

### P4 — 设备画面预览

- Host 路由 `GET /api/device.screen?serial=` 提供最新拉取的帧（仅缓存——帧永不进入会话日志）。
- bug 面板中的预览 tab：1 fps 轮询（Config 可调）、仅可见时轮询、测试工具运行时让路；可选增强：预览点击回传坐标实现远程操控。

## Alternatives considered

- **用原始 HDC 替代 `devecocli`** — 暂缓。基础工具只使用 DevEco CLI；仅在 skill 识别出必要但不受支持的操作后，才增加针对性的后备实现。
- **设备端 ArkTS Driver 测试 HAP** — 官方 UITest ArkTS API 需要安装测试 HAP 并经 `aa test` 拉起；命令行模式（`hdc shell uitest`）从主机驱动同一框架、无需设备端应用。命令行模式胜出；HAP 路径留作设备受限时的退路（见风险）。
- **新增 `bug/reported` 会话事件** — 会加 `SessionEventMap` 成员并强制 TS+Python SDK 更新及 ignorable 信封处理；经 projection 折叠 `tool/result.meta` 不动会话格式即可得到同样的持久列表。
- **bug 列表塞进 `DetailsPanel.tsx`** — 改动最小但把 ui-conversation 与领域功能耦合；新包接管槽位保持领域隔离，符合详情栏的既有组装方式。
- **wukong 作为执行引擎** — wukong 做随机/稳定性遍历，不做逐步的预期结果校验；它保留为稳定性阶段工具，经 provider 的 `shell` 操作可达。

## Acceptance criteria

- P1：通用 DevEco CLI 工具有 focused 单元测试和 keyless transcript 覆盖，示例 overlay 带有依赖声明。真机连接后，`devecocli device list` 和 `devecocli ui` 验证 UI 自动化。
- P2：`bug_report` 结果出现在 `bugList` projection；Web 界面右边栏展示 bug 列表且导出可用；e2e 覆盖面板与详情栏生命周期；不落任何会话格式或 SDK 变更。
- P3：`automation` preset 出现在模式选择器中且文案本地化；其组合启动 snapshot 断言模型可见工具目录。
- P4：预览端点按配置帧率出帧且不触碰会话日志。

## Risks

- **真机 `uitest` 命令行可用性** — 因 API 版本而异；失败必须是结构化探测结果（`probeUitest`），绝不静默空转储。以能力探测缓解，`devecocli ui` 作人工退路。
- **details 槽位接管** — 同优先级二次注册 `details` 会在启动时抛错（必须 priority -1 并移除 ui-conversation 的注册）；选择 store 必须经服务访问器拿到同一 handle，否则工具详情页失效。
- **projection 线格式契约** — 缺少声明合并会让 `useProjection('bugList')` 静默 undefined；e2e 必须断言值出现。
- **preset 服务行漏加 `isolate`** — 挂载被响亮拒绝；组合启动 snapshot 在 CI 兜底。
- **多会话并发操作一台设备** — 每次操作唯一的 `/data/local/tmp` 文件名与单 serial 模型；作为受支持的部署形态记录在案。
- **中文文本输入** — 设备框架以粘贴方式注入文本（无输入法合成）；`hdc shell input text` 作为真机验证的退路。
- **预览保真度** — 轮询 `screenCap` 只有 1–2 fps，不是镜像；真流式需要 AAMS 通路，与 uitest 互斥，不在范围内。
