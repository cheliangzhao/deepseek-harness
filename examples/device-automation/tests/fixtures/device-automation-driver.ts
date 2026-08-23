#!/usr/bin/env node
/** Loader-backed driver for the device-automation overlay snapshot. */

import { boot, loadOverlayPatches, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { CallId } from '@deepseek-ai/dsh-llm'

const name = 'device-automation-snapshot'
const [configPath, overlayPath] = process.argv.slice(2)
if (configPath === undefined || overlayPath === undefined) throw new Error(`${name}: expected <config-path> <overlay-path>`)

const patches = loadOverlayPatches(name, overlayPath)
const inserted = patches.flatMap(patch => patch.insert ?? []).find(entry => entry.id === 'tool-harmonyos-uitest')
if (inserted === undefined) throw new Error(`${name}: overlay did not insert tool-harmonyos-uitest`)
inserted.config = { ...(inserted.config as Record<string, unknown> | undefined), devecoCliExecutable: '/bin/echo' }

const ctx = await boot(name, resolveConfigPath(configPath, undefined), patches)
try {
  const schema = ctx.tools.schemas().find(tool => tool.name === 'devecocli')
  const prompt = (await ctx.systemPrompt.assemble()).sections.find(section => section.name === 'tool:devecocli')
  if (schema === undefined || prompt === undefined) throw new Error(`${name}: devecocli did not mount through the Loader`)
  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId('device-automation-snapshot'),
    name: 'devecocli',
    arguments: { argv: ['device', 'list'] },
  })
  process.stdout.write(`${JSON.stringify({
    schema: schema.name,
    prompt: prompt.text,
    result: {
      content: result.content,
      isError: result.isError,
      value: result.value,
    },
  })}\n`)
} finally {
  await ctx.fiber.dispose()
}
