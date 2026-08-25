# Agent Note：跨平台设备自动化 Provider seam

Status: implemented

[English](2026-08-24-device-automation-provider-seam.md) | 中文

## 问题

最初的浏览器设备预览直接组合了 HarmonyOS DevEco CLI 命令、HTTP 截图服务与一个浏览器面板。在该包后添加 Android 或 iOS 要么会复制浏览器协议，要么会让平台专用命令进入共享 UI 包。所需工作区还要提供目录导航与只读文件打开，但不继承 Better Sidebar 的终端、Git、内嵌浏览器或 PTY 依赖。

## 决策

设备自动化由四个包组合：

- `@fadinglight/dsh-device-automation` 是可安装 Bundle 与发布单元。`@fadinglight/*` 包不属于仓库的 `@deepseek-ai/*` release family，并独立发布。
- `@fadinglight/dsh-device-automation-runtime` 拥有 `ctx.deviceAutomation`、具名 Provider 选择、受信浏览器 RPC，以及通过 `ctx.fs` 实现的只读工作区访问。
- `@fadinglight/dsh-device-automation-harmonyos` 注册 `harmonyos` Provider，并是唯一理解 DevEco CLI argv 的包。
- `@fadinglight/dsh-client-ui-device-automation` 是浏览器 Consumer，通过公开 `conversation.view` slot 仅暴露“文件”与“设备”。

运行时依次选择请求指定的 Provider、已配置的默认 Provider，以及唯一已注册 Provider。存在多个 Provider 但没有明确选择时会明确失败。当前 Provider 接口仅包含截图与相对坐标点击，因为只有它们拥有当前 Consumer；手势、文本输入、旋转与设备选择只会在出现具体跨平台需求时添加。

所有浏览器操作使用同一个 trusted-host Connection RPC 通道。截图以受大小限制的 base64 PNG 数据经该 JSON 载体传递，因此该功能不拥有精确 HTTP 图片路由，并继承 Connection 的 Host、Origin、Fetch Metadata 与 JSON 媒体类型信任栅栏。文件请求携带在线会话 id 与候选路径。运行时通过 `ctx.fs` 解析会话根与候选路径，在符号链接解析后检查 Provider 拥有的包含关系，并仅返回直接目录元数据或受大小限制的严格 UTF-8 文件。

HarmonyOS Provider 通过一个生命周期拥有的操作尾部串行执行截图与点击。销毁会撤销新请求准入、中止正在执行的命令、阻止排队工作启动、等待尾部停稳，并删除临时目录。浏览器仅在选中“设备”且文档可见时轮询；每个完成的截图响应会下发下一次延迟，随附 Bundle 将其配置为 100 ms。

## 与 Better Sidebar 的关系

“文件 + 设备”工作区遵循 Better Sidebar 的紧凑页签工作区思路，但不使用其实现或依赖图。没有复制 Better Sidebar 源码。UI 注册一个普通 `conversation.view` entry，不扩展 Web 应用或 `ui-conversation` 包。目录导航与文件查看使用 Harness 服务与 slot，从而保留会话工作区权威、client 生命周期、本地化与仓库信任栅栏。

## 已考虑的替代方案

- **安装 Better Sidebar 并隐藏不需要的页签。** 被隐藏的终端、Git、浏览器和 PTY 路由仍会加载并发布。
- **保留一个 HarmonyOS 专用 client 并添加平台条件。** 每个新平台都会改变浏览器包并复制选择规则。
- **保留精确 HTTP 截图路由。** 这需要第二次应用信任栅栏，并将一项功能分散到两种浏览器传输上。
- **直接向浏览器暴露模型的文件系统工具。** 工具调用携带模型策略与 transcript 语义；人类只读浏览是 `ctx.fs` 的独立 Consumer。
- **向 `ui-conversation` 添加专用详情栏注册表。** 独立发布的插件安装到不含该私有服务的 DSH 版本后会永久等待；现有 conversation-view slot 已经拥有可选的完整会话视图。

## 结果

Android 和 iOS 可注册 Provider，无需改变浏览器 RPC 或 React 组件。可安装 Bundle 可以首先发布一个 HarmonyOS 组合，同时保持运行时的平台无关性。Web profile 加载该聚合 Bundle，而不是重复其内部行；automation preset 仅保留模型可见工具与 skill 指导。

单元测试覆盖 Provider 选择、格式错误的 wire 输入、工作区包含关系、截图校验、相对点击映射、串行执行与可等待销毁。组装的无密钥 Web 场景启动随附 Loader 与浏览器 bundle，打开真实工作区文件，点击已渲染设备帧，观察精确的 `devecocli ui click` argv，并验证后续帧替换它。发布路径演练会打包聚合包及其内部包，将聚合包 tarball 安装到全新 DSH profile，并通过已构建 CLI 输出组合树。
