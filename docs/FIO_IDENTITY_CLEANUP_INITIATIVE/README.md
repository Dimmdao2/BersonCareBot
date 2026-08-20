# FIO / Identity Cleanup Initiative

Status: execution. Core phases 0-8 and owner-reviewed TEST apply are complete; production closeout, legacy audit,
and parser retirement remain open.

Owner requirements authority:
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §19.

Detailed execution plan: `.cursor/plans/fio_identity_cleanup.plan.md`.

## Goal

Replace ambiguous patient naming with structured identity fields:

- `last_name` — surname, doctor-facing required for booking;
- `first_name` — given name, patient-facing greeting name;
- `patronymic` — optional middle/patronymic name;
- `display_name` — legacy/derived compatibility field, not the source of truth.

Doctor surfaces should display full FIO when available. Patient greetings address the patient by
`first_name` only. The patient's own `/app/patient/profile` identity field is the explicit exception:
it displays and edits canonical structured ФИО (`last_name`, `first_name`, optional `patronymic`).

## Execution Principle

This initiative is executed phase-by-phase with explicit gates. The work is not
delegated to blind batch agents: each phase starts from code inspection, keeps a
narrow scope, and uses targeted validation. Full `pnpm run ci` is reserved for
explicit push/pre-push requests or repo-wide risk.

## Source Priority

Canonical patient name resolution, from strongest to weakest:

1. reviewed manual doctor/admin edit;
2. booking/Rubitime full name attached to actual appointments;
3. native booking form structured fields;
4. current structured `platform_users` fields;
5. OAuth / Telegram / MAX profile hints;
6. legacy `display_name`.

Messenger/OAuth names must not overwrite a stronger booking/manual FIO.

## Backfill Dataset

Local dictionary source for the one-off parser:

- Zenodo record: https://zenodo.org/records/2747011
- DOI: `10.5281/zenodo.2747011`
- Author: Ivan Begtin / Infoculture
- File: `russiannames_db_jsonl.zip`

Downloaded data lives in `.tmp/fio-backfill/russiannames/` and is not committed.
Runbook: `apps/webapp/scripts/fio-backfill/README.md`.

## Scope Boundaries

Allowed:

- `apps/webapp/scripts/fio-backfill/**`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/**`
- `.cursor/plans/fio_identity_cleanup.plan.md`
- later phase-specific code under identity, booking, merge, doctor-client,
  patient-display, and booking-notification modules listed in the master plan.

Out of scope unless explicitly added later:

- production DB writes before the explicit Phase 9 owner gate;
- removing `display_name` from schema;
- committing downloaded or derived large dictionary files;
- multi-tenant identity policy;
- unrelated patient profile redesign;
- real external sends from dev/test outside documented delivery redirect.

## Phases

### Phase 0 — Prepared Infrastructure

Status: completed.

Artifacts:

- `apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs`
- `apps/webapp/scripts/fio-backfill/README.md`
- `.tmp/fio-backfill/russiannames/jsonl/{names,midnames,surnames}.jsonl`

Gate:

- Dataset is local-only and ignored by git.
- No DB writes and no product behavior changes.

### Phase 1 — Inventory And Data Quality Report

Status: completed.

Goal: establish the real state before touching behavior.

Actions:

- Map all runtime readers/writers of:
  `display_name`, `first_name`, `last_name`, `patronymic`, `email`,
  `email_verified_at`, `contact_name`, `payload.name`.
- Inspect platform users, booking, Rubitime projection, OAuth, Telegram/MAX,
  merge, doctor-client, and patient-display paths.
- Add read-only tooling:
  `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`.
- Emit reports under `.tmp/fio-backfill/reports/`:
  `name-field-inventory.md`, `fio-quality-report.json`,
  `fio-quality-report.csv`.

Report metrics:

- active client count;
- missing structured names;
- one-token/two-token/three-plus-token legacy names;
- Cyrillic vs Latin/mixed names;
- Rubitime full-name candidates;
- booking/profile conflicts;
- phone/email prefill gaps;
- verified email candidates for booking-created email.

Validation:

- Syntax/type checks needed for the script.
- Targeted tests only if script imports app code.
- No full CI.

Gate:

- Exact current writers and risky overwrite paths are known.
- No DB writes.

Latest dev DB aggregate, generated 2026-07-02:

- active client rows: 213
- missing all structured names: 89
- first + last only: 124
- first + last + patronymic: 0
- legacy display one token: 29
- legacy display two tokens: 120
- legacy display three+ tokens: 64
- legacy display Latin/mixed: 34
- users with booking/profile name conflicts: 78
- verified-email users: 24
- booking rows missing email while profile email is verified: 55

Artifacts:

- `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`
- `.tmp/fio-backfill/reports/name-field-inventory.latest.md`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.json`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.csv`

### Phase 2 — Shared FIO Model, Parser, And Scoring

Status: completed.

Goal: create one typed place for name decisions before changing consumers.

Actions:

- Define strict types:
  `StructuredFio`, `FioSource`, `FioConfidence`, `FioCandidate`,
  `FioDecision`.
- Implement normalization, casing, doctor full-FIO label, patient greeting
  label, candidate parsing, source scoring, and conflict reason codes.
- Use Zenodo dictionaries only in script/backfill tooling. Runtime helpers must
  not depend on `.tmp`.

Validation:

- Focused unit tests for Russian FIO, ambiguous order, two-token names,
  one-token provider names, Latin names, hyphenated names, patronymics, and
  conflicts.
- Targeted tests through `/home/dev/orch/run-tests.sh`.

Gate:

- Parser explains confidence and conflicts instead of silently guessing.

Artifacts:

- `apps/webapp/src/shared/lib/fio.ts`
- `apps/webapp/src/shared/lib/fio.test.ts`

Validation:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/fio.test.ts --project=fast"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/lib/fio.ts src/shared/lib/fio.test.ts"`

### Phase 3 — Backfill Dry Run

Status: completed.

Goal: generate a reviewable migration proposal before any DB writes.

Actions:

- Add `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`.
- Dry-run only. `--commit` is not added in this phase.
- Collect candidates from Rubitime, native booking snapshots, existing
  structured fields, legacy `display_name`, and weak provider hints.
- Produce chosen FIO, rejected candidates, confidence, source, and conflict
  flags.
- Keep PII in `.tmp` reports, not chat.

Validation:

- Synthetic unit tests for collector/scorer.
- Dry-run on dev DB only after explicit env load from `apps/webapp/.env.dev`.
- Confirm reports are untracked.

Gate:

- High/medium/low/conflict counts are reviewable before any write path exists.

Latest dev DB aggregate, generated 2026-07-02:

- total users: 213
- users with candidates: 213
- no change: 43
- fill missing: 9
- replace weak partials: 24
- review conflict: 65
- insufficient: 72
- selected high confidence: 139
- selected medium confidence: 2
- selected low confidence: 70
- selected source Rubitime: 141
- selected source display_name: 67
- selected source profile_structured: 3
- selected none: 2

Artifacts:

- `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`
- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.json`
- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.csv`

### Phase 4 — Booking Form Contract

Status: completed.

Goal: stop creating new messy names.

Actions:

- Replace single booking contact name input with:
  surname required, given name required, patronymic optional.
- Prefill structured names, phone, and email from the current profile.
- Derive legacy `contactName` for existing service/integrator contracts.
- Store structured name snapshot in booking metadata/submissions.

Validation:

- Patient booking create/reschedule tests.
- Confirm form tests for required surname/given name.
- UI smoke if material UI changed.

Gate:

- New bookings contain structured FIO and still produce existing lifecycle
  payloads.

Implemented:

- patient confirm step collects surname, given name, and optional patronymic;
- surname and given name are required;
- phone and email are prefilled from the current profile/session;
- legacy `contactName` is derived as `Фамилия Имя Отчество`;
- API accepts optional `contactFio`;
- canonical profile prefill and booking event/attribution carry structured FIO
  when provided.

### Phase 5 — Merge, Projection, And Provider Priority

Status: completed.

Goal: prevent Telegram/MAX/OAuth from degrading canonical patient names.

Actions:

- Make appointment/Rubitime FIO a strong source in ensure/projection paths.
- Provider names fill only empty or low-confidence fields.
- Update platform merge logic and preview.
- Preserve supplementary phone/email contact behavior.

Validation:

- Focused tests for Rubitime vs Telegram, OAuth Latin vs Cyrillic FIO, empty
  fields filled by provider, conflict surfacing, and email contact preservation.

Gate:

- No path can replace strong structured FIO with weaker provider display data.

Implemented:

- projection updates preserve non-empty `display_name` when incoming data is only
  weak display-only input;
- structured projection with first+last can still update derived display name;
- merge SQL preserves `patronymic`;
- auto-merge helper and preview include patronymic effective values/conflicts.

### Phase 6 — Structured FIO At Identity Creation

Status: completed on `feat/doctor-ui-rebuild` at `50eba2619`.

Goal: stop creating new ambiguous identities before migration cleanup.

Actions:

- The separate registration flow for a **new patient** collects required surname/given name and optional patronymic;
  «Войти по коду» is login for an existing account and does not ask FIO before every OTP login (owner ruling
  2026-07-19, `OWNER_REVIEW_2026-07-18.md` addendum).
- Specialist/clinic registration collects structured specialist FIO and keeps organization name separate.
- Owned registration flows derive `display_name` for compatibility rather than accepting it as identity truth.
- Update UI, API schemas, domain types, ports, repositories, and focused tests using the existing columns.

Validation:

- Patient and specialist registration API/UI tests.
- Provisioning tests for specialist and organization separation.
- Required surname/given name, optional patronymic, and derived `display_name`.

Gate:

- Every owned **new-identity registration** path writes structured FIO; existing-account OTP login does not become an
  identity-creation writer.

Evidence:

- Specialist/clinic structured registration foundation: `a9d70dc85`.
- Separate structured patient email registration and lookup-only existing-account OTP login: `4d53e003e`.
- Independent audit `bcb-c2f-855-patient-registration-audit-20260719`: PASS.
- Post-rebase focused registration suite: 6 files / 60 tests; combined milestone CI and audit: PASS at `50eba2619`.

### Phase 7 — Remaining Writers And Provider Priority

Status: implementation completed on `feat/doctor-ui-rebuild` at `c8492fec5`; task `#856` completion/closeout is
recorded at `2718fe68b`.

- Audit manual edit, booking, provisioning, OAuth, Telegram, and MAX writers.
- Provider names remain weak hints: fill empty fields only and never replace manual/booking/Rubitime FIO.
- Keep unresolved provider conflicts visible for manual resolution.
- Preserve `display_name` as a derived compatibility field/fallback.

Gate: regression tests prove every weak provider path preserves strong structured FIO.

Evidence:

- Telegram/MAX structured hints fill empty strong fields and do not replace existing manual/booking/Rubitime FIO.
- Manual doctor/admin edits normalize structured parts and derive the compatibility label.
- Focused integrator/webapp tests, scoped lint, integrator/webapp typecheck, and diff-check passed.
- Independent audit `bcb-c2f-856-audit-20260719`: PASS, safe to integrate, no P0/P1.
- Deferred P2 audit debt: messenger projection and pre-bind merge can still make the compatibility `display_name`
  disagree with preserved structured FIO; patient shell legacy fallback is not yet consolidated on the same helper.
- Owner question deferred to the Phase 10 legacy audit: when a provider name disagrees with strong FIO on the same
  row, is strong-wins plus manual edit sufficient, or is a new visible conflict indicator required?

### Phase 8 — Display Cleanup

Status: implementation completed on `feat/doctor-ui-rebuild` at `c8492fec5`; task `#856` completion/closeout is
recorded at `2718fe68b`.

Goal: make the app consistently use structured names.

Actions:

- Doctor surfaces use full FIO helper:
  client list, patient card, appointments, communications, search, and broadcasts/audience previews.
- Patient surfaces use first-name helper:
  shell greeting, profile hero, booking prefill.
- Booking prefill reads structured fields directly when available.
- Keep `display_name` fallback while legacy rows exist.
- Do not remove `display_name` schema.

Validation:

- Targeted doctor clients/card tests.
- Targeted patient profile/shell tests.
- UI smoke for changed views.

Gate:

- Doctor sees full FIO where available; patient sees given name.

Evidence:

- Doctor client list/card, appointments, schedule search, communications, search and broadcast previews use the
  shared full-FIO formatter with legacy fallback.
- Patient profile and booking prefill prefer structured fields; booking prefill does not parse `display_name` when
  structured parts exist.
- The same focused validation and independent audit recorded for Phase 7 cover this combined Phase 7-8 stage.

### Phase 9 — Production Backfill Closeout

Status: the exact owner-reviewed TEST apply was successfully re-established on 2026-07-19 after the fresh-dump
rehearsal; production was not executed. Owner sequencing forbids a standalone FIO backfill into the materially
outdated production runtime. Task `#857` runs only as one ordered step of the final full production cutover after
commercial, SaaS/tenant and legal/readiness launch gates.

Owner-reviewed TEST result (aggregate only):

- 165 rows updated;
- 3 rows already matched;
- 1 missing row skipped;
- 1 row changed after XLSX review and was not overwritten.

The reviewed XLSX/CSV and TEST before/after audit are local PII artifacts. They must not be committed or copied into
plans row-by-row. Their decisions are authoritative and must not be recomputed by a parser.

Current TEST mechanism: `apps/webapp/scripts/fio-backfill/apply-owner-reviewed-fio-test.ts`. The full clean-dump
wrapper requires its protected hash-bound manifest and runs it after identity/Rubitime history normalization but
before fixtures and service restart. Exact expected-missing and preserve-current exceptions represent the two owner-
reviewed edge cases; global skip policies are forbidden. This TEST-only command does not authorize or implement a
production mutation.

Actions:

- Complete the compatible new code/schema and rehearse the entire cutover chain repeatedly on TEST from a fresh
  copy before any production preview/apply. The existing old production application is not a backfill target.
- Preserve and re-prove the exact expected-missing and preserve-current TEST exceptions without replacing or
  recalculating the owner's decisions.
- Prepare a preview from an up-to-date production copy.
- Require explicit owner approval of the exact preview artifact before production apply.
- Use a versioned/hash-bound manifest with unique IDs, explicit approval and expected-before snapshots; validate the
  exact `current_database()` target because localhost may be production.
- Verify the canonical host-backup gate, then use a transaction, conditional row-drift protection, durable `0600`
  rollback artifact prepared before commit, conditional rollback, and PII-free console output.
- Reconcile after apply and perform selective doctor/patient UI checks.
- Keep all XLSX/CSV/JSON decisions, previews, backups, and audits in ignored local storage.

Validation:

- Preview/apply/rollback tests against an isolated database.
- Malformed/duplicate manifest rejection; exact target/mode guards; unlisted stale-row abort and exact reviewed
  exception proof; rollback-conflict proof;
  aggregate reconciliation and UI spot-check.

Gate:

- Production mutation is impossible without an approved full production change window and separate approval of the
  exact current FIO preview/manifest inside that cutover.

### Phase 10 — Legacy Fallback Audit

Status: blocked under `#858` until the final production cutover FIO step and production reconciliation pass.

- Audit active users for incomplete structured fields.
- Search all consumers that parse `display_name` and classify each fallback.
- Confirm registration, booking, manual edit, provider priority, and production backfill gates.

Gate: no active identity or consumer requires parsing `display_name` to recover FIO.

### Phase 11 — Runtime Parser Retirement

Status: blocked under `#858` until production reconciliation and the Phase 10 audit both pass.

- Retire the dictionary-backed one-off parser after migration closeout; it is not a runtime dependency.
- Remove the runtime `display_name -> FIO` fallback only after Phase 10 passes.
- Search every call site and add regression tests for doctor labels, patient greetings, and booking prefill.

### Separate Notification Track

The former booking-lifecycle-template phase belongs to the notification roadmap. Templates continue to use
DB-backed `system_settings`, but notification work does not block structured identity completion.

## Final Acceptance

- Historical acceptance of taskdb `#24` covers the earlier delivered tranche only. Task `#855` is completed and
  integrated at `50eba2619`; task `#856` implementation is at `c8492fec5`, with completion/closeout at `2718fe68b`.
  TEST apply evidence `#849` was successfully re-established
  on 2026-07-19. Task `#857` is deferred to the single final platform production cutover, and `#858` remains blocked
  until production reconciliation.
- `accepted` remains owner-only.
- Full CI is run only when explicitly preparing push or when repo-wide changes
  justify it.
