# @deepseek-ai/dsh-device-automation-harmonyos

[English](README.md) | 中文

[`ctx.deviceAutomation`](../device-automation-runtime/README.zh.md) 的 HarmonyOS Service Provider。它注册 `harmonyos` Provider，并将平台无关的截图与相对坐标点击请求转换为 `devecocli ui screenshot` 和 `devecocli ui click` argv。

该 Provider 会将每张截图验证为非空、受大小限制的 PNG，读取原生尺寸，并仅保留当前交互需要的尺寸与字节。截图和点击操作共用一个串行队列，因为 DevEco CLI 面向同一台已授权设备。销毁会中止正在执行的命令、阻止排队工作启动、等待队列停稳，然后删除临时目录。

## 配置

| 字段 | 含义 |
|---|---|
| `devecoCliExecutable` | 可选的 DevEco CLI 绝对路径；省略时由 `ctx.subprocess` 解析 `devecocli`。 |
| `deviceSerial` | 可选的已授权设备序列号，作为 `--device` 传入。 |
| `maxBytes` | 可接受的编码后截图大小上限；默认 16 MiB。 |
| `timeoutMs` | 截图或点击截止时间；默认 15 秒。 |

## 模型体验

无；该 Provider 不注册模型可见的提示词或工具。面向模型的 DevEco CLI 访问由独立的 [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.zh.md) 拥有。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 一个 Provider 实例只控制一台已选 HarmonyOS 设备。
- 截图与点击是当前浏览器 Consumer 请求的全部平台无关操作。
