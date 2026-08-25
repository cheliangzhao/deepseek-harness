# @fadinglight/dsh-device-automation-runtime

English | [中文](README.zh.md)

Service Definition and Host Consumer for cross-platform device automation. `ctx.deviceAutomation` is a named Provider registry; the runtime also owns the trusted `/device-automation` Connection RPC channel used by the browser Consumer.

| Member | Meaning |
|---|---|
| `registerProvider(provider)` | Register one effect-scoped Provider with a unique non-empty name. |
| `listProviders()` | Return provider name and platform descriptors in registration order. |

Each Provider implements `preparationProgress()`, `prepare(signal)`, `screenshot(signal)`, and `tap(position, signal)`. Preparation finishes platform setup or returns one structured user action before the browser enables device controls. The progress method returns the latest immutable Provider-owned phase and, during Skill synchronization, the completed count, total count, and current Skill without starting work. The runtime selects an explicit request Provider, then `defaultProvider`, then the only registered Provider. An ambiguous or empty registry fails loud.

The trusted RPC channel exposes provider discovery, preparation and its progress, screenshot, tap, directory listing, and file reads. File operations resolve from a live session's `header.cwd` through `ctx.fs`, reject targets outside that root after provider-owned resolution, return only direct entries, and decode bounded files as strict UTF-8. Device images cross the JSON carrier as base64 PNG data; providers never expose their temporary paths.

## Configuration

| Field | Meaning |
|---|---|
| `defaultProvider` | Provider used when a request omits one. |
| `refreshMs` | Non-negative delay advertised after each completed capture; default 100 ms. |
| `maxFileBytes` | Maximum complete file returned to the browser; default 1 MiB. |
| `maxDirectoryEntries` | Maximum entries returned from one listing; default 1000. |

## Model Experience

None, as the runtime registers no prompt or model-facing tool.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- File access requires a currently live session because the session store is the workspace authority.
- The current wire supports screenshot and tap; gestures, text input, rotation, and multi-device selection need explicit Provider capabilities before they are added.
