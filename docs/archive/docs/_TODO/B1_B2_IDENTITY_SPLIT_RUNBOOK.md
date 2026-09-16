# B-1 / B-2 — Split OS identities + narrow Postgres host trust — TEST only

Status: **REVISED after two independent audits (mechanics + aftermath), owner-authorised to execute on
TEST.** Written read-only against the live TEST box on 2026-07-26, then corrected before execution — see §7
"Audit fixes" for exactly what changed and why. TEST is a disposable mirror with no real users but the owner
— the point of running this on TEST first is to let execution find what discovery missed, fast. This runbook
is deliberately lean: discovery is kept (cheap, informative), every step has a one-line rollback (cheap), but
it does not try to predict every failure in advance. The riskiest/most informative step is moved early so a
wrong assumption surfaces in minutes, not after an hour of unit-file edits.

Scope: `bersoncarebot-webapp-test.service` + `bersoncarebot-api-test.service` (B-1), and
`/etc/postgresql/16/main/pg_hba.conf` (B-2). TEST box only. PROD (135.x) untouched — deltas noted inline
where PROD will eventually differ.

---

## 0. Summary

⚠️ **ФАКТ УСТАРЕЛ 2026-08-23 — не запускать как runbook.** Документ предшествует port-context cutover:
текущий TEST deploy требует `DB_PRINCIPAL_CONTEXT_MODE=port-context`
(`deploy/host/deploy-test.sh`) и именованные runtime logins описаны в
`deploy/postgres/privileges/declaration.ts`. Новая mTLS boundary имеет отдельный канонический маршрут в
`deploy/HOST_DEPLOY_README.md`; ниже сохранён исторический план, а не подтверждённая инструкция для хоста.

- Both services run `User=deploy Group=deploy` (`systemctl cat`, confirmed). `deploy` is root-equivalent
  today (unrestricted `sudo systemctl/sed/apt-get`, plus a NOPASSWD `bash` as the unrelated `tgcarebot`
  project's OS account) — a webapp/api compromise inherits all of it.
- App services connect to Postgres over **TCP `127.0.0.1:5432` + `scram-sha-256`**, never the Unix socket.
  Confirmed for every `DATABASE_URL*` in both env files and every `psql`/`pg_dump` call in
  `deploy/host/*.sh` and `/opt/backups/scripts/*.sh`. **Narrowing `local all all peer` cannot break the app
  or the deploy scripts** — nothing found depends on it.
- `local all all peer` is already inert for everyone except `postgres` and `tgcarebot`, both of which have
  their own more specific rule earlier in the file (live `pg_roles` query: no role named `deploy`, `dev`,
  `root`, `www-data`, or `storylama` exists). Deleting it changes nothing observable today; it closes a
  latent future hole.
- Systemd's manager (root) reads `EnvironmentFile=` and injects the parsed vars into the child **before**
  dropping to the unit's `User=` — the runtime identity never needs filesystem read access to the secret
  file. This is the whole reason no chown/chgrp/ACL work is needed on `/opt/env/bersoncarebot/*` — and it's
  also why `deploy/host/bootstrap-c4-test-env.mjs:112-114` hardcoding `chownSync(..., deployGid)` on every
  rewrite of those files doesn't matter for this design (it would matter for a chgrp-based design, which is
  why this runbook doesn't use one). **This is the assumption Step 3 tests empirically before anything else
  is built on it** — cheap, five minutes, done before any unit file is touched for real.
- One real functional gap found: Next.js image optimization is active (`sharp` + `next/image`, no
  `unoptimized` config) and writes a runtime cache under `.next/cache/images`, inside the tree `deploy`
  rebuilds from scratch every deploy (`rm -rf apps/webapp/.next`). Handled with `CacheDirectory=` (Step 5),
  not a chown — a chown there would get wiped by the next deploy and could break `deploy`'s own `rm -rf`.

---

## 1. Discovery (executed today, read-only, evidence only — not exhaustive by design)

**Units** (`systemctl cat`): both `bersoncarebot-webapp-test.service` and `bersoncarebot-api-test.service`
run `User=deploy Group=deploy`, no `RuntimeDirectory=`/`StateDirectory=`/`CacheDirectory=`, no sandboxing
directives (`systemctl show`: `NoNewPrivileges=no`, `ProtectSystem=no`, `PrivateTmp=no`). Webapp:
`WorkingDirectory=/opt/projects/bersoncarebot-test/apps/webapp/.next/standalone/apps/webapp`,
`EnvironmentFile=/opt/env/bersoncarebot/webapp.test`, port 6300. Api:
`WorkingDirectory=/opt/projects/bersoncarebot-test/apps/integrator`,
`EnvironmentFile=/opt/env/bersoncarebot/api.test`, port 3300 (env value read directly, not secret).
Sibling units `worker-test`/`scheduler-test` also run as `deploy` and also load `api.test` (out of scope
here, left untouched). `media-worker-test` is **hard-pinned** to `deploy:deploy` by
`assert-media-worker-test-unit-properties.sh` (FATALs otherwise) — precedent for how this repo pins unit
identity when it wants to; not touched by this runbook.

**Env files** (`/opt/env/bersoncarebot/`, `ls -la` via `sudo -n`, names/owners/modes only, no values):
`webapp.test` and `api.test` are `root:deploy 0640`. Group `deploy` also has a **second, unrelated
member**: `getent group deploy` → `deploy:x:1000:deploy,storylama` — the `storylama` project's OS account
can already read `api.prod` (`640 deploy:deploy`) today. This is why the new identities must never join
group `deploy` — that group's blast radius already reaches outside this project. `webapp.prod`/`cutover.prod`
are `600`, not group-readable at all. Var names only (no values) confirm each file holds secrets the other
service doesn't need — webapp has session/staff-credential secrets, api has SMS/Telegram/MAX/Rubitime keys —
this is the property the verification block checks.

**DB roles** — extracted with a redacting regex, connection shape only, no passwords printed:

```
webapp.test DATABASE_URL/_STAFF/_NONSTAFF/_WEB_PUSH_REMINDER -> bcb_test_worker_login / bcb_test_staff_login /
                                                                  bcb_test_nonstaff_login / bcb_test_operational_web_push_reminder_login
api.test    DATABASE_URL/_DIAGNOSTIC/_DELIVERY_WORKER/_SCHEDULER -> bcb_test_integrator_login / bcb_test_operational_diagnostic_login /
                                                                      bcb_test_operational_delivery_login / bcb_test_operational_scheduler_login
```

All eight are `postgres://<role>:***@127.0.0.1:5432/bersoncarebot_test` — TCP, not the socket. None is
`postgres` or superuser (confirmed live against `pg_roles`).

**Deploy scripts' Postgres access** (`grep psql deploy/host/*.sh` + the two backup scripts): exactly two
shapes — `sudo -u postgres psql` (admin/DDL, peer via the untouched first pg_hba line) and `sudo -u deploy
bash -lc "... psql \"\$DATABASE_URL\" ..."` (app-role checks, TCP/password, same as the running services).
**No script anywhere invokes bare `psql` as `deploy` with no URL** — the one pattern that would actually
depend on the catch-all peer line. Backups (`/opt/backups/scripts/*.sh`) use a connection-string variable,
same TCP shape. Cron (`cronport list` + `crontab -u deploy/root -l`, read-only): backup jobs use the same
connection-string pattern; `deploy`'s own cron entry (`operator-health-probe.sh`) runs against the **PROD**
path (`/opt/projects/bersoncarebot`, no `-test`), unaffected either way. Nothing found depends on
`local all all peer`.

**Who can become `postgres`/root today**: `deploy`'s sudoers grants unrestricted `sudo systemctl/sed/nginx/
apt-get` as root (NOPASSWD) plus `(tgcarebot) NOPASSWD: git/pnpm/bash` — root-equivalent, and a cross-project
escape hatch, neither touched by this runbook (out of stated scope). The account that actually runs
`deploy-test-saas.sh` is `dev` (`sudo -n -l`: `(ALL) NOPASSWD: ALL`) — confirmed via `journalctl -t sudo`,
every `sudo -u postgres`/`sudo -u deploy` call tonight is attributed to `dev`. Sudo invocations are captured
in the persistent journal (actor + full command) — that's the existing "audited path" for superuser access.
`postgres` OS account has no `.ssh` (no external reach, correct).

**Filesystem**: no `fs.writeFile`/`mkdir`/`createWriteStream` in `apps/webapp/src`, `apps/integrator/src`,
or `apps/media-worker/src` outside tests — the app never writes local disk (S3 for uploads/media,
`StandardOutput=journal` for logs). Exception found by checking the _framework_, not just app code:
`next/image` + `sharp` are active with no `unoptimized` config, so Next's built-in image optimizer writes a
runtime cache to `.next/cache/images` — inside the tree `deploy` owns and `rm -rf`s every deploy. Code tree
itself is world-readable (`664` files / `775` dirs, `deploy`'s umask `0002`) — a brand-new user needs no
group grant to read the code, just to run it.

**pg_hba.conf**, active lines in order (`sudo -n cat`):

```
local   all             postgres                                peer
local   tgcarebot       tgcarebot                               peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
local   replication     all                                     peer
host    replication     all             127.0.0.1/32            scram-sha-256
host    replication     all             ::1/128                 scram-sha-256
```

File's own comment: "DO NOT DISABLE" on the `postgres` line — untouched. `tgcarebot`'s dedicated line —
untouched; its database/role are unaffected by removing the catch-all underneath it.

---

## 2. Target identity model

| Account        | Shell               | Home | Sudo | Groups           | Runs                                |
| -------------- | ------------------- | ---- | ---- | ---------------- | ----------------------------------- |
| `bcb-web-test` | `/usr/sbin/nologin` | none | none | own primary only | `bersoncarebot-webapp-test.service` |
| `bcb-api-test` | `/usr/sbin/nologin` | none | none | own primary only | `bersoncarebot-api-test.service`    |

Created via `useradd --system --no-create-home --shell /usr/sbin/nologin --user-group <name>` — no `docker`,
no `deploy` (that group already leaks into another project and into PROD secrets, §1). No sudoers entry for
either. `deploy` itself is untouched — deploys keep running as `dev`/`deploy` exactly as today.

**What each can no longer do, the moment `User=`/`Group=` flips**: read the other service's env file, read
any PROD secret, `sudo` anything, act as `tgcarebot`, touch the Docker socket, or log in interactively
(`nologin`, no password, no SSH key — even a shell inside the compromised process has nowhere to escalate to
on the host).

**Not decided here (owner input needed, not guessed):**

- _"Delete the dormant old deploy path"_ — no single unambiguous artifact found (two SSH keys in
  `deploy/.ssh/`, a day apart, either could be it). Ask the owner which path he means; don't delete a guess.
- _"Root-capable account for me, no external access"_ — `dev` already matches that shape (blanket sudo,
  key-only SSH, own key). Unclear if a second distinct identity is wanted. Ask, don't invent.

---

## 3. Steps

Every step: command, how to tell it worked, one-line rollback. The empirical proof (Step 3) comes before any
unit file is touched for real, on purpose — it's the step most likely to reveal a wrong assumption.

**1 — create the two accounts**

```
sudo useradd --system --no-create-home --shell /usr/sbin/nologin --user-group bcb-web-test
sudo useradd --system --no-create-home --shell /usr/sbin/nologin --user-group bcb-api-test
```

Works: `id bcb-web-test` / `id bcb-api-test` show one group each, matching their own name, no `docker`/
`deploy`. Rollback: `sudo userdel bcb-web-test` / `bcb-api-test` (nothing references them yet).

**2 — confirm no sudo rights**

```
sudo -n -l -U bcb-web-test; sudo -n -l -U bcb-api-test
```

Works: both say "not allowed to run sudo". Rollback: none (read-only).

**3 — prove the `EnvironmentFile=`-is-read-as-root assumption before building on it**

```
sudo systemd-run --uid=bcb-web-test --gid=bcb-web-test --pty --wait \
  --property=EnvironmentFile=/opt/env/bersoncarebot/webapp.test \
  /bin/bash -c '
    test -r /opt/env/bersoncarebot/webapp.test \
      && echo "UNEXPECTED: file directly readable" || echo "file not directly readable (expected)";
    [ -n "$DATABASE_URL" ] && echo "env var present (expected)" || echo "UNEXPECTED: env var missing"
  '
```

(No inner `sudo -u bcb-web-test` wrapper — this transient unit already runs _as_ `bcb-web-test` via
`--uid`/`--gid`; wrapping the check in `sudo` would prove nothing, since Step 2 already established
`bcb-web-test` has zero sudo rights, so that call would be denied by sudo's own ACL regardless of the file's
actual permissions, and the "expected" branch would print even if the underlying assumption were false.)
Works: both lines say "(expected)". If not — stop, the whole no-chown design needs rethinking before Step 4.
Rollback: transient unit, cleans itself up on exit; nothing persists.

**4 — webapp: cache dir + identity flip in one edit**

Backup, then edit `/etc/systemd/system/bersoncarebot-webapp-test.service`: `User=deploy`→`User=bcb-web-test`,
`Group=deploy`→`Group=bcb-web-test`; add to `[Service]`:

```
CacheDirectory=bersoncarebot-webapp-test
CacheDirectoryMode=0750
ExecStartPre=+/bin/sh -c 'rm -rf ".next/cache"; ln -sfn /var/cache/bersoncarebot-webapp-test ".next/cache"'
```

**Note (fixed after audit):** the original draft used `%W` believing it meant "WorkingDirectory". It does
not — `%W` is the OS `VARIANT_ID` specifier, unset on this box, so it expands to an empty string. That would
have made `ExecStartPre` operate against filesystem root (`ln -sfn ... "/.next/cache"`, no `/.next` parent to
create the symlink in), which fails; a non-`-`-prefixed failing `ExecStartPre` fails the whole unit start,
`Restart=always` turns that into a crash loop, and `deploy-test-saas.sh` restarts this unit under
`set -euo pipefail` — so every future TEST deploy would abort at that step. Fix: no specifier is needed at
all. `WorkingDirectory=` already applies to `ExecStartPre` by systemd's own semantics, so a bare relative
path (`".next/cache"`) resolves correctly with no `%W`.

```
sudo cp /etc/systemd/system/bersoncarebot-webapp-test.service{,.bak-$(date +%Y%m%d-%H%M%S)}
# edit as above
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-webapp-test.service
```

Works: `systemctl show bersoncarebot-webapp-test.service -p User -p Group --value` → `bcb-web-test` /
`bcb-web-test`; `curl -fsS http://127.0.0.1:6300/api/health` → `{"ok":true,...,"db":"up"}`; `curl -fsS -o
/dev/null -w '%{http_code}\n' 'http://127.0.0.1:6300/_next/image?url=%2Ffavicon.ico&w=64&q=75'` → `200`.
Rollback (tightened after audit — the original only re-checked `/api/health`, not the image endpoint that
proves the cache symlink actually worked, and never freed the `CacheDirectory=`, which would otherwise be
left on disk owned by an orphaned UID once `bcb-web-test` is gone):

```
sudo cp /etc/systemd/system/bersoncarebot-webapp-test.service.bak-<ts> /etc/systemd/system/bersoncarebot-webapp-test.service
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-webapp-test.service
curl -fsS http://127.0.0.1:6300/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:6300/_next/image?url=%2Ffavicon.ico&w=64&q=75'
sudo systemctl clean --what=cache bersoncarebot-webapp-test.service   # frees /var/cache/bersoncarebot-webapp-test now that User=deploy again owns the unit
```

**5 — api: identity flip (no cache-dir handling needed — §1 found no runtime fs writes in the integrator)**

```
sudo cp /etc/systemd/system/bersoncarebot-api-test.service{,.bak-$(date +%Y%m%d-%H%M%S)}
# edit: User=deploy -> User=bcb-api-test ; Group=deploy -> Group=bcb-api-test
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-api-test.service
```

Works: `systemctl show bersoncarebot-api-test.service -p User -p Group --value` → `bcb-api-test` /
`bcb-api-test`; `curl -fsS http://127.0.0.1:3300/health` → `200`. Rollback: same pattern as Step 4 (minus the
cache-dir lines — this unit never had a `CacheDirectory=`).

**6 — worker-test + scheduler-test: same identity flip, no new account** _(added after audit — see §7)_

Audit 2 confirmed `bersoncarebot-worker-test.service` and `bersoncarebot-scheduler-test.service` load the
**identical** `EnvironmentFile=/opt/env/bersoncarebot/api.test` as the api service, and — like the api service
— do no runtime filesystem writes (§1 discovery, unchanged). Leaving them on `deploy` after the split means
an RCE in either still yields the same secrets the split was meant to protect, plus root — diluting the
point. **Decision: they run as the existing `bcb-api-test` identity, not new accounts of their own.** A
separate identity per unit would only buy something if there were a reason to keep worker, scheduler, and api
from reading _each other's_ secrets — there is not: all three already trust the same `api.test` file by
design (same DB roles' worth of blast radius already), so a third and fourth system account would be pure
sprawl with no additional boundary. The boundary that matters here is `api.test` vs `webapp.test` vs
`deploy`, and this gets both processes off `deploy` for exactly that boundary.

```
sudo cp /etc/systemd/system/bersoncarebot-worker-test.service{,.bak-$(date +%Y%m%d-%H%M%S)}
sudo cp /etc/systemd/system/bersoncarebot-scheduler-test.service{,.bak-$(date +%Y%m%d-%H%M%S)}
# edit both: User=deploy -> User=bcb-api-test ; Group=deploy -> Group=bcb-api-test
sudo systemctl daemon-reload
sudo systemctl restart bersoncarebot-worker-test.service bersoncarebot-scheduler-test.service
```

Works: `systemctl show bersoncarebot-worker-test.service bersoncarebot-scheduler-test.service -p User -p
Group --value` → `bcb-api-test` / `bcb-api-test` (×2); `systemctl is-active` both → `active`; no restart loop
(`systemctl show ... -p NRestarts --value` stays `0` a few seconds after restart). Rollback: same pattern as
Step 4 (minus cache-dir lines — neither unit ever had one).

**7 — update the owner's visual-session helper to expect the new webapp identity** _(added after audit — see
§7)_ — code change, not an on-box command.

`deploy/host/test-visual-global-admin-session.mjs:169-170` hard-codes `User == "deploy" && Group == "deploy"`
as a security precondition (`assertTestWebappListenerIdentity()`) before issuing a signed global-admin
session for visual review (canon: `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md`).
It is not a deploy gate — a redeploy will not fail because of it — but after Step 4 it would fail every
future invocation with a cryptic `test_webapp_systemd_identity_mismatch`, silently retiring an owner tool.
Update the two literal comparisons (and the matching self-test fixture at line ~388) from `"deploy"` to
`"bcb-web-test"` in the same change as the runbook, run `node deploy/host/test-visual-global-admin-session.mjs
--self-test` to confirm the parser/fixture still agree, then re-run the real
`assertTestWebappListenerIdentity()` path (via `status`/`issue`) against the live box after Step 4 lands.

**8 — pg_hba.conf: remove the catch-all**

```
sudo cp /etc/postgresql/16/main/pg_hba.conf{,.bak-$(date +%Y%m%d-%H%M%S)}
```

Delete exactly the `local   all   all   peer` line (third active line — see §1 for full before/after
listing; every other line, including `postgres` and `tgcarebot`'s own rules, is untouched, same order). No
replacement line — an unmatched `local` connection is denied by Postgres's own default, which is the wanted
behavior.

```
sudo -u postgres psql -tAc "SELECT pg_reload_conf();"
sudo journalctl -u postgresql@16-main -n 20 --no-pager   # no FATAL/invalid line about pg_hba.conf
```

**Note (fixed after audit):** the original draft checked `journalctl -u postgresql` — that is the
`Type=oneshot` meta-unit, not the running daemon, so it never has anything to say and the FATAL check was
decorative. `postgresql@16-main.service` is the actual `postgres` process instance and the one whose log
matters.
Works: `pg_reload_conf()` → `t`, no error in the log; `sudo -u postgres psql -tAc "SELECT current_user;"` →
`postgres` (line 1, unaffected); `sudo -u tgcarebot psql -d tgcarebot -tAc "SELECT current_user;"` →
`tgcarebot` (its own line, unaffected). Rollback: `sudo cp` the `.bak-*` back, reload again — no restart
needed either direction, this is a hot reload.

**9 — prune the relocated image cache** _(added after audit — see §7)_

`.next/cache` now symlinks to `/var/cache/bersoncarebot-webapp-test`, which sits outside the tree `deploy`
wipes on every deploy (`rm -rf apps/webapp/.next`). Before the split that made the cache an accidental
bound; after it, growth is unbounded. Low severity on TEST — a `tmpfiles.d` age rule is enough, no need for
anything heavier:

```
printf 'e /var/cache/bersoncarebot-webapp-test - - - 30d\n' | sudo tee /etc/tmpfiles.d/bersoncarebot-webapp-test-cache.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/bersoncarebot-webapp-test-cache.conf
```

Works: `sudo systemd-tmpfiles --cat-config | grep bersoncarebot-webapp-test-cache` shows the rule loaded; no
FATAL from `--create`. Rollback: `sudo rm /etc/tmpfiles.d/bersoncarebot-webapp-test-cache.conf` (the cache
directory itself is untouched by removing the rule — it just stops aging out).

---

## 4. Verification (after all steps)

- `sudo -u bcb-web-test test -r /opt/env/bersoncarebot/api.test` → denied (webapp can't read api's secrets)
- `sudo -u bcb-api-test test -r /opt/env/bersoncarebot/webapp.test` → denied (and vice versa)
- `sudo -u bcb-web-test test -r /opt/env/bersoncarebot/webapp.prod` → denied (no PROD reach either)
- `sudo -n -l -U bcb-web-test` / `-U bcb-api-test` → neither can sudo, i.e. neither can act as `deploy`
- `grep -c '^local\s\+all\s\+all\s\+peer' /etc/postgresql/16/main/pg_hba.conf` → `0`
- `curl -fsS http://127.0.0.1:6300/api/health` and `http://127.0.0.1:3300/health` → both real 200s, not
  just `systemctl is-active`
- `ps -eo user,group,cmd | grep -E 'server\.js|dist/main\.js'` → `bcb-web-test`/`bcb-api-test`, no `deploy`
- `systemctl show bersoncarebot-worker-test bersoncarebot-scheduler-test -p User -p Group --value` →
  `bcb-api-test` ×2 (moved off `deploy` per Step 6 — **not** the same expectation as media-worker below)
- `systemctl is-active bersoncarebot-worker-test bersoncarebot-scheduler-test
bersoncarebot-media-worker-test` → all still `active`; `media-worker-test` alone stays `deploy:deploy`
  (the one unit this runbook explicitly does not touch, still pinned by its own assert script)
- `node deploy/host/test-visual-global-admin-session.mjs --self-test` → OK; then a real `status`/`issue`
  call succeeds (no `test_webapp_systemd_identity_mismatch`) — proves Step 7's code change matches Step 4's
  live identity, not just the fixture

---

## 5. OPEN

- Step 3's empirical proof is load-bearing for the whole "no chown needed" design — if it fails, stop
  before Step 4, don't improvise a filesystem-permission fallback on the box.
- "Delete the dormant old deploy path" and "root-capable account for me" (owner's own B-1 lines) — both
  ambiguous, need one clarifying question each, not executed here (§2).
- `deploy`'s own sudoers (root-equivalent + `tgcarebot` escape hatch) and the `storylama`-reads-`api.prod`
  leak via group `deploy` are real, pre-existing, and out of this runbook's stated scope (splitting the two
  services, not narrowing `deploy` itself) — surfaced, not fixed here. (`deploy`'s own sudoers and the
  `tgcarebot` escape hatch are explicitly out of scope for this runbook — see §7 prohibition list.)
- ~~`worker-test`/`scheduler-test` share `api.test`'s env file and stay on `deploy`~~ — resolved by Step 6
  (added after audit): both now run as `bcb-api-test`, same secret-scope boundary as the api service itself.

---

## 6. Worst case

If Step 8 goes wrong and nothing can reach Postgres locally: we have shell on this box (`dev`, blanket
sudo, unaffected by pg_hba — that file only gates Postgres auth, not SSH/sudo) — `sudo cp` the
`pg_hba.conf.bak-*` back over the live file and `sudo -u postgres psql -tAc "SELECT pg_reload_conf();"`.
That's the whole recovery. If an identity flip (Step 4/5/6) goes wrong: same shape, restore the
`.service.bak-*` file(s), `daemon-reload`, `restart`, re-verify that step's own checks; Step 4 additionally
needs `systemctl clean --what=cache bersoncarebot-webapp-test.service` once reverted, so a full reversal
doesn't leave `/var/cache/bersoncarebot-webapp-test` behind owned by an orphaned UID.

---

## 7. Audit fixes (applied before execution)

Two independent audits reviewed this runbook before the owner authorised execution on TEST. All findings
were fixed in the document above prior to running anything; nothing in this section describes work still
pending.

**Audit 1 (mechanics) — three defects, all in the original draft:**

1. Step 4's `ExecStartPre` used `%W`, which is not "WorkingDirectory" (that's an undocumented myth) — it's
   the OS `VARIANT_ID` specifier, unset on this box, so it silently expanded to `""` and the command would
   have targeted `/`. Fixed: no specifier needed, `WorkingDirectory=` already applies to `ExecStartPre`,
   plain relative path.
2. Step 8 (was Step 6)'s FATAL-log check targeted `postgresql.service`, a `Type=oneshot` meta-unit that
   never logs anything from Postgres itself. Fixed: `postgresql@16-main.service`.
3. Step 3's inner `sudo -u bcb-web-test test -r ...` proved nothing — the transient unit already ran as that
   user, which per Step 2 has zero sudo, so the call would be denied by sudo's own ACL either way and the
   "expected" branch would print regardless of the actual permission. Fixed: dropped the wrapper.

**Audit 2 (aftermath) — four more, found by tracing what the split touches beyond the units themselves:** 4. `deploy/host/test-visual-global-admin-session.mjs:157-186` hard-codes `User == "deploy" && Group ==
   "deploy"` as a security precondition for the owner's visual-review tool. Not a deploy gate, so it would
not block anything — it would just quietly stop working. Fixed by new Step 7: update the two literal
comparisons (line ~169-170) and the self-test fixture (line ~388) to `bcb-web-test`, in the same change. 5. `worker-test`/`scheduler-test` load the identical `api.test` env file and were going to stay on `deploy`
after the split, diluting its value. Fixed by new Step 6: both now run as `bcb-api-test` — decision and
reasoning recorded inline at that step (shared identity, not new accounts, because they already share the
same secret-scope boundary by design). 6. `.next/cache`'s new home outside the tree `deploy` wipes per deploy is unbounded growth where it used to
be an accidental bound. Fixed by new Step 9: a `tmpfiles.d` age rule (30d), deliberately not more than
that — low severity on TEST. 7. Step 4's rollback only re-checked `/api/health`, not the image endpoint that actually proves the cache
symlink is working, and never freed the `CacheDirectory=`. Fixed: rollback now re-checks both curl
endpoints and runs `systemctl clean --what=cache`.

**Verified clean by audit 2, not re-litigated:** no privilege-escalation path from the new accounts back to
`deploy` (groups, docker socket, unit file modes, world-writable files all checked); `USERGROUPS_ENAB=yes` so
`userdel` removes the matching private group cleanly; `tgcarebot`/`storylama` neighbours are unaffected;
only `media-worker-test` is identity-pinned by a deploy-time assertion script, so webapp/api/worker/scheduler
will not be silently reverted to `deploy` by a future redeploy.
