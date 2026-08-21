# D15b/6 canonical contacts physical cutover — independent audit 2026-08-21

Candidate: `8d907c1e8da508ac7a3092b1e6fc6435644f1913`.

Oracle: `WORK_ORDER.md` D15b/6 — `public.user_contacts` remains and becomes the sole source of phone/email.

## Blind kill-set (written before reading candidate tests or implementation)

The following kill-set was derived only from the owner/plan authority named in the audit brief.

| ID  | Class                 | Named break and reachable impact                                                                                                                                                                                                                                                                                                     | Proof method                                                                                                                                   |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Repeated behavior     | A confirmed non-primary phone/email stops resolving its one canonical account, or phone and email owned by different accounts are silently accepted. The person is locked out or enters the wrong account.                                                                                                                           | Fault injection against the existing public identity/auth boundary; inspect conflict and confirmation semantics.                               |
| K2  | Repeated behavior     | Any webapp, integrator, or `packages/platform-merge` production write updates a legacy scalar/history/provider row without atomically updating canonical `public.user_contacts`, or rebuilds/deletes canonical contacts from those reverse sources. Login/delivery identity silently drifts or a valid contact is lost.              | Fault injection at the single canonical contact mutation root plus writer-callsite inspection.                                                 |
| K3  | Mixed                 | Session refresh, registration, OAuth/email setup, phone/messenger bind, admin lookup, booking, delivery, or purge still reads a removed scalar contact column, or bypasses the existing identity facade/DB ports through a second reader/writer/raw-SQL helper. Runtime fails after DROP or two identity truths reappear.            | Exact base..candidate callgraph/schema/raw-SQL inspection; behavior faults at public facades where repeatable.                                 |
| K4  | Repeated behavior     | Merge transfers a contact more than once, changes confirmed/primary/provenance semantics, lets a tombstone/history row reclaim it, or permits contacts owned by different accounts to converge. Canonical ownership is corrupted or authentication crosses accounts.                                                                 | Fault injection in the shared merge engine and its canonical mutation boundary; inspect transactional uniqueness/conflict handling.            |
| K5  | One-off cutover       | The timestamp-forward migration can DROP before parity/dependency proof, omits an active dependency, drops a non-superseded object, diverges from Drizzle/generated/deploy artifacts, silently discards a contact, edits an applied migration, or contains access-control DDL. Deploy or restart produces data loss/runtime failure. | Exact SQL, catalog-dependency, migration-order/journal/generator/deploy inspection and migration self-tests; no source-string acceptance test. |
| K6  | Mixed architecture    | The cutover introduces `any`, application raw SQL outside existing low-level ports, a duplicate contact facade, cross-layer DB access, or D15b/7 pseudonym/medical-subject scope. Type/architecture boundaries become bypassable or unrelated scope changes.                                                                         | Strict typechecks, scoped lint, raw-SQL/architecture gates, and exact diff inspection.                                                         |
| K7  | One-off compatibility | Current named DEV cannot satisfy migration preconditions, candidate code requires columns before they are dropped, or old code is expected to run after DROP. The staged DEV→TEST cutover has no safe application/migration ordering.                                                                                                | Read-only named DEV catalog/data/dependency inspection plus exact old/new code and deploy-order inspection; do not execute the migration.      |

## Verdict

**FAIL.** Candidate `8d907c1e8da508ac7a3092b1e6fc6435644f1913` must not be cut over on DEV. The
named DEV data fails the migration's first parity assertion, the migration leaves an active scalar reader, and
its final body-regex assertion cannot reach zero even after the intended rewrites. There is also a reachable
confirmed-secondary-phone login split, manual merge corrupts OAuth provenance, and the candidate leaves a
targeted integrator behavior suite red.

Base used for the whole diff: candidate second parent
`2435c795f096423ffa5a3187a80c629d7c791c95` (the synchronized `feat/doctor-ui-rebuild`). The product worker
commit is candidate first-parent ancestor `38b917aba01f741d7cc4bedc2a868668db11754d`.

## MUST FIX

### MF-1 — named DEV cannot pass the migration parity precondition

Reachable scenario: run the required DEV preflight against the current named `bcb_webapp_dev`. The exact
read-only expression copied from the migration returns five person rows, so
`20260821T040000_cut_over_canonical_contacts.sql:40-42` raises before any cutover statement. No migration was
executed during this audit.

Impact: the required DEV -> TEST sequence cannot start; D15b/6 cannot physically cut over.

Violated requirement: K5/K7 and `WORK_ORDER.md` D15b/6 — parity must be proved before DROP, and the current named
DEV catalog/data must be able to pass the preconditions.

Evidence (no phone/e-mail values were printed):

```text
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev ...
  SELECT count(*) ... WHERE person.phone_normalized IS DISTINCT FROM phone.value_normalized
    OR person.patient_phone_trust_at IS DISTINCT FROM phone.confirmed_at
    OR person.email_normalized IS DISTINCT FROM email_contact.value_normalized
    OR person.email_verified_at IS DISTINCT FROM email_contact.confirmed_at ...;
-> parity_mismatches=5

same read-only CTE, split by predicate with count(*) FILTER:
-> phone_value=1,phone_confirm=4,email_value=0,email_confirm=1,email_raw=0
```

The current source roots were measured, not inferred:

```text
sudo -n -u postgres psql ... -d bcb_webapp_dev -Atqc
  "BEGIN READ ONLY; SELECT 'contacts='||count(*) FROM public.user_contacts; ...; ROLLBACK;"
-> contacts=328
-> duplicate_primary_groups=0
```

### MF-2 — an active patient identity reader is not rewritten before DROP

Reachable scenario: `pgPlatformUserContacts.ts` calls
`app.read_current_patient_identity_contacts()`. Its current DEV body still selects `account.email` from
`public.platform_users`; the candidate migration contains zero rewrites for that function and later drops
`platform_users.email`. The migration's own legacy-body gate currently stops this path; if that gate were merely
relaxed to get past MF-3, the patient booking/supplementary-contact path would fail at runtime after DROP.

Impact: either the migration aborts, or an active patient identity port calls a function whose body references a
removed column.

Violated requirement: K3/K5 — booking and identity readers must not read removed scalar contact columns, and an
active reader must not survive the irreversible DROP.

```text
rg -n '^CREATE OR REPLACE FUNCTION app\.read_current_patient_identity_contacts' \
  apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql | wc -l
-> 0

rg -n 'read_current_patient_identity_contacts' apps/webapp/src apps/integrator/src \
  packages/platform-merge/src --glob '!**/*.test.ts' --glob '!**/*.test.tsx' | wc -l
-> 2

read-only pg_get_functiondef(...) on named DEV
-> body contains `SELECT account.email ... FROM public.platform_users AS account`
```

### MF-3 — the migration's final legacy-body assertion self-matches and false-positively matches a canonical root

Reachable scenario: after the candidate replaces its function bodies, the final check at lines 4101-4110 uses an
unanchored regex containing `user.email_normalized`. The candidate's own rewritten
`app.accept_org_invite(...)` contains `v_user.email_normalized`, which matches that substring. The unreplaced,
already-canonical `app.read_admin_notification_targets(...)` contains `holder.email`, which also matches. Thus
the check cannot reach zero even after data parity is repaired; it raises before DROP.

Impact: DEV preflight/execute always aborts. Removing the check alone is unsafe because MF-2 is a real reader.

Violated requirement: K5/K7 — dependency safety must be proved by a gate that distinguishes physical scalar
references from derived/contact aliases, and the timestamp-forward migration must be applicable on named DEV.

```text
sudo -n -u postgres psql ... -d bcb_webapp_dev -Atqc
  "BEGIN READ ONLY;
   SELECT ('v_user.email_normalized' ~ '<migration regex>')::text;
   SELECT ('holder.email' ~ '<migration regex>')::text;
   ROLLBACK;"
-> candidate_accept_regex_matches=true
-> canonical_holder_regex_matches=true

awk '/^CREATE OR REPLACE FUNCTION/{fn=$0}
     /(u|pu|users|user|patient|person|platform_user|holder|owner|recipient|source|target|duplicate)\
\.(phone_normalized|email|email_normalized|email_verified_at|patient_phone_trust_at)/{print FNR,fn,$0}' \
  apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql
-> line 169: candidate `accept_org_invite`, `v_user.email_normalized`
```

### MF-4 — a confirmed non-primary phone is excluded from messenger identity resolution

Reachable scenario: promoting phone B demotes the previously confirmed phone A but preserves its
`confirmed_at`. On a first channel binding whose only identity hint is A,
`collectMessengerResolutionCandidates()` calls `findTrustedCanonicalUserIdByPhone()`. That query requires
`user_contacts.is_primary = true`, returns no owner for A, and the `findOrCreateByChannelBinding` path can create
a second account. The canonical general lookup correctly has no primary filter; the trusted login lookup is the
divergent second rule. The candidate itself creates this state through the `demoted_primary` CTE.

Impact: an equal-rights confirmed phone stops authenticating through the messenger boundary and can split one
person into two accounts.

Violated requirement: K1 and `IDENTITY_AND_MERGE_SCHEME.md` — any confirmed phone/e-mail is login-enabled;
primary selects default delivery, not authentication eligibility.

Current DEV happens to have no such row, but the production write supports and creates it:

```text
sudo -n -u postgres psql ... -d bcb_webapp_dev -Atqc
  "BEGIN READ ONLY; SELECT 'confirmed_nonprimary='||count(*) FROM public.user_contacts
   WHERE confirmed_at IS NOT NULL AND is_primary=false; ROLLBACK;"
-> confirmed_nonprimary=0
```

This is a reachable future state, not a claim about current DEV data.

### MF-5 — the candidate's targeted integrator behavior suite is red

The candidate changed the canonical write/query shape but did not update the existing in-memory behavior model.
One assertion still expects the removed scalar phone and two paths reject the new canonical SQL. This is not a
cosmetic test-name issue: the repository's ordinary integrator test command includes this file and exits nonzero.

Impact: the candidate cannot pass its relevant test gate, and create/enrich plus phone-history behavior is not
currently regression-proved by that suite.

Violated requirement: the audit brief's targeted behavior-suite gate and AGENTS.md test policy.

```text
pnpm --dir apps/integrator exec vitest --run \
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts \
  src/infra/db/userUpsert.identity.test.ts \
  src/infra/adapters/deliveryTargetsPort.test.ts
-> exit 1; 1 file failed, 2 passed; 3 tests failed, 37 passed
```

### MF-6 — manual merge rewrites OAuth contact provenance to `direct`

Reachable scenario: support manually merges accounts and chooses an OAuth-origin phone or e-mail as the surviving
primary. `merge-from` first transfers the canonical row without changing its provenance. Lines 762-768 then
upsert the selected value with a hard-coded `sourceOrigin: 'direct'`; the mutation root unconditionally assigns
that value at `userContactsMirrorWrite.ts:82-86`. No direct proof was created by the merge.

Impact: canonical provenance is corrupted from `oauth` to `direct`. Provider bindings remain separate facts, but
the canonical contact's own provenance no longer describes its origin.

Violated requirement: K4 — merge must preserve deterministic ownership/primary/confirmed/**provenance** semantics;
history and provider bindings are facts, not justification to overwrite the canonical provenance field.

Exact inspection:

```text
nl -ba packages/platform-merge/src/pgPlatformUserMerge.ts | sed -n '752,778p'
-> lines 766-767: selected phone and e-mail both use `sourceOrigin: 'direct'`

nl -ba packages/platform-merge/src/userContactsMirrorWrite.ts | sed -n '78,96p'
-> line 85: `source_origin = ${mutation.sourceOrigin}::text`
```

## Kill-class result

| Class | Result         | Evidence                                                                                                                                                                                                                                   |
| ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| K1    | **NOT CAUGHT** | Cross-account fail-closed mutation was killed by both OAuth suites, but the shipped primary-only trusted-phone predicate violates equal-rights confirmed-contact login (MF-4).                                                             |
| K2    | **KILLED**     | Removing the canonical write from messenger phone bind made its behavior test fail; exact callgraph found six mutation callers, one production direct-DML file, and no reverse-mirror symbol.                                              |
| K3    | **NOT CAUGHT** | Exact catalog/callgraph inspection found the unreplaced live `read_current_patient_identity_contacts()` scalar reader (MF-2).                                                                                                              |
| K4    | **NOT CAUGHT** | Manual merge overwrites OAuth provenance (MF-6), and removing the entire `merge-from` contact transfer left all four existing merge tests green. There is no acceptance test for canonical contact transfer/provenance/tombstone behavior. |
| K5    | **NOT CAUGHT** | Ordering/access-DDL/generator gates pass, but parity and final dependency/body gates make the one-off migration inapplicable (MF-1 through MF-3).                                                                                          |
| K6    | **KILLED**     | Strict builds/typechecks, scoped lint, raw-SQL and architecture gates pass; exact diff adds no TypeScript `any` and no D15b/7-named scope.                                                                                                 |
| K7    | **NOT CAUGHT** | Current named DEV fails the actual parity precondition and the forward migration cannot pass its own body check. No TEST/PROD/live operation was attempted.                                                                                |

## Independent fault injection

All mutations were made only in the audit worktree and restored immediately.

1. Replaced the cross-account OAuth conflict condition with an always-false guard.

   ```text
   pnpm --dir apps/webapp exec vitest --run \
     src/modules/auth/oauthWebLoginResolve.unit.test.ts src/modules/auth/oauthVkResolve.unit.test.ts
   -> exit 1; 2 failed, 16 passed; both case-6 tests rejected the mutation
   ```

2. Returned before `mutateCanonicalUserContacts()` in messenger phone binding.

   ```text
   pnpm --dir apps/integrator exec vitest --run \
     src/infra/db/messengerPhonePublicBind0380.unit.test.ts
   -> exit 1; 1 failed; expected canonical contact row was absent
   ```

3. Removed the `merge-from` mutation from `mergePlatformUsersInTransaction()`.

   ```text
   pnpm --dir apps/webapp exec vitest --run src/infra/accountMergeMedicalHistory.unit.test.ts
   -> exit 0; 4 passed; mutation survived, therefore K4 is not caught
   ```

After restoring all three mutations:

```text
pnpm --dir apps/webapp exec vitest --run \
  src/modules/auth/oauthWebLoginResolve.unit.test.ts \
  src/modules/auth/oauthVkResolve.unit.test.ts \
  src/infra/accountMergeMedicalHistory.unit.test.ts
-> exit 0; 3 files, 22 passed

pnpm --dir apps/integrator exec vitest --run \
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts
-> exit 0; 1 file, 1 passed
```

No source-string test was added for one-off migration/reference absence. No weak SQL-text test was added to mask
the missing K4 behavioral acceptance coverage.

## Exact census and inspection outcomes

Whole synchronized diff:

```text
git diff --stat 2435c795f096423ffa5a3187a80c629d7c791c95..8d907c1e8da508ac7a3092b1e6fc6435644f1913
-> 79 files changed, 5466 insertions(+), 1112 deletions(-)

git diff --name-only 2435c795f096423ffa5a3187a80c629d7c791c95..8d907c1e8da508ac7a3092b1e6fc6435644f1913 | wc -l
-> 79
```

Production contact census:

```text
rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  'platformUsers\.(phoneNormalized|patientPhoneTrustAt|email|emailNormalized|emailVerifiedAt)|platform_users\.(phone_normalized|patient_phone_trust_at|email|email_normalized|email_verified_at)' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
-> 0

rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' 'mutateCanonicalUserContacts\(' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src \
  | rg -v 'export async function mutateCanonicalUserContacts' | wc -l
-> 6

rg -l --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  '(INSERT INTO|UPDATE|DELETE FROM) public\.user_contacts' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
-> 1 (`packages/platform-merge/src/userContactsMirrorWrite.ts`)

rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  'syncUserContactsMirror|syncUserContactsPhoneMirror|clearDuplicate(User)?ContactsMirror' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
-> 0
```

Migration/static scope:

```text
rg -in '<GRANT|REVOKE|ROLE|OWNER TO|POLICY|RLS statement families>' \
  apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql | wc -l
-> 0

git diff --unified=0 2435c...8d907 -- '*.ts' '*.tsx' \
  | rg '^\+[^+].*\bany\b|^\+[^+].*as any|^\+[^+].*: any' | wc -l
-> 0

git diff --name-only 2435c...8d907 | rg -i 'pseudonym|medical.subject|subject.identity|d15b7' | wc -l
-> 0
```

Read-only DEV catalog:

```text
SELECT column_name FROM information_schema.columns ...
  AND column_name IN ('phone_normalized','email','email_normalized','email_verified_at','patient_phone_trust_at')
  ORDER BY 1;
-> email, email_normalized, email_verified_at, patient_phone_trust_at, phone_normalized

SELECT count(*) FROM pg_depend ... WHERE deptype NOT IN ('i','a');
-> noninternal_dependencies=0

SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
  FROM pg_proc ... WHERE p.prosrc ~ '<migration legacy-body regex>';
-> 30 current function bodies match
```

The zero `pg_depend` count does not clear PL/pgSQL string bodies; that is why exact body/callgraph inspection found
MF-2 and why the migration includes a body scan. The scan implementation itself is MF-3.

## Commands and gates

Passed:

```text
pnpm --dir packages/platform-merge run build
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/db-principal run build
pnpm --dir packages/error-tracking run build
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/integrator run typecheck
-> all exit 0

pnpm --dir apps/webapp exec vitest --run <8 targeted auth/contact/merge files>
-> 8 files, 41 tests passed

bash apps/webapp/scripts/check-drizzle-migration-order.sh
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
node scripts/check-migration-privileges.mjs
node scripts/check-migration-privileges.mjs --self-test
node scripts/check-c4-migration-owned-function-bodies.mjs
node --test deploy/postgres/privileges/migration-order.test.mjs
-> exit 0; migration-order suite 22 passed

node deploy/postgres/privileges/generate-cli.mjs --check
-> four generated privilege/allowlist artifacts byte-identical

node --test deploy/postgres/privileges/function-census.test.mjs
-> 19 passed

node scripts/check-no-new-raw-sql.mjs
-> OK; production debt 0
node scripts/check-db-chokepoint.mjs
node scripts/check-webapp-infra-import-boundary.mjs
node scripts/check-webapp-infra-import-boundary.mjs --self-test
-> all exit 0; boundary self-test rejected 7 bypass forms

git diff --name-only 2435c...8d907 -- 'apps/webapp/**/*.ts' 'apps/webapp/**/*.tsx' \
  | sed 's#^apps/webapp/##' | xargs pnpm --dir apps/webapp exec eslint --no-warn-ignored
git diff --name-only 2435c...8d907 -- 'apps/integrator/**/*.ts' \
  | sed 's#^apps/integrator/##' | xargs pnpm --dir apps/integrator exec eslint --no-warn-ignored
-> both exit 0
```

The first isolated `pnpm --dir apps/webapp run typecheck` attempt failed because freshly installed dependencies
had no built workspace declarations (`@bersoncare/db-principal`, `operator-db-schema`, `error-tracking`). No gate
was weakened: those three packages were built by their normal scripts, then both application typechecks were
rerun and passed.

Failed:

```text
pnpm --dir apps/integrator exec vitest --run \
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts \
  src/infra/db/userUpsert.identity.test.ts \
  src/infra/adapters/deliveryTargetsPort.test.ts
-> exit 1; 3 failed, 37 passed (MF-5)
```

## NOT DONE live/destructive gates

- NOT DONE: `migrate-dev.sh --preflight` or `--execute`; the exact precondition was inspected read-only and already
  fails. No migration was applied.
- NOT DONE: any DB write, disposable database, restore/reset, historical replay, TEST, PROD, deploy, or push.
- NOT DONE: live Telegram/MAX login/bind/delivery journey; it requires a successfully applied DEV cutover.
- NOT DONE: full CI, explicitly forbidden by the audit brief.

Temporary fault mutations were restored before validation. The committed audit changes only this report; product
code and candidate tests are unchanged.
