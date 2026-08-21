import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as ToolUitest from '@deepseek-ai/dsh-tool-harmonyos-uitest'
import { DevEcoCliError, runDevEcoCli, validateDevEcoCliArgv } from '@deepseek-ai/dsh-tool-harmonyos-uitest'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('validateDevEcoCliArgv', () => {
  it('accepts the command families described by the DevEco skill', () => {
    expect(validateDevEcoCliArgv(['device', 'list', '--format', 'json'])).toEqual(['device', 'list', '--format', 'json'])
    expect(validateDevEcoCliArgv(['ui', 'layout', '--format', 'json'])).toEqual(['ui', 'layout', '--format', 'json'])
    expect(validateDevEcoCliArgv(['log', '--tail', '50'])).toEqual(['log', '--tail', '50'])
  })

  it('rejects command families outside the base capability', () => {
    expect(() => validateDevEcoCliArgv(['update'])).toThrow(DevEcoCliError)
    expect(() => validateDevEcoCliArgv(['auth', 'login'])).toThrow('must begin with')
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
      content: [{ type: 'text', text: 'device list\n' }],
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
})
