# @fadinglight/dsh-device-automation-harmonyos

[English](README.md) | 中文

[`ctx.deviceAutomation`](../device-automation-runtime/README.zh.md) 的 HarmonyOS Service Provider。它注册 `harmonyos` Provider，并将平台无关的截图与相对坐标点击请求转换为 `devecocli ui screenshot` 和 `devecocli ui click` argv。

首次收到准备请求时，Provider 会解析 `devecocli`。找不到可执行文件时，它会返回官方 npm 安装命令与包链接，而不启动设备操作。CLI 可用时，它会检查原子写入的 `$DSH_HOME/device-automation/skills/.fadinglight-device-automation-skills.json` 状态和每个必需的 `SKILL.md`；Provider 版本、有序 Skill 列表、文件与同步时间均匹配时，无需启动子进程或访问网络即可就绪。状态缺失、不可读、不匹配或超过配置间隔时，它会先运行 `devecocli update`，再通过强制添加把 `hmos-local-test`、`hmos-instrument-test`、`hmos-cppcrash-analysis`、`hmos-jscrash-analysis`、`hmos-jsleak-analysis`、`hmos-memleak-analysis`、`hmos-native-memleak-analysis`、`hmos-fdleak-analysis`、`hmos-apifault-analysis` 和 `hmos-appfreeze-analysis` 同步到该目录。状态仍有效但某个 Skill 缺失时，只修复 Skills，不会推迟完整同步时间。每条 Skill 命令开始前，Provider 会把已完成数量、总数与当前 Skill 发布为只读进度。它在提交状态前验证每个已安装 Skill，因此中断或不完整的尝试仍可重试。并发请求共用一次准备，成功结果会在 Provider 生命周期内复用。

该 Provider 会将每张截图验证为非空、受大小限制的 PNG，读取原生尺寸，并仅保留当前交互需要的尺寸与字节。截图和点击操作共用一个串行队列，因为 DevEco CLI 面向同一台已授权设备。销毁会中止正在执行的准备或设备命令、阻止排队工作启动、等待两个操作所有者停稳，然后删除临时目录。

## 配置

| 字段 | 含义 |
|---|---|
| `devecoCliExecutable` | 可选的 DevEco CLI 绝对路径；省略时由 `ctx.subprocess` 解析 `devecocli`。 |
| `deviceSerial` | 可选的已授权设备序列号，作为 `--device` 传入。 |
| `maxBytes` | 可接受的编码后截图大小上限；默认 16 MiB。 |
| `timeoutMs` | 截图或点击截止时间；默认 15 秒。 |
| `skillSyncTimeoutMs` | 每条 `devecocli update` 或 `devecocli skills add` 命令的截止时间；默认 120 秒。 |
| `fullSyncIntervalMs` | 一次完整 DevEco CLI 与 Skill 同步的最长间隔；默认 7 天。 |

## 模型体验

无；该 Provider 不注册模型可见的提示词或工具。面向模型的 DevEco CLI 访问由独立的 [`dsh-tool-harmonyos-uitest`](../../harmony/tool-harmonyos-uitest/README.zh.md) 拥有。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 必需的同步需要访问已安装 DevEco CLI 使用的目录服务。
- 一个 Provider 实例只控制一台已选 HarmonyOS 设备。
- 截图与点击是当前浏览器 Consumer 请求的全部平台无关操作。
