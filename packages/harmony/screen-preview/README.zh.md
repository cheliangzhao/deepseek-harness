# @deepseek-ai/dsh-harmony-screen-preview

[English](README.md) | 中文

automation preset 的 HTTP 提供方，提供当前 HarmonyOS 设备画面和点击。

`GET /api/device-preview/screenshot` 会运行 `devecocli ui screenshot`，在提供方拥有的临时目录中校验受大小限制的 PNG，原子替换保留图片，并以 `ETag` 和 `Last-Modified` 返回图片字节。浏览器不会获得临时路径。已配置的 `deviceSerial` 会传给 DevEco CLI；否则由 DevEco CLI 选择已授权设备。

受信 Host 可调用 `POST /device-preview/tap` Connection RPC，载荷为 `{ "x": number, "y": number }`，每个坐标均在 `[0, 1)` 内。Connection 载体会在分发前拒绝不受信的 Host、Origin、Fetch Metadata 和非 JSON 请求。提供方将已接受的坐标映射到最近一次截图 PNG 的原生像素，并运行 `devecocli ui click`。点击需要有效的保留截图；格式错误的载荷和 CLI 失败会返回 RPC 错误。

## 配置

`devecoCliExecutable` 覆盖在 `PATH` 中找到的可执行文件。`deviceSerial` 选择设备。`maxBytes` 默认是 16 MiB，`timeoutMs` 默认是 15 秒。截图、设备、格式和大小错误均会返回 HTTP 503，且不会保留无效图片。截图与点击操作串行执行；插件销毁会取消并等待正在执行的操作，并阻止排队操作启动。

## 模型体验

无。提供方暴露浏览器路由，不注册面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- 提供方仅支持点击。它不支持滑动、文本输入、实时视频流、录屏或图片历史。
