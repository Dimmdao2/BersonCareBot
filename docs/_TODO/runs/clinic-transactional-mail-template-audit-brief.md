# Audit brief: clinic transactional mail template

Exact candidate: `69ffd09c5` on `wt/mail-template-settings`.

Authority:

- Owner reported that branded patient OTP mail on new PROD never arrives and asked to diagnose and fix it.
- The confirmed incident is `BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING`: branded delivery stops before SMTP because the organization has no `clinic_transactional_mail_template` and the application had no canonical write path.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, C4: clinic + platform sender wording is owner-authored; branded delivery remains fail-closed when it is absent. Do not invent or persist default copy.
- `AGENTS.md` §10a/§10b, §16/§17/§21/§21a, §24.4–§24.7. UI/DOM/copy automated tests are forbidden; UI is inspected in code now and live only after landing.

Audit the exact committed candidate independently. Before reading its tests, derive a compact kill-set for these observable risks:

1. A clinic owner with the `branding` mechanic can save a complete organization-scoped template through the existing admin settings route/service; another organization cannot receive or overwrite it.
2. Both the HTTP route and the internal settings service deny writes without the `branding` mechanic. The template is not incorrectly coupled to own-SMTP availability.
3. The stored envelope and field names are exactly consumable by the existing integrator `mailProfile` reader; required placeholders and lengths are validated consistently and incomplete copy fails closed.
4. No default owner wording is invented in the registry, service, page, placeholders, or persistence path. Empty initial UI state does not silently save anything.
5. The existing settings screen reuses its current section/API rather than adding a parallel endpoint or page; the controls are reachable only on the intended branding settings surface and use doctor UI primitives. Check code only; do not write UI tests and do not run a candidate Next server.
6. Review every new/changed test under §10a. Remove tests that only pin registry membership, internal DTO/calls, or source/UI text unless they have an independent oracle and a named expensive silent failure. Retain the cheapest public-boundary behavior tests and perform one fault injection per independent retained class.

Run the focused non-UI suites, webapp typecheck, scoped ESLint, and `git diff --check`. Do not run full CI, push, deploy, touch a database, or change PROD/TEST. Product changes are forbidden for the auditor. Persistent changes may be only justified behavior tests/test cleanup and `docs/_TODO/runs/clinic-transactional-mail-template-audit.md`; commit explicit paths and leave the candidate clean.

Verdict is binary PASS/FAIL. Each MUST FIX must name a reachable scenario, user/system impact, exact authority, and evidence. Style or alternative architecture is not a finding.
