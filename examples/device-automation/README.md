# device-automation

English | [中文](README.zh.md)

An opt-in overlay that adds the restricted DevEco CLI tool to a normal dsh composition.

## Run

Connect and authorize a device, then apply this overlay to a profile that already contains `subprocess`, `tools`, and `systemPrompt`:

```sh
pnpm dsh --profile headless --patch examples/device-automation/cordis.yml "List the connected device and inspect the current UI."
```

`devecocli` accepts a plain argv vector for the `device`, `ui`, `log`, `build`, `run`, `check`, and `docs` command families. It resolves `devecocli` from `PATH`. The installed `deveco-cli` skill supplies evolving command knowledge, but the runtime remains allow-listed.
