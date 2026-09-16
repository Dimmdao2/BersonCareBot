# C3M worker — client portal and per-symptom patient tracking

Read the `AGENTS.md` heading map before every action, then the full migration/privilege rules in §1 if schema is
touched, plus §4/§4a, §5, §9, §10/§10a/§10b, §12, §15–§19, §21, §22 and §24. Read `README.md`, the whole C3M
section of `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, the patient-invite and symptom-diary
module docs, and accepted C3M-01/02/03/04/06/07a/09 code before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-10 — «Gate invite issue
и linked org-private patient routes/APIs client policy; отдельно добавить `patient_tracking_enabled` в create/edit
symptom, patient list/read/write guards и compatibility backfill `true`; создание использует только snapshot
текущего symptom default и `onSupport`. Public booking и глобальный дневник/identity не отнимать».

Implement C3M-10 only. The lead closes it after independent audit, privilege analysis and owner-aware candidate
preflight for every migration, targeted validation and live acceptance.

## Required behavior

1. Apply the accepted `client_portal` workspace switch and organization-scoped per-client `inherit | allow | deny`
   policy to issuing/reissuing invites and every linked private patient surface/API for that organization. A disabled
   or denied portal returns the accepted neutral unavailable/typed deny state server-side; hiding doctor controls is
   not sufficient.
2. Portal OFF/deny must not delete or unlink global patient identity, organization enrollment, invite history,
   diary data or clinical/program data. Pending invite revocation may continue through the existing lifecycle.
   Re-enable restores the same authorized relationship. Another organization of the same patient is unaffected.
3. Public booking, schedule/appointments and their cancellation/payment rules remain outside client-portal and
   support-group policy. Do not gate the patient's global identity or global diary shell as a substitute for gating
   organization-private content.
4. Add one boolean `patient_tracking_enabled` to each symptom tracking. Existing trackings backfill to `true`.
   This boolean is independent of `is_active`: disabling patient tracking leaves the symptom, its history and the
   specialist's create/edit/read path intact and does not archive it.
5. In the specialist's client card, expose one control «разрешить отслеживание пациентом» in create/edit settings
   of the existing diary `symptom_trackings` model. Current code has the staff create route but no connected
   create/edit UI; connect that same model into the existing client card with the smallest coherent controls. Do not
   attach the control to `patient_clinical_complaints` (the longitudinal medical-record symptom entity), do not add a
   second symptom entity, and do not create a separate page. Create pre-fills it from the accepted organization
   default: `off=false`, `all=true`, `on_support=current onSupport`. The specialist may change it before save and
   edit it later.
6. The create default is a one-time snapshot only. Changing the organization default or later changing `onSupport`
   never rewrites existing symptom trackings. Do not add a per-client symptom override, inheritance state, live
   symptom policy resolver, second group or favorite property.
7. Patient symptom list/read/journal and direct entry mutations select/accept only active trackings with
   `patient_tracking_enabled=true`; a crafted entry for a disabled tracking is rejected server-side. Re-enable makes
   the same tracking and prior history visible again without data mutation.
8. Reuse existing invite, workspace-policy, support-profile and symptom-diary ports/services/repositories. Keep
   organization and patient principals authoritative at each boundary; no parallel portal, diary or tracking model.

## Explicit non-scope

No presets/onboarding, tariffs/add-ons/domain/solo/clinic logic, profession roles, new favorite/support mechanism,
booking policy, communication-channel UI, terminology sweep, medical-record/encounter/rehabilitation redesign or
Today presentation change. Do not reinterpret the portal switch as account deletion and do not use `is_active` for
patient visibility.

This product worker writes no tests (`AGENTS.md` §10b). Do not add label/DOM/source-text/SQL-text/function-format
tests. The independent auditor owns the blind behavior oracle. Run affected existing service/route/repository checks,
webapp typecheck, scoped ESLint, architecture and migration/privilege checks, and `git diff --check`; no full CI or
shared dev server.

Use a timestamp migration with owner markers, no GRANT/REVOKE/policy statements, same-PR indexes needed by the new
patient visibility predicate, and update privilege declarations only for a demonstrated rights gap. Leave the
owner-aware rollback-only candidate preflight to the separate acceptance run. Commit explicit in-scope paths only
with `#1098`, why, evidence, `C3M-10`, and remaining audit/preflight. Never `git add -A`, never push, and do not
finish before the commit exists.
