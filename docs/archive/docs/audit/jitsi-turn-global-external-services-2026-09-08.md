# Jitsi global `external_services` correction — independent auditor-live pass (#1100 stream C)

Candidate: branch `wt/jitsi-turn-global-external-services-20260908`, exact SHA `1d49c1cee`, base `aac33cfa1`
(11 files, +126/−124). Authority: `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` VM-03/VM-04, `AGENTS.md`
§1/§1b/§7/§9/§10a/§10b/§24, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`,
`deploy/jitsi/README.md`, `RUNBOOK.md`. This pass modified no product/deploy code, touched no host, no TEST,
no PROD, no database, and read no secret value. Working tree was clean before and after except this file.

## Verdict: FAIL — 1 finding

The **configuration fix itself is correct** and its mechanism is proven against the pinned upstream
`stable-11146-2` templates and against real Prosody 13.0.x sources (§"Confirmed correct" below). The FAIL is
in the candidate's own verification gate: `bin/health-check.sh` asserts the fix through a `prosodyctl shell`
command that **does not exist in the Prosody version the pinned image installs**, so the gate is red on a
correctly configured stack and none of its new assertions ever execute.

## F1 (MUST FIX) — `bin/health-check.sh` can never pass; its new `external_services` assertions never run

`deploy/jitsi/bin/health-check.sh:136-175`.

**Reachable scenario.** Operator applies the candidate on TEST exactly as `install.sh` instructs
("run bin/health-check.sh to verify config actually landed") with a fully correct stack: global
`external_services` present, three service records on both hosts, ephemeral credentials issued, coturn
sharing the same HMAC secret. Run `bash deploy/jitsi/bin/health-check.sh`.

**Two independent defects, either one sufficient:**

1. **The command does not exist on the pinned Prosody.** `query_external_services()` runs
   `prosodyctl … shell services list "$host"`. The `services:list` shell command is added by
   `module:add_item("shell-command", { section = "services"; name = "list"; … })` — present only in Prosody
   **trunk** (`hg.prosody.im/trunk/…/mod_external_services.lua`, 291 lines, command at :254-290). It is
   absent from the entire 13.0.x line: `prosody-13.0.3` and `prosody-13.0.6`
   `plugins/mod_external_services.lua` are 244 lines and contain zero `shell-command` items (file ends at the
   extdisco `module:hook` calls). The pinned image installs 13.x — `docker-jitsi-meet@stable-11146-2`
   `prosody/Dockerfile` sets `ARG PROSODY_PACKAGE_VERSION="13.*"` and asserts
   `apt-cache policy prosody | grep Installed | grep -Eq " 13\."`.
   With `def_env["services"]` nil, `mod_admin_shell.lua:274-282` returns
   `nil, "Command not found. Is the necessary module loaded?"`, `send_result` emits
   `Error: Command not found. Is the necessary module loaded?` on stderr and `prosodyctl` exits 1.
   `2>&1` + `|| true` swallow both.

2. **Even on a version that has it, the count parser cannot match.** `service_count()` is
   `sed -nE 's/^([0-9]+) services$/\1/p'`, but the handler's `return true, ("%d services"):format(c)` is
   rendered by `mod_admin_shell.lua` as `result:text("OK: "..tostring(message))` →
   `prosody-13.0.6/plugins/mod_admin_shell.lua:392` (identical in 0.12 and trunk). The line on the wire is
   `OK: 3 services`, which the anchored regex rejects. `util/prosodyctl/shell.lua:99-113` (the
   non-interactive `arg[1]` path) writes the result text raw, so no `| ` prefix compensates either.

**Impact.** `main_service_count` / `metadata_service_count` are both the empty string, therefore:

- `check_external_service_set` takes its `[[ "$count" != "3" ]]` branch for **both** hosts and calls
  `bad "… exposes unknown external services …"` → `fail=1` → `RESULT: FAIL`, `exit 1`. The mandatory
  named-TEST health gate for VM-03/VM-04 is unreachable, and `install.sh`/`restart.sh` post-apply guidance
  never goes green.
- The split-context detector `[[ "$main_service_count" == "3" && "$metadata_service_count" == "0" ]]` — the
  one check written specifically to catch the regression this candidate fixes — is **dead code that can
  never fire**.
- The endpoint-set grep and the two-ephemeral-`username`/`password`/`expires`-triplet counts are never
  reached, so the fix has no working automated assertion; the only surviving evidence for it is the
  `grep -F '"external_services";'` source-text check at :127, i.e. AGENTS.md §10a ступень 3, not behaviour.
  (Confirmed the skipped assertions would otherwise be correct: against a faithful reconstruction of real
  handler output, the `stun (udp)`/`turn (udp)`/`turns (tcp)` greps match and `username` field_count = 2.)

**Rule violated.** AGENTS.md §10a — a check earns its place only if it reddens on the named breakage and not
otherwise; this one is red unconditionally and cannot detect its named breakage. Also the script's own
header contract ("Fails closed: a passing exit code means every check below actually passed") and this
candidate's amended `deploy/jitsi/README.md:122-129`, which states health-check "queries the upstream module
for both hosts, asserts own STUN, TURN/UDP and TURNS/TCP records plus two generated
username/password/expiry triplets" — not achievable on the pinned Prosody as written.

**Note for the fixer (not additional scope):** Prosody 13.0.x exposes no shell introspection for
`external_services`. A behavioural assertion on this version has to come from the protocol side (an
authenticated c2s `urn:xmpp:extdisco:2:services` IQ against each host) or from `prosodyctl shell` global-env
evaluation (`>` prefix) of the loaded module's `get_services()`; the choice is the lead's, not this audit's.

## Confirmed correct (kill-set cleared)

**The diagnosis and the mechanism are right, proven from source, not assumed.**

- `external_services` is enabled **globally**: upstream `prosody/rootfs/defaults/prosody.cfg.lua:138-140`
  puts `"external_services";` into the top-level `modules_enabled` when `TURN_HOST` or `TURNS_HOST` is set;
  `:352-353` sets global `external_service_secret = TURN_CREDENTIALS`; `:356-413` builds the global
  `external_services` array. `Include "conf.d/*.cfg.lua"` is line **441 of 441** and the file declares no
  `VirtualHost`/`Component`, so all three are true global scope.
- **Why the old host-local module produced an empty metadata list.** `default_component_inheritable_modules`
  (`core/modulemanager.lua:40-50`, applied at `:131-142`) does **not** contain `external_services`, so a
  Component never inherits it from global `modules_enabled`. But `mod_room_metadata_component.lua:79-80`
  does `module:depends("external_services")` and takes `get_services`, force-loading the module on
  `metadata.<XMPP_DOMAIN>` and using it to inject TURN credentials into the initial self-presence metadata
  push (its own header, lines 29-33). Under `XMPP_MODULES=turn_external` that forced instance had no
  configuration at all → zero services → browser ICE wiped. Under the global config it reads the same three
  records. Kill-set 1 cleared; both named contexts are genuinely covered.
- **`TURN_CREDENTIALS` is the HMAC shared secret, not a static password.** Each `turn`/`turns` record is
  emitted with `secret = true, algorithm = "turn"`; `mod_external_services`'
  `behave_turn_rest_credentials` sets `username = tostring(expires)` and
  `password = base64(hmac_sha1(secret, username))` per query (draft-uberti-behave-turn-rest). The static
  path is `TURN_USERNAME`/`TURN_PASSWORD` (`prosody.cfg.lua:377-383`, `:404-410`), correctly left unset and
  hard-asserted by `install.sh`. Kill-set 3 and 4 cleared.
- **Isolated merged Compose render** (pinned upstream `docker-compose.yml` + this override, synthetic env,
  `env -i` shell, throwaway project — exit 0): `TURN_CREDENTIALS` reaches **only** the `prosody` service;
  `TURN_USERNAME`/`TURN_PASSWORD` render as null and are therefore not passed (Go template `{{ if }}` skips
  them); `coturn` receives **no** environment at all — its secret arrives solely via the 0600
  `turnserver.rendered.conf` bind mount; the deleted `00-turn-external.rendered.cfg.lua` mount is gone and
  `prosody` carries only upstream's own three volumes. No static browser credential path exists.
- **One HMAC secret on both sides.** Single store file `turn-shared-secret` →
  `write_env_var_inplace … TURN_CREDENTIALS` (Prosody) and `__TURN_SHARED_SECRET__` substitution in
  `turnserver.rendered.conf` (coturn), same run, same value. `gen_if_missing` does not rotate on restart.
  Kill-set 2 cleared.
- **Shell-environment precedence — the added re-source is load-bearing, and measured.** Re-rendered with
  `TURN_CREDENTIALS=__GENERATED_BY_render-secrets.sh__` exported into an otherwise empty shell env while the
  `--env-file` held the real value: Compose emitted the **placeholder**. Without the new
  `set -a; source "$ENV_FILE"; set +a` after `render-secrets.sh`, Prosody would have signed credentials with
  the placeholder while coturn used the real secret — credentials issued, allocations rejected. Present and
  correctly ordered (render → re-source → `unset` → `compose config` → `up`) in `install.sh:277-302` and
  `restart.sh:27-48`; those are the only two `compose up` sites. Kill-set 5 cleared.
- **Atomicity / mode / idempotency, no secret in argv.** `write_env_var_inplace` reads the current mode via
  `stat`, writes a same-directory `mktemp`, `chmod`s before an atomic `mv`; substitution is bash
  `${var//…}` and the `printf` builtin only — no secret ever becomes a process argument. It replaces an
  existing key line and appends when absent, so repeat runs converge. `render-secrets.sh` now hard-fails
  unless the env file is writable **and** mode `600` before it will store `TURN_CREDENTIALS`. Verified
  without reading or printing any value.
- **Removal is complete.** No live reference to `turn_external` / `00-turn-external` remains in any script,
  compose file, env template, `RUNBOOK.md` or `NETWORK_POLICY.md`; `rollback.sh` no longer `rm`s an artifact
  that is no longer produced; `XMPP_MODULES=` empty is falsy in the upstream Go template so no stray module
  is requested. Remaining mentions are only in the two dated `docs/audit/*-2026-09-08.md` records, which are
  historical. Kill-set 7 cleared.
- Health cannot go green on the original split-context defect (F1 makes it red unconditionally — fail-closed,
  not fail-open), and the `services list` output is captured into a variable and never echoed, so no
  short-lived username/password is printed. Kill-set 6: the disclosure half is clear; the "stays green"
  half is superseded by F1.

## Commands run and results

| Command | Result |
|---|---|
| `git diff --stat/-- aac33cfa1 1d49c1cee`, `git status --porcelain` | 11 files; tree clean at `1d49c1cee` |
| `bash -n deploy/jitsi/bin/*.sh` (all 11) | all OK |
| `git diff --check aac33cfa1 1d49c1cee` | clean |
| `docker compose -f <pinned upstream>/docker-compose.yml -f docker-compose.override.test.yml --env-file <synthetic> --project-directory . -p rendercheck config` | exit 0; merged tree inspected (see above) |
| same, with `TURN_CREDENTIALS` exported stale in the shell | Compose emitted the shell value — precedence proven |
| upstream tarball `jitsi/docker-jitsi-meet` `stable-11146-2`; Prosody sources `13.0.3`, `13.0.6`, `0.12`, trunk | fetched read-only to `/tmp`, greps as cited |
| health-check parser replayed against reconstructed correct-stack output and against the real 13.0.x error string | `count=[]` → `FAIL` both hosts; split-context detector dead |

Full CI was not run (out of scope for a config/host-script candidate, per the brief). No test was written for
shell/YAML/doc strings. All `/tmp` scratch was removed; nothing was injected into the repo tree.

## Not done here — remains the lead's gate

Live TEST `bin/health-check.sh`, browser-to-browser join with forced TURN, and the actual advertised-ICE
observation on `151.241.228.122` are **not** covered by this pass and are not implied to have passed. They
stay mandatory after F1 is fixed.
