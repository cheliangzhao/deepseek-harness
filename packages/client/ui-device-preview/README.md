# @deepseek-ai/dsh-client-ui-device-preview

English | [中文](README.zh.md)

Browser-only automation-preset preview for the shared details column. Its header shortcut opens a frameless `/api/device-preview/screenshot` image. While the browser document is visible, each completed image request starts a 100 ms delay before the next request, so slow device captures never overlap and the previous frame remains visible until its replacement loads. A failed image request shows a no-device placeholder while polling continues, so an authorized device appears without another interaction. Clicking the displayed device image maps the point to its rendered content and calls the `/device-preview/tap` Connection RPC; clicks in letterboxing or during frame loading do nothing. The same shortcut closes the preview; polling pauses when the document is hidden.

## Model Experience

None, as the panel is browser-only and does not reach a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The panel supports taps only. It does not retain screenshots, support swipes, or accept keyboard input.
