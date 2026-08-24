# TEST start OAuth projections — fix acceptance

Date: 2026-08-24

Product fix: `be45473c4`

Independent audit: `9eb5c9bb8` / landed artifact `0cb37b15b`

Verdict: **PASS**

The independent audit found one reachable class of failure on candidate `13f2e1920`: JSON object,
array, boolean and number values in restricted OAuth settings were treated as configured. The
localized fix requires the inner `value` to be a non-blank JSON string. No new surface, relation,
row, write path, role, policy or grant was introduced.

The lead reran the auditor's exact foreground, one-transaction named-DEV probe against
`be45473c4`. It installed the candidate function under the declared owner, used synthetic
non-secret values, exercised the accepted pre-session context and finished with explicit
`ROLLBACK`.

Result:

```text
SUMMARY|checks=60|failures=0
```

The matrix covered complete and incomplete provider sets, provider isolation, missing/empty/
whitespace/malformed inputs, no-context refusal, restricted-source non-disclosure, absence of
physical projection rows, owner/security/ACL/relation access, ordinary public settings, surface
toggles and the existing SMS-derived behavior. The four assertions that failed in the independent
audit (`object_value_false`, `boolean_value_false`, `numeric_value_false`, `array_value_false`) all
passed after the fix.

Additional gates on the fixed candidate:

```text
node scripts/check-migration-privileges.mjs
check-migration-privileges: OK (78 migration files)

node deploy/postgres/privileges/migration-order.mjs --check
exit 0

bash deploy/host/migrate-dev.sh --preflight
migrate-dev preflight: PASS (rollback-only; pending=1, total=77)

git diff --check
exit 0
```

The audit FAIL remains unchanged as the historical record of what the independent pass found; this
acceptance records the required same-matrix fix verification under `AGENTS.md` section 24.5.
