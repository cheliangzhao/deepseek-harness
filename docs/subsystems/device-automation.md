# Device Automation

English | [中文](device-automation.zh.md)

The device automation capability separates the platform-neutral runtime ([dsh-device-automation-runtime](../../packages/device/device-automation-runtime/README.md), `ctx.deviceAutomation`), platform Providers such as [HarmonyOS](../../packages/device/device-automation-harmonyos/README.md), and the browser [Files + Device Consumer](../../packages/client/ui-device-automation/README.md). The installable [dsh-device-automation Bundle](../../packages/device/device-automation/README.md) composes those roles and registers its packaged `automation` preset as a read-only system root. Android and iOS Providers can implement the same Provider interface without changing browser requests. The [Provider-seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-24-device-automation-provider-seam.md) records the role split.

Source: [`packages/device/device-automation-runtime/src/index.ts`](../../packages/device/device-automation-runtime/src/index.ts)

## Provider identity and data

Provider names are opaque registry identities. Relative taps refer to decoded screenshot content rather than browser layout coordinates.

```ts type-equiv
/** Opaque registry key for one platform provider. */
type DeviceAutomationProviderName = Branded<'DeviceAutomationProviderName'>
```

```ts type-equiv
/** Relative coordinates within the last device screenshot. */
interface RelativeTapPosition {
  /** Horizontal fraction in `[0, 1)`. */
  readonly x: number
  /** Vertical fraction in `[0, 1)`. */
  readonly y: number
}
```

```ts type-equiv
/** Complete image returned by a platform provider. */
interface DeviceScreenshot {
  /** Browser-decodable media type. */
  readonly mediaType: 'image/png'
  /** Complete encoded image bytes. */
  readonly bytes: Uint8Array
  /** Native image width in pixels. */
  readonly width: number
  /** Native image height in pixels. */
  readonly height: number
}
```

## Provider contract

```ts type-equiv
/** Provider role implemented by HarmonyOS, Android, or iOS adapters. */
interface DeviceAutomationProvider {
  /** Unique registry name. */
  readonly name: string
  /** Stable platform label shown by clients. */
  readonly platform: string
  /**
   * Read the latest provider-owned preparation progress without starting work.
   * @returns one immutable point-in-time progress value.
   */
  preparationProgress(): DeviceAutomationPreparationProgress
  /**
   * Prepare platform tooling before the browser starts device operations.
   * @param signal - caller cancellation.
   * @returns readiness or one user action that can make the provider ready.
   */
  prepare(signal: AbortSignal): Promise<DeviceAutomationPreparation>
  /**
   * Capture the current authorized device screen.
   * @param signal - caller cancellation.
   * @returns one complete validated screenshot.
   */
  screenshot(signal: AbortSignal): Promise<DeviceScreenshot>
  /**
   * Tap the current authorized device using relative screenshot coordinates.
   * @param position - point within the last screenshot.
   * @param signal - caller cancellation.
   * @returns completion after the platform operation settles.
   */
  tap(position: RelativeTapPosition, signal: AbortSignal): Promise<void>
}
```

Each registration has a unique non-empty name and follows its Cordis effect scope. A request selects its explicit Provider, then the configured default, then the sole registered Provider. Empty and ambiguous registries fail instead of selecting by registration order. Preparation returns readiness or one installation action; the progress snapshot reports its current phase without starting work, and device controls remain inactive until the Provider is ready.

## Trusted browser operations

The runtime registers `/device-automation` through the Connection service with `trusted-host` authority. The channel exposes Provider discovery and preparation progress, screenshot capture, relative taps, directory listing, and bounded UTF-8 file reads. Browser requests cannot name an arbitrary workspace: file operations derive the live session working directory from `SessionHeader.cwd`, resolve paths through `ctx.fs`, and reject targets whose resolved path lies outside that directory. Directory and file size limits are deployment configuration.

Screenshot replies carry complete PNG bytes and a Host-selected delay before the next request. The Consumer exists only while the current Session records the `automation` agent preset, names that mode in the sidebar title, waits until the replacement image decodes before discarding the preceding frame, and stops polling while its Device tab, standalone right sidebar, or browser document is hidden.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeviceautomation--deviceautomationruntime"></a>

### `ctx.deviceAutomation` — `DeviceAutomationRuntime`

Registry and browser-facing consumer over platform device providers.

```ts cordis-catalog
/**
 * Register one uniquely named platform provider for this effect scope.
 * @param provider - trusted same-process platform implementation.
 * @returns disposer removing exactly this provider.
 */
registerProvider(provider: DeviceAutomationProvider): () => void

/**
 * List the currently registered platform providers.
 * @returns provider descriptors in registration order.
 */
listProviders(): readonly { name: DeviceAutomationProviderName; platform: string }[]
```

Types: [DeviceAutomationProvider](../../packages/device/device-automation-runtime/README.md) · [DeviceAutomationProviderName](../../packages/device/device-automation-runtime/README.md)

Source: [`packages/device/device-automation-runtime/src/index.ts`](../../packages/device/device-automation-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
