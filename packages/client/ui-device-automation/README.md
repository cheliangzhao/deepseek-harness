# @fadinglight/dsh-client-ui-device-automation

English | [中文](README.zh.md)

Browser Consumer for the device automation capability. It contributes a **Device automation** entry to the standard conversation-view tab ring; that view contains only **Files** and **Device** and requires no private client service or change to the Web application packages.

Files lists the current live session's working directory through the trusted `/device-automation` Connection RPC channel. It enters child directories and opens bounded UTF-8 files read-only; editing, terminals, Git, and embedded browsing are intentionally absent. Host-side containment follows the configured `ctx.fs` provider, including symlink resolution, so a requested path outside the session workspace is rejected.

The Device surface requests complete screenshots through the same trusted RPC channel, keeps the previous frame until its replacement decodes, and waits for the Host-advertised interval after each completed request. Polling stops while the browser document is hidden, the Files tab is selected, or another conversation view is active. Failed captures keep retrying so a newly connected authorized device appears without reopening the view. Clicking decoded image content sends relative coordinates; letterboxing and loading states do not issue taps.

## Model Experience

None, as the package contributes browser presentation and no model-visible prompt or tool.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- File presentation is plain UTF-8 text without syntax highlighting, search, or binary previews.
- The active provider is selected by the Host runtime; the browser has no provider picker yet.
