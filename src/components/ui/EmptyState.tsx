import type { ReactNode } from 'react'

export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="empty-state">{title && <h2>{title}</h2>}{children}</div>
}
