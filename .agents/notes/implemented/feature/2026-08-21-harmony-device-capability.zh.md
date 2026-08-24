# Agent Note: DevEco CLI 鸿蒙自动化工具

Status: implemented

[English](2026-08-21-harmony-device-capability.md) | 中文

## Problem

Harness agent 需要操作已授权的 HarmonyOS 设备，同时不应在运行时内嵌一份不断增长的 DevEco CLI 命令目录。

## Decision

`packages/harmony/tool-harmonyos-uitest` 导出一个模型可见的 `devecocli` 工具。它通过 `ctx.subprocess` 将经过检查的普通 argv 向量传给主机上的 `devecocli` 可执行文件，并使用调用 agent 的工作区作为子进程目录。allow-list 包含随附 `deveco-cli` skill 记录的 15 个顶层命令族；任意 shell 语法不可用。每次调用都有有界超时、终止宽限期和逐流保留输出，面向模型的文本会标记两个输出流以及被截断的尾部。

已安装的 `deveco-cli` skill 拥有命令知识和安全工作流。skill 更新可改进 agent 指导，但不会改变工具的可执行权限。

## `automation` Agent preset

`apps/cli/config/agent-presets/automation/` 在 `standard` 目录之上组合出 `devecocli` 工具行、设备测试 persona 以及随 preset 目录携带的 deveco-cli skill。`skill-filesystem` 的 `customSkillDirs` 将 preset 自带的 skill 根追加到用户自己的根之上，因此该 preset 上的会话无需任何安装步骤即可获得工具与命令指导。工具行注册进 host `tools` 注册表中属于本 preset 的层，不提供任何服务，因此无需 realm。

## 浏览器设备预览

`packages/harmony/screen-preview` 通过 `GET /api/device-preview/screenshot` 提供经过校验的新鲜截图，并在专用 `/device-preview` Connection RPC 通道注册点击操作。Connection 载体会在提供方收到点击前执行 Host、Origin、Fetch Metadata 和 JSON 媒体类型检查。提供方将相对图片坐标映射到保留 PNG 的原生像素，并通过一个由生命周期拥有的队列串行执行截图和点击命令。销毁会移除两项注册、取消并等待正在执行的命令停止、阻止排队命令启动，然后删除临时截图目录。

`packages/client/ui-device-preview` 为 automation 会话在共享详情栏渲染图片，等待每次截图请求完成后再调度下一次请求，忽略图片载入期间及留白区域中的点击，并通过 Connection RPC 客户端提交已接受的相对坐标。

## Alternatives considered

- **每个 DevEco CLI 操作一个工具。** 这会重复随 CLI 变化的命令目录，并增加不必要的模型 schema。
- **原始 HDC 或 shell 工具。** 它会扩大设备权限；当前 DevEco CLI 已覆盖所需操作，因此没有必要。

## Consequences

示例 overlay 只贡献一个工具。无密钥测试通过确定性 executable 运行真实 Loader 路径，并钉住允许的命令族、工作区目录、流渲染、截断标记和失败分类。shipped-preset e2e 钉住 automation agent 的精确工具目录及其 scoped skill 视图。组装 Web 快照会启动 shipped Loader 和浏览器 bundle、点击已渲染的截图，并钉住 subprocess 边界观察到的 `devecocli ui click` argv。单元覆盖钉住点击信任栅栏、路由回滚、队列取消和完全停稳的销毁。显式打开的详情栏在受限视口下保持最小宽度。在 `nova 14 Pro` 上的真机验证确认已授权手机可运行 `devecocli device list`、`devecocli ui layout`、`click` 和 `screenshot`。
