# Worker brief — #1100 daily autosaved doctor notes

You own one coherent Wave 1 stream B. Work only in the supplied clean clone and branch.

## Authority and rules

Read `AGENTS.md` first: universal rules, §1 migration/privilege rules, §5 Clean Architecture, doctor UI §§16–17,
UI text §21, git/validation §§7/9/10, and orchestration §24. The owner checklist is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`; implement NOTE-01..09 and only the notes portion of Wave 1.

Required owner contract:

- NOTE-01: one logical note per `organization + client + author + local calendar date`; reopening UI or starting a
  call never creates another note.
- NOTE-02: date uses the specialist's stored IANA timezone with `app_display_timezone` fallback; an open editor keeps
  its date over midnight and a new date is selected only on the next editor open.
- NOTE-03/04: all history newest-date first, date only (no time); today expanded/editable by default; no Add/Save
  buttons and every change autosaves.
- NOTE-05/06: past dates collapsed by default with at most three visual lines and ellipsis; each expands into its own
  editable borderless textarea without changing its date.
- NOTE-07/08: per-date serialized/versioned autosave prevents stale responses winning, preserves local text on error,
  retries without parent reload, does not remount future video or steal textarea focus.
- NOTE-09: legacy rows for the same author/client/Moscow calendar date merge without text loss in chronological
  order, retaining earliest `created_at` and latest `updated_at` provenance.

## Deliverable

1. Extend the existing doctor-notes module/port/service/repository and current note route; do not create a second
   notes domain. Replace append-only creation with an idempotent daily upsert/update contract and an explicit revision
   conflict response suitable for serialized autosave.
2. Add explicit `note_date` and optimistic revision (plus only genuinely needed provenance fields) in Drizzle and a
   timestamp-named forward migration. Provide DB-enforced uniqueness with correct nullable legacy organization
   semantics (`NULLS NOT DISTINCT` or a proved safe backfill to NOT NULL). Consolidate same-day legacy rows exactly as
   NOTE-09 requires; no disposable DB and no historical migration replay.
3. Extend the existing `doctor-calendar-timezone` resolver rather than adding a second timezone chain. Use the
   personal stored IANA zone and existing settings fallback. Capture the logical edit date on editor open.
4. Update the existing reusable notes UI used from the client overview: all date-separated history visible, today
   expanded, past entries collapsed with CSS line-clamp 3/ellipsis, past edit in borderless textareas, autosave status
   only when useful. Keep stable keys/component identity and local draft state so saving, adjacent expansion and later
   embedding beside video do not remount the editor or parent.
5. Implement a bounded debounce plus a per-note serialized save queue/version check. A stale response cannot replace
   newer text; network failure keeps the local draft and retries safely. Avoid parent `router.refresh()`/full reload.
6. In `deploy/postgres/privileges/declaration.ts`, give `app_staff` the exact required UPDATE columns including
   `text`, `updated_at`, `note_date` and revision. Regenerate canonical privilege artifacts. Migration SQL must not
   contain GRANT/REVOKE.

Before creating a new helper or component, inspect and extend the existing doctor-notes service/port/repository,
`DoctorNotesPanel`/current overview note surface and timezone resolver. One shared notes path is mandatory.

## Excluded

No live meeting pages, video provider, encounter form, entry buttons, tariff/session/invite code, notifications,
Jitsi/coturn infrastructure or live DEV/TEST/PROD writes. Do not change owner checkboxes.

## Validation and handoff

Workers do not write, edit or delete tests. Run generated privilege parity, migration/order/static checks, webapp
typecheck, scoped lint/format and diff checks. Do not run full CI or shared dev servers. Do not run named-DEV migration
preflight; the independent trusted acceptance pass will do it on the exact committed candidate.

Commit all task changes with explicit path staging (never `git add -A`), a message containing `#1100`, why, evidence,
the plan stage and what remains. Do not push. Report exact SHA, changed paths, validation, and a four-point DB rights
handoff. Do not finish while a foreground process is still running.
