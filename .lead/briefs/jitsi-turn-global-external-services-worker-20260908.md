# Worker brief — #1100 browser TURN credentials via upstream global external_services

## Role and authority

You are the implementation worker for the bounded correction below. Read `AGENTS.md` header map, core rules,
§1/§1b/§7/§9/§10/§24 and the relevant `deploy/jitsi/` docs before acting. Authority is the owner's active
video-meetings plan `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, specifically VM-03 and VM-04: P2P first,
our RF-hosted coturn as the only STUN/TURN fallback, and no foreign runtime endpoint.

Work only in the clone supplied by the orchestration port. Do not touch DEV/TEST/PROD services, host env,
databases, DNS, nginx, Docker, or `/opt/projects/bersoncarebot-test`. Do not launch agents. Do not write tests.
Do not edit the application/UI/database. Allowed scope is `deploy/jitsi/**` plus one factual audit/evidence note
under `docs/audit/**` if needed. Stage explicit paths only, commit before ending, and do not push.

## Reproduced defect

Live TEST evidence on integration SHA `71ea8a3caacb`:

- two synthetic Chromium contexts complete the doctor→guest call over direct P2P and exchange video;
- Prosody returns three valid XEP-0215 services (own STUN, own TURN/UDP, own TURNS/TCP) with ephemeral
  timestamp+HMAC credentials;
- nevertheless final `jingle.p2pIceConfig.iceServers` and `jingle.jvbIceConfig.iceServers` are empty;
- both clients log `onReceiveStunAndTurnCredentials -> XMLUtils.findAll -> querySelectorAll is not a function`;
- live introspection proves `external_services.get_services()` has 3 items on the main VirtualHost but 0 on the
  room-metadata component host. That component sends JSON `services={}`; stable-11146-2 treats it as a non-array,
  errors, then overwrites both ICE configurations with `[]`.

The pinned upstream docker-jitsi Prosody template already has the correct shared/global mechanism. When
`STUN_HOST`/`TURN_HOST`/`TURNS_HOST` are set, it globally enables `external_services`; with `TURN_CREDENTIALS` it
generates short-lived TURN REST credentials (`secret=true`, `algorithm="turn"`). These variables are passed only
to Prosody by upstream compose, not exposed as static credentials in web `config.js`.

## Required implementation

Replace the custom host-local `XMPP_MODULES=turn_external` path with the pinned upstream global
`external_services` configuration:

1. In the non-secret Jitsi env template declare only our endpoints: STUN and TURN host
   `turn.test.bersoncare.ru`, UDP/TCP TURN port 3478, TURNS/TCP 5349, TTL consistent with the short session policy,
   and a `TURN_CREDENTIALS` placeholder populated from the existing generated coturn shared secret. Keep
   `TURN_USERNAME`/`TURN_PASSWORD` unset. Remove `turn_external` from `XMPP_MODULES`.
2. Extend the existing render/apply path so the same host-side generated HMAC secret is safely synchronized into
   the runtime Jitsi env value expected as `TURN_CREDENTIALS`, without printing it, putting it in argv, committing
   it, or weakening file permissions. Preserve idempotency and restart behavior. Prefer extending the existing
   single render path; do not create a second secret source or wrapper.
3. Remove the obsolete custom `mod_turn_external` rendered mount/template and every script assumption about it.
4. Update `health-check.sh` so it proves the global runtime configuration actually contains own STUN, TURN/UDP,
   and TURNS/TCP entries with secret-backed ephemeral credentials and so it detects the original split-context
   regression (main host populated while room-metadata sees an empty service list). Keep the real credentialed
   UDP and TLS coturn allocation probes. Never print credentials.
5. Correct `deploy/jitsi/README.md`, `RUNBOOK.md` or other package docs that currently claim the custom module is
   intentional. Document why the upstream global module is required for both direct extdisco IQ and initial room
   metadata. Do not broaden product scope.

Do not patch or fork Jitsi/lib-jitsi-meet. Do not put static username/password credentials in served JS. Do not add
foreign STUN/TURN. Do not redesign the stack.

## Verification and done

Run only proportional static/package checks available without touching shared services: `bash -n` for changed
scripts, syntax/render checks already used by this package where feasible, and `git diff --check`. Do not run full
CI. Do not call host deploy or live Docker lifecycle commands. Report exact commands and results.

Done means the whole correction is committed in `wt/jitsi-turn-global-external-services-20260908`, with a concise
report naming the commit SHA, changed files, validation, and anything that still requires lead-run live TEST proof.
