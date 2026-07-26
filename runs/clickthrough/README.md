# Click-through testing against TEST

Real-browser (Playwright/Chromium) click-through tests that go past the GET-only page walk
(`runs/g4_app_walk/`). That walk proved 570 pages return non-error HTTP status; this suite proves
(or disproves) that the *effects* of writes are real — reminder marked done, LFK diary journal
opened by a patient who owns real data, a clinic name saved and rendered in a different session,
a booking actually created, an admin setting actually persisted.

## Why Playwright, and why not added to package.json

Playwright is not a repo dependency (`package.json` has no `playwright`/`@playwright/test`), and
this suite deliberately doesn't add it there — it's a one-off testing tool for this box, not
something the app's build/install graph should carry. Instead:

- The Playwright **library** is resolved at runtime from the box's global npm install
  (`npm ls -g` already has `playwright@1.61.0`) via `lib/browser.mjs`, which does
  `createRequire(<npm root -g>)`. No install step, no lockfile change.
- Chromium **browser binaries** come from the existing cache at `/home/dev/.cache/ms-playwright/`
  (already had 4 chromium builds before this task started) — Playwright finds them automatically
  via its default cache path resolution; nothing was downloaded.

If a future session wants this as a proper repo dependency (e.g. to run in CI), add
`playwright` as a `devDependency` in `apps/webapp` or the repo root and swap `lib/browser.mjs`'s
`resolvePlaywright()` for a plain `import { chromium } from "playwright"`.

## Layout

- `lib/fixtureAuth.mjs` — reads `/run/bersoncarebot/saas-smoke.fixture` via `sudo -n cat` (same
  fixture the G4 walk read, unmodified) and injects the right session cookie into a fresh
  Playwright `BrowserContext` per profile (`patient`, `doctor`, `clinic_admin`, `global_admin`).
  Never logs a cookie value — only ok/fail status lines, matching the convention in
  `docs/_TODO/SAAS_FOUNDATION/scripts/regenerate-saas-smoke-fixture.mjs`.
- `lib/browser.mjs` — resolves Playwright (see above) and the TEST base URL
  (`CLICKTHROUGH_BASE_URL` env override, defaults to `http://127.0.0.1:6300`).
- `flows/*.mjs` — one file per flow, each exporting a `run<Name>Flow({ browser, baseUrl,
  screenshotDir, log })` that returns `{ flow, steps: [{name, ok, detail}], verdict }`.
- `run-all.mjs` — runs every flow in one Chromium instance, sequentially (this box's dev-server
  capacity notes say keep heavy browser work modest), writes `out/results-<ts>.json` and
  `out/REPORT.md`.
- `run-one.mjs` — debug entrypoint for a single flow (`node run-one.mjs <flowName>`), prints the
  result as JSON to stdout without writing report files.
- `smoke-auth-check.mjs` — quick check that all four fixture profiles actually authenticate
  (no login redirect) before running the real flows.
- `seed-lfk-complex-for-owner-patient.mjs` — idempotent, TEST-only, owner-patient-only seed that
  assigns one real LFK complex (with exercises that have media) to the owner's own patient
  account by replaying the exact INSERTs
  `apps/webapp/src/infra/repos/pgLfkAssignments.ts:assignPublishedTemplateToPatient` performs.
  Required to reproduce taskdb #1032 for real (see `flows/lfkDiary.mjs`'s header comment for why).
- `screenshots/` — one PNG per meaningful step, referenced by flow name.
- `out/` — JSON + Markdown results from the latest `run-all.mjs`.

## Running it

```
node runs/clickthrough/smoke-auth-check.mjs   # sanity: all 4 profiles authenticate
node runs/clickthrough/seed-lfk-complex-for-owner-patient.mjs   # idempotent, safe to re-run
node runs/clickthrough/run-all.mjs            # full suite, writes out/REPORT.md
node runs/clickthrough/run-one.mjs lfkDiary   # single flow, stdout only
```

Requires: TEST running at `http://127.0.0.1:6300` (or `CLICKTHROUGH_BASE_URL`), passwordless
`sudo -n cat`/`sudo -n psql` access to the fixture and to `bersoncarebot_test` (same access this
session used throughout — read-only except for the one seed script, which is TEST + owner-account
hardcoded and idempotent).

## Known limitations (what this still can't see)

- **No CI wiring.** This is a manual/on-demand suite, not gated in any pipeline.
- **Flow 3 (booking) is blocked**, not completed — see taskdb #1046. Slot-selection and the
  "refused slot" assertion were never reached because the patient booking page itself 500s
  (masked as HTTP 200 by Next.js's error boundary) for every patient right now. Re-run
  `run-one.mjs booking` once that's fixed to get past step 1.
- **Reminder done/snooze/skip is driven by an in-page `fetch`, not a DOM click** — there is
  currently no button anywhere in the webapp that calls
  `/api/patient/reminders/[id]/{done,snooze,skip}` (verified by grep). The flow still exercises a
  real authenticated same-origin request from inside a live browser tab and re-reads the journal
  page to confirm the effect, which is strictly more than the GET-only walk could do, but it is
  not literally "clicking a button" because no such button exists yet.
- **Only one send-safety check was performed** (env vars on the integrator confirmed non-empty,
  matching `docs/ARCHITECTURE/SERVER CONVENTIONS.md`'s documented passthrough-allowlist) — no flow
  in this suite deliberately triggers an email/SMS/push send, so the redirect path itself was not
  exercised end-to-end by this session.
- **Single-tenant blind spot**: every flow runs as the owner's three accounts inside ONE
  organization (Точка Здоровья). Cross-tenant isolation is out of scope here (covered elsewhere —
  see MEMORY.md's B4-core-* entries).
- **No mobile/responsive pass** — all flows run at a fixed 1280×900 desktop viewport (the doctor
  sidebar brand mark is desktop-only markup — see `flows/branding.mjs`).
- **No accessibility/perf assertions** — this suite only checks functional effects.
