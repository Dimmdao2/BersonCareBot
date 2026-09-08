# Worker brief — #1100 active patient-card daily notes integration

You own one coherent correction stage on the current accepted integration base. Work only in the supplied clean
clone/branch. This is a real TEST-discovered product gap, not a style pass.

## Authority and rules

Read the heading map and applicable sections of `AGENTS.md` before each action: universal rules, §5 architecture,
§7/§9/§10 validation and commit, doctor UI §§16–17, UI text §21, and §24 worker discipline. Read the active owner
checklist `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, especially NOTE-01..08 and UI-01/UI-07. The already accepted
daily note implementation is `apps/webapp/src/app/app/doctor/clients/DoctorNotesPanel.tsx` plus the existing
doctor-notes service/route; extend/reuse that one path. Do not create a second note component, endpoint, service,
or storage path.

## Источник оракула

Owner checklist `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Сегодняшняя заметка открыта первой и редактируема
по умолчанию. Кнопки «Добавить»/«Сохранить» нет: каждое изменение автоматически и надёжно сохраняется.»

## Proven gap

Live TEST inspection of the actual route `/app/doctor/patients/[userId]` proved that its active
`PatientTabOverview.tsx` still renders the legacy append-only notes modal and separate «Новая заметка»/manual-save
form. The accepted daily `DoctorNotesPanel` is currently mounted only by the legacy
`DoctorClientOverviewTab.tsx` and the live-call page. Thus the owner requirement that opening/reopening notes in the
actual client overview edits today's one autosaved note is not delivered.

## Required correction

1. Integrate the existing `DoctorNotesPanel` into the canonical active patient-card overview
   `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx`.
2. Preserve the existing notes stat card and its modal interaction, but the modal body must be the shared daily
   note history/editor: newest date first, today expanded/editable, old dates collapsed to three lines and editable
   when expanded, autosave, no Add/Save buttons.
3. Both the stat-card click and its note action must open that same notes modal/editor. Remove the legacy local
   `noteFormOpen`/`noteText`/manual POST UI path from this active surface; do not change unrelated PatientTabOverview
   behavior or layout.
4. Closing and reopening the modal must keep the logical daily note model; starting a call continues to use the same
   shared panel on the live page. Do not add parent refresh/remount behavior.
5. Parameterize/reuse the existing component and existing modal. Do not add a helper/abstraction unless an existing
   point cannot carry the required behavior without violating its boundary (§5 one common path).

## Scope exclusions

No migrations, DB changes, APIs, video provider/session logic, tariff/workspace gates, patient UI, Jitsi/coturn,
deploy, TEST/DEV writes, plan checkbox edits, or broad PatientTabOverview cleanup. Do not alter unrelated interface.

## Tests and validation

Workers do not write, edit, delete, rename, or regenerate tests. Do not update snapshots or fixtures. Run scoped
lint/typecheck and existing relevant tests only if useful under the repository host-lock rules, plus
`git diff --check`. Do not run full CI or a shared dev server.

Before finishing, inspect the diff against the exact base and verify the legacy active note form/button path is gone
only from this surface and `DoctorNotesPanel` is actually reachable from the canonical active route. Commit all task
changes with explicit path staging (never `git add -A`), message containing `#1100`, why, evidence, stage and what
remains. Do not push. Do not finish with a foreground process running. Report exact SHA, changed paths and checks.
