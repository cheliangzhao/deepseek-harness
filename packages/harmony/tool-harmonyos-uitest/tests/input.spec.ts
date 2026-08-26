import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ToolUitest from '@fadinglight/dsh-tool-harmonyos-uitest'
import { DevEcoCliError, runDevEcoCli, validateDevEcoCliArgv } from '@fadinglight/dsh-tool-harmonyos-uitest'

const contexts: Context[] = []

const reader = (text: string, lossy = false) => ({ readFrom: () => ({ text, nextOffset: Buffer.byteLength(text), lossy }) })
const quietHandle = (done: SubprocessHandle['done'], collected: SubprocessHandle['collected'] = { stdout: reader(''), stderr: reader('') }): SubprocessHandle => ({
  pid: 1, stdin: undefined, stdout: undefined, stderr: undefined, collected, done,
  terminate: () => {}, waitForExit: async () => true,
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('validateDevEcoCliArgv', () => {
  it('accepts the command families described by the DevEco skill', () => {
    for (const command of ['build', 'run', 'update', 'device', 'emulator', 'skills', 'log', 'create', 'init', 'serve', 'docs', 'ui', 'auth', 'check', 'signature']) {
      expect(validateDevEcoCliArgv([command, '--format', 'json'])).toEqual([command, '--format', 'json'])
    }
  })

  it('rejects command families outside the base capability', () => {
    expect(() => validateDevEcoCliArgv(['unknown'])).toThrow(DevEcoCliError)
    expect(() => validateDevEcoCliArgv(['unknown'])).toThrow('must begin with')
    expect(() => validateDevEcoCliArgv(['ui', 'text', 'x\0y'])).toThrow('cannot contain NUL')
  })

  it('mounts one generic tool and executes its argv through the subprocess service', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(ToolUitest, { devecoCliExecutable: '/bin/echo' })

    expect((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name)).toEqual(['devecocli'])
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('devecocli-tool'),
      name: 'devecocli',
      arguments: { argv: ['device', 'list'] },
    })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'stdout:\ndevice list\n' }],
      isError: false,
      meta: {
        argv: ['device', 'list'],
        stdout: 'device list\n',
        stderr: '',
        exitCode: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      value: {
        argv: ['device', 'list'],
        stdout: 'device list\n',
        stderr: '',
        exitCode: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    })
  })

  it('resolves devecocli from the subprocess execution world when no override is configured', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    const resolveExecutable = vi.spyOn(ctx.subprocess, 'resolveExecutable').mockResolvedValue('/bin/echo')

    await expect(runDevEcoCli(ctx, {}, ['docs', 'search', 'ArkUI'], new AbortController().signal)).resolves.toMatchObject({
      argv: ['docs', 'search', 'ArkUI'], stdout: 'docs search ArkUI\n', exitCode: 0,
    })
    expect(resolveExecutable).toHaveBeenCalledWith('devecocli', undefined, expect.any(AbortSignal))
  })

  it('uses the calling agent workspace as the subprocess cwd', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    const spawn = vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.resolve({ exitCode: 0, signal: null })))

    await runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], new AbortController().signal, '/workspace/project')
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/workspace/project' }))
  })

  it('renders both streams and truncation markers for the model', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(
      Promise.resolve({ exitCode: 2, signal: null }),
      { stdout: reader('tail\n', true), stderr: reader('error\n') },
    ))
    await ctx.plugin(ToolUitest, { devecoCliExecutable: '/bin/echo', maxOutputBytes: 5 })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('devecocli-render-both'),
      name: 'devecocli',
      arguments: { argv: ['device', 'list'] },
    })
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'stdout:\ntail\nstderr:\nerror\n[stdout truncated; only the retained tail is shown]\n',
    })
  })

  it('renders the exit code when both streams are empty', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.resolve({ exitCode: 0, signal: null })))
    await ctx.plugin(ToolUitest, { devecoCliExecutable: '/bin/echo' })

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('devecocli-render-empty'),
      name: 'devecocli',
      arguments: { argv: ['device', 'list'] },
    })
    expect(result.content[0]).toEqual({ type: 'text', text: 'exit 0' })
  })
})

describe('runDevEcoCli failure and edge branches', () => {
  it('does not register when disabled', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ToolUitest, { enabled: false })

    expect((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name)).not.toContain('devecocli')
  })

  it('maps a spawn throw to DEVECO_CLI_SPAWN_FAILED', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockImplementation(() => { throw new Error('boom') })

    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], new AbortController().signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_SPAWN_FAILED' })
  })

  it('maps a done rejection to DEVECO_CLI_SPAWN_FAILED', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.reject(new Error('boom'))))

    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], new AbortController().signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_SPAWN_FAILED' })
  })

  it('classifies timeout and caller cancellation independently', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    const spawn = vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.resolve({ exitCode: null, signal: 'SIGTERM' })))
    spawn.mockReturnValueOnce(quietHandle((async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return { exitCode: null, signal: 'SIGTERM' }
    })()))
    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo', timeoutMs: 1 }, ['device', 'list'], new AbortController().signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_TIMEOUT' })

    const caller = new AbortController()
    caller.abort()
    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], caller.signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_CANCELLED' })
  })

  it('classifies a process terminated by an external signal', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.resolve({ exitCode: null, signal: 'SIGTERM' })))

    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], new AbortController().signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_SIGNALLED' })
  })

  it('rejects when a collect stream is missing', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalSubprocessRuntime)
    vi.spyOn(ctx.subprocess, 'spawn').mockReturnValue(quietHandle(Promise.resolve({ exitCode: 0, signal: null }), {}))

    await expect(runDevEcoCli(ctx, { devecoCliExecutable: '/bin/echo' }, ['device', 'list'], new AbortController().signal))
      .rejects.toMatchObject({ code: 'DEVECO_CLI_OUTPUT_UNAVAILABLE' })
  })
})
