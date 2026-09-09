# Worker brief — close Berson TEST custom-domain privilege finding (#787)

Work only in `/home/dev/dev-projects/bcb-wt-berson-test-custom-domain-20260909` on
`wt/berson-test-custom-domain-20260909`. The committed candidate is `941c632ea`; the committed independent
audit/test/report is `e8ec3348c`. This is a continuation of the same bounded workstream, not a new product scope.

## Required reading and authority

Before every action follow the heading-map gate in `AGENTS.md`. Read the complete relevant sections: §1 including
migration/privilege/preflight/checklist rules, §1b, §4a, §5, §7, §9–§10b, §12 and §24. Read
`deploy/postgres/privileges/README.md`, the custom-domain migration and port, the current #787 plan sections
§1.2a/B2/B8/C5a/D, the original worker brief, and
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md`.

Owner authority remains: `test.bersoncare.ru` is the Berson Care branded TEST patient custom domain; the ordinary
clinic settings path must save its own exact binding, another organization must remain unreachable, and the binding
identity/readiness/activation lifecycle is server-owned and fail-closed. No PROD action.

## Confirmed defect and important technical correction

The candidate cured the observed `42501` by granting `app_staff` INSERT on every column named by Drizzle, including
generated identity/timestamps and activation/readiness state. The audit rejected that effective authority because a
caller using the staff DB role can explicitly manufacture server-owned state.

Do not implement the audit's naive textual suggestion by merely deleting defaulted columns: the canonical privilege
README explicitly records that Drizzle names defaulted columns as `DEFAULT`, so such a grant will restore the live
`42501`. Prove the emitted surface and then remove the *effective ability* of `app_staff` to choose server-owned
state. Prefer extending the existing custom-domain lifecycle boundary with one narrow, parameterized staff intent
door (set/retry/supersede/clear as required) and removing direct INSERT/UPDATE authority, or an equivalently narrow
existing-boundary solution. Do not create a second binding table/store/resolver, Berson-specific branch, raw-SQL
application bypass, or a generic new abstraction. Do not combine the staff intent boundary with the infrastructure
DNS/TLS transition caller if that would broaden either trust boundary.

The public port remains `CustomDomainBindingPort`; callers and UI should not fork. Hostname must still be computed
server-side from normalized base domain + placement; organization/actor come from the accepted staff principal, not
caller-controlled service state. The database boundary must preserve advisory serialization, global hostname
uniqueness, immutable organization ownership, quarantine/no-reclaim semantics, retry semantics, and the existing
active-only resolver. Staff must not be able to set generated id/timestamps, `activated_at`, readiness/active state,
arbitrary status reason, or another organization's binding.

## Scope and delivery

- Implement the complete security correction, including forward migration(s), declaration/function census,
  generated privilege artifacts and port wiring required by the chosen existing-boundary design.
- Migration files obey current timestamp naming, statement-owner markers, verification probe and never contain
  GRANT/REVOKE. Update the single privilege declaration and regenerate artifacts; do not edit generated SQL by hand
  or touch historical TSV inventories.
- Analyze rights for every changed/new function body in the final report: owner, caller, table/column operations and
  exact declaration entries. Run the owner-aware candidate preflight against named DEV if the sanctioned candidate
  path supports it; never create a disposable DB and never apply to TEST/PROD.
- Preserve the already accepted nginx/domain/docs part of `941c632ea`; do not broaden into remaining B2/B8/C5a/D
  automation.
- **Write no new tests and do not rewrite expected values.** The independent auditor owns the committed
  `pgCustomDomainBinding.devDbProof.test.ts`. You may run it unchanged. If current named DEV lacks its documented
  fixture shape, report that honestly rather than weakening or editing the test. Do not clean unrelated old tests.
- Run the smallest relevant privilege generation/checks, package/type checks, migration candidate preflight and the
  unchanged audit test where executable. No full CI and no live provider sends.
- Stage only explicit task paths, commit all product changes before ending, do not push. Final report names commit,
  exact validations/results, rights analysis, and any remaining blocker. Do not end while a foreground command is
  still running.
