// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import {
  AutomationTestView,
  workspaceRelativePath,
} from '../src/client/AutomationTestView.tsx'
import { buildAutomationTestPrompt } from '../src/client/test-runner.ts'
import { zh, type DeviceAutomationKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const listing = {
  cwd: '/workspace', path: '/workspace', truncated: false,
  entries: [
    { name: 'tests', path: '/workspace/tests', type: 'directory' as const },
    { name: 'smoke.md', path: '/workspace/smoke.md', type: 'file' as const },
  ],
}

function props(overrides: Partial<ComponentProps<typeof AutomationTestView>> = {}): ComponentProps<typeof AutomationTestView> {
  return {
    sessionId: 's1',
    t: (key: DeviceAutomationKey) => zh[key],
    list: vi.fn(async () => listing),
    run: vi.fn(async () => {}),
    ...overrides,
  } as unknown as ComponentProps<typeof AutomationTestView>
}

describe('AutomationTestView', () => {
  it('selects a workspace test case and submits its relative path', async () => {
    const run = vi.fn(async () => {})
    render(<AutomationTestView {...props({ run })} />)

    expect(screen.getByText(zh.noTestSelected)).toBeTruthy()
    fireEvent.click(await screen.findByRole('treeitem', { name: /smoke\.md/ }))
    expect(screen.getByText('smoke.md', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText('smoke.md', { selector: 'code' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.runTest }))

    await waitFor(() => { expect(run).toHaveBeenCalledWith('smoke.md', expect.any(AbortSignal)) })
    expect((await screen.findByRole('status')).textContent).toContain(zh.testSubmitted)
  })

  it('reports submission failure and lets a new selection replace it', async () => {
    const list = vi.fn(async (_sessionId: string, path: string | undefined) => path === undefined
      ? listing
      : {
        cwd: '/workspace', path: '/workspace/tests', truncated: false,
        entries: [{ name: 'nested.yaml', path: '/workspace/tests/nested.yaml', type: 'file' as const }],
      })
    render(<AutomationTestView {...props({ list, run: vi.fn(async () => { throw new Error('offline') }) })} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /smoke\.md/ }))
    fireEvent.click(screen.getByRole('button', { name: zh.runTest }))
    expect((await screen.findByRole('alert')).textContent).toContain(zh.testSubmitFailed)

    fireEvent.click(screen.getByRole('treeitem', { name: /tests/ }))
    fireEvent.click(await screen.findByRole('treeitem', { name: /nested\.yaml/ }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('tests/nested.yaml', { selector: 'code' })).toBeTruthy()
  })

  it('aborts environment preparation when the view unmounts', async () => {
    let signal: AbortSignal | undefined
    const run = vi.fn((_path: string, current: AbortSignal) => {
      signal = current
      return new Promise<void>(() => {})
    })
    const view = render(<AutomationTestView {...props({ run })} />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /smoke\.md/ }))
    fireEvent.click(screen.getByRole('button', { name: zh.runTest }))
    expect(signal?.aborted).toBe(false)
    await act(async () => { view.unmount() })
    expect(signal?.aborted).toBe(true)
  })
})

describe('automation test task', () => {
  it('normalizes POSIX and Windows workspace paths', () => {
    expect(workspaceRelativePath('/workspace', '/workspace/tests/smoke.md')).toBe('tests/smoke.md')
    expect(workspaceRelativePath('C:\\workspace', 'C:\\workspace\\tests\\smoke.yaml')).toBe('tests/smoke.yaml')
    expect(workspaceRelativePath('/workspace', '/other/smoke.md')).toBe('/other/smoke.md')
  })

  it('quotes the selected path in the durable model-visible instruction', () => {
    expect(buildAutomationTestPrompt('tests/line\nfeed.md')).toContain('"tests/line\\nfeed.md"')
    expect(buildAutomationTestPrompt('smoke.md')).toContain('currently connected authorized device')
  })
})
