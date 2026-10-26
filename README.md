# Internal Trello Hierarchy

A static TypeScript/Vite Power-Up for real, same-board Trello cards. No database,
paid backend, Custom Fields, webhooks, or background workers. The **Hierarchy**
board button opens a fullscreen Trello modal with lists, nested expandable cards,
search, status/label filters, and current card metadata. A parent card also has a
child-tree section; child cards have a parent link. Card buttons open create/link/
change-parent/unlink controls. Unlink never deletes the card.

**Platform boundary:** a Power-Up iframe cannot rearrange or hide Trello's native
board cards. Collapsing applies only to this Power-Up's view. Children keep their
real lists and remain visible in the standard board. Nothing is moved, archived,
or deleted to simulate hiding.

## Documentation verification and limitations

Verification attempted **2026-10-26**. This build environment could not resolve
`developer.atlassian.com`, `support.atlassian.com`, or `p.trellocdn.com`. Therefore
**current official documentation and a real-board integration were not verified**.
The implementation uses documented SDK patterns corroborated by Trello-owned
archived examples, not invented DOM hooks. Before company rollout, confirm the
current pages below and run the private-board acceptance checklist.

| Concern | Implementation / evidence and required check |
| --- | --- |
| Supported surfaces | `board-buttons`, `card-buttons`, `card-back-section`, `card-badges`, `authorization-status`, `show-authorization`, `show-settings`; fullscreen `t.modal()` called by a user action. See [capabilities](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/) and [client library](https://developer.atlassian.com/cloud/trello/power-ups/client-library/). |
| SDK evidence retrieved | Trello's [archived template](https://github.com/trello-archive/power-up-template/blob/master/js/client.js) demonstrates fullscreen modal, card data, shared/private storage, badges, and authorization. [Archived section example](https://github.com/trello-archive/code-snippets/blob/master/scripts/connector.js) demonstrates the card-back iframe. These are historical, not proof of current commercial terms. |
| Authorization | Official [REST API client](https://developer.atlassian.com/cloud/trello/power-ups/rest-api-client/): SDK `getRestApi()`, configured with `appKey` / `appName`, authorizes on a user click. SDK manages the token; the app never puts it in shared storage, localStorage, build output, logs, or URL query strings. REST uses an OAuth Authorization header. Each user authorizes separately. |
| API visibility | REST reads the current board's cards, lists, members, and membership. SDK reads/writes only this Power-Up's card-shared parent pointers. REST and SDK enforce the user's permissions; UI checks write access too. [REST introduction](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/). Tokens are user-wide read/write grants, **not** board-scoped credentials; only authorize trusted deployed code. |
| Storage | Historical official limit: **4096 characters per model/scope and visibility aggregate**, not per key. The implementation budgets 3500 UTF-8 bytes for settings/preferences to leave serialization headroom; small child pointers avoid a board-wide relationship limit. Reconfirm [storage documentation](https://developer.atlassian.com/cloud/trello/power-ups/client-library/getting-and-setting-data/). |
| Free plan | Trello has offered unlimited Power-Ups per board on Free; this app uses no paid API feature. **Current Free-plan eligibility, collaborator/board quotas, and private custom-Power-Up rules could not be freshly verified here.** Confirm [current pricing](https://trello.com/pricing), [enabling Power-Ups](https://support.atlassian.com/trello/docs/enabling-power-ups/), and the custom-Power-Up guide before relying on Free for company use. Do not confuse Premium-only observer roles with a need for Premium for the app itself. |
| Private distribution | Register an unlisted/custom Power-Up owned by the company Workspace. Historically this requires a Workspace admin and makes it available on that Workspace's boards. Confirm [adding a custom Power-Up](https://developer.atlassian.com/cloud/trello/guides/power-ups/adding-a-custom-power-up/) and current Workspace/Enterprise policy; a board admin may also be needed to enable it. No public directory publication is required for internal distribution. |
| Static hosting | GitHub Pages serves public assets, cannot receive Trello webhooks, and cannot run workers. Free GitHub Pages generally requires a public repository; private-repository Pages availability depends on your GitHub plan and organization policy. See [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages). Do not make a company source repository public without approval. |

Private Power-Up distribution controls where Trello offers the integration;
**it does not make the hosted JavaScript private**. Conversely, public frontend
assets do not make a private board public. Never embed real company cards, tokens,
client secrets, or personal data in this repository, fixtures, Actions variables,
screenshots, or static artifacts. The API key is a public client identifier, not a
secret. No client secret is needed.

## Run locally / demo

Use Node **24** and npm:

```sh
npm ci
npm test
npm run dev
```

Open the printed local URL (or `?demo=1`). The default standalone page is clearly
labeled **demo mode**, with fictional help-center launch cards, cross-list
children, deeper nesting, a completed task, and an overdue task. Demo changes
are in-memory only and reset on reload; they never call Trello. Live preferences
are stored privately per member on the board. Trello SDK access requires HTTPS
and an actual Trello iframe; localhost demo is not a substitute for live testing.

```sh
npm run build
npm run preview
```

There are no additional lint tools. `npm run build` performs TypeScript checking.
Tests use Node's built-in runner and cover hierarchy integrity, storage budgets,
rollups, stale metadata, authorization, and live adapter permission gates.

## Account setup — actions you must perform

### 1. GitHub account / repository administrator

1. Approve hosting of these **non-sensitive frontend assets**. Keep your Trello
   board private. If your private repository cannot use Pages on its current
   plan, use an approved public frontend-only repository or another free static
   HTTPS host; do not pay for a server just for this app.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
   The workflow deploys on pushes to `main` or manual dispatch. Adjust its branch
   trigger if your default branch is different.
3. After creating the Trello API key below, add the repository **Actions variable**
   `VITE_TRELLO_API_KEY`. Never supply a token or client secret. Re-run deployment
   after changing it. No additional npm runtime dependency is necessary.
4. Approve the `github-pages` environment deployment if your organization
   requires it. The workflow uses read-only checkout and grants Pages/OIDC
   permissions only to the deployment job.
5. Expected project URL:
   `https://kowkelley.github.io/trello-power-up-int/`.
   Workflow `BASE_PATH` is derived from the repository name. Locally the default
   base is relative. For a custom domain or a user-site repository, use `/` as
   `BASE_PATH` instead. All iframe and icon URLs resolve from the deployed folder,
   including the trailing project path.

### 2. Trello Workspace administrator

1. Sign into [Power-Up administration](https://trello.com/power-ups/admin).
   Create a new custom Power-Up owned by the **company Workspace**, not an
   unrelated personal Workspace. Workspace admin access may be required.
2. Set its name, support contact, and iframe connector URL to:
   `https://kowkelley.github.io/trello-power-up-int/index.html?view=connector`.
   Use your actual Pages host/project path if different. The bare URL opens demo
   mode; **it is not the connector URL**.
3. Enable exactly these capabilities:
   `board-buttons`, `card-buttons`, `card-back-section`, `card-badges`,
   `authorization-status`, `show-authorization`, `show-settings`.
   The settings UI contains list-to-status configuration.
4. Generate an API key associated with this Power-Up in its API-key settings.
   Add the **allowed authorization origin**
   `https://kowkelley.github.io` (scheme + host, **not** `/trello-power-up-int/`).
   Configure any URL fields separately with the full HTTPS project URL.
   For a different host, allow that exact origin. Do not add broad wildcards.
   Add this public API key as the GitHub variable above, then deploy again.
5. Keep the Power-Up unlisted/private for that Workspace. Do not submit it for
   public directory publication just to enable internal boards. Verify the
   current admin portal's private/custom distribution settings and Free-plan
   policy using the links above; Enterprise restrictions may require approval.
6. On a **private** board in that Workspace, use **Power-Ups → Add Power-Ups**
   and the Workspace/custom section to enable it. Ask a board admin if you cannot.
   Enabling the Power-Up does not change board visibility.

### 3. Each Trello user

1. Click **Hierarchy** and **Authorize** (or the Power-Up's authorize-account
   setting), allow the SDK authorization popup, review read/write scope, and
   approve. The write scope enables real card creation; Trello still rejects
   writes for read-only users. Blocking third-party storage or popups may prevent
   authorization; permit Trello/your trusted Pages origin, not arbitrary sites.
2. Click **Refresh** after returning. Tokens are managed by the SDK. Disconnect
   clears the app's saved token, but is not token revocation; revoke access in
   your Trello account's authorized-app settings when necessary.
3. Only **board admins** can save workflow mappings. Ordinary board writers can
   edit hierarchy; viewers see a read-only view. True anonymous viewers of a
   private board cannot access it. Free does not need a paid observer role.

For non-Pages static hosting, build with the same public key and the correct
`BASE_PATH`, upload `dist`, retain HTTPS and iframe compatibility, and update all
connector/origin settings.

## Behavior and data model

- Canonical relationship: child-card **shared** key `parent-v1` = parent card ID.
  No duplicate board-wide relationship index. One pointer permits only one
  direct parent. Deeper nesting is allowed; self-links, cycles, missing/archived
  targets, and cross-board links are rejected.
- Create child makes one real card in the chosen active list and writes its
  parent pointer. If linking fails after creation, the error identifies the
  preserved new card; refresh and link it rather than creating a duplicate.
  Unlink changes only Power-Up metadata.
- Rendering deduplicates by the canonical parent edge. A child's real list is
  shown even under a parent in another column. Search/filters retain ancestor
  context and reveal matching descendants. Unparented active cards appear in
  their own list.
- Read titles, labels, members, lists, due dates, and `dueComplete` live from
  REST. Default status is the real list name. Board-shared `list-rules-v1`
  optionally maps list IDs to a display status and a completion rule; this uses
  no Custom Fields. Complete means `dueComplete` **or** mapped completed list.
  Archival alone never means completion.
- Rollups count **all active descendants**, not just direct children. Completed
  / total, percentage, and overdue count appear in the hierarchy. Native compact
  badges show direct-child count / child-card marker without triggering REST
  authorization just to view the board; dynamic badges request a 60-second refresh.
- Board-private `expanded-v1` stores the current user's expanded card IDs.
  The 3500-byte guard reports a storage-budget error rather than silently
  truncating preferences; collapse branches to save a smaller set. Demo does
  not persist preferences across reloads.
- Fresh loads precede writes. Concurrent edits of different children do not
  overwrite an aggregate document. Same-child edits are **last-writer-wins**.
  Trello shared plugin storage has no application-level compare-and-swap or
  transaction; two simultaneous edits on different cards can still create a
  cycle. The app detects invalid edges on every load, deterministically ignores
  unsafe edges in the view, and warns with card IDs. Post-write checks report
  conflicts. This is detection/recovery, **not** a claim of atomic cycle
  prevention across clients. Change parent or Unlink on the reported card
  repairs its stored pointer; ignored metadata is not silently deleted.
- Archived, deleted, moved, or inaccessible parents are not followed across
  boards. Remaining active children return to their actual columns with a
  repair warning. Archived cards are excluded from active trees/rollups.
  Restoring a parent can reactivate a still-valid stored link. Metadata on a
  moved child follows that card; unlink/change parent on its new enabled board.
  Deleted-child metadata disappears with that card.
- SDK render events, manual Refresh, and 60-second visible-view polling keep
  the hierarchy current while open. No promise of real-time background updates.
  Rate-limit/access failures are shown; there is no retry storm. Relationship
  reads are batched at 20. Large boards may take longer; no company data is
  cached in a server or static build.
- If a relationship read fails, that card is shown safely without an edge and
  editing is blocked until a complete snapshot is available. Nothing attempts
  to circumvent inaccessible cards or board permissions.

## Private-board acceptance checklist

- [ ] Confirm current plan/private-distribution terms and admin approvals;
      deploy, verify the project-path connector and allowed auth origin.
- [ ] Enable on a test **private** board; authorize two separate users. Check
      browser network requests go only to your host, Trello SDK, and Trello API.
- [ ] Create parent + children in different lists; confirm real cards exist.
      Link an existing card, change parent, unlink; confirm no card was removed.
- [ ] Reject self-parenting, descendant-as-parent, and cross-board candidates;
      create a three-level tree with no duplicate rows.
- [ ] Collapse a parent in Hierarchy: children disappear there **only**. Verify
      standard Trello still displays them and their lists did not change.
- [ ] Reload/reopen as the same user, then another user; collapse preferences
      persist independently. Search a collapsed descendant; filter status/label.
- [ ] Change title/list/labels/member/due date in Trello; Refresh or wait up to
      60 seconds in the visible view. Click a child/parent to open its real card.
- [ ] Starting with unrelated cards, link and unlink them; verify native parent
      and child badges appear/update within 60 seconds. Confirm Trello schedules
      dynamic refresh even when the initial badge has empty text and no icon.
- [ ] As board admin map a list to complete; check multi-level rollups and
      overdue counts. Confirm archive is not counted as completion.
- [ ] Test a read-only user on a board/plan that supports it: no mutation
      controls, no SDK or REST writes; ordinary writers cannot save admin rules.
- [ ] Archive/move/delete a linked parent; verify children remain accessible,
      warnings appear, and Unlink or Change parent repairs stale metadata.
- [ ] Have two users relink concurrently; verify deterministic safe rendering
      and repair warnings if a cycle is formed. Check permission revocation,
      expired/revoked authorization, blocked popups, and manual reconnection.
- [ ] Verify public build output contains only code/assets/fictional demo data
      and the public API key. Never record a token in an issue or screenshot.

## Optional separate native-board extension

Exact native-board collapsing would require a **separate browser extension** or
changes by Trello itself. No extension is bundled or required here. An extension
would need installation by every user (possibly managed-company deployment),
carefully limited Trello host/content-script permissions, a trusted way to read
relationships, and continuous maintenance as Trello's undocumented DOM changes.
It can hide local DOM rows but must not move/archive/delete real cards. It
introduces security review, browser support, and accessibility risks absent from
the supported modal; do not treat it as an official SDK capability.
