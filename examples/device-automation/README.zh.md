# device-automation

[English](README.md) | 中文

一个可选 overlay，将受限的 DevEco CLI 工具加入普通 dsh 组合。

## 运行

连接并授权设备，然后把此 overlay 应用于已包含 `subprocess`、`tools` 和 `systemPrompt` 的 profile：

```sh
pnpm dsh --profile headless --patch examples/device-automation/cordis.yml "List the connected device and inspect the current UI."
```

`devecocli` 接受一个普通 argv 向量，用于 `device`、`ui`、`log`、`build`、`run`、`check` 和 `docs` 命令族。它从 `PATH` 解析 `devecocli`。已安装的 `deveco-cli` skill 提供可演进的命令知识，但运行时仍维持 allow-list。
