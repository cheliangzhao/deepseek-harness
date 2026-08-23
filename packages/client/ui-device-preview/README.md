# @deepseek-ai/dsh-client-ui-device-preview

Browser-only automation-preset preview for the shared details column. Its header shortcut opens a frameless `/api/device-preview/screenshot` image that refreshes every 200 ms while the browser document is visible. A failed image request shows a no-device placeholder while polling continues, so an authorized device appears without another interaction. The same shortcut closes the preview; polling pauses when the document is hidden.

## Known Limitations and Deferred Work

- The panel previews screen images only. It does not map clicks to device coordinates or retain screenshots.
