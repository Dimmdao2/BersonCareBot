# D15b/6 pre-session phone lookup — independent audit brief (2026-08-21)

## Источник оракула

> «Оставшаяся работа — перевести всех писателей/читателей на `public.user_contacts` через DB-порты и удалить дублирующие contact-колонки из `platform_users`.» — `docs/OWNER_DECISIONS.md`, owner decision 21.08.2026.

> «Равноправный вход переводится на эту таблицу.» — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/6.

Implementation brief: `docs/_TODO/runs/integrator-cleanup/D15B6_PRE_SESSION_PHONE_LOOKUP_FIX_BRIEF_2026-08-21.md`.
Rules: `AGENTS.md` §1 migrations/DEV safety, §5, §6, §10/§10a/§10b and §24.

## Тест или взгляд

- Migration/function ownership, exact relation surfaces, declaration/generated artifacts and absence of resurrected
  D36 source/count gates are one-time state: inspect diff, generator output and named-DEV rollback-only preflight.
- Phone start/confirm neutrality, exact capability binding and session mapping are behavior: blind kill-set, existing
  targeted route/repository tests, focused fault injection where already supported, and a rollback-only named-DEV
  function call. Do not create a fixture/test user/clinic, disposable DB or new source/SQL/count gate.

## Candidate

Audit worker commit `9f2a4f3f2` as merged with current integration at candidate HEAD `5cce4cd8f`. The integration merge
intentionally keeps `deploy/postgres/privileges/port-context-callsite-catalog.test.mjs` deleted by accepted D36; do
not restore or replace it. Inspect the 13-file candidate diff against `origin/feat/doctor-ui-rebuild` plus the existing
phone-start/phone-confirm/identity DB-port context needed to establish reachability.

## Required audit

1. Before reading candidate tests, record a kill-set from the authority:
   - existing canonical confirmed phone starts login without 500 and reaches the same neutral delivery contract;
   - absent/ambiguous/archived phone does not disclose account existence or mint a session;
   - the named root is callable only by exact pre-session function/purpose/typed-args context and exposes no broad
     relation door, legacy contact fallback, HTTP hop or second store;
   - successful OTP confirmation/create-or-bind cannot immediately fall into the same forbidden unnamed relation-read
     seam. The worker explicitly flagged `createOrBind`/`/api/auth/phone/confirm`; determine actual runtime principal
     and reachability. If the full required phone-login path still 500s, this is an in-scope `MUST FIX`, not a future
     recommendation.
2. Inspect the function body and TS mapping for canonical holder resolution, duplicates, merged/archived users,
   contact confirmation/primary semantics, role/session epoch, bindings and neutral timing. Check whether returning the
   full contacts/bindings payload is the minimum data needed by this trusted port path.
3. Verify migration policy: timestamp-forward; no `GRANT`/`REVOKE`/role/policy; existing owner/seam reused; generated
   DEV/TEST artifacts derive byte-exactly from declaration and name census; no deleted source/SQL gate returns.
4. Run the canonical candidate checkout command `bash deploy/host/migrate-dev.sh --preflight` only. It must target
   named `bcb_webapp_dev`, apply pending migration work in one transaction and end in `ROLLBACK`; never `--execute`.
   Record exact pending/result and prove the migration ledger/function state is unchanged afterward.
5. If canonical accepted pre-session context can be established inside one explicit named-DEV transaction using
   existing repo/runbook primitives, call the candidate function for an existing owner phone and negative value, then
   `ROLLBACK`; print no phone/email/external-id/secret/PII in the report. If this cannot be done without inventing a
   context or persisting the migration, report `BLOCKED` for this sub-gate rather than weakening it.
6. Run only existing targeted repository/route tests, webapp typecheck, relevant privilege generator/check and
   `git diff --check`. No full CI, deploy, push, fixture, durable DB write or new test file.

Return one line per item as `PASS|FAIL|BLOCKED`, with exact command and measured result. A finding must name the
reachable failure, impact and violated owner/rule line. Do not edit or commit product/docs; the port log is the audit
artifact.
