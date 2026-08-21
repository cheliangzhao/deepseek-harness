# Agent Note: HarmonyOS automation testing platform

Status: proposed

English | [中文](2026-08-21-harmony-automation-platform.zh.md)

## Problem

Quality engineers need to run test cases against a connected HarmonyOS phone from `dsh`: input test cases in natural language plus structured YAML, have an agent execute them on the device, and collect failures as a bug list shown in the web UI's right sidebar with export support. Today `dsh` has no device-driving capability, no bug-reporting vocabulary, and no "automation testing mode" beside the standard/code/minimal/cordis agent presets. Users also want a live screen preview of the connected device in the right sidebar.

## Proposal

Add a harmony device capability family under `packages/harmony/` following the established capability-seam template (`packages/web/`), a bug-report tool feeding a session projection, a client panel that takes over the web UI's `details` slot, a new `automation` agent preset, and a screen-preview endpoint. Four phases, one mergeable PR each.

### P1 — DevEco CLI capability layer

- `packages/harmony/tool-uitest` — one model-facing `devecocli` tool. It accepts a plain argv vector for the `device`, `ui`, `log`, `build`, `run`, `check`, and `docs` command families; command knowledge lives in the installed `deveco-cli` skill.
- Example leaf `examples/device-automation/` with a keyless argv transcript, plus group, TypeScript-reference, package-list, and example dependency registration.

### P2 — Bug reports, right-sidebar panel, export

- `packages/harmony/harmony-tool-bug-report` — `bug_report` tool: structured bug (severity/title/steps/expected/actual/evidence refs) projected through `presentationMeta` into `tool/result.meta`, so **no `SessionEventMap` member is added and neither SDK changes**. The same package registers the host projection definition `bugList` (mirrors `packages/llm/token-meter`): folds `tool/result` events by callId (idempotent, latest-wins), `stateVersion: 1`, client-safe types in `src/client.ts`.
- `packages/client/ui-bug-report` — client plugin that takes over the `details` slot at priority -1 (single-slot shadowing: ui-conversation's `details` registration is removed; the plugin re-declares the `conversation.details.tool` child seat so tool details keep rendering; the shared chat selection store is exposed through the `IConversation` service — the sanctioned cross-package channel). Panel tabs: bug list (`useProjection('bugList')`, severity chips, evidence links, export button) and tool details.
- Export: host route `GET /api/bugs.export?sessionId=` (cold sessions replay the pure fold from the log — model-visible ⟺ logged holds), client download mirrors `session-log-export`'s controller.

### P3 — 自动化测试模式 preset

- `apps/cli/config/agent-presets/automation/agent.cordis.yml` — standard base plus the harmony rows; **service-publishing rows sit in an `isolate` realm group** (the presets plugin rejects service rows in the root realm); testing persona. `preset.yml` with `name: 自动化测试模式`, `order: 5`. Directory discovery makes the mode appear with zero backend code.
- `packages/client/ui-agent-preset/src/client/locales.ts` — `presetAutomationName/Description` keys, zh/en copy, `BUILT_IN_PRESET_KEYS` entry; e2e/snapshot updates.

### P4 — Device screen preview

- Host route `GET /api/device.screen?serial=` serving the latest pulled frame (cache only — frames never enter the session log).
- Preview tab in the bug-report panel: 1 fps polling (Config knob), polls only while visible, backs off while test tools run, optional click-to-tap coordinate relay as a follow-up.

## Alternatives considered

- **Raw HDC instead of `devecocli`** — deferred. The base tool remains DevEco CLI-only; a focused fallback can be added only after the skill identifies a required unsupported operation.
- **ArkTS Driver test HAP on the device** — the official UITest ArkTS API needs a test HAP installed and `aa test` launching; the command-line mode (`hdc shell uitest`) drives the same framework from the host with no on-device app. Command-line mode wins for the agent; the HAP path stays a fallback if a device restricts it (risk below).
- **New `bug/reported` session event** — would add a `SessionEventMap` member and force TypeScript + Python SDK updates with ignorable-envelope handling; folding `tool/result.meta` through a projection achieves the same durable list without touching session format.
- **Bug list inside `DetailsPanel.tsx`** — cheapest edit but couples ui-conversation to a domain feature; the slot takeover in a new package keeps the domain isolated and matches how the details column is composed.
- **`wukong` as the execution engine** — wukong does random/stability traversal, not step-by-step expected-result verification; it remains a stability-phase tool reachable through the provider's `shell` operation.

## Acceptance criteria

- P1: the generic DevEco CLI tool has focused unit and keyless transcript coverage, and the example overlay boots with its dependency declaration. With a real device connected, `devecocli device list` and `devecocli ui` verify UI automation.
- P2: `bug_report` results appear in the `bugList` projection; the web UI shows the bug list in the right sidebar with working export; e2e covers the panel and the details-column lifecycle; no session-format or SDK change lands.
- P3: the `automation` preset appears in the mode picker with locale copy; its composition boot snapshot asserts the model-visible tool catalog.
- P4: preview endpoint serves frames at the configured rate without touching the session log.

## Risks

- **`uitest` command-line availability on real devices** — varies by API level; failure must be a structured probe result (`probeUitest`), never a silent empty dump. Mitigate with the capability probe and `devecocli ui` as a manual fallback.
- **Details-slot takeover** — a same-priority second `details` registration throws at boot (must be priority -1 plus removal of ui-conversation's registration); the selection store must be the same handle via the service accessor or the tool-details tab breaks.
- **Projection wire contract** — missing declaration merges make `useProjection('bugList')` silently undefined; e2e must assert the value appears.
- **Preset service rows outside `isolate`** — the mount is rejected loudly; the composition boot snapshot catches it in CI.
- **Concurrent sessions on one device** — per-operation unique `/data/local/tmp` filenames and a single-serial model; documented as the supported deployment.
- **Chinese text input** — the device framework pastes text (no IME composition); `hdc shell input text` is the device-verification fallback.
- **Preview fidelity** — polling `screenCap` yields 1–2 fps, not a mirror; true streaming needs the AAMS path, which is exclusive with uitest and out of scope.
