# Worker brief: doctor analytics first honest stage

## Authority

- `AGENTS.md` is canonical. Read the heading map and relevant §1 migrations/privileges, §5, §10a, §10b, §16, §17, §21, §22, §24.
- Owner authority and exact acceptance checklist: `docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md`.
- Implement only first-stage IDs in sections `A–D`, `F`, `G`. Do not close or implement section `E`.
- Источник оракула: `docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md` §§A–D,F,G — «Специалист видит только аналитику по доступным ему пациентам и получает два понятных разреза: записи и фактическую активность назначенных программ».

## Required architecture

- Extend existing doctor analytics, appointment, treatment-program and catalog primitives. Do not restore the old global doctor page from `main` and do not copy its global loaders.
- `/app/doctor/analytics` is tenant/visibility scoped. Move the current platform page to the admin route without duplicating the route tree.
- Prefer the existing `DoctorAppointmentsPort` for records. For activity add one scoped module/port only where the existing service cannot carry the required aggregate; mandatory inputs are organization and visibility actor or allowed patient IDs.
- Thin routes, injected deps, Drizzle only, strict types, no `any`, no raw SQL in new app code.
- Do not add a second UI system, modal, tab implementation or chart primitive.

## Explicit non-scope

- No money/prepayment KPI until owner defines semantics.
- No fabricated adherence percentage from free-form schedule text.
- No claimed watch minutes or exact promo/assigned split from resolve events.
- No platform/player/proxy/transcode/storage errors in doctor UI.
- No app/reminder/top-exercise scope beyond the first-stage checklist.
- No PROD, disposable DB, push, landing, deploy or full CI.

## Required evidence and handoff

- Keep every assigned owner checkbox open until the same commit contains appropriate evidence.
- Behavioral tests must prove cross-organization exclusion, invisible-patient exclusion, specialist/admin scope, period boundaries/timezone and KPI↔drill-down agreement. Do not test source strings.
- If a new DB read root is necessary, update the central privilege declaration/generated artifacts and run documented named-DEV rollback-only/preflight proof; never put GRANT/REVOKE in a migration.
- Run targeted tests, webapp typecheck, scoped lint and architecture/migration checks that match changed files. Do not run full CI.
- Stage explicit paths only, commit before ending, leave the candidate worktree clean, and report exact SHA/check commands/counts and any genuine owner blocker.
