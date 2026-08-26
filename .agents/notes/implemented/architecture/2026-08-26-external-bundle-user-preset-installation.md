# Agent Note: External Bundle presets install into the user roster

Status: implemented

English | [中文](2026-08-26-external-bundle-user-preset-installation.zh.md)

## Problem

An external Bundle can contribute Host and Client rows through `cordis.patch.yml`, but DSH 0.1.1-rc.2 has no public operation for adding a package-relative Agent Preset root. A preset directory published inside an npm package is therefore invisible to the roster. Calling a method added only in a source checkout makes the plugin start there while the same published package fails under the globally installed DSH release.

## Decision

`@fadinglight/dsh-device-automation` keeps `presets/automation` in its npm payload, while its Bundle patch registers only the automation runtime, HarmonyOS Provider, and browser UI. Its published `dsh-device-automation preset install` command copies that preset to `<dshHome>/.agent-presets/automation`, the user root derived by Agent Presets. The package main exports the same installer operations for programmatic use; no Bundle row calls `agentPresets`.

The installed directory carries an ownership record with a schema version, package version, directory inventory, and SHA-256 hash for every managed file. Install and update use an exclusive sibling lock, prepare owner-only content in a random sibling directory, and replace an existing managed version through a backup rename. A replacement failure restores the prior directory; failure of both replacement and rollback reports both outcomes. A symlink, non-directory target, absent or invalid ownership record, additional directory, changed file, or unsupported filesystem entry is retained and reported instead of overwritten.

The install operation is idempotent and also performs upgrades. Status distinguishes absent, foreign, locally modified, current, and outdated installations. Uninstall removes only an unchanged directory whose ownership record belongs to this package. The macOS/Linux script runs the official Profile installation command with its exact default package version followed by the explicit preset command; callers may override that version. The exact default prevents the Profile's minimum-release-age policy from resolving a fresh dist-tag to an older Bundle. Windows and diagnostic workflows use the same two commands directly. The preset command, rather than npm `postinstall`, owns the durable write so package-manager script policy cannot silently skip it and the invoked process resolves the intended `DSH_HOME`.

Every package reached only after selecting the installed preset must still be resolvable from the consumer Profile. The model-facing DevEco CLI tool therefore publishes as `@fadinglight/dsh-tool-harmonyos-uitest` and remains an aggregate dependency even though it is not a row in the Bundle patch. The copied preset loads that external package only for automation Sessions; the Web composition continues to register exactly the runtime, HarmonyOS Provider, and browser UI.

The installed preset has `user` trust and follows every configured root in roster precedence. Existing Sessions keep their mounted generation; later Sessions discover the synchronized directory. Deployments configured with `includeUserRoot: false` intentionally do not expose it. This realization partially replaces the preset-location portion of the broader [HarmonyOS automation platform proposal](../../proposed/feature/2026-08-21-harmony-automation-platform.md) and follows the existing [Harness-home user-root decision](../bug-fix/2026-08-11-preset-authoring-agent-validates-its-own-composition.md).

## Verification

Unit coverage pins dry runs, idempotence, upgrades, exact ownership checks, concurrent mutation rechecks, symlink and foreign-target refusal, local-change retention, staging cleanup, replacement rollback, and uninstall. The packed-install rehearsal installs only the aggregate tarball into a clean Profile, executes its built CLI under plain Node, and resolves the copied mode and externally published tool through the released user-root mechanism; assembled browser coverage uses that same `user` trust classification.

## Alternatives considered

- **Dynamically register a package-owned system root** — this keeps the preset read-only and avoids a copy, but the required `registerSystemRoot()` method is not in the released DSH runtime. It can be reconsidered after an official API and compatibility floor ship; a plugin release cannot assume a source-only method.
- **Write the preset from npm `postinstall`** — rejected because pnpm may block dependency lifecycle scripts, install-time environment does not reliably identify the intended Harness home, and removing an npm package does not provide a symmetric cleanup hook.
- **Patch the `agent-presets.roots` config row** — rejected because patch config replaces the whole row rather than deep-merging it, the launcher owns its shipped absolute root, and a package-relative path cannot be expressed portably in static YAML.
- **Copy without ownership metadata** — rejected because upgrades and uninstall could not distinguish plugin content from a user's same-named preset and would eventually overwrite or delete user work.

## Consequences

The published plugin works with the Agent Presets API already present in globally installed DSH 0.1.1-rc.2. Installation has one additional explicit synchronization step, and installing the Bundle alone mounts its Host and Client roles without adding the mode. The user copy consumes a small amount of Harness-home storage and can be edited, but any edit deliberately transfers update and removal responsibility to the user until they reconcile or delete it.
