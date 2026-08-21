# Agent Note: DevEco CLI 鸿蒙自动化工具

Status: implemented

[English](2026-08-21-harmony-device-capability.md) | 中文

## Problem

Harness agent 需要操作已授权的 HarmonyOS 设备，同时不应在运行时内嵌一份不断增长的 DevEco CLI 命令目录。

## Decision

`packages/harmony/tool-harmonyos-uitest` 导出一个模型可见的 `devecocli` 工具。它通过 `ctx.subprocess` 将经过检查的普通 argv 向量传给主机上的 `devecocli` 可执行文件。基础 allow-list 包含 `device`、`ui`、`log`、`build`、`run`、`check` 和 `docs`；更新、认证、模拟器生命周期、签名和任意 shell 语法不可用。

已安装的 `deveco-cli` skill 拥有命令知识和安全工作流。skill 更新可改进 agent 指导，但不会改变工具的可执行权限。

## `automation` Agent preset

`apps/cli/config/agent-presets/automation/` 在 `standard` 目录之上组合出 `devecocli` 工具行、设备测试 persona 以及随 preset 目录携带的 deveco-cli skill。`skill-filesystem` 的 `customSkillDirs` 将 preset 自带的 skill 根追加到用户自己的根之上，因此该 preset 上的会话无需任何安装步骤即可获得工具与命令指导。工具行注册进 host `tools` 注册表中属于本 preset 的层，不提供任何服务，因此无需 realm。

## Alternatives considered

- **每个 DevEco CLI 操作一个工具。** 这会重复随 CLI 变化的命令目录，并增加不必要的模型 schema。
- **原始 HDC 或 shell 工具。** 它会扩大设备权限；当前 DevEco CLI 已覆盖所需操作，因此没有必要。

## Consequences

示例 overlay 只贡献一个工具。无密钥测试钉住允许和拒绝的命令族以及命令 transcript；shipped-preset e2e 钉住 automation agent 的精确工具目录及其 scoped skill 视图。在 `nova 14 Pro` 上的真机验证确认已授权手机可运行 `devecocli device list`、`devecocli ui layout`、`click` 和 `screenshot`。
