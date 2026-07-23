# Acceptance ST-01 — strict/FORCE TEST finalizer

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

Тип: security/migration, code + disposable/scratch + TEST operational proof. Визуальная печать не применяется.

- [x] Code/scratch — fresh wrapper order: stop writers → restore → migrate/cleanup → roles/helpers/overlays → strict+FORCE/assert
      → separate seed privilege window/cleanup → restart → locked smoke.
- [x] Code/scratch — code-only TEST migrate path не может вернуть базу в NO FORCE и имеет те же cleanup/assert guarantees.
- [x] Scratch — exact 163-target policy/FORCE inventory проверяется исполнением, а не наличием SQL-текста.
- [x] Code/static — любая ошибка оставляет сервисы остановленными и стены не отключает.
- [x] Scratch — временные owner-membership/BYPASSRLS отзываются success/failure trap; отсутствие residue проверяется.
- [x] Existing specialized overlays остаются эффективны после base strict policy replacement.
- [x] Fixture path остаётся внешним и не печатается; locked smoke не может быть незаметно skipped.
- [x] Static/self-tests, bash syntax, scratch SQL rehearsal и deep trace audit зелёные.
- [ ] Live TEST — fresh/code-only closure, stopped-on-failure behavior, unit health and mandatory locked smoke proven.

## Correction evidence (2026-07-15)

- Base renderer теперь всегда идёт до invite/course/app_worker overlays; FORCE и semantic assertions — после них.
- Invite direct policy fail-closed (`app_staff` + protected org only). Pre-session lookup/accept перенесены на
  NOLOGIN/BYPASSRLS `app_owner` как узкие SECURITY DEFINER functions с exact table grants; direct `app_patient`
  table access отсутствует.
- Fresh и code-only пути сходятся в `run_strict_post_migration_closure`: P0.5b/P2-B, runtime overlays, E1 telemetry
  closed API, ledger/D3.4, settings, strict finalizer, separate seed cleanup, restart, health/nginx/locked smoke.
- Disposable DB `bcb_saas_strict_rehearsal_20260715a`: canonical dormant wrapper PASS; strict finalizer PASS;
  unset `app_staff` invites visible = 0; `app_patient` direct invite SELECT = false; lookup no-match = 0 rows;
  accept no-match = `invalid_token`; course/app_worker/invite semantic probes = true.
- Targeted static checkers and their self-tests pass. Final independent code/scratch re-audit PASS is recorded in
  `ST-01-final-PASS.md`; live TEST wrapper/deploy remains open.
- Re-audit integrity correction: product-smoke fixture now passes one canonical validator both at preflight and
  immediately before consumption. It requires an absolute fully resolved path outside `SRC_REPO`/`DEPLOY_REPO`,
  rejects a symlink file or any symlink parent, and enforces exact `root:deploy 0640`. Executable self-test proves
  rejection of in-repo, symlink-parent, unsafe-mode, unsafe-owner, and unsafe-group cases; checker mutation tests
  fail when canonical-path, repository-boundary, metadata, or immediate-revalidation clauses are removed.
