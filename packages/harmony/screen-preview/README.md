# @deepseek-ai/dsh-harmony-screen-preview

English | [中文](README.zh.md)

Automation-preset HTTP provider for the current HarmonyOS screen image and taps.

`GET /api/device-preview/screenshot` runs `devecocli ui screenshot`, verifies a bounded PNG in a provider-owned temporary directory, atomically replaces the retained image, and returns image bytes with `ETag` and `Last-Modified`. The browser never receives the temporary path. A configured `deviceSerial` is passed to DevEco CLI; otherwise DevEco CLI selects the authorized device.

The trusted-host `POST /device-preview/tap` Connection RPC accepts `{ "x": number, "y": number }`, with each coordinate in `[0, 1)`. The Connection carrier rejects untrusted Host, Origin, Fetch Metadata, and non-JSON requests before dispatch. The provider maps accepted coordinates to the most recently captured PNG's native pixels and runs `devecocli ui click`. A tap requires a valid retained screenshot; malformed payloads and CLI failures return RPC errors.

## Configuration

`devecoCliExecutable` overrides the executable found on `PATH`. `deviceSerial` selects a device. `maxBytes` defaults to 16 MiB and `timeoutMs` defaults to 15 seconds. Capture, device, format, and size failures return HTTP 503 without retaining an invalid image. Screenshot and tap operations are serialized; plugin disposal cancels and awaits the active operation and prevents queued operations from starting.

## Model Experience

None, as the provider exposes browser routes and registers no model-facing content.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The provider supports taps only. It does not offer swipes, text input, video streaming, recording, or image history.
