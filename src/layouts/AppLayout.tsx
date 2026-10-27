import type { ReactNode } from 'react'

export function AppLayout({ demo, focused, actions, children }: {
  demo: boolean; focused: boolean; actions: ReactNode; children: ReactNode
}) {
  return <main className="hierarchy-app">
    <header className="app-header">
      <div className="heading">
        <div className="eyebrow">{demo ? 'INTERACTIVE DEMO' : 'TRELLO POWER-UP'}</div>
        <h1>{focused ? 'Card hierarchy' : 'Board hierarchy'}</h1>
        <p className="subtitle">One parent. Many possibilities. Keep related work together.</p>
      </div>
      <div className="header-actions">{actions}</div>
    </header>
    <div className="context-note">
      {demo ? 'Sample board · Changes stay in this demo session. No Trello cards are changed. ' : 'Hierarchy view · '}
      Collapsing a branch here does not hide native Trello cards.
    </div>
    {children}
    <footer className="app-footer">
      Relationships organize cards without moving or deleting them. Expansion is saved privately for this board.
    </footer>
  </main>
}
