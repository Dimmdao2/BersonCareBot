# Worker brief: patient appointment time in branch timezone with offset warning

You are the implementation worker for one bounded owner-approved stage. Work only in the isolated branch/worktree
created by `tools/orch-launch.sh`; never edit or commit in `feat/doctor-ui-rebuild` directly.

Before any action, follow the top rule in `AGENTS.md`: print its heading map, then read the applicable sections.
Mandatory reading: `AGENTS.md` §1 migration rules (including privileges), §4a, §5, §10a, §10b, §15, §17, §21,
and §24; `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`; `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`
§34; and P3 in `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`.

## Authority: exact owner checklist

- `PATIENT-OVERVIEW-08`: “На всех пациентских поверхностях время записи показано по IANA-таймзоне филиала, а не
  по таймзоне браузера; смещение вычисляется для даты записи с учётом сезонных переходов.”
- `PATIENT-OVERVIEW-09`: “Если UTC-смещение филиала на момент записи отличается от смещения устройства пациента,
  рядом со временем показаны компактный красный `!` и красная подпись `UTC±N`.”
- `PATIENT-OVERVIEW-10`: “Если UTC-смещения филиала и устройства пациента совпадают, показано только время:
  подписи UTC и предупреждения нет.”

Latest owner correction is stricter than any earlier prose:

- This warning is patient-only. Do not add it anywhere in doctor/admin UI.
- Doctor UI always shows the branch-local appointment time and never compares it with the device timezone.
- On patient surfaces, `UTC±N` and `!` are red and appear only when the offsets actually differ at the instant of
  the appointment. When offsets match, there must be no UTC label and no warning.

## Required behavior and data path

1. Inventory every patient-facing place that renders an appointment/booking/slot date or time. Start with
   `code-search`, then use exact `rg`. The inventory must at least cover authenticated `/app/patient/**` booking
   history/upcoming/cabinet, slot selection, confirmation and success screens. Also inspect patient-facing public
   `/book/**`; change it only where it renders the same branch-owned appointment time and can use the canonical
   branch timezone without trusting query-string display data. Do not touch treatment dates, reminder moments,
   message timestamps, or any unrelated date.
2. A physical or online branch-owned appointment is formatted using that branch's canonical
   `public.be_branches.timezone` IANA value. Never substitute browser timezone, global `app_display_timezone`, city,
   branch title, or hardcoded `Europe/Moscow` when a canonical branch is known.
3. Extend an existing canonical data pass; do not add a second fetch, repository, API route or parallel formatter.
   Existing consolidation candidates are:
   - `app.read_current_patient_booking_rows(text,timestamptz)` and its
     `canonical_in_person_context` JSON;
   - `app.read_current_patient_booking_catalog()` / `PatientBookingCatalogRow` for the selected booking branch;
   - existing booking RSC context and `formatBusinessDateTime` helpers.
   Prefer adding the branch IANA timezone to those existing typed read models. Do not trust a URL parameter as the
   authority for timezone on confirm/done; resolve it from the already validated canonical branch/booking path.
4. Create one reusable patient-zone presentation primitive/model for appointment date/time plus optional warning,
   or parameterize an existing patient primitive if one already exists. It must preserve each caller's current
   surrounding layout and text. Do not create slightly different warning logic in each page.
5. The comparison is offset-at-instant, not just IANA-name comparison. It must be DST/date-specific for both the
   branch zone and the patient's current device zone. Examples that must work:
   - different IANA names but equal offsets at the appointment instant: no warning;
   - same appointment rendered for a device whose offset differs: red `! UTC±N`;
   - branch offset changes seasonally: displayed `UTC±N` reflects the appointment date, including half-hour or
     quarter-hour offsets if present (do not truncate to whole hours).
6. The UTC label describes the branch offset, using compact `UTC+3`, `UTC−4`, `UTC+5:30` formatting. Use a real
   minus glyph only if the current product typography already does; consistency matters more than inventing copy.
7. Client hydration must not flash a false warning or produce a hydration mismatch. Device offset is browser-only;
   server output may omit the warning until the client has a reliable device offset, but branch-local time itself
   must be correct immediately.
8. If a retained legacy row truly has no canonical branch, preserve the current documented fallback and do not
   falsely label it as branch time. Do not infer branch timezone from legacy snapshots. This exception must not let
   canonical rows fall back to global/browser time.

## Database and privileges contract

- No disposable database and no historical migration replay. Use only named DEV for DB verification.
- Do not edit the generated schema snapshot manually. Add a UTC timestamp-named forward migration under
  `apps/webapp/db/drizzle-migrations/` when an existing function body/return shape must change.
- Every migration statement needs the exact `BCB-MIGRATION-OWNER`/breakpoint contract from §1. No `GRANT`, `REVOKE`,
  policy or role statement in a migration.
- If the function begins reading `be_branches.timezone`, update the canonical privilege declaration's
  `relationSurfaces` column evidence. Regenerate canonical privilege artifacts only through the repository's
  existing generator; do not hand-edit generated privilege SQL.
- Before declaring the candidate ready, run owner-aware rollback-only candidate preflight against named DEV using
  the existing candidate-safe entrypoint. Do not apply the candidate migration to shared DEV and do not land it.
- Explicitly report whether the existing function owner has `SELECT` on the required branch timezone column after
  declaration reconcile; an unproven grant is not acceptance.

## Behavioral acceptance tests

Write or extend behavior-level tests (not source-string tests) so these independent regressions are caught:

1. The same UTC appointment renders the branch-local date/time, not browser/global-app time.
2. Equal branch/device offsets suppress both `!` and `UTC` even if IANA zone names differ.
3. Different offsets render one compact red warning with the branch's date-specific offset.
4. Seasonal and fractional-offset cases format correctly.
5. Canonical booking rows/catalog mapping carry the exact branch timezone through existing typed ports.
6. At least one upcoming/history surface and booking select/confirm flow use the shared behavior; inventory proves
   no remaining patient appointment rendering still uses `appDisplayTimeZone` or browser local time when branch
   timezone is available.
7. Doctor UI receives no new warning/UTC copy and no patient primitive import.
8. Invalid/absent IANA data fails through the existing fallback without crashing or displaying a fake UTC offset.

Use fake system time and explicit timezones where relevant. Do not assert source text, CSS class strings, imports,
line positions or SQL text. Visual styling will be accepted by the owner on TEST; do not run screenshot polish.

## Scope and prohibitions

Allowed scope is limited to the minimum needed within:

- `apps/webapp/src/app/app/patient/**` booking/appointment renderers and their existing tests;
- patient-facing `apps/webapp/src/app/book/**` only if the inventory proves it renders the same canonical branch
  appointment time;
- `apps/webapp/src/shared/ui/patient/**` for one reusable patient appointment-time primitive;
- `apps/webapp/src/shared/lib/**` for parameterizing one existing datetime helper plus behavior tests;
- `apps/webapp/src/modules/patient-booking/**` typed models/services;
- `apps/webapp/src/infra/repos/pgPatientBookings*` and `pgPatientBookingCatalog*`;
- `apps/webapp/db/drizzle-migrations/<one timestamp migration>.sql`;
- `deploy/postgres/privileges/declaration.ts` and generator-produced privilege artifacts if required;
- the exact P3 checklist lines only after all acceptance evidence is green.

Forbidden: doctor/admin UI changes; encounter/visit page internals; P4 clinical list work; unrelated date/time
formatting; new API/repository/function when an existing pass can be extended; full CI; shared dev server; TEST or
PROD; push; landing; broad refactors or visual redesign.

## Required finish

- Run targeted Vitest for changed behavior, webapp typecheck, scoped ESLint, migration lint/preflight required by
  repo rules, and `git diff --check`. Do not run full CI.
- Long commands must stay in the foreground and finish during this one agent turn. Do not end while waiting for a
  background process.
- Stage only explicit task paths (never `git add -A`) and commit before the turn ends. Do not push or land.
- Final report: commit SHA; exact changed paths; full patient-surface inventory; exact commands/results; migration
  privilege analysis; which checklist IDs are actually satisfied; any named blocker.
