# Email Manager Pro

Outlook Mail Add-in (Office.js) that adds notes, statuses, project linkage and a "responsable"
field to individual emails, plus sync to SharePoint through Power Automate.

## Repo

- GitHub: https://github.com/jarm2092-DEV/email-manager-pro (public, branch `main`)
- Hosted on Vercel: `https://email-manager-pro.vercel.app` (statics in `public/`, functions in `api/`)
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
| `api/_supabase.js` | Token verification helpers. The `_` prefix keeps it off the routing table. |

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
the only real identity: each person has their own account, and `api/sync.js` stamps
`enviado_por` on every SharePoint row from the verified token.

## Environment variables

Set in Vercel → Settings → Environment Variables. See `.env.example`.

| Name | Secret? | Notes |
|---|---|---|
| `FLOW_READ_URL` | **yes** | Power Automate trigger URL with its `?sig=` |
| `FLOW_WRITE_URL` | **yes** | Same, for the write flow |
| `SUPABASE_URL` | no | Project URL |
| `SUPABASE_ANON_KEY` | no | Served to the client by `/api/config` |

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
