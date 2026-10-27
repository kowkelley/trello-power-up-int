import type { ReactNode } from 'react'

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{title}</span>{children}</label>
}
