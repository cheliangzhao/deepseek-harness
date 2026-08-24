// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DevicePreviewPanel } from '../src/client/panel.tsx'
import { zh, type DevicePreviewKey } from '../src/client/locales.ts'

afterEach(() => { cleanup(); tap.mockClear(); vi.restoreAllMocks(); vi.useRealTimers() })

const t = (key: DevicePreviewKey): string => zh[key]
const tap = vi.fn(async () => {})

describe('DevicePreviewPanel', () => {
  it('shows the no-device page after a failed screenshot and restores the image on recovery', () => {
    render(<DevicePreviewPanel t={t} tap={tap} />)
    const image = screen.getByRole('img', { name: zh.imageAlt })

    fireEvent.error(image)
    expect(screen.getByRole('status').textContent).toContain(zh.noDevice)
    expect(image.getAttribute('data-hidden')).not.toBeNull()

    fireEvent.load(image)
    expect(screen.queryByRole('status')).toBeNull()
    expect(image.getAttribute('data-hidden')).toBeNull()
  })

  it('maps clicks in the contained image to relative device coordinates', async () => {
    render(<DevicePreviewPanel t={t} tap={tap} />)
    const image = screen.getByRole('img', { name: zh.imageAlt })
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 200))
    fireEvent.load(image)

    fireEvent.click(image, { clientX: 110, clientY: 70 })

    await waitFor(() => {
      expect(tap).toHaveBeenCalledWith({ x: 0.5, y: 0.25 })
    })
  })

  it('does not tap when the click lands in image letterboxing', () => {
    render(<DevicePreviewPanel t={t} tap={tap} />)
    const image = screen.getByRole('img', { name: zh.imageAlt })
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 100 },
      naturalHeight: { configurable: true, value: 200 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 200))
    fireEvent.load(image)

    fireEvent.click(image, { clientX: 20, clientY: 70 })

    expect(tap).not.toHaveBeenCalled()
  })

  it('starts the next poll only after the current screenshot settles', () => {
    vi.useFakeTimers()
    render(<DevicePreviewPanel t={t} tap={tap} />)
    const image = screen.getByRole('img', { name: zh.imageAlt })
    const firstSource = image.getAttribute('src')

    act(() => { vi.advanceTimersByTime(1_000) })
    expect(image.getAttribute('src')).toBe(firstSource)

    fireEvent.load(image)
    act(() => { vi.advanceTimersByTime(99) })
    expect(image.getAttribute('src')).toBe(firstSource)

    act(() => { vi.advanceTimersByTime(1) })
    const secondSource = image.getAttribute('src')
    expect(secondSource).not.toBe(firstSource)
    expect(image.getAttribute('data-hidden')).toBeNull()

    act(() => { vi.advanceTimersByTime(1_000) })
    expect(image.getAttribute('src')).toBe(secondSource)

    fireEvent.load(image)
    act(() => { vi.advanceTimersByTime(100) })
    expect(image.getAttribute('src')).not.toBe(secondSource)
  })
})
