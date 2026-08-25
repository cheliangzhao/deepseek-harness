# @fadinglight/dsh-client-ui-device-automation

English | [中文](README.zh.md)

Browser Consumer for the device automation capability. It mounts a plugin-owned **Device automation** right sidebar containing only **Files** and **Device** when the current Session records the `automation` agent preset. The sidebar title names the current mode as **Automation test mode**. Other modes render no sidebar entry, reserve no application width, and issue no screenshot requests. The package appends one React portal to `document.body`, follows the current Session from `ctx.sessions`, and makes `#root` yield the open panel width through a plugin-owned CSS variable. When collapsed, its entry stays beside the Session header utilities on the same center line. It does not depend on Better Sidebar, a private client service, or changes to the Web application packages.

Files lists the current live session's working directory through the trusted `/device-automation` Connection RPC channel. It enters child directories and opens bounded UTF-8 files read-only; editing, terminals, Git, and embedded browsing are intentionally absent. Host-side containment follows the configured `ctx.fs` provider, including symlink resolution, so a requested path outside the session workspace is rejected.

The Device surface requests complete screenshots through the same trusted RPC channel, keeps the previous frame until its replacement decodes, and waits for the Host-advertised interval after each completed request. Polling stops while the browser document is hidden, the Files tab is selected, or the sidebar is collapsed. Failed captures keep retrying so a newly connected authorized device appears without reopening the sidebar. Clicking decoded image content sends relative coordinates; letterboxing and loading states do not issue taps.

## Model Experience

None, as the package contributes browser presentation and no model-visible prompt or tool.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- File presentation is plain UTF-8 text without syntax highlighting, search, or binary previews.
- The active provider is selected by the Host runtime; the browser has no provider picker yet.
- Layout integration relies on the Web application's stable `#root` mount element; narrow viewports overlay the application instead of shrinking it.
