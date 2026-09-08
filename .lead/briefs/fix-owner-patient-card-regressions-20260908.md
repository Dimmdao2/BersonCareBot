# Owner-found patient card regressions

Role: WORKER. Read the AGENTS.md heading map first, then fully read §15-18, §21-22, §24 and testing policy.
Read docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md, the active C3M plan/owner decisions, and
docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md. Newer owner authority below overrides older prose
that moved support controls into Overview.

Owner authority from live TEST on 2026-09-08:

Источник оракула: owner live TEST 2026-09-08 — «настройки сопровождения только в модалке должны быть и открывать
по кнопке из учетки» и «в деталях симптома (модалке) и только там ставится переключатель».

1. Remove the entire `На сопровождении` settings block from the patient Overview. It must not occupy or replace
   the Tasks KPI/card. For now, all per-patient support/channel settings live only in a modal opened by a button
   from the `Учётка` tab. Reuse the existing `DoctorClientSupportPanel` and `DoctorModal`; do not duplicate policy
   logic or create a second settings UI. The small read-only support/star status marker may remain where the
   established card header already had it; the editable settings panel may not remain in Overview.
2. Remove the added standalone `Симптомы дневника` block from above `История приёмов` / `Начать приём`. Restore
   the polished card header/action layout without changing those existing actions.
3. The only per-symptom UI for patient visibility is a switch labelled
   `Отслеживание пациентом` / `Отслеживание клиентом` inside the existing modal/details editor for that concrete
   symptom. Use the single server-resolved patient terminology helper/context for the noun. Reuse the existing
   `patientTrackingEnabled` field and PATCH path; do not create a global flag, a second endpoint, or a separate
   symptom-management block. New symptom creation may keep its configured default, but each symptom modal must
   reflect and save that symptom's actual override.

Update active documentation only where it contradicts this newer owner decision; replace incompatible active
prose instead of leaving two variants.

WORKER DOES NOT WRITE OR MODIFY TESTS. Existing behavior tests may be run, but do not add UI/source/count/text
tests. Run focused lint/typecheck; no full CI. Do not deploy, push, mutate TEST/DEV data, or touch PROD.

Commit all and only this workstream's files with explicit paths. Final report must state root causes, exact files,
checks, commit SHA and remaining live verification.
