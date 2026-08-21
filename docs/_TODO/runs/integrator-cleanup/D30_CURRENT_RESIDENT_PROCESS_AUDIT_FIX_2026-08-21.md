# D30 Ш9 audit-fix result — legacy worker unit retirement on upgrade (21.08.2026)

Fixes the single FAIL from `D30_CURRENT_RESIDENT_PROCESS_AUDIT_2026-08-21.md` ("deploy/systemd cannot yet
prevent a second active worker on upgrade"). Authority: that audit; `D30_SCHEDULER_REVERSAL_PLAN.md` Ш9;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D30 (one resident process/unit/lock/cycle).

## Defect

Source removal of the pre-Ш9 worker was complete (`worker/main.ts`, `deploy/systemd/bersoncarebot-worker-prod.service`
template, package launchers, compose service all deleted), but nothing in `deploy-prod.sh`/`bootstrap-systemd-prod.sh`
retired an *already installed and active* `bersoncarebot-worker-prod.service` on a host upgrading from the
pre-Ш9 state. Ordinary deploy only restarts API/scheduler; the old worker (`Restart=always`) would keep
dispatching `public.outgoing_delivery_queue` / direct-public-write retries alongside the new resident
scheduler's now-embedded delivery ticks — a reachable duplicate-delivery window.

## Fix

- `deploy/host/bootstrap-systemd-prod.sh` (root-only): new `retire_legacy_worker_unit()`, called first thing
  inside `start_available_prod_services()` — i.e. before the merged scheduler is started. Idempotent: stops the
  legacy unit if active, disables it if enabled, removes exactly its installed unit file if present (regular
  non-symlink check before `rm`, matching the existing `require_file`/`require_safe_install_target` safety
  pattern), then `daemon-reload`s only if it removed something. Absent/already-retired legacy unit is a normal
  no-op path, not an error — an ordinary repeated bootstrap run on an already-migrated host still succeeds.
- `deploy/host/deploy-prod.sh` (ordinary, non-root, must not touch root-owned units): new
  `require_legacy_worker_retired()`, called right after the existing `require_unit_file` checks — i.e. before
  any build or restart work. Fails closed (`fail "..."`, pointing at `bootstrap-systemd-prod.sh`) if the legacy
  unit file is still installed at `/etc/systemd/system/bersoncarebot-worker-prod.service`, or `systemctl
  is-active`/`is-enabled` still report it live. These are unprivileged read-only systemctl queries — no new
  sudoers entries needed (same pattern `require_unit_file` already uses for `systemctl show`).
- `deploy/host/bootstrap-systemd-prod.sh --self-test`: extended with two new scenarios verifying deploy
  *behavior*, not source shape — an active+enabled legacy unit is stopped, disabled, its file removed and
  `daemon-reload`d, in that exact order, strictly before the scheduler start sequence; and a subsequent
  bootstrap run (legacy already retired) succeeds as an ordinary no-op. All four pre-existing media-cutover
  scenarios pass unchanged (their expected event sequence now carries the no-op retirement prefix, since
  retirement always runs first).
- Docs synced: `deploy/HOST_DEPLOY_README.md` (Scheduler+Worker resident process section) and
  `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (systemd units section) now describe the retirement mechanism.
  `D30_SCHEDULER_REVERSAL_PLAN.md` Ш9 got a short addendum note (evidence appended, box/status unchanged — Ш9
  was already `[x]`). The historical audit artifact itself was not modified.

## What was intentionally not touched

Product queue / delivery claim / idempotency / retry / reclaim code, scheduler/worker TypeScript, D18/D20/D25/D36,
sudoers. No new source-text/count/code-shape gate was added — the self-test asserts the retirement *sequence of
systemctl calls* the script would actually issue, via the same function-override harness the existing
media-cutover self-test already used.

## Commands run (this worktree)

```
bash -n deploy/host/bootstrap-systemd-prod.sh deploy/host/deploy-prod.sh   → OK
bash deploy/host/bootstrap-systemd-prod.sh --self-test                    → "bootstrap-systemd-prod media cutover self-test: OK"
git diff --check                                                          → clean
```

`require_legacy_worker_retired()` in `deploy-prod.sh` has no built-in self-test harness (none existed before this
pass, and one wasn't added — no parallel test path). It was checked offline instead: the exact function body was
extracted and run standalone against a stub `systemctl` on `PATH` (no `/bin/systemctl` from this sandbox was
invoked) covering three states — legacy unit absent/inactive/disabled (passes), active (fails closed, points at
bootstrap), enabled-but-inactive (fails closed). All three matched the intended behavior. No PROD, deploy,
migration, database, fixtures, or full CI run occurred.

## Residual risk

- Not exercised against a real systemd instance (no host/systemctl access in this sandbox) — behavior rests on
  `systemctl is-active`/`is-enabled`/`stop`/`disable` exit-code conventions matching the self-test's mocked
  contract when actually run as root on `adelaide`. The next real bootstrap run on `135.106.162.170` is the first
  live confirmation.
- `deploy-prod.sh`'s new gate only rejects deploy loudly; it does not retire the unit itself, by design (ordinary
  deploy is not root and must not touch root-owned units) — an operator still has to run
  `bootstrap-systemd-prod.sh` as root once on the still-pending PROD upgrade.
