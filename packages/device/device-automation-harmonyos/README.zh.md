# @fadinglight/dsh-device-automation-harmonyos

[English](README.md) | 中文

[`ctx.deviceAutomation`](../device-automation-runtime/README.zh.md) 的 HarmonyOS Service Provider。它注册 `harmonyos` Provider，并将平台无关的截图与相对坐标点击请求转换为 `devecocli ui screenshot` 和 `devecocli ui click` argv。

首次收到准备请求时，Provider 会解析 `devecocli`。找不到可执行文件时，它会返回官方 npm 安装命令与包链接，而不启动设备操作。CLI 可用时，它会将 `hmos-local-test`、`hmos-instrument-test`、`hmos-cppcrash-analysis`、`hmos-jscrash-analysis`、`hmos-jsleak-analysis`、`hmos-memleak-analysis`、`hmos-native-memleak-analysis`、`hmos-fdleak-analysis`、`hmos-apifault-analysis` 和 `hmos-appfreeze-analysis` 同步到 `$DSH_HOME/device-automation/skills`。每条命令开始前，Provider 会把已完成数量、总数与当前 Skill 发布为只读进度。并发请求共用一次同步，成功结果在 Provider 生命周期内复用，失败的尝试会被丢弃。下一次准备请求会自动重新执行幂等的强制添加，让首次下载中断后复用已安装 Skill，并且无需确认即可完成同步。

该 Provider 会将每张截图验证为非空、受大小限制的 PNG，读取原生尺寸，并仅保留当前交互需要的尺寸与字节。截图和点击操作共用一个串行队列，因为 DevEco CLI 面向同一台已授权设备。销毁会中止正在执行的准备或设备命令、阻止排队工作启动、等待两个操作所有者停稳，然后删除临时目录。

## 配置

| 字段 | 含义 |
|---|---|
| `devecoCliExecutable` | 可选的 DevEco CLI 绝对路径；省略时由 `ctx.subprocess` 解析 `devecocli`。 |
| `deviceSerial` | 可选的已授权设备序列号，作为 `--device` 传入。 |
| `maxBytes` | 可接受的编码后截图大小上限；默认 16 MiB。 |
| `timeoutMs` | 截图或点击截止时间；默认 15 秒。 |
| `skillSyncTimeoutMs` | 每条 `devecocli skills add` 命令的截止时间；默认 120 秒。 |

## 模型体验

无；该 Provider 不注册模型可见的提示词或工具。面向模型的 DevEco CLI 访问由独立的 [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.zh.md) 拥有。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- Skill 同步需要访问已安装 DevEco CLI 所使用的远端目录。
- 一个 Provider 实例只控制一台已选 HarmonyOS 设备。
- 截图与点击是当前浏览器 Consumer 请求的全部平台无关操作。
