# LabClear web — rules for everyone working in `web/`

LabClear is a Thai health-check chatbot (coursework business simulation). Release 4.0.0 moves the
whole website from FastAPI/Jinja + vanilla JS to **Next.js 16 (App Router) + React 19 + React Three Fiber**.
FastAPI stays as the API (`/api/business/*`). Read `AGENTS.md` in this folder: Next 16 differs from
older versions; the docs for the installed version are in `node_modules/next/dist/docs/`.

## What already exists (do not rewrite)

| Path | What |
|---|---|
| `app/layout.tsx` | Root: fonts, theme boot script, global CSS, `LangProvider`, `SessionProvider` |
| `app/styles/{base,site,workspace,i18n}.css` | The 3.x design system, ported unchanged. **Reuse its class names.** |
| `app/styles/next.css` | 4.0 additions shared by everyone (guest note, press feedback, browser surfaces) |
| `app/(site)/layout.tsx` | Website frame: sim note, `SiteHeader`, `SiteFooter`, `SearchDialog`, `Dock` |
| `lib/i18n/*` | `t("English")` → Thai (default) or English. Server: `const { t, tf, lang } = await getT()`. Client: `const { t, tf, lang } = useT()` |
| `lib/api/client.ts` | Browser API client `api` (session, CSRF, guest token in memory only, `get/post/put/patch/del`, `stream` for NDJSON chat steps, `objectUrl` for report images) |
| `lib/api/server.ts`, `lib/site-data.ts` | Server components: `getCommon()` (catalog, branches, policies, plans, dots, source counts), `getSources()`, `packageGroups()`, `searchPackages()` — live from the API with seed fallback |
| `lib/session.tsx` | `useSession()` → `{ user, notice(text, tone), fail(error), openSignIn(opts) }` (global toast + sign-in dialog) |
| `lib/format.ts` | `money`, `baht`, `longDate`, `when`, `ago`, `bangkokDate` |
| `components/ui/Dialog.tsx` | Native `<dialog>` with `.rs-dialog` styling |
| `components/ui/Markdown.tsx` | Safe Markdown for assistant replies, citation chips |
| `components/site/*` | Header, footer, language switch, theme toggle, account slot |
| `components/workspace/{Workspace,context,ui}.tsx` | `/app` shell, `useWorkspace()` context, `Intro/Empty/Badge/ActionButton/Field/Skeleton` |

The 3.x implementation you are porting is still in the repo root: `templates/site/*.html`,
`templates/workspace.html`, `static/js/*.js` (`workspace.js`, `turns.js`, `dock.js`, `site.js`,
`account.js`, `motion.js`, `organizations.js`, `lab_report.js`, `pay_sim.js`) and `static/css/*.css`.
Port behaviour faithfully (every button there calls a real endpoint), then improve.

## Language: Thai first (CEO requirement)

- Every visible string goes through `t("English source text")` (or `tf("Hello {name}", { name })`).
- Add the Thai translation to **your own** file `lib/i18n/th/<your-feature>.json`, then run
  `npm run i18n:merge`. Never edit `lib/i18n/th.json` or another package's file.
- `lib/i18n/th.json` already has ~560 reviewed translations from 3.x — reuse the same English keys
  where the meaning is the same (grep it first).
- Write natural, plain Thai a customer understands (ภาษาไทยที่อ่านง่าย สุภาพ ไม่แปลตรงตัว). Keep test
  names (HbA1c, LDL), values, units and source titles untranslated.
- `npm run i18n:check` lists any `t()` literal without Thai. Your files must not appear in it.
- Thai line height is taller: never set `white-space:nowrap` on Thai prose; check 320/390 px widths.

## Design rules (the owner likes the current look — refine, do not replace)

- Keep the LabClear identity: purple accent `--color-accent`, Geist + Noto Sans Thai, Noto Serif Thai
  display, the DNA motif, cards and buttons from `site.css` / `workspace.css`.
- Use the CSS variables (`--color-*`, `--space-*`, `--radius-*`, `--ease-out`, `--dur-*`). Put new
  CSS in **your own** file under `app/styles/<feature>.css` and import it from your top-level
  component (`import "@/app/styles/<feature>.css"`). Do not edit other packages' CSS files.
- Craft floor: body text contrast ≥ 4.5:1; hover, focus-visible, disabled, loading, empty and error
  states for everything; real content (no lorem ipsum); keyboard reachable; visible focus.
- No AI-slop tells: no eyebrow/kicker label above headings, no gradient text, no glassmorphism as
  decoration, no grid of identical icon-cards as page structure, no emoji as icons, no "hero metric"
  template, no colored thick border-left callouts. Icons are inline SVG with one stroke width.
- Motion (Emil Kowalski rules): ease-out `cubic-bezier(0.23,1,0.32,1)` for enter/exit, UI motion
  ≤ 300 ms, never animate from `scale(0)` (use 0.95 + opacity), buttons `scale(0.97)` on `:active`,
  prefer CSS transitions (interruptible) over keyframes, no animation on keyboard-repeated actions,
  respect `prefers-reduced-motion`. Content is visible by default; motion only enhances.
- React (Vercel rules): server components by default, `"use client"` only where needed; no
  waterfalls (`Promise.all`); `next/dynamic` with `ssr:false` for heavy client-only code (three.js);
  derive state during render instead of effects; no components defined inside components;
  stable keys; `useTransition` for non-urgent updates.
- Accessibility: landmarks, labelled controls, `aria-live` for streaming status, dialogs via
  `components/ui/Dialog`, menus close on Escape and outside click.

## Privacy rules (CEO requirement 2)

A visitor who is not signed in has a **temporary chat that is deleted when the page is refreshed or
closed**. Never store chat text, report data or the guest token in `localStorage`, `sessionStorage`,
IndexedDB or cookies. Keep it in React state / the `api` module only. Textareas holding chat drafts use
`autoComplete="off"`. Show the guest notice where a guest can chat. `localStorage` is allowed only
for the theme (`rs-theme`).

## Running things

Both servers are already running — do **not** start, stop or restart them, and do **not** run
`next build` (it would break the shared dev server):

- Website (Next dev, hot reload): http://localhost:3000
- API with an offline AI stand-in (`scripts/dev_mock_api.py`): http://127.0.0.1:8000 (proxied at
  http://localhost:3000/api/...). Any chat message gets a Thai sample answer with 2 sources and
  streamed steps; a message containing "จอง", "นัด" or "book" returns a booking preview card;
  `UI_TEST_FAIL_ONCE` fails once (test Retry); `UI_TEST_DOCK` returns a page shortcut; sample report
  reading returns one Glucose row.
- Accounts (type in the sign-in dialog): `test-01` / `1234` (customer, free plan), `test-02` / `1234`
  (customer, LabClear Plus), `admin` / `1234` (manager → `/staff`), `staff@example.invalid` /
  `ui-test-only-password` (manager).

Check your work with:

```bash
cd /home/claude/LabClear/web
npx tsc --noEmit -p .                    # type check (ignore errors in files you do not own)
npm run i18n:check                       # Thai coverage
node /tmp/claude-0/-home-claude/df725ed7-c2df-5e48-b2ad-a8153e2bd578/scratchpad/shot.mjs <url> <out.png> [width] [height] [fullPage 0|1]
```

The screenshot helper prints the page title and console errors; open the PNG with the Read tool.
Look at desktop (1440) and phone (390) widths. Two inspection rounds at most, then stop polishing.

## Ownership (to avoid editing the same files in parallel)

Only edit files inside your package. If you need a change in a shared file (`lib/*`, `components/ui/*`,
`components/site/*`, `components/workspace/{Workspace,context,ui}.tsx`, root layout, backend Python),
do not make it — describe it in your final report and work around it locally.

## Final report

End with: files created/changed, endpoints used, anything you could not finish, shared-file changes
you need, and the screenshots you checked.
