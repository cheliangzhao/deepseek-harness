/** Optional content shown in the shared details column. */
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** One additive details-column mode supplied by an optional client plugin. */
export interface DetailsPanelEntry {
  /** Stable mode identity. */
  readonly id: string
  /** Panel body for the currently addressed session. */
  readonly render: (sessionId: SessionId) => ReactNode
  /** Whether the mode is available for the addressed session. */
  readonly visible?: (sessionId: SessionId) => boolean
}

/** Registry face for optional details-column modes. */
export interface IDetailsPanels {
  /** Subscribe to registrations and removals. */
  subscribe(listener: () => void): () => void
  /** Monotonic revision for useSyncExternalStore. */
  version(): number
  /** Select one live mode and open the shared details column. */
  open(id: string): void
  /** Current optional content, or undefined for built-in tool details. */
  active(): DetailsPanelEntry | undefined
  /** Register one optional mode. */
  register(entry: DetailsPanelEntry): () => void
}

/** In-memory details-mode registry owned by ui-conversation. */
export class DetailsPanelRegistry implements IDetailsPanels {
  private readonly entries = new Map<string, DetailsPanelEntry>()
  private readonly listeners = new Set<() => void>()
  private revision = 0
  private selected = 'tool'

  version(): number { return this.revision }
  active(): DetailsPanelEntry | undefined { return this.entries.get(this.selected) }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  open(id: string): void {
    if ((id !== 'tool' && !this.entries.has(id)) || this.selected === id) return
    this.selected = id
    this.changed()
  }

  register(entry: DetailsPanelEntry): () => void {
    if (entry.id === 'tool' || this.entries.has(entry.id)) throw new Error(`ui-conversation: duplicate details panel "${entry.id}"`)
    this.entries.set(entry.id, entry)
    this.changed()
    return () => {
      if (!this.entries.delete(entry.id)) return
      if (this.selected === entry.id) this.selected = 'tool'
      this.changed()
    }
  }

  private changed(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
