# Agent Note: Cross-platform device automation Provider seam

Status: implemented

English | [中文](2026-08-24-device-automation-provider-seam.zh.md)

## Problem

The first browser device preview directly combined HarmonyOS DevEco CLI commands, HTTP screenshot serving, and one browser panel. Adding Android or iOS behind that package would either copy the browser protocol or make platform-specific commands part of a shared UI package. The requested workspace also needs directory navigation and read-only file opening without inheriting Better Sidebar's terminal, Git, embedded browser, or PTY dependencies.

## Decision

Device automation is a four-package composition:

- `@fadinglight/dsh-device-automation` is the installable Bundle and publishing unit. It also owns registration of the packaged automation preset. The `@fadinglight/*` packages are excluded from the repository's `@deepseek-ai/*` release family and publish independently.
- `@fadinglight/dsh-device-automation-runtime` owns `ctx.deviceAutomation`, named Provider selection, trusted browser RPC, and read-only workspace access through `ctx.fs`.
- `@fadinglight/dsh-device-automation-harmonyos` registers the `harmonyos` Provider and is the only package that knows DevEco CLI argv.
- `@fadinglight/dsh-client-ui-device-automation` is the browser Consumer and exposes only Files and Device through a plugin-owned right-sidebar portal.

The runtime selects a request-named Provider, then the configured default, then a sole registered Provider. Multiple Providers without an explicit choice fail loud. The current Provider interface includes only screenshot and relative tap because those are the operations with current Consumers; gestures, text entry, rotation, and device selection are added only with a concrete cross-platform requirement.

All browser operations use one trusted-host Connection RPC channel. Screenshots cross that JSON carrier as bounded base64 PNG data, so the feature owns no exact HTTP image route and inherits the Connection Host, Origin, Fetch Metadata, and JSON media-type fence. File requests carry a live session id and a candidate path. The runtime resolves the session root and candidate through `ctx.fs`, checks provider-owned containment after symlink resolution, and returns only direct directory metadata or a bounded strict-UTF-8 file.

The HarmonyOS Provider resolves `devecocli` on the first browser preparation request. Absence returns an installation action. Availability checks a Provider-owned state file and every required `SKILL.md` in `$DSH_HOME/device-automation/skills`; matching Provider version, ordered Skill list, files, and state younger than the configured seven-day interval return ready without a subprocess. Missing, unreadable, mismatched, or expired state runs `devecocli update` followed by one Provider-owned forced synchronization of the mode's testing and fault or performance analysis skills. A missing Skill with otherwise current state is repaired without resetting the full-synchronization time. Before each Skill command starts, the Provider replaces one immutable progress snapshot with the completed count, total count, and current Skill. It verifies each resulting Skill before atomically committing the state file. The browser reads that snapshot while awaiting preparation but never starts or owns the synchronization. Concurrent requests share the operation, readiness is cached for the Provider lifetime, and a failed operation is discarded. The Provider separately serializes screenshots and taps through one lifecycle-owned operation tail. Disposal unregisters admission, aborts active preparation and device commands, prevents queued work from starting, awaits both operation owners, and removes the temporary directory. The browser polls only after preparation succeeds, while Device is selected and the document is visible; each completed capture response advertises the next delay, configured as 100 ms by the shipped Bundle.

## Better Sidebar relationship

The Files + Device workspace independently applies Better Sidebar's layout pattern without using its package or source. The client appends an effect-owned React portal to `document.body` and subscribes to the authoritative `ctx.sessions.list` selection. It renders the sidebar only when the selected Session records the `automation` preset, displays that mode in the sidebar title, and writes a package-specific CSS width variable that makes `#root` yield space while the panel is open. Successful preparation holds the workspace behind one short HarmonyOS-ready transition; reduced-motion clients keep the ready message but skip element motion. Selecting any other mode unmounts the workspace, stops screenshot polling, and removes the layout contribution. Disposal unmounts the React root, removes the portal, restores the layout variable, and ends the Session subscription. Directory navigation and file viewing keep using Harness services, which preserves session workspace authority, localization, and the repository's trust fence.

The aggregate carries `presets/automation`; its explicit `dsh-device-automation preset install` CLI copies the verified managed directory to `$DSH_HOME/.agent-presets/automation`. Its skill filesystem scans both the packaged DevEco CLI guidance and the Provider-owned synchronization directory. The aggregate depends on the HarmonyOS tool named by the preset; the host installation supplies the preset's other standard rows.

## Alternatives considered

- **Depend on Better Sidebar and register an external tab.** Its terminal, Git, browser, PTY, and Host routes would remain part of the installed dependency even when their tabs are disabled.
- **Keep one HarmonyOS-specific client and add platform conditionals.** Every new platform would change the browser package and duplicate selection rules.
- **Keep screenshots on an exact HTTP route.** This needs a second trust-fence application and splits one feature across two browser transports.
- **Expose the model's filesystem tool directly to the browser.** Tool calls carry model policy and transcript semantics; human read-only browsing is a separate Consumer of `ctx.fs`.
- **Add a dedicated details-column registry to `ui-conversation`.** An independently published plugin would then wait forever when installed into a DSH release without that private service.
- **Expose the sidebar for every agent preset.** Device controls would appear outside the automation workflow and a visible Device tab could keep polling in unrelated sessions.
- **Configure the Bundle preset path in the Web roster.** Profile configuration cannot portably derive an installed Bundle's directory and would couple the Web preset to the plugin's package layout.
- **Copy the preset into the user root during installation.** Installation would mutate user-owned state, assign the wrong trust and lifecycle ownership, and leave upgrades and removal without one authoritative source.
- **Download HarmonyOS skills from an npm `postinstall` script.** Package installation would depend on an ambient DevEco CLI, network access, and enabled lifecycle scripts, while silently changing package contents after integrity verification. First-use synchronization can report missing prerequisites and failures in the owning UI.
- **Contact the Skill catalog for every Provider process.** A locally verified state file avoids repeated catalog traffic while a bounded full synchronization obtains current DevEco CLI and declared Skills.

## Consequences

Android and iOS can register Providers without changing the browser RPC or React components. The installable Bundle can initially publish one HarmonyOS composition while the runtime remains platform-neutral. The Web profile loads that aggregate Bundle instead of duplicating its internal rows. The aggregate supplies the automation mode, while the preset itself retains only model-visible tooling and skill guidance.

Unit tests cover Provider selection, malformed wire input, workspace containment, missing-CLI guidance, persistent Skill synchronization state, retry, screenshot validation, relative tap mapping, serial execution, awaited disposal, preset-root disposal, mode-scoped sidebar rendering, preparation UI, and sidebar HMR cleanup. The assembled keyless Web scenario boots the shipped Loader and browser bundles, verifies that the standard mode has no device sidebar, resolves and opens the bundled automation mode, observes the exact skill synchronization argv, checks its sidebar title, opens a real workspace file, clicks the rendered device frame, observes the exact `devecocli ui click` argv, and verifies a later frame replaces it. A publish-path rehearsal packs the aggregate and its internal packages, installs the aggregate tarball into a fresh DSH profile, verifies the installed preset and effect disposer, and dumps the composed tree through the built CLI.
