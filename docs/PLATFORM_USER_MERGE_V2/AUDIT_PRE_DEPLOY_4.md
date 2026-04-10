# Audit — Pre-deploy 4 (retrospective repo audit)

**Дата:** 2026-04-10  
**Scope:** Deploy 4 / Stage 5 — feature flag + integrator-first manual merge flow

Этот файл создан ретроспективно для восстановления полного audit trail по deploy-slice. Он фиксирует **repo readiness** для Deploy 4 и operator rollback story.

---

## Проверка readiness

| Критерий | Статус | Комментарий |
|----------|--------|-------------|
| Scope соответствует Deploy 4 | **PASS** | feature flag, preview/gate/UI/API flow switch; без новых schema требований |
| Миграции/код в правильных местах | **PASS** | `system_settings` key, webapp routes/UI, integrator M2M routes |
| Rollback-путь описан | **PASS** | флаг `platform_user_merge_v2_enabled` выключается через Settings без redeploy |
| SQL gates подготовлены | **PASS** | используется Stage 4 gate как post-merge evidence; ссылки есть в runbook/closeout |
| Нет нарушений server conventions | **PASS** | новых env для бизнес-логики не добавлено; флаг хранится в `system_settings` |
| `pnpm run ci` зелёный | **PASS** | подтверждено в `AGENT_EXECUTION_LOG.md` и повторно в финальном fix-pass |

## Особая оговорка

Полный browser e2e на двух живых БД не входил в обязательный контракт Deploy 4; принятый repo-level gate — unit/stub-flow/route tests + полный CI.

## Verdict

**PASS (repo readiness)** — Deploy 4 подготовлен с подтверждённым rollback через Settings и без нарушения DB-backed config policy.

## MANDATORY FIX INSTRUCTIONS

1. Нельзя переносить `platform_user_merge_v2_enabled` в env — только `system_settings` (scope `admin`).
2. При изменении M2M контрактов integrator/webapp нужно обновить route tests, stub-flow tests и Stage 5 docs одновременно.
