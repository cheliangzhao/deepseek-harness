# Agent Note: Session-scoped automation test view

Status: implemented

English | [中文](2026-08-26-session-automation-test-view.zh.md)

## Problem

Device automation Sessions need a test-case entry point beside Conversation and Trajectory. A global tab would expose device controls in unrelated modes, while direct browser process execution would bypass the Session log and duplicate the automation Agent's tool and Skill policy.

## Decision

`ui-device-automation` contributes an **Automation tests** entry to the existing `conversation.view` list only while the selected Session records the `automation` agent preset. The plugin follows the Session list in an effect, registers the view after the slot declaration exists, and removes it on mode change, declaration loss, or plugin disposal. The Session view ring retains its normal Chat fallback when the entry is absent.

The view reuses the trusted workspace file-list RPC as a lazy read-only test-case picker. Running a selected file first completes device Provider preparation, then sends one fixed instruction with the workspace-relative path through the scoped `ctx.conversation` service. This creates an ordinary durable user message and leaves execution, tool policy, progress, and results in the automation Agent's Conversation and Trajectory. The browser neither reads the selected test content nor spawns a process.

Test-case selection and submission remain in the existing client package because they use the same Session identity, file service, preparation lifecycle, locale, and device workspace as its sidebar. Platform Providers remain independently packaged; a separate UI package is warranted only if another deployment consumes the test view without the device automation workspace.

## Alternatives considered

- **Register the tab globally and return `null` outside automation mode** — the tab would remain visible and the component would mount before declining, so unrelated Sessions would receive automation chrome and effects.
- **Add a per-Session visibility predicate to the generic list-slot API** — one feature does not justify expanding every list registration and the conversation tab projection. Effect-owned registration uses the existing declaration and disposal semantics.
- **Execute DevEco CLI directly from the browser action** — this would create another execution protocol, bypass the durable model-visible Session input, and hard-code one test framework before the selected files establish one.
- **Publish a separate test-view package** — it would split one current Consumer across synchronized package versions without an independent installer, configuration, or non-HarmonyOS Provider consumer.

## Consequences

Automation Sessions gain a file-driven test action without modifying the conversation shell or exposing device controls in other modes. Every submitted test is reconstructable from the Session log, and existing Agent Skills and tools decide how to interpret Markdown, YAML, ArkTS, or other text cases. The view reports submission rather than framework completion; structured pass/fail dashboards require a durable result vocabulary and are intentionally separate from this decision.
