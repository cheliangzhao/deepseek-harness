# Agent Note: Session 级自动化测试视图

Status: implemented

[English](2026-08-26-session-automation-test-view.md) | 中文

## Problem

设备自动化 Session 需要在“对话”和“轨迹”旁提供测试用例入口。全局页签会在无关模式暴露设备操作，而浏览器直接执行进程会绕过 Session 日志，并重复自动化 Agent 已有的工具与 Skill 策略。

## Decision

仅当选中 Session 记录了 `automation` agent preset 时，`ui-device-automation` 才向现有 `conversation.view` 列表贡献 **自动化测试** 入口。插件在 effect 中跟随 Session 列表，在槽位声明存在后注册视图，并在模式变化、声明消失或插件销毁时移除视图。入口不存在时，Session 视图环继续使用正常的 Chat 后备项。

该视图复用受信的工作区文件列表 RPC，作为惰性加载的只读测试用例选择器。运行选中文件时，它会先完成设备 Provider 准备，再通过有 Session 作用域的 `ctx.conversation` 服务发送一条固定指令及工作区相对路径。这会产生普通的持久用户消息，执行、工具策略、进度和结果均保留在自动化 Agent 的“对话”和“轨迹”中。浏览器既不读取选中测试内容，也不创建进程。

测试用例选择和提交保留在现有客户端包内，因为它们与右侧栏共用 Session 身份、文件服务、准备生命周期、本地化文案和设备工作区。平台 Provider 继续独立分包；只有其他部署需要在不安装设备自动化工作区的情况下使用测试视图时，才应拆出单独 UI 包。

## Alternatives considered

- **全局注册页签，在非自动化模式返回 `null`** — 页签仍会显示，组件也会先挂载再拒绝，因此无关 Session 会收到自动化界面和 effect。
- **给通用列表槽位 API 增加按 Session 可见性谓词** — 单个功能不足以扩展所有列表注册与对话页签投射。由 effect 拥有的注册可直接使用现有声明和销毁语义。
- **由浏览器操作直接执行 DevEco CLI** — 这会新建一套执行协议、绕过持久的模型可见 Session 输入，并在选中文件尚未确定测试框架前硬编码一种框架。
- **发布独立测试视图包** — 在没有独立安装器、配置或非鸿蒙 Provider Consumer 的情况下，它只会把一个现有 Consumer 拆成需要同步版本的多个包。

## Consequences

自动化 Session 无需修改对话外壳即可获得文件驱动的测试入口，其他模式也不会暴露设备操作。每次提交的测试都能从 Session 日志重建，已有 Agent Skills 与工具负责解释 Markdown、YAML、ArkTS 或其他文本用例。该视图报告“已提交”而不是框架执行完成；结构化通过/失败仪表盘需要持久结果词表，不属于本决策范围。
