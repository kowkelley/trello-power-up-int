import type { HierarchyState } from './store'

export function Notifications({ state, onDismiss }: { state: HierarchyState; onDismiss(): void }) {
  const { data, error, warning, notice } = state
  return <section className="banners" aria-label="Notifications">
    {error && <div className="banner error" role="alert">
      <span>{error}</span><button type="button" className="quiet" onClick={onDismiss}>Dismiss</button>
    </div>}
    {warning && <p className="banner warning">{warning}</p>}
    {notice && <p className="banner success" role="status">{notice}</p>}
    {data && !data.canWrite && <p className="banner warning">
      Read-only · Board write access is required to create cards or change relationships. You can still browse, filter, and expand.
    </p>}
    {!!data?.issues.length && <details className="banner warning">
      <summary>{data.issues.length} relationship issue{data.issues.length === 1 ? '' : 's'} · Review and repair</summary>
      <ul>{data.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
    </details>}
  </section>
}
