# @deepseek-ai/dsh-tool-harmonyos-uitest

[English](README.md) | 中文

通过 `devecocli` 提供面向模型且受 allow-list 限制的鸿蒙自动化。

## 工具

`devecocli` 接受一个 argv 向量，用于 `device`、`ui`、`log`、`build`、`run`、`check` 和 `docs` 命令族。它通过 `ctx.subprocess` 运行该向量，模型值不会进入 shell。

## 配置

`enabled` 默认是 `true`。`devecoCliExecutable`、`timeoutMs`、`graceMs` 和 `maxOutputBytes` 配置执行。禁用后不会注册工具或提示指导。

## 模型体验

### DevEco CLI 命令

#### What the model sees

- 一个 `devecocli` schema，以及要求先使用已安装 `deveco-cli` skill 的稳定提示段。

#### Token effect

- 每次调用返回 argv、stdout、stderr、退出状态和截断事实。

#### KV Cache 影响

稳定提示段和工具 schema 可跨轮次复用。仅在命令运行后工具结果才会变化。

## 已知限制与暂缓事项

- 基础工具不包含 `update`、`auth`、模拟器生命周期和签名命令。
- 工具不推断参数、选择器、路径或工程配置。
