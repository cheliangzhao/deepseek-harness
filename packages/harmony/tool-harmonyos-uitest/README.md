# @deepseek-ai/dsh-tool-harmonyos-uitest

English | [中文](README.zh.md)

Model-facing, allow-listed HarmonyOS automation through `devecocli`.

## Tools

`devecocli` accepts one argv vector for the `device`, `ui`, `log`, `build`, `run`, `check`, and `docs` command families. It runs that vector through `ctx.subprocess`; no model value enters a shell.

## Configuration

`enabled` defaults to `true`. `devecoCliExecutable`, `timeoutMs`, `graceMs`, and `maxOutputBytes` configure execution. Disabled instances register no tool or prompt guidance.

## Model Experience

### DevEco CLI command

#### What the model sees

- One `devecocli` schema and one stable prompt section that directs it to the installed `deveco-cli` skill.

#### Token effect

- Each call returns argv, stdout, stderr, exit status, and truncation facts.

#### KV Cache effect

The stable prompt section and tool schema are reusable across turns. Tool results change only after a command runs.

## Known Limitations and Deferred Work

- `update`, `auth`, emulator lifecycle, and signature commands are excluded from the base tool.
- The tool does not infer arguments, selectors, paths, or project configuration.
