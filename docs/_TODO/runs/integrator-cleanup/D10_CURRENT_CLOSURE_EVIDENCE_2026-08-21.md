# D10 Current Closure Evidence (2026-08-21)

## Requirement Source
Independent audit session `6282ca28-1385-46d6-9e73-e996265d2c5f` finding against `8be1dd3b6`; D10 owner requirement in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §3.4.

**Supersedes:** Earlier pre-apply audit reports. These reports documented analysis of the planned removal; this report documents executed, deployed, and live-verified evidence.

---

## Evidence 1: Historical Integration Gate

**Command run by lead:**
```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"
```

**Commit SHA:** `f6c39c9a0`

**Exit code:** `0` (PASS)

**Status:** Integration gate passed. Historical full-CI raw log was not preserved; this fact recorded by lead at integration time and honored in this report.

---

## Evidence 2: Live Database Revalidation

Two live databases validated for D10 migration and schema state.

### Database: `bcb_webapp_dev`

**Command run by lead:**
```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atqc 'BEGIN READ ONLY; SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag = '"'"'20260820T210709_retire_projection_outbox'"'"'; SELECT to_regclass('"'"'integrator.projection_outbox'"'"') IS NULL; SELECT to_regprocedure('"'"'app.read_integrator_projection_health(integer)'"'"') IS NULL; ROLLBACK;'
```

**Measured result:** three output lines: `1`, `t`, `t`.

**Interpretation:** (1) Migration tag present; (t) table schema object removed; (t) procedure removed. ✅

### Database: `bersoncarebot_test`

**Command run by lead:**
```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -Atqc 'BEGIN READ ONLY; SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag = '"'"'20260820T210709_retire_projection_outbox'"'"'; SELECT to_regclass('"'"'integrator.projection_outbox'"'"') IS NULL; SELECT to_regprocedure('"'"'app.read_integrator_projection_health(integer)'"'"') IS NULL; ROLLBACK;'
```

**Measured result:** three output lines: `1`, `t`, `t`.

**Interpretation:** (1) Migration tag present; (t) table schema object removed; (t) procedure removed. ✅

---

## Evidence 3: Current TEST Runtime State

### 3.1 Git state

**Command:** `git -C /opt/projects/bersoncarebot-test rev-parse HEAD`

**Result:** `6fa2f6e1b4d22e7f0a7aefc15dae5870566fc1c4`

### 3.2 Service status (systemctl is-active)

| Service | Status |
|---|---|
| `bersoncarebot-api-test.service` | `active` |
| `bersoncarebot-scheduler-test.service` | `active` |
| `bersoncarebot-webapp-test.service` | `active` |
| `bersoncarebot-media-worker-test.service` | `active` |
| `bersoncarebot-worker-test.service` (legacy) | `inactive` |

**Interpretation:** All required services active; legacy worker correctly inactive. ✅

### 3.3 Loopback health checks

**Webapp health command:**
```bash
curl -fsS --max-time 10 http://127.0.0.1:3300/health | jq -c '{ok,db}'
```
**Output:** `{"ok":true,"db":"up"}`

**API health command:**
```bash
curl -fsS --max-time 10 http://127.0.0.1:6300/api/health | jq -c '{ok,db}'
```
**Output:** `{"ok":true,"db":"up"}`

### 3.4 Ancestry check

**Command:** `git merge-base --is-ancestor f6c39c9a0 6fa2f6e1b4d22e7f0a7aefc15dae5870566fc1c4`

**Result:** Exit code `0` (true) — integration SHA `f6c39c9a0` is an ancestor of current TEST HEAD.

**Interpretation:** TEST runtime is at or past the integration closure commit. ✅

---

## Summary

All three required evidence categories measured and verified:

1. ✅ **Historical gate:** Integration CI passed on D10 closure commit (SHA `f6c39c9a0`, exit 0)
2. ✅ **Database validation:** Both `bcb_webapp_dev` and `bersoncarebot_test` confirm migration applied and schema objects removed
3. ✅ **TEST runtime:** Current deployment at or past integration commit; all required services active; health endpoints responding

**Date of measurement:** 2026-08-21
**Command provenance:** run and recorded by the Track D lead.
