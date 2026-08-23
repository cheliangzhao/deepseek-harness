// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DevicePreviewPanel } from '../src/client/panel.tsx'
import { zh, type DevicePreviewKey } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: DevicePreviewKey): string => zh[key]

describe('DevicePreviewPanel', () => {
  it('shows the no-device page after a failed screenshot and restores the image on recovery', () => {
    render(<DevicePreviewPanel t={t} />)
    const image = screen.getByRole('img', { name: zh.imageAlt })

    fireEvent.error(image)
    expect(screen.getByRole('status').textContent).toContain(zh.noDevice)
    expect(image.getAttribute('data-hidden')).not.toBeNull()

    fireEvent.load(image)
    expect(screen.queryByRole('status')).toBeNull()
    expect(image.getAttribute('data-hidden')).toBeNull()
  })
})
