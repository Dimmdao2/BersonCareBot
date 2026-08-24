# TEST start OAuth projections — independent audit

Date: 2026-08-24

Candidate: `13f2e1920536eaeeb1cc34c5ea2394c6d03002a7`

Verdict: **FAIL**

## Finding

### F1 — malformed restricted values are published as `configured=true`

**Reachable scenario.** A platform operator can PATCH any of the restricted OAuth source keys with
an arbitrary JSON value: the route schema accepts `value: z.unknown()`
(`apps/webapp/src/app/api/admin/settings/route.ts:214-217`), the shared normalizer preserves the
inner value without type validation
(`apps/webapp/src/modules/system-settings/adminSettingsPatchNormalize.ts:4-12`), and there is no
OAuth-key-specific validation before the canonical `system_settings` write at route line 683 and
below. Object, boolean, number and array values therefore reach the single canonical data-root via
the normal platform settings write-path; no raw SQL or hypothetical corruption is required.

The candidate tests only
`NULLIF(btrim(setting.value_json ->> 'value'), '') IS NOT NULL`
(`20260824T154700_derive_public_oauth_availability_at_read.sql:74-76`). PostgreSQL converts all four
malformed JSON types used by the probe to non-empty text, so a provider with the otherwise complete
set is returned as configured. With its surface toggle on,
`isOAuthProviderEnabled()` publishes the provider because it computes `enabled && configured`
(`apps/webapp/src/modules/auth/authChannelPolicy.ts:104-113`). The provider config reader then
stringifies those non-string values
(`apps/webapp/src/infra/repos/pgSystemSettings.ts:159-173,210-215`), so OAuth starts with invalid
credentials/redirect configuration instead of failing closed at availability. This is the same
human-visible failure class as the observed TEST start outage: a visible/enabled OAuth path cannot
complete.

**Violated authority.** Brief item 2 requires every empty or malformed required value to produce
`false`, without a 500 or value leak. `apps/webapp/src/modules/auth/authChannelPolicy.ts` requires a
safe indication of complete provider configuration.

**Behavior evidence.** One foreground `psql` process was used; its stdin was one transaction:
`BEGIN`, exact candidate migration bytes under the declared owner, synthetic rows, named accepted
`pre_session` context with the exact typed-argument hash before every call, assertions, then an
explicit `ROLLBACK`.

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev
```

The command emitted `SUMMARY|checks=60|failures=4`. The only failed assertions were
`object_value_false`, `boolean_value_false`, `numeric_value_false`, and `array_value_false`; each
observed `configured=true` where the oracle required `false`. It did not select or print any stored
credential value. The first harness attempt tried `\i` and failed at filesystem traversal before
fixtures or product calls; the successful run streamed the exact migration bytes through stdin.

**Required lead action.** Do not land or deploy the candidate as-is. Make the derived predicate
accept only a non-empty JSON string value (and keep all other cases false), then rerun the same
rollback-only behavior matrix.

## Test-or-view classification

This classification was recorded after reading `AGENTS.md` sections 10a, 10b and 24 completely and
before reading existing tests.

| Brief item | Classification | Independent oracle |
|---|---|---|
| 1 | mixed: test + view | Calls prove derived booleans; catalog/count-only inspection proves no physical projection row or second write-path. |
| 2 | test | Complete, missing, empty, whitespace, malformed and absent inputs must return booleans without exception or value disclosure. |
| 3 | test | Exact provider matrices and cross-provider isolation are observable behavior. |
| 4 | test | Existing SMS-derived output, ordinary public keys and surface toggles are regression behavior. |
| 5 | test | Calls for every restricted source key must return no public row. |
| 6 | mixed: test + view | No-context refusal is behavior; owner, SECURITY DEFINER, EXECUTE wall, relation surface and absence of rights DDL are catalog/static inspection. |
| 7 | view | Candidate diff must contain no domain, Therapysto, UI or route file. |

## Blind kill-set

Written before inspection of existing tests:

- full provider set is true; every single required-key omission is false;
- empty string, whitespace, missing envelope value, JSON null, object, boolean, number and array are
  false and never throw from the public projection;
- exact source sets are Yandex (client id, client secret, redirect URI), Google (client id, client
  secret, specifically `google_oauth_login_redirect_uri`), Apple (client id, redirect URI, team id,
  key id, private key), and VK (application id, client secret, redirect URI);
- each provider remains false while another provider alone is complete;
- absent entire sets are false;
- SMS doctor precedence/admin fallback, ordinary public keys and auth surface toggles retain their
  old output;
- each raw restricted source key returns no row through the public function;
- an unaccepted session is refused;
- no physical OAuth projection row, new right, role, policy, relation or write-path appears;
- function owner, SECURITY DEFINER, EXECUTE wall, accepted-context identity and relation access stay
  exact;
- candidate diff contains no domain, Therapysto, UI or route change.

## Rollback-only DEV result

The single-transaction named DEV probe loaded the exact candidate function and used synthetic,
non-secret marker values only. Its passing assertions covered:

- all complete sets and all single required-key omissions for the exact Yandex/Google/Apple/VK key
  lists;
- isolated provider matrices (the selected complete provider true, every other provider false);
- absent sets, empty string, whitespace and missing `value` false;
- no-context refusal with SQLSTATE `42501`;
- no public rows for any restricted source key;
- no physical OAuth projection row before or after calls;
- unchanged SMS doctor-over-admin precedence and admin fallback;
- unchanged ordinary public key and surface-toggle values;
- declared function owner, SECURITY DEFINER flag, EXECUTE ACL and relation access.

It failed only the malformed-type class documented as F1. `ROLLBACK` executed after the summary and
before process exit. An independent post-probe read-only check used:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d bcb_webapp_dev -At <<'SQL'
BEGIN READ ONLY;
SELECT 'projection_rows=' || count(*) FROM public.system_settings
 WHERE key IN ('oauth_yandex_enabled','oauth_google_enabled','oauth_apple_enabled','oauth_vk_enabled');
SELECT 'candidate_body_present=' || (position('provider_requirement' in p.prosrc) > 0)
 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'app' AND p.proname = 'read_public_runtime_setting'
   AND pg_get_function_identity_arguments(p.oid) = 'p_key text, p_scope text';
ROLLBACK;
SQL
```

Output: `projection_rows=0`, `candidate_body_present=false`, followed by `ROLLBACK`. Thus neither
the candidate function nor synthetic rows persisted on DEV.

## Item verdicts

| Brief item | Verdict | Evidence |
|---|---|---|
| 1 | PASS | All projection calls were derived from restricted rows; projection-row census stayed empty. |
| 2 | **FAIL** | Missing/empty cases were safe, but the four malformed JSON type classes returned true (F1). |
| 3 | PASS | Exact required sets and provider isolation passed. Google uses `google_oauth_login_redirect_uri`. |
| 4 | PASS | SMS-derived, ordinary public and surface-toggle probes passed. |
| 5 | PASS | Every restricted source-key call returned no row; no value was printed. |
| 6 | PASS | Named context/refusal and owner/ACL/relation inspections passed; migration contains no rights DDL. |
| 7 | PASS | Candidate commit changes only the named migration file. |

## Preflight, rights and census gates

```bash
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
```

PASS: owner-ordered validation rolled back on `bcb_webapp_dev`; output reported
`pending=1 total=77 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0`.

```bash
node scripts/check-migration-privileges.mjs
node scripts/check-migration-privileges.mjs --self-test
```

PASS: `OK (78 migration files)` and `self-test OK (7 red fixtures, 1 green fixture)`.

```bash
node --experimental-strip-types --test deploy/postgres/privileges/function-census.test.mjs deploy/postgres/privileges/relation-access.test.mjs
```

PASS: `tests 56`, `pass 56`, `fail 0`.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check
```

PASS: DEV and TEST privilege/allowlist artifacts match the declaration byte-for-byte.

```bash
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --census
```

PASS: `bcb_webapp_dev` census checked `208 ACTIVE relations across 3260 source files`.

```bash
node --experimental-strip-types deploy/postgres/privileges/seam-owner-access-census.mjs --db bcb_webapp_dev
```

PASS: `owners=43`, `requirements=1349`, `missing_or_partial=0`; the settings runtime owner remains
membership-free and read-only on its declared relations.

```bash
git diff --name-only 13f2e1920^ 13f2e1920
```

PASS: only
`apps/webapp/db/drizzle-migrations/20260824T154700_derive_public_oauth_availability_at_read.sql`.

`bash apps/webapp/scripts/check-drizzle-migration-order.sh` could not reach its final online-index
subcheck because this worktree intentionally has no local `node_modules`; Node reported missing
`dotenv`. The owner-aware migration preflight above independently executed the pending candidate in
order and rolled it back. A combined run that added `port-context-catalog.test.mjs` similarly could
not load local `typescript`; the two directly relevant rights suites were rerun alone and are green.
These are harness dependency absences, not product findings.

## Permanent acceptance-test decision

No permanent test was added. A SQL-text assertion would violate `AGENTS.md` section 10a and would
miss the malformed-value behavior. The honest signal requires a named live DEV database, exact
candidate materialization, privileged installation of a synthetic accepted context, fixture writes
and rollback; that is not a cheap default test. The one-off rollback matrix is the appropriate audit
proof. Product code and migration were not changed; no TEST, PROD, deploy, domain or Therapysto
action was performed.
