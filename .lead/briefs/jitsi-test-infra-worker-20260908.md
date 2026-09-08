# Worker brief — #1100 self-hosted Jitsi + coturn TEST package

You own the complete Wave 1 stream C operational package. Work only in the supplied clean clone and branch.

## Authority and rules

Read `AGENTS.md` first: universal rules; §1/§1b server and environment gates; §§2–4 config/secrets; git/validation
§§7/9/10; orchestration §24. Read `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, existing deploy patterns, and
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`. Use official Jitsi/coturn documentation as the external protocol source.

Implement VM-01..06, the infrastructure side of VM-02/03/04, and Wave 1 stream C:

- fully self-hosted Jitsi; no JaaS, meet.jit.si, 8x8 or foreign runtime service;
- exactly two simultaneous Prosody/MUC occupants, enforced server-side even for a duplicate JWT subject;
- Jitsi 1:1 P2P first; direct ICE failure uses only our coturn; our JVB is the non-P2P fallback path;
- no external STUN/TURN, telemetry/callstats/analytics/avatar/Giphy/YouTube/calendar/invite integrations;
- no Jibri/Jigasi, recording, transcription or conference-only UI;
- minimal controls for camera, microphone and hangup, no Jitsi branding;
- time-limited TURN credentials via Jitsi/Prosody XEP-0215/coturn shared-secret mechanism, never static browser
  credentials;
- secure-domain/JWT room-role-subject-expiry contract compatible with the provider adapter, without putting app JWT
  signing secrets in host env.

## Deliverable

Build a version-pinned, reviewable TEST deployment package following existing repo conventions. Prefer the smallest
officially supported Docker/Jitsi topology that provides web, Prosody, Jicofo, JVB and coturn while preserving P2P.
Include:

1. templates/config generation with every endpoint explicit and no third-party default inherited;
2. Prosody/Jitsi JWT and ephemeral TURN integration, MUC max occupants 2, JVB advertised-address/media-port contract,
   UDP plus TLS TURN fallback, and a minimal explicit media/relay port range;
3. no secret values in git, command lines or logs; app JWT signing secret remains in `system_settings`, while only
   host-side Prosody/JVB/coturn material uses the TEST secret store;
4. idempotent TEST-only install/apply, health, configuration/network proof, restart and rollback commands/scripts;
5. exact proposed nftables/Selectel SG diff and DNS/TLS prerequisites, fail-closed host identity checks, and no
   operation against either PROD host;
6. runbook for two synthetic browser contexts, a third-participant refusal, direct P2P ICE stats, forced TURN, JVB
   fallback and DNS/network capture proving no foreign runtime endpoints.

Do not actually provision DNS, buy a node, modify firewall, SSH, start shared services, read secrets or mutate
DEV/TEST/PROD in this worker. The lead will execute the reviewed package on TEST after product integration. If the
canonical TEST host cannot safely host the media stack, encode the requirement and detection probe rather than
inventing an address.

## Excluded

No webapp schema/routes/UI/notes/tariff/notifications, no PROD config or rollout, no recording/transcription. Do not
change plan checkboxes; the lead owns evidence.

## Validation and handoff

Workers do not write, edit or delete tests. Add operational health/config-check commands only when they are part of
the product deployment contract, not source-string test files. Run shell/YAML/config syntax checks, scoped lint if
applicable, `git diff --check`, and any safe dry/check mode. Do not run full CI.

Commit every task file with explicit path staging (never `git add -A`), message containing `#1100`, why, evidence,
the plan stage and what remains. Do not push. Report exact SHA, pinned versions, proposed ports/DNS, validation and
the exact remaining TEST prerequisites. Do not end the turn waiting for any background operation.
