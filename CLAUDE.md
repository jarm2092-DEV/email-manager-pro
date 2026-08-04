# Email Manager Pro

Outlook Mail Add-in (Office.js) that adds notes, statuses, project linkage and a "responsable"
field to individual emails, plus sync to SharePoint through Power Automate.

## Repo

- GitHub: https://github.com/jarm2092-DEV/email-manager-pro (public, branch `main`)
- Hosted on Vercel: `https://email-manager-pro-seven.vercel.app` (statics in `public/`, functions in `api/`)
- No build step and no dependencies. Plain HTML + inline CSS/JS, plus four Node serverless
  functions. Pushing to `main` deploys.

## Files

| File | Role |
|---|---|
| `public/taskpane.html` | The whole client — UI, CSS and JS in one file. |
| `public/manifest.xml` | Office Add-in manifest (MailApp, `ReadWriteItem`). Points at the Vercel URLs. v1.3.0.0. |
| `public/sp-test.html` | Harness for the `/api/*` endpoints, including a 401 check. |
| `public/blank.html` | Empty page used as an auth/redirect stub. |
| `public/icon-64.png` | Ribbon/store icon. |
| `public/EmailManagerPro_ManualVisual.html` | Visual end-user manual (Spanish). |
| `api/config.js` | Serves `SUPABASE_URL` + anon key so the client can log in. |
| `api/projects.js` | Reads the project list from SharePoint via `FLOW_READ_URL`. Auth required. |
| `api/sync.js` | Writes a tracking row via `FLOW_WRITE_URL`. Auth required. |
| `api/me.js` | Returns the caller's `display_name` and role from CCP's `user_roles`. |
| `api/_supabase.js` | Token verification and profile lookup. The `_` prefix keeps it off the routing table. |

## Architecture

Three storage layers, deliberately separate:

- **Per-email data** → Office `customProperties`, single key `EMP_Data` holding
  `{status, project, responsable, notes[]}`. Read via `getEmailData()`, written via
  `setEmailData()`. Travels with the mail item, so it is shared across the team.
- **Per-user config** → `localStorage` under the `emp_` prefix (`author`, `statuses`,
  `projects`, `session`).
- **SharePoint** → reached only through `/api/projects` and `/api/sync`.

Security model — the reason the API layer exists:

- The taskpane is served publicly (Outlook has to fetch it), so **anything the client holds is
  public**. The Power Automate URLs carry a SAS `sig` that is equivalent to a password, so they
  live in Vercel env vars and are never sent to the browser.
- Every `/api` call carries a Supabase access token. `requireUser()` validates it against
  `/auth/v1/user` before any flow is touched; no token means 401 and the flow is never called.
- `api/sync.js` whitelists and length-caps every field before forwarding — the flow writes
  straight into a SharePoint list.
- The Supabase anon key in `/api/config` is public by design; it only permits what Supabase auth
  and RLS permit.

Other core pieces:

- `syncCategories()` mirrors state into Outlook master categories: `EMP Notas` when the email has
  notes, plus a category named after the project ID (e.g. `CCP-0031`).
- `createCalendarEvent()` has a four-step fallback chain: `displayNewAppointmentForm` →
  `Office.context.ui.openBrowserWindow` → `window.top.location` → `window.open`.
- `autoSyncSP()` fires silently after status/note changes; it no-ops when signed out.
- Project names are stored as short IDs (`CCP-0031`); `getFullProjectName()` re-expands them
  against the merged local + SharePoint list.
- Note author: the manually configured name wins, otherwise the local part of the signed-in
  Supabase email.

## Identity

Outlook runs on a single shared tenant account, so Outlook cannot tell users apart. Supabase is
the only real identity — and it is **the same Supabase project as CCP**
(`PERMIT-MANAGER-SUITE`), with the same accounts and the same `user_roles` table
(`user_id, email, role, display_name, last_seen`; roles `Admin`, `Manager`, `Dibujante`).

- `api/me.js` reads that row for the caller and returns `{email, displayName, role}`.
  The lookup runs as the caller, so RLS decides; a miss falls back to the email local part
  rather than failing the request.
- `api/sync.js` stamps `enviado_por` (display name), `enviado_por_email` and `rol` on every
  SharePoint row, all from the verified token.
- The taskpane signs notes with `display_name`, so a note reads the same here as in CCP.

Consequence of the shared project: **any CCP user can call these endpoints**, not just the
people who use the add-in. If that ever needs narrowing, gate on `profile.role` in
`_supabase.js` — the value is already fetched.

Never add an `UPDATE` policy on `user_roles` that lets a user write their own row: RLS is
per-row, not per-column, so it would let anyone set `role='Admin'` with the anon key. CCP uses a
`security definer` function for the `last_seen` heartbeat instead.

## Flows

This add-in uses **its own Power Automate flows only** — the two it always had (`FLOW_READ_URL`
for the project list, `FLOW_WRITE_URL` for the tracking rows), plus new dedicated ones if a need
appears. It never calls CCP's flows.

That isolation is deliberate and worth keeping: CCP's save flows (`FLOW_SAVE`, `FLOW13`) do a
full item update, so any mapped column that is not resent is blanked. Writing through them from
here would silently wipe project data. A new requirement gets a new dedicated flow, never an
extra field bolted onto a shared save flow.

## Environment variables

Set in Vercel → Settings → Environment Variables. See `.env.example`.

| Name | Secret? | Notes |
|---|---|---|
| `FLOW_READ_URL` | **yes** | Power Automate trigger URL with its `?sig=` |
| `FLOW_WRITE_URL` | **yes** | Same, for the write flow |
| `SUPABASE_URL` | no | Project URL |
| `SUPABASE_ANON_KEY` | no | Served to the client by `/api/config` |

## Open security risk — old flows still reachable

The two original Power Automate flows had their trigger URLs, signature included, committed to
this public repo. Those signatures are still valid:

| Old flow (trigger GUID) | Exposure | Status |
|---|---|---|
| `6bd81083debf4e7a8100cd389d9cb8e1` | Read: anyone can list the SharePoint projects | **open** — flow never located in the portal |
| `9307f259fdeb4e529b3fd0641f55c8d2` | Write: anyone could create rows in the tracking list | closed 2026-08-03 — flow turned off |

The write path is closed. What remains is read-only exposure of the project list (codes and
addresses) to anyone who digs the URL out of this repo's history.

Rotating the client-side code does not help here: the exposure is the flow endpoint itself, and
it stays open until each flow is turned off or deleted. Power Automate cannot search flows by
trigger GUID, only by name, which is why the read one has not been found yet.

Two ways to locate a flow when only the trigger GUID is known:
1. Admin center → Environments → Resources → Flows, narrowed by created date
   (both were created between 2026-03-12 and 2026-04-08).
2. POST `{}` to the leaked URL, then look for the flow whose 28-day run history shows a run
   from seconds ago.

Replacement flows in use since 2026-08-03: `cad3ffdc…` for reads, `850a70cb…` for writes. Both
are reached only through the Vercel functions.

## Known issues / backlog

1. `removeProject()` / `addProject()` operate on `getProjects()`, which is the merged
   local+SharePoint list, then write the result back to localStorage — SharePoint projects leak
   into local storage and index-based removal can delete the wrong entry.
2. Note indices come from array position, so deleting/editing while another user has the same
   email open can hit the wrong note.
3. No rate limiting on the API functions. Any valid Supabase user can call them freely.
4. No automated tests in the repo, no CI.

## Working on it

- Local dev: `npx vercel dev` runs statics and functions together on one port. Needs the env
  vars in a local `.env` (gitignored).
- Client-only check: open `public/taskpane.html` in a browser. After 3 s without Office.js it
  falls back to "Vista previa" mode and renders with empty data.
- Real testing needs Outlook sideloading with `public/manifest.xml`, which points at the live
  Vercel URLs, not localhost.
- After deploying, open `/sp-test.html` and run test 3 — it must return 401. If it returns 200,
  the endpoints are unprotected.
- Language: UI, comments and the manual are in Spanish. Keep it that way.

## graphify

A knowledge graph of this repo lives in `graphify-out/` (gitignored). Check
`graphify-out/GRAPH_REPORT.md` or query `graphify-out/graph.json` before answering architecture
questions, and rebuild with `/graphify . --update` after meaningful changes.
