# 设备自动化

[English](device-automation.md) | 中文

设备自动化能力将平台无关运行时（[dsh-device-automation-runtime](../../packages/device/device-automation-runtime/README.zh.md)，`ctx.deviceAutomation`）、[HarmonyOS](../../packages/device/device-automation-harmonyos/README.zh.md) 等平台 Provider，以及浏览器 [文件 + 设备 Consumer](../../packages/client/ui-device-automation/README.zh.md) 分开。可安装的 [dsh-device-automation Bundle](../../packages/device/device-automation/README.zh.md) 组合这些角色，并将其打包的 `automation` preset 注册为只读系统根目录。Android 与 iOS Provider 可以实现相同的 Provider 接口，无需改变浏览器请求。[Provider seam Agent Note](../../.agents/notes/implemented/architecture/2026-08-24-device-automation-provider-seam.zh.md)记录了角色拆分。

源码：[`packages/device/device-automation-runtime/src/index.ts`](../../packages/device/device-automation-runtime/src/index.ts)

## Provider 标识与数据

Provider 名称是不透明的注册表标识。相对点击坐标对应已解码的截图内容，而非浏览器布局坐标。

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

## Provider 约定

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

每项注册使用唯一的非空名称，并跟随其 Cordis effect 作用域。请求依次选择显式指定的 Provider、配置的默认 Provider，以及唯一注册的 Provider。注册表为空或存在歧义时会失败，不按注册顺序选择。准备结果为就绪状态或一项安装操作；进度快照会报告当前阶段但不启动工作，Provider 就绪前，设备控制保持不可用。

## 受信浏览器操作

运行时通过 Connection 服务以 `trusted-host` 权限注册 `/device-automation`。该通道提供 Provider 发现与准备进度、截图、相对坐标点击、目录列表与受大小限制的 UTF-8 文件读取。浏览器请求不能指定任意工作区：文件操作从 `SessionHeader.cwd` 获取在线会话工作目录，通过 `ctx.fs` 解析路径，并拒绝解析后位于该目录之外的目标。目录和文件大小限制属于部署配置。

截图响应携带完整 PNG 字节和 Host 选定的下次请求等待时间。仅当当前 Session 记录了 `automation` agent preset 时，Consumer 才存在，并在侧栏标题中显示该模式；它会等到替换图片解码后再丢弃上一帧，并在“设备”页签、独立右侧栏或浏览器文档隐藏时停止轮询。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [DeviceAutomationProvider](../../packages/device/device-automation-runtime/README.zh.md) · [DeviceAutomationProviderName](../../packages/device/device-automation-runtime/README.zh.md)

Source: [`packages/device/device-automation-runtime/src/index.ts`](../../packages/device/device-automation-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
