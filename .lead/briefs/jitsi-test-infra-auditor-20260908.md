# Тест или взгляд

Runtime/config generators, host guards, health and rollback behavior are tested at their public command boundary;
the concrete pinned topology, ports, external endpoint inventory and config contents are inspected. Do not create
tests that merely grep source strings or freeze incidental YAML/layout.

# Independent auditor-live — #1100 Jitsi/coturn TEST package

## Authority and exact candidate

You are the independent auditor of exact committed candidate `ed653358f` on branch
`wt/jitsi-test-infra-20260908`, based on `3249e88b5`. Before inspection read the `AGENTS.md` heading map and fully
read §1/§1b, §§2–4, §10a, §10b and §24; also read `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md` and authority
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-01..06 plus Wave 1 stream C. Official Jitsi/coturn docs are the
external protocol oracle.

Do not change product deployment code. You may commit only genuinely missing behavioral acceptance tests and a
concise audit artifact. Revert every fault injection and do not push, land, deploy, modify host firewall/nginx/DNS,
read secrets, start shared services or touch PROD. Safe local render/check/dry-run and ephemeral isolated container
validation are allowed only if the package explicitly supports them without host mutation.

## Blind kill-set — prepare before reading tests

Before opening tests/check scripts, name the observable failure/impact for each class:

1. Any browser/Jitsi component can contact meet.jit.si, 8x8, public STUN/TURN, analytics/callstats, avatar/Giphy,
   YouTube/calendar/invite or another undeclared foreign runtime endpoint (VM-01/04).
2. A room admits a third occupant, including duplicate subject/device, because the limit is only in app/JWT/UI and
   not enforced by Prosody/MUC (VM-02).
3. A two-party call uses JVB before P2P or direct ICE failure cannot fall back exclusively through own coturn/JVB;
   JVB discovers/advertises an external address through a foreign STUN service (VM-03/04).
4. TURN credentials are static/browser-persisted rather than time-limited XEP-0215/shared-secret material, or TLS/
   UDP fallback/relay range is internally inconsistent (VM-03/04).
5. Arbitrary users can create/join guessed rooms; JWT is not constrained by room/role/subject/expiry, or app signing
   secret is required in a host env/template/log (secure-domain contract and plan §3/4).
6. Jibri/Jigasi/recording/transcription or conference UI/branding is enabled or deployable (VM-05/06).
7. Apply can run on a PROD/unknown host, mutates before missing DNS/TLS/ports/secrets are detected, leaks a secret to
   argv/log/generated mode, is non-idempotent, or rollback cannot restore the exact reviewed state.
8. Health/proof reports green while a required component, P2P/TURN/JVB route, two-occupant guard or no-third-party
   policy is absent.
9. Proposed ports collide with canonical TEST services, firewall/SG diff is incomplete, versions/images are mutable,
   or the runbook cannot reproduce two contexts + third refusal + direct/TURN/JVB + network capture evidence.

Behavioral command checks need one temporary fault per independent protected class and a recorded red assertion.
One-time inventory/config properties are inspected/rendered and recorded, not cemented by source-text tests. If a
real executable defect is found, leave a failing acceptance test when appropriate and report it; do not fix product
scripts/config.

## Required checks and result

Inspect all candidate files and rendered outputs. Run package dry/check/render/config syntax, shell syntax,
Compose/container config validation if available, host-identity negative proof, secret-redaction/mode proof,
idempotency/rollback simulation that makes no host changes, scoped checks and `git diff --check`. Explicitly compare
the endpoint/DNS inventory against official Jitsi/coturn requirements and the repo TEST topology. Record live TEST
prerequisites separately; absence of DNS/cert is an external blocker only if the reviewed package correctly detects
it before mutation.

Return binary PASS or FAIL. Each FAIL names a reachable scenario, impact, exact plan ID/rule and evidence; style,
alternative architecture and optional hardening are not findings. Report exact candidate/auditor SHAs, pinned
versions, ports/DNS, commands/counts, kill-set/fault mappings and caught/uncaught totals. Commit only allowed tests
and audit artifact with explicit staging; otherwise leave tree clean. Do not end while a foreground process runs.
