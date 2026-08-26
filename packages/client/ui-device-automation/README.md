# @fadinglight/dsh-client-ui-device-automation

English | [中文](README.zh.md)

Browser Consumer for the device automation capability. When the current Session records the `automation` agent preset, it contributes an **Automation tests** conversation tab and mounts a plugin-owned **Device automation** right sidebar containing only **Files** and **Device**. The sidebar title names the current mode as **Automation test mode**. Other modes render neither entry, reserve no application width, and issue no screenshot requests. The package appends one React portal to `document.body`, follows the current Session from `ctx.sessions`, and makes `#root` yield the open panel width through a plugin-owned CSS variable. When collapsed, its entry stays beside the Session header utilities on the same center line. It does not depend on Better Sidebar, a private client service, or changes to the Web application packages.

The first mount for an automation Session requests Provider preparation before rendering Files or starting screenshot polling. While DevEco CLI checks and Skill synchronization run, the sidebar keeps its spinner visible and shows the completed count, total count, progress bar, and current Skill below it. Successful synchronization plays a short HarmonyOS-ready transition before opening the workspace; reduced-motion clients retain the ready state without moving its elements. A missing CLI shows the Provider-supplied installation command, download link, and retry action. Synchronization failures show a retry action without discarding the session, and a later mount automatically starts preparation again so an interrupted first download resumes without another confirmation.

Files lists the current live session's working directory through the trusted `/device-automation` Connection RPC channel. It enters child directories and opens bounded UTF-8 files read-only; editing, terminals, Git, and embedded browsing are intentionally absent. Host-side containment follows the configured `ctx.fs` provider, including symlink resolution, so a requested path outside the session workspace is rejected.

Automation tests reuses the same contained file tree as a test-case picker. **Run test** first requires successful Provider preparation, then queues one user message on the selected automation Session through `ctx.conversation`; the browser does not invoke a process directly. The selected path is relative to the Session workspace, and execution progress and results remain in Conversation and Trajectory.

The Device surface requests complete screenshots through the same trusted RPC channel, keeps the previous frame until its replacement decodes, and waits for the Host-advertised interval after each completed request. Polling stops while the browser document is hidden, the Files tab is selected, or the sidebar is collapsed. Failed captures keep retrying so a newly connected authorized device appears without reopening the sidebar. Clicking decoded image content sends relative coordinates; letterboxing and loading states do not issue taps.

## Model Experience

### Submitted automation test task

#### What the model sees

Clicking **Run test** queues the following user message in the current automation Session. `<path>` represents the selected workspace-relative path serialized as a JSON string.

##### Automation instruction

```markdown
Run the automation test case at workspace-relative path <path>.

Read the complete file before acting. Treat its contents as the test case steps and data. Use the installed HarmonyOS automation Skills and DevEco CLI UI automation commands against the currently connected authorized device.

After execution, report the steps performed, passed and failed checks, relevant device errors or logs, and concrete follow-up actions. Do not modify the test case unless it explicitly asks for an edit.
```

#### Token effect

Conditional and append-only: each run adds the fixed instruction plus the selected path as one queued user message. No tokens are added until the user runs a test.

#### KV Cache effect

The message appends after existing Session history, so the preceding reusable prefix remains stable. Selecting another path without running does not affect requests; each run extends history and may create a new reusable suffix subject to provider caching and eviction.

## Known Limitations and Deferred Work

- File presentation is plain UTF-8 text without syntax highlighting, search, or binary previews.
- Test execution results remain in Conversation and Trajectory; this view does not parse framework-specific pass/fail reports into a structured dashboard.
- The active provider is selected by the Host runtime; the browser has no provider picker yet.
- Layout integration relies on the Web application's stable `#root` mount element; narrow viewports overlay the application instead of shrinking it.
