# @deepseek-ai/dsh-harmony-screen-preview

Automation-preset HTTP provider for the current HarmonyOS screen image.

`GET /api/device-preview/screenshot` runs `devecocli ui screenshot`, verifies a bounded PNG in a provider-owned temporary directory, atomically replaces the retained image, and returns image bytes with `ETag` and `Last-Modified`. The browser never receives the temporary path. A configured `deviceSerial` is passed to DevEco CLI; otherwise DevEco CLI selects the authorized device.

## Configuration

`devecoCliExecutable` overrides the executable found on `PATH`. `deviceSerial` selects a device. `maxBytes` defaults to 16 MiB and `timeoutMs` defaults to 15 seconds. Capture, device, format, and size failures return HTTP 503 without retaining an invalid image.

## Known Limitations and Deferred Work

- The provider exposes screenshots only. It does not offer input control, video streaming, recording, or image history.
