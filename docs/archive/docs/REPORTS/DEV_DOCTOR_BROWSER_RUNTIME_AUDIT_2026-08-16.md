# DEV doctor browser runtime audit — 2026-08-16

Scope: owner-visible Safari failures on shared DEV `http://127.0.0.1:5200`, doctor session. This is a blind behavioral audit; no shared server, auth/API, DB, deploy, migration, or production code was changed.

## Blind kill-set

1. The `TodayMiniCalendarWithModal` fallback heading must have byte-identical server and first client render text, including Russian day-name casing and spaces.
2. Calendar label generation must not rely on server/browser locale-formatting differences during render.
3. Every chunk referenced by a current Turbo client graph must be served by the same current DEV generation.
4. A failed chunk after a shared HMR rebuild must be classified by direct current-generation inspection before any code fix: repeatable bad reference vs. stale/rebuild state.

## Evidence and classification

| ID | Result | Evidence |
| --- | --- | --- |
| H1 | FAIL — code defect | `DoctorTodayDashboard.tsx:63-66` calculates `DateTime.now().setZone(...).setLocale('ru').toFormat('EEE, d MMMM')` during client-component render, then passes it to the SSR fallback. Owner console records the exact mismatch `Вс, 16 августа` → `вс, 16 августа`; a second console capture records the same class for `август 2026 г.` → `август 2026 г.`. The committed UI acceptance test reproduces the server/browser locale divergence and is red on this revision. |
| C1 | PASS — no persistent bad chunk reference found | Owner captures name three unrelated async Turbo chunks: schedule FullCalendar (`node_modules__pnpm_1q_f562._.js`), exercise form (`apps_webapp_src_1nwenrd._.js`), and chats (`apps_webapp_src_19ui4nh._.js`). Direct inspection on the sole listener `127.0.0.1:5200` found each URL HTTP 200 with `Cache-Control: no-cache, must-revalidate`; the current document also references the Turbo HMR client chunk. This is inconsistent with one repeatable code/build reference. |
| C2 | PASS — transient shared HMR state, not a production-code finding | Each owner chunk failure is followed by `[HMR] connected`; the hydration capture includes `[Fast Refresh] rebuilding` immediately before it. With the listed chunks currently served, the evidence supports a tab holding an obsolete Turbo graph while the shared server rebuilt, not a persistent missing module. No code change is authorized for this transient state. |

Attachments inspected: `01fd6361-5181-47af-b17f-109f922513af`, `9d753a0e-d355-4711-b539-9d4315193798`, `64e8e085-6d11-4641-9011-90ccd744052b`, and `ea00e269-2ab0-413d-a914-62cde5b52f53` `pasted-text.txt` files under `/home/dev/.codex/attachments/`.

## Validation commands

- Red behavioral evidence (expected until H1 is fixed): `pnpm --dir apps/webapp exec vitest run --project ui src/app/app/doctor/DoctorTodayDashboard.ui.test.tsx` → 1 failed test; the hydrated heading was `вс, 16 августа` after server HTML `Вс, 16 августа`.
- Test-file lint: `pnpm --dir apps/webapp exec eslint src/app/app/doctor/DoctorTodayDashboard.ui.test.tsx` → pass.
- Webapp typecheck: `pnpm --dir apps/webapp typecheck` → pass.
- Current chunk inspection: `for path in '/_next/static/chunks/node_modules__pnpm_1q_f562._.js' '/_next/static/chunks/apps_webapp_src_1nwenrd._.js' '/_next/static/chunks/apps_webapp_src_19ui4nh._.js'; do curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:5200${path}"; done` → 3 HTTP 200 responses. `curl -sSI` reported `Cache-Control: no-cache, must-revalidate` for each.

## Worker handoff

1. Fix H1 only: provide one server-derived, serialized calendar-day snapshot (date ISO, minutes, and heading) to the first client render of `DoctorTodayDashboard` / `TodayMiniCalendarWithModal`; do not calculate the SSR-visible heading with `DateTime.now()` in a client render. Keep both fallback and loaded mini calendar on that same snapshot.
2. Run `pnpm --dir apps/webapp exec vitest run --project ui src/app/app/doctor/DoctorTodayDashboard.ui.test.tsx` until the committed test is green. The test is intentionally red on the audited revision; no auditor product fix was made.
3. After land on the shared DEV generation, validate as the reported doctor: hard reload the `/app/doctor` page, verify no React hydration error, then open schedule, exercises, and communications. If a ChunkLoadError remains after that one deterministic reload with the current chunk URL captured as a non-200 response, treat it as a new reproducible build defect with that URL/status/build evidence. Otherwise, the correct recovery for a stale tab during a shared rebuild is one hard reload after HMR has settled; do not restart the shared server.
