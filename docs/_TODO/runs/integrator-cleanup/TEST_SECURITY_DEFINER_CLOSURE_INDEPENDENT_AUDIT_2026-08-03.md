# TEST SECURITY DEFINER closure fixer — independent audit

Candidate: `5d77eb569` (`wt/trackd-test-security-definer`), last recorded green TEST baseline:
`00ddf35bd`.

Verdict: **PASS к land/deploy**. Audit changed documentation only; no deploy, migration, service restart or
persistent database write was performed.

## Result

- The candidate itself changes only `deploy/host/deploy-test-saas.sh`: 31 additions, 3 deletions. The large
  repository diff from `00ddf35bd` is intervening landed work, not fixer scope.
- Catalog delta is exactly four `app_owner` `SECURITY DEFINER` functions: fixed-key auth-channel read,
  argless platform-availability read, incident open/touch, and argless reclaim-config read. The first, second
  and fourth touch only `public.system_settings`; the incident capability needs `operator_incidents`
  `SELECT+INSERT` and column-scoped `UPDATE(last_seen_at, occurrence_count, error_detail)`.
- The required-table extraction contains exactly 114 `(table, privilege)` rows. Candidate adds the two missing
  incident rows rather than merely changing the display count. All five pinned column grants are present.
- Live read-only TEST catalog evidence: `app_owner` owns exactly `148` SECURITY DEFINER functions. Exact ACLs
  are owner + login for auth-channel/platform; owner + login + delivery-worker for incident; owner +
  delivery-worker for reclaim. Both runtime principals have no direct `system_settings SELECT` or
  `operator_incidents` DML.
- The exact gate missing-set is empty. A read-only fault-equivalent changed only the predicate result to treat
  `public.operator_incidents INSERT` as absent; the same query returned
  `public.operator_incidents INSERT`. This proves the new required grant fails closed without mutating TEST.

## Evidence

- `bash -n deploy/host/deploy-test-saas.sh` — PASS.
- `git diff --check 5d77eb569^..5d77eb569` — PASS.
- `git diff --name-only 5d77eb569^..5d77eb569 | wc -l` — `1`.
- `sed -n '1007,1169p' deploy/host/deploy-test-saas.sh | rg -c "^    \\('[^']+', '[^']+'\\),?$"` — `114`.
- `git diff -U0 5d77eb569^..5d77eb569 -- deploy/host/deploy-test-saas.sh | rg -c "^\\+    \\('[^']+', '[^']+'\\),?$"` — `2`.
- Four-function extraction from `00ddf35bd..5d77eb569` — `4`; expected pin changes `144 -> 148`.
- `sudo -u postgres psql -d bersoncarebot_test ... SELECT count(*) ... p.prosecdef` — `148`.
- Exact 114-row required-set query against TEST — empty missing-set.
- Same read-only query with simulated absent `operator_incidents INSERT` — one missing row, exactly
  `public.operator_incidents INSERT`.
- Five-column `has_column_privilege(..., 'UPDATE')` pin query — `5/5`.

TEST was queried read-only. DEV and PROD were not touched.
