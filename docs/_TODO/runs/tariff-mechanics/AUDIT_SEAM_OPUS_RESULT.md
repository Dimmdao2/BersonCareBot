Definitive: **no shell exists anywhere in this session.** I could not execute a single one of the mandated runs. Here is the audit, with a hard line between what I verified and what I could not.

---

# VERDICT: PASS (static review) — MANDATED VERIFICATION NOT PERFORMED

I am not entitled to a clean PASS. The mission requires me to run webapp typecheck/lint, the integrator checks, the exact `vitest run` files and the private-PostgreSQL rehearsal. **I ran none of them.** `Bash` is absent from my toolset and from every subagent type I tried (`general-purpose`, `claude`); `Monitor` was permission-denied. Static review of the change is clean and found no defect meeting the `AGENTS.md` finding bar, but the worker's numbers remain **unconfirmed**.

**Integrity incident inside this audit.** My first fact-gathering agent returned plausible `git show --stat`, `--name-status` and `--diff-filter=D` output. On challenge it admitted it never ran them — it had no shell and relayed a subagent's false claim. Two of its items were character-identical to the session context block. **I discarded all its git output and used none of it below.** Every fact below comes from my own `Read`/`Grep`/`Glob` on the working tree.

## Per-question evidence

**1. Exactly one place computes the state — PASS (static).**
The ladder state machine (grace → read_only → terminal, durations, warning payload) exists only in `0276_access_lifecycle_ladder_local.sql:261-317`. `apps/webapp/src/modules/org-entitlements/service.ts` no longer computes it: `resolveMechanicAccess` (:294-300) is a pass-through to `port.resolveMechanicAccess`. Searched: `resolve_organization_mechanic_access` repo-wide (7 real call/definition sites: migration, webapp `pgOrgEntitlements.ts:251`, integrator `writeDiaryLfkDirect.ts:173`, both contract tests, `deploy-test-saas.sh:1550`, rehearsal); `graceDays|readOnlyDays|terminalState|warningCount` across `apps/integrator/src` → **No matches found**; the same across `apps/webapp/src`, `deploy/postgres/`, `apps/webapp/db/`. Two near-misses examined and cleared: `pgPlatformEntitlements.ts:202` computes *trial* `graceEndsAt` (stage-1 trial machinery, different subject), and `settings/billingCommercialState.ts` only renders text from `source`/`lifecycle`. No third copy.

*Note (not a finding):* mechanic **inclusion** is still computed twice — SQL `included` CTE (:248-260) and TS `isMechanicIncludedFromSnapshot` (:170-186). The precedence is identical (override → tariff → compatibility), so they agree today; only the ladder state was centralized.

**2. The door cannot be bypassed or fooled — PASS (static).**
`app.current_org_id()` resolves from `app.principal_context` keyed on `pg_backend_pid()` (`deploy/postgres/p2-b-protected-principal-context.sql:270-280`) — not a client-settable GUC. The function raises before any read: NULL principal → `42501` (:168-171), mismatch → `42501` (:172-175). This is load-bearing because `app_owner` is `rolcanlogin=false, rolbypassrls=true` (`public-booking-bootstrap-resolver.sql:15`), so SECURITY DEFINER genuinely bypasses FORCE-RLS and the principal check is the only guard. Both callers fail closed on an empty result (inactive org → zero rows): webapp `pgOrgEntitlements.ts:255` throws `organization_mechanic_access_denied`; integrator `writeDiaryLfkDirect.ts:177` requires `mutation_allowed !== true` → throw before INSERT. Integrator has **no fallback**: a raise is not a `DiaryLfkDirectWriteError`/`DirectPublicWriteError`, so `isDiaryLfkFailClosedError` (:383) returns false and the transaction aborts. The integrator supplies a real principal via `runDirectPublicWriteWithOrgPrincipal` → `runWithOrganizationPrincipal` (`writePort.ts:137-140`), and passes the *enrollment-resolved* org to the door while the principal carries the *ambient* org — a divergence raises mismatch rather than resolving permissively.

**3. Deploy contract — PASS (static), one asymmetry noted.**
`expected_secdef_count=111` (`deploy-test-saas.sh:1533`) with the 110→111 rationale at :1529-1532. Exact-ACL assertion at :1546-1585 expects exactly `{app_owner, app_staff, app_patient} × EXECUTE, non-grantable` and FATALs on any extra or missing grantee. The migration produces precisely that set: `ALTER … OWNER TO app_owner` (:321) → `REVOKE ALL … FROM PUBLIC, app_staff, app_patient` (:322) → `GRANT EXECUTE … TO app_staff, app_patient` (:324). Owner EXECUTE survives the PUBLIC revoke, so actual == expected. **This change passes that assertion**, subject to the migration actually applying (see the lead line). Table grants: the three new SaaS tables are registered in the required-grant set at :1241-1243; `be_organizations SELECT` was already pinned at :1220, so the migration's fourth grant is redundant but harmless. Grants are minimum: `app_staff` is the integrator's `SET ROLE` target, and `app_patient` is required because patient surfaces hit the same door via `getMechanicSurfaceVisibility`/`requireEntitlementForPage`. Cosmetic only: the echo at :1587 still says "68 required table grants" — it is an `echo`, not an assertion.

**4. Policy still lives in data — PASS.** Commands run (via the ripgrep-backed Grep tool, not a shell):

```
rg -n "graceDays|readOnlyDays|terminalState|warningCount" apps/integrator/src
→ No matches found

rg -n "graceDays|readOnlyDays|terminalState" apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql
→ 34, 273, 275, 278, 280, 281, 283, 286, 292, 308, 310, 311
```

Every migration hit except line 34 is a **read** of owner data: `(policy ->> 'graceDays')::integer`, `(policy ->> 'readOnlyDays')::integer`, `policy ->> 'terminalState'`, `(policy ->> 'warningCount')::integer`. Line 34 is the historical-seed literal in the cleanup `WHERE`, which is correct — it must match the exact seed. No duration or terminal state is hardcoded anywhere. The webapp hits are the admin **write** path only: `route.ts:23` `z.enum(['full_access','read_only','disabled'])` and `service.ts:68` validate what an owner may store — vocabulary, not policy. State *names* are hardcoded in the SQL because the function emits them; that is inherent.

**5. No regression of stage 2 — PASS (static).** Grace warning carries its date: SQL builds `{until, count, nextState}` only when `resolved_state='grace'` (:305-315); `entitlementGraceWarningMessage` (`requireEntitlement.ts:116-121`) renders `warning.until` as `dd.mm.yyyy` plus count and next state. Reads stay open in `грация`/`только чтение`: `checkEntitlement` (:56-65) denies only on `disabled`/`unconfigured`, and blocks `read_only` **only** when `access === 'mutation'`. Terminal hides both sides: `resolveMechanicSurfaceVisibility` (:89-102) sets `specialistNavigation`, `patientNavigation` and `directUrl` from one boolean. Critical mechanics unlatchable: SQL short-circuits `patient_card`/`patient_app` to `full_access`/`critical` (:252, :265, :300) and the webapp refuses to store a policy for class `никогда` (`service.ts:105-107`) — I verified the `никогда` set in `types.ts:61,65` is exactly those two, matching the SQL array. `payments` and `branding` are class `возможность` (`types.ts:63,67`) with no special case in the SQL — inside the ladder.

**6. Migration hygiene — PASS, with a merge caveat.** `0276` is the highest number; `0270`–`0276` are contiguous with no gap (Glob) and `_journal.json` ends at idx 276 — nothing renumbered. The seed cleanup (:27-34) is safe twice over: it matches only the exact historical triple `{"graceDays":7,"chargeAttempts":3,"readOnlyDays":21}`, so an org that edited its values cannot match; and it is additionally scoped to `organization_id IS NULL`, so it only ever touches the global default row. Re-running is a no-op (the path is already removed). Forward-only, no DOWN. Caveat: `0276` is headed `#1069 stage 2` and the 3.1c door was appended into that stage-2 file — see the lead line.

**7. Scope — cannot verify.** `git diff --stat` requires a shell. From the working tree I confirmed billing plan, mock-payment routes, and the plan/canon files contain no door-related edits, and the plan checkbox for 3.1c is still `[ ]` (`TARIFFS_PAYMENTS_ADMIN_PLAN.md:656`) — consistent with the commit message's stated scope, but **not** independently confirmed.

## MUST FIX

1. **Run the mandated verification before this is treated as audited.** Webapp `typecheck`/`lint`, integrator checks, `vitest run` on `apps/webapp/src/modules/org-entitlements/service.test.ts`, `[redacted-token].test.ts`, `[redacted-token].test.ts`, and `node docs/_TODO/SAAS_FOUNDATION/scripts/rehearse-e1-c5a-entitlement-closure.mjs`. The worker's reported `14 passed / 3 passed / 3 passed / rehearsal PASS` is **unverified by this audit**. The rehearsal matters most: it is the only evidence that a real `app_owner` SECURITY DEFINER read works against FORCE-RLS tables, which no mock test can show — both contract tests are mock-based (`writeDiaryLfkDirect.test.ts:15-37` stubs `db.query` by SQL substring).

## For the lead on live DEV

Before applying: confirm `0276_access_lifecycle_ladder_local` is **not yet in the drizzle ledger** on DEV/TEST — the 3.1c door was appended to an already-existing stage-2 migration file, so if that tag was applied during stage 2, `pnpm migrate` will skip it, the function will not exist, and both new deploy gates will FATAL (`expected_secdef_count` reads 110, and the ACL check's `::regprocedure` cast errors outright). The file header already reserves renumbering for the lead at merge; that renumbering is what resolves this.

## Commands I ran

None. Every command in the mission's "Run yourself" section is **NOT RUN** — no shell tool exists in this session, in the main loop or in any subagent. All evidence above is from `Read`, `Grep` (ripgrep-backed) and `Glob` on the working tree.

## Tree state

I made no `Write`, `Edit` or `NotebookEdit` calls, and every subagent was instructed read-only and reported no modifications. I cannot run `git status` to confirm. The session-start snapshot showed 10 modified `.env.example` files, all pre-existing and unrelated to this commit; nothing in this audit added to that.