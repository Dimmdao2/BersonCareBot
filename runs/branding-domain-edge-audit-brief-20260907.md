# Independent auditor-live brief — automatic custom-domain TLS edge (#787)

Тест или взгляд: сначала классифицируй каждый пункт независимо по AGENTS.md §10a/§24.4.

## Provenance and authority

- Human owner: Dmitry. Only owner-marked text in repository records is an owner decision.
- Orchestrator: assigns this bounded independent audit; these instructions are not owner canon.
- Auditor: independently gates candidate `6253a346c` in branch `wt/branding-domain-edge-20260907`.

Read `AGENTS.md` headings first, then §1/§1b/§9/§10/§10a/§10b/§24 in full, `README.md`,
`docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, and the owner scope in
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` B7/B8/C5a. Also read the edge
research/runbook and existing blue-green/nginx scripts. Use code-search before broad grep.

## Scope and independence

Audit only `c8eb16f7a..6253a346c`: the Caddy/on-demand TLS edge, coexistence with the documented single-IP nginx
blue-green production topology, health signal, cutover and rollback documentation/scripts. Do not audit or edit
application Host resolution, DB lifecycle, settings UI, unrelated production pipeline work, or live hosts.

Before reading existing/new tests, derive a blind kill-set from the authority above. For every item classify
`test` or `view` under §10a/§24.4. Inspect the actual diff and scripts. Only repeatable stable behavior may receive
an automated acceptance test; do not write tests that grep source prose, pin command text, or assert incidental
file layout. One-shot config/server-fact checks are views.

You may commit only genuinely missing acceptance tests and one audit artifact under the initiative audit area.
Do not fix product or deploy code. Revert every fault injection before committing. Never contact PROD, never run
sudo, never install/start/stop/reload services, never alter DNS, certificates, firewall, cron, nginx or Caddy on
any live host. Local syntax/render validation is allowed.

## Required kill-set coverage

At minimum independently judge these owner-required consequences:

1. The design works with the one documented public IP and does not assume or encode an unconfirmed second IP or
   stale host identity.
2. Existing platform hosts and nginx blue/green switching remain reachable through the edge; the application
   receives the original external Host and correct forwarded scheme/client chain.
3. Only approved custom hosts can trigger on-demand issuance; an unavailable/denying ask path fails closed. Confirm
   that the chosen Caddy ask mechanism and the application-side authentication contract can actually interoperate.
4. Per-tenant nginx/Certbot work is absent; certificate issuance and renewal are automatic with durable storage.
5. HTTP-01 can own public port 80; public 80/443 handoff, preflight, rollback and failure windows are explicit and
   operationally coherent. A failed cutover must have a reachable recovery path.
6. Platform `<slug>.therapygo.ru` traffic does not create an unbounded per-slug ACME/registered-domain rate-limit
   failure. B7 explicitly requires both `therapygo.ru` and `*.therapygo.ru`; judge whether the candidate actually
   meets that requirement or honestly remains non-land-ready.
7. The health/expiry signal observes the real certificate storage and can be scheduled without duplicating or
   contradicting the existing domain-health monitor.
8. TEST/VPN behavior and current servers are not silently changed by repository-only work.
9. Env examples contain no secrets and app-facing DNS values have one non-drifting source appropriate to the repo's
   env/config rules.

Fault-inject each repeatable class that has a suitable test seam; otherwise give exact view evidence. Findings are
only reachable violations with scenario, impact and exact owner/repo requirement. Alternative architecture/style is
not a finding.

## Deliverables

- Write one audit artifact with: candidate SHA; blind kill-set; per-item `test/view`; files and canonical facts read;
  commands and exact results; fault injections and proof they were reverted; binary PASS/FAIL; concrete MUST FIX
  findings; remaining live/owner gates.
- If and only if stable acceptance tests are missing, add them once, demonstrate the relevant injection makes them
  red, restore production code, rerun green, and commit tests + artifact explicitly (never `git add -A`).
- Record the verdict through the audit queue mechanism required by the launcher.
- End only after the foreground checks finish and any allowed changes are committed. Return artifact path, commit
  SHA if any, exact verdict, and residual blockers. Do not push.
