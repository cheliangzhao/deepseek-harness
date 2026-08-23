# Agent Note: DevEco CLI HarmonyOS automation tool

Status: implemented

English | [中文](2026-08-21-harmony-device-capability.zh.md)

## Problem

Harness agents need to operate an authorized HarmonyOS device without embedding a growing copy of the DevEco CLI command catalogue in the runtime.

## Decision

`packages/harmony/tool-harmonyos-uitest` exports one model-visible `devecocli` tool. It passes a checked plain argv vector to the host `devecocli` executable through `ctx.subprocess`, using the calling agent's workspace as the subprocess directory. The allow-list contains the 15 top-level command families documented by the bundled `deveco-cli` skill; arbitrary shell syntax remains unavailable. Each call has bounded timeout, termination grace, and per-stream retained output, and the model-facing text labels both streams and any truncated tail.

The installed `deveco-cli` skill owns command knowledge and safe workflows. Skill updates improve agent guidance without changing the tool's executable authority.

## The `automation` agent preset

`apps/cli/config/agent-presets/automation/` composes the `standard` catalog plus the `devecocli` tool row, a device-testing persona, and a deveco-cli skill shipped inside the preset directory. `skill-filesystem`'s `customSkillDirs` adds the preset's own skill root to the user's own, so a session on this preset gets the tool and its command guidance with no installation step. The tool row registers into this preset's layer of the host `tools` registry and provides no service, so it needs no realm.

## Alternatives considered

- **One tool per DevEco CLI operation.** This duplicates a command catalogue that changes with the CLI and creates unnecessary model schemas.
- **A raw HDC or shell tool.** It broadens device authority and is unnecessary while DevEco CLI covers the required operation.

## Consequences

The example overlay contributes one tool only. Keyless tests exercise the real Loader path with a deterministic executable and pin the accepted command families, workspace directory, stream rendering, truncation markers, and failure classification. The shipped-preset e2e pins the automation agent's exact tool catalog and its scoped skill view. The automation Web client opens its screenshot preview in the shared details column; an explicitly opened details column retains its minimum width on constrained viewports. Real-device verification on a `nova 14 Pro` confirms `devecocli device list`, `devecocli ui layout`, `click`, and `screenshot` operate on an authorized phone.
