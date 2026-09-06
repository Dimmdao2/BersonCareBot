# Worker brief: fullscreen mobile text editor for notes and anamnesis

You are the implementation worker for an owner-approved bounded UI stage. Work only in the isolated branch/worktree
created by `tools/orch-launch.sh`; never edit or commit in `feat/doctor-ui-rebuild` directly.

Before every action follow `AGENTS.md`'s heading-map rule. Mandatory reading: `AGENTS.md` §5, §10a, §10b, §16,
§17, §21 and §24; `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`; the common modal section, P3 and P4.2/P4.3
of `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` —
«Автофокус устанавливается сразу при открытии однополевого редактора, без ожидания завершения анимации».

## Exact acceptance checklist

Implement every applicable pending item, without silently shortening it:

- `MODAL-TEXT-01..08` in full.
- `PATIENT-NOTE-EDITOR-01..03` in full.
- `DISEASE-EDIT-03`, `DISEASE-EDIT-04`, `DISEASE-EDIT-05`, `DISEASE-EDIT-05A`, while preserving already working
  `DISEASE-EDIT-01/02/06/07/08` behavior.
- `LIFE-LIFESTYLE-01..04`, without deleting technical history.

## Owner behavior, position by position

### One shared modal presentation

1. This is a canonical DoctorModal presentation for forms whose main content is one long text field. Do not create
   three independent layouts. First extend/parameterize `apps/webapp/src/shared/ui/doctor/DoctorModal.tsx`, or make
   one thin reusable doctor-zone composition only if the existing component cannot express the content contract.
2. On a mobile viewport the editor covers the entire visible viewport. It has no top gap, rounded top corners or
   drawer handle. It remains a layer in the existing DoctorModal stack; the patient card beneath stays mounted.
3. Header is at the top safe-area and remains visible when the software keyboard opens. It keeps the standard
   `DoctorModalStackedTitle`: action/document title at left, current patient context at right, no patient chooser.
4. A borderless white textarea starts immediately below the header. It fills all space remaining above the footer.
   Its own text scrolls when long; the whole modal must not scroll the header or footer out of view. With no keyboard
   it fills the full screen rather than sitting at the bottom of an empty modal.
5. The common footer is always visible with `Отмена` on the left and `Сохранить` on the right. With the keyboard
   open it sits directly above the keyboard and respects safe area. No local duplicate footer geometry.
6. Mobile geometry must react to `window.visualViewport.height` and `window.visualViewport.offsetTop` (with a safe
   `100dvh` fallback) so iOS Safari and other supporting browsers keep header, textarea and footer within the visible
   area. Subscribe only while the editor is open and clean up listeners. Do not globally resize ordinary modals.
7. Focus the sole textarea immediately as part of opening/mounting the editor. Do not wait for the open animation to
   finish. A browser that permits autofocus from the user's click should open the keyboard without another tap.
   Do not blur after mount or steal focus on every render.
8. Desktop/right-sheet preserves the established DoctorModal desktop geometry and top-oriented text entry. The
   fullscreen/no-handle contract is mobile-only.
9. `Отмена`, close and unsaved dismissal discard the working draft and close only this layer. `Сохранить` keeps the
   existing typed endpoint, toast and parent refresh behavior.

### Apply to the three current entry points

10. Patient card → Overview → Notes → `Новая заметка`: use the common fullscreen editor. Current TEST defect to
    eliminate: the modal opens without focus/keyboard and the textarea is stranded at the bottom. Keep the existing
    note list/order and note creation API unchanged.
11. Patient card → Map → `Анамнез заболевания` → edit: use the same editor. Add the missing `Отмена` button beside
    `Сохранить`. Preserve the single patient-scoped replacement text, five-line preview, toast, refresh and ability
    to clear if the existing contract allows it.
12. Patient card → Map → `Анамнез жизни` editor → `Образ жизни`: present one current editable text value, not a list
    of dated entries. Do not display entry/record date beside it in the life editor or on the main map. Editing again
    changes the visible current value. Existing technical history may remain in storage; do not delete or migrate it.
    Use the existing append/update typed contracts: update the current/latest existing entry when one exists, append
    only when none exists. The user must never choose or see a date for this field.
13. Do not convert the whole multi-section life-anamnesis editor into this one-field fullscreen editor. Only the
    nested/current `Образ жизни` text editing action uses it; the parent long-sheet with comorbidities, traumas and
    illnesses keeps its established structure.

## Reuse and scope discipline

- Inspect `DoctorModal`, its footer slot, doctor drawer primitives and existing tests before coding. Parameterize the
  existing modal path; do not build a second portal, overlay, layer context, drawer or footer.
- No new dependency. Use existing hooks/primitives/classes and strict TypeScript; no `any`.
- Do not touch PatientModal or patient-app UI: these entry points are doctor-zone patient-card UI.
- Do not touch encounter/visit page internals, appointment timezone work, symptoms/diagnoses layout, unrelated
  modals, database schema/migrations/grants, calendar, TEST/PROD or the shared dev server.
- Visual acceptance belongs to the owner on TEST. Do not perform screenshot/polish rounds or invent spacing beyond
  the position contract above.

Allowed paths:

- `apps/webapp/src/shared/ui/doctor/DoctorModal.tsx`
- `apps/webapp/src/shared/ui/doctor/DoctorModal.ui.test.tsx`
- at most one new shared doctor text-editor composition/helper and its behavior test, only if reuse cannot be
  expressed cleanly through `DoctorModal` props;
- `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/PatientTabOverview.tsx` and its existing test;
- `apps/webapp/src/app/app/doctor/patients/[userId]/tabs/karta/PatientClinicalSections.tsx` and its existing test;
- existing anamnesis route/service/port/in-memory/pg files and tests only if required to make the current lifestyle
  value replaceable without exposing dates;
- only the checklist lines named above after evidence is green.

## Behavioral verification

Prefer a small number of observable behavior tests; do not pin layout classes, source strings or DOM structure.

- Mobile DoctorModal text-editor presentation exposes no drag handle, autofocuses its textarea once, and retains
  accessible title/footer actions.
- A controllable `visualViewport` resize/offset change updates the editor's visible geometry without unmounting the
  textarea or losing its value/focus.
- New note opening produces a focused textarea; cancel creates no note; save calls the existing note contract once.
- Disease editor has both actions; cancel preserves old text; save refreshes the visible value.
- Lifestyle editor shows only the latest/current text with no date control or date label; existing value uses update,
  empty state uses create; technical historical rows are not deleted.

Run targeted Vitest for changed behavior, webapp typecheck, scoped ESLint and `git diff --check`. Do not run full CI.
Do not start the shared dev server. Keep long commands in the foreground and finish them in this one turn. Stage only
explicit task paths (never `git add -A`), commit before finishing, do not push or land. Final report must list the
commit SHA, changed paths, exact commands/results and each checklist ID genuinely satisfied.
