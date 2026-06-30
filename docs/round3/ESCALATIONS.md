# Escalations

## 2026-06-19 — Patient Files Library Isolation: rule 5 / DoD-4 scope reduction (from plan-auditor-pfi)

**Initiative:** Patient Files Library Isolation (`docs/PATIENT_FILES_ISOLATION_INITIATIVE/`)

**What the owner spec requires (rule 5 / DoD-4, verbatim):**
> Индив-упражнение врача (видео с пациентом на приёме) пишется в индивидуальную программу пациента; его видео ложится в папку этого пациента (правила 1–3).

**Problem:** No doctor-side route/UI currently records an individual-exercise video at appointment time and uploads it. The patient-SIDE submission already routes to the patient folder (`app/api/patient/media/program-submission/presign/route.ts`), but the DOCTOR-side entry point the spec describes does not exist in the codebase (planner open-question O3).

**Plan's response:** ROADMAP ST-08 lands only the shared routing helper + a "wiring point" and explicitly moves the actual doctor UI/route to "Out of scope." This means rule 5 / DoD-4 would NOT be fully closed by this initiative — only prepared.

**Decision needed from owner:**
- (A) Confirm DoD-4 is deferred (doctor indiv-exercise capture is a separate future initiative); this initiative only lands the helper. OR
- (B) Bring the doctor entry point in-scope (then ST-08 needs a real route + UI stage, raising scope beyond M).

**Also pending owner confirmation (non-escalation, design defaults in plan):**
- O1: rename prod root «Файлы клиентов» → «Пациенты» (compat-preserving) vs UI alias.
- O2: dual-record `patient_files.media_file_id` link vs full migration into `media_files`.
- O4: dedup fallback when patient has no phone (default uuid8).

**Auditor verdict:** REVISION-NEEDED (also a code-targeting fix G1 on the move-out chokepoint — see `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/plan-audit.md`).
