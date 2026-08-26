# @fadinglight/dsh-client-ui-device-automation

[English](README.md) | 中文

设备自动化能力的浏览器 Consumer。当当前 Session 记录了 `automation` agent preset 时，它会贡献一个 **自动化测试** 对话页签，并挂载一个由插件拥有的 **设备自动化** 右侧栏，其中只包含 **文件** 与 **设备**；侧栏标题将当前模式显示为 **自动化测试模式**。其他模式不渲染这两个入口、不占用应用宽度，也不请求设备截图。本包向 `document.body` 添加一个 React Portal，从 `ctx.sessions` 跟随当前 Session，并通过插件拥有的 CSS 变量让 `#root` 为展开面板让出宽度。折叠入口位于 Session 标题栏工具右侧，并与工具保持同一垂直中心线。它不依赖 Better Sidebar 或私有 client 服务，也不需要修改 Web 应用包。

自动化 Session 首次挂载时，侧栏会先请求 Provider 准备，再渲染“文件”或开始截图轮询。检查 DevEco CLI 与同步 Skill 期间，侧栏会保持加载动画，并在其下方显示已完成数量、总数、进度条与当前 Skill。同步成功后会播放短暂的鸿蒙就绪过渡动画，再打开工作区；启用减少动态效果的客户端会保留就绪状态，但不会移动其中的元素。CLI 缺失时会显示 Provider 返回的安装命令、下载链接与重试操作。同步失败时会保留会话并提供重试操作，后续挂载还会自动重新准备，因此首次下载中断后无需再次确认即可继续同步。

“文件”通过受信的 `/device-automation` Connection RPC 通道列出当前在线会话的工作目录。它可进入子目录并以只读方式打开受大小限制的 UTF-8 文件；编辑、终端、Git 与内嵌浏览器均不在功能范围内。Host 端包含关系由已配置的 `ctx.fs` Provider 判定，包括符号链接解析，因此会拒绝会话工作区之外的路径。

“自动化测试”复用同一个受限文件树作为测试用例选择器。“运行测试”会先要求 Provider 准备成功，再通过 `ctx.conversation` 向选中的自动化 Session 排入一条用户消息；浏览器不会直接调用进程。选中路径相对于 Session 工作区，执行进度与结果保留在“对话”和“轨迹”中。

“设备”通过同一受信 RPC 通道请求完整截图，在替换帧解码前保留旧帧，并在每次请求完成后等待 Host 下发的间隔。浏览器文档隐藏、选中“文件”页签或侧栏折叠时会停止轮询。抓取失败后会继续重试，新连接的已授权设备无需重新打开侧栏即可出现。点击已解码图片内容会发送相对坐标；留白区域与加载状态不会触发点击。

## 模型体验

### 提交的自动化测试任务

#### 模型看到的内容

点击 **运行测试** 后，当前自动化 Session 会排入以下用户消息。`<path>` 表示以 JSON 字符串序列化的工作区相对路径。

##### 自动化指令

```markdown
Run the automation test case at workspace-relative path <path>.

Read the complete file before acting. Treat its contents as the test case steps and data. Use the installed HarmonyOS automation Skills and DevEco CLI UI automation commands against the currently connected authorized device.

After execution, report the steps performed, passed and failed checks, relevant device errors or logs, and concrete follow-up actions. Do not modify the test case unless it explicitly asks for an edit.
```

#### Token 影响

有条件且仅追加：每次运行会把固定指令和选中路径作为一条用户消息加入队列。用户运行测试前不会增加 token。

#### KV Cache 影响

该消息追加在现有 Session 历史之后，因此之前可复用的前缀保持稳定。只选择其他路径而不运行不会影响请求；每次运行会扩展历史，并可能形成新的可复用后缀，实际缓存与淘汰由 Provider 决定。

## 已知限制与暂缓事项

- 文件界面仅显示纯 UTF-8 文本，尚无语法高亮、搜索或二进制预览。
- 测试执行结果保留在“对话”和“轨迹”中；本页面不会把框架特定的通过/失败报告解析为结构化仪表盘。
- 当前 Provider 由 Host 运行时选择；浏览器尚无 Provider 选择器。
- 布局集成依赖 Web 应用稳定的 `#root` 挂载元素；窄屏下侧栏会覆盖应用，而不是压缩应用宽度。
