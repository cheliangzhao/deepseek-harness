# @fadinglight/dsh-device-automation-runtime

[English](README.md) | 中文

跨平台设备自动化的 Service Definition 与 Host Consumer。`ctx.deviceAutomation` 是具名 Provider 注册表；运行时还拥有浏览器 Consumer 使用的受信 `/device-automation` Connection RPC 通道。

| 成员 | 含义 |
|---|---|
| `registerProvider(provider)` | 注册一个作用域受 effect 管理、名称唯一且非空的 Provider。 |
| `listProviders()` | 按注册顺序返回 Provider 名称与平台描述。 |

每个 Provider 实现 `preparationProgress()`、`prepare(signal)`、`screenshot(signal)` 与 `tap(position, signal)`。浏览器启用设备控制前，准备操作会完成平台设置，或返回一项结构化用户操作。进度方法返回 Provider 拥有的最新不可变阶段；同步 Skill 时还会返回已完成数量、总数和当前 Skill，但不会启动工作。运行时依次选择请求显式指定的 Provider、`defaultProvider`，以及唯一已注册的 Provider。注册表为空或存在歧义时会明确失败。

受信 RPC 通道提供 Provider 发现、准备及其进度、截图、点击、目录列表与文件读取。文件操作通过 `ctx.fs` 从在线会话的 `header.cwd` 解析，在 Provider 完成解析后拒绝该根目录之外的目标，只返回直接子项，并将受大小限制的文件严格解码为 UTF-8。设备图片以 base64 PNG 数据经 JSON 载体传递；Provider 不会暴露临时路径。

## 配置

| 字段 | 含义 |
|---|---|
| `defaultProvider` | 请求省略 Provider 时使用的 Provider。 |
| `refreshMs` | 每次截图完成后下发的非负延迟；默认 100 ms。 |
| `maxFileBytes` | 返回给浏览器的完整文件大小上限；默认 1 MiB。 |
| `maxDirectoryEntries` | 一次列表返回的条目上限；默认 1000。 |

## 模型体验

无；运行时不注册提示词或模型可见工具。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 文件访问需要当前在线会话，因为会话存储是工作区权威。
- 当前 wire 支持截图与点击；手势、文本输入、旋转和多设备选择需要先定义明确的 Provider 能力。
