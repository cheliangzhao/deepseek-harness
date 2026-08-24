# Agent Note: Cross-platform device automation Provider seam

Status: implemented

English | [中文](2026-08-24-device-automation-provider-seam.zh.md)

## Problem

The first browser device preview directly combined HarmonyOS DevEco CLI commands, HTTP screenshot serving, and one browser panel. Adding Android or iOS behind that package would either copy the browser protocol or make platform-specific commands part of a shared UI package. The requested workspace also needs directory navigation and read-only file opening without inheriting Better Sidebar's terminal, Git, embedded browser, or PTY dependencies.

## Decision

Device automation is a four-package composition:

- `@cheliangzhao/dsh-device-automation` is the installable Bundle and publishing unit. The `@cheliangzhao/*` packages are excluded from the repository's `@deepseek-ai/*` release family and publish independently.
- `@cheliangzhao/dsh-device-automation-runtime` owns `ctx.deviceAutomation`, named Provider selection, trusted browser RPC, and read-only workspace access through `ctx.fs`.
- `@cheliangzhao/dsh-device-automation-harmonyos` registers the `harmonyos` Provider and is the only package that knows DevEco CLI argv.
- `@cheliangzhao/dsh-client-ui-device-automation` is the browser Consumer and exposes only Files and Device.

The runtime selects a request-named Provider, then the configured default, then a sole registered Provider. Multiple Providers without an explicit choice fail loud. The current Provider interface includes only screenshot and relative tap because those are the operations with current Consumers; gestures, text entry, rotation, and device selection are added only with a concrete cross-platform requirement.

All browser operations use one trusted-host Connection RPC channel. Screenshots cross that JSON carrier as bounded base64 PNG data, so the feature owns no exact HTTP image route and inherits the Connection Host, Origin, Fetch Metadata, and JSON media-type fence. File requests carry a live session id and a candidate path. The runtime resolves the session root and candidate through `ctx.fs`, checks provider-owned containment after symlink resolution, and returns only direct directory metadata or a bounded strict-UTF-8 file.

The HarmonyOS Provider serializes screenshots and taps through one lifecycle-owned operation tail. Disposal unregisters admission, aborts the active command, prevents queued work from starting, awaits the tail, and removes the temporary directory. The browser polls only while Device is selected and the document is visible; each completed capture response advertises the next delay, configured as 100 ms by the shipped Bundle.

## Better Sidebar relationship

The Files + Device workspace follows Better Sidebar's compact tab-workspace idea, not its implementation or dependency graph. No Better Sidebar source is copied. Directory navigation and file viewing use Harness services and slots, which preserves session workspace authority, client lifecycle, localization, and the repository's trust fence.

## Alternatives considered

- **Install Better Sidebar and hide unwanted tabs.** Hidden terminal, Git, browser, and PTY routes would remain loaded and published.
- **Keep one HarmonyOS-specific client and add platform conditionals.** Every new platform would change the browser package and duplicate selection rules.
- **Keep screenshots on an exact HTTP route.** This needs a second trust-fence application and splits one feature across two browser transports.
- **Expose the model's filesystem tool directly to the browser.** Tool calls carry model policy and transcript semantics; human read-only browsing is a separate Consumer of `ctx.fs`.

## Consequences

Android and iOS can register Providers without changing the browser RPC or React components. The installable Bundle can initially publish one HarmonyOS composition while the runtime remains platform-neutral. The Web profile loads that aggregate Bundle instead of duplicating its internal rows, and the automation preset retains only model-visible tooling and skill guidance.

Unit tests cover Provider selection, malformed wire input, workspace containment, screenshot validation, relative tap mapping, serial execution, and awaited disposal. The assembled keyless Web scenario boots the shipped Loader and browser bundles, opens a real workspace file, clicks the rendered device frame, observes the exact `devecocli ui click` argv, and verifies a later frame replaces it. A publish-path rehearsal packs the aggregate and its internal packages, installs the aggregate tarball into a fresh DSH profile, and dumps the composed tree through the built CLI.
