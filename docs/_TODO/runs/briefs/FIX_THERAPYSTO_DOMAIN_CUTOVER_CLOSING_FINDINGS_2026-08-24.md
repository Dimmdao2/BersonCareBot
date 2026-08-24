# Fix Therapysto future-domain cutover closing findings

## Role and authority

You are the single implementation fixer for the already-audited future-domain cutover package.
Read `AGENTS.md` and obey the route, especially sections 1, 7, 9, 10a, 10b, and 24. The owner explicitly
wants the future domain scheme completely prepared in this separate branch, while the currently running
`test.bersoncare.ru` scheme must remain untouched. The complete finding authority is:

- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/CLOSING_AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md`
- candidate/audit HEAD `2c153e8c49f9311e860f805628e8a40e39c892cb`

Источник оракула: `/home/dev/dev-projects/bcb-wt-therapysto-domain-cutover-ready-20260824/docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/CLOSING_AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` — «Four reachable gaps remain».

Fix exactly CF1-CF4 in one coherent pass. Do not invent adjacent product work.

## Required outcome

1. Remove the `.test.example` or any other hostname-based exception to the requirement that platform and
   exact custom hosts use distinct certificate/key pairs. Tests must use genuinely distinct fixture pairs.
2. Reject `--offline --apply` before DNS, TLS, `sudo`, services, files, or any other host effect. Offline is
   validation/rendering only.
3. A successful real apply must mean runtime inputs are active and proven:
   - verify the DB-backed `yandex_oauth_redirect_uri` is exactly the two callbacks required by the approved map,
     without printing secrets;
   - activate the changed TEST webapp environment by restarting the documented TEST webapp service;
   - health-check the restarted webapp with the correct Host header before reporting success;
   - rollback env/nginx independently on every partial failure, and restore/restart runtime consistently if the
     new webapp activation or health gate fails.
4. Make the rollback acceptance scenario hermetic: it must use only temp files/fake commands, prove that mutation
   happened and restoration followed, and never read `/opt/env/bersoncarebot/webapp.test` or any live env/secret.
5. Correct the runbook so its success/rollback sequence exactly matches the executable behavior.

Prefer parameterizing existing script seams over adding parallel wrappers or another cutover path. Keep the
existing TEST nginx renderer byte-for-byte composed into the future config. Do not weaken fail-closed routing,
owner digest binding, DNS equality, TLS hostname/key validation, or monitoring.

## Absolute boundaries

- Work only in this worktree/branch. Do not merge or push.
- Do not deploy or apply. Do not mutate DNS, TLS, nginx, env, systemd, DB, cron, DEV, TEST, or PROD.
- Do not read live env files or secret values. Use hermetic temp fixtures and fake command seams.
- Do not touch the currently active old-domain configuration.
- Do not run full CI; run the existing targeted cutover gates and syntax/static checks.
- Run long commands in the foreground and wait for them.
- Commit all task files explicitly before the end of the one turn; `git add -A` is forbidden.

## Acceptance

Run and report exact results for:

- `node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs`
- `node deploy/host/therapysto-domain-cutover.test.mjs`
- `bash -n deploy/host/apply-test-nginx-webapp.sh deploy/host/therapysto-domain-cutover.sh deploy/host/check-therapysto-domain-certificates.sh`
- `node --check deploy/host/therapysto-domain-cutover.acceptance.test.mjs`
- `node --check deploy/host/therapysto-domain-cutover.test.mjs`
- `git diff --check`

The 11 committed acceptance scenarios must all pass. Add or strengthen only behavior-level coverage needed for
CF3/CF4. Prove by explicit assertions that offline apply never reaches sudo, rollback reached real fake mutation
before restore, DB mismatch blocks before mutation, restart occurs only after installed validation, correct Host
health is required, and a failed restart/health restores the old env/nginx/runtime state.

End with the commit SHA, concise changed-file list, exact checks, and confirmation that no live state was read or
mutated.
