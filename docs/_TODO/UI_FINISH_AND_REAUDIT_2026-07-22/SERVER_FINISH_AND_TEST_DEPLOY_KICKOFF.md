# SERVER FINISH & TEST DEPLOY — kickoff (передача с облака, 2026-07-23)

**Миссия:** на DEV+TEST боксе подтянуть `feat`, ДОВЕСТИ всю серверную работу, которую облачный агент не смог
(нужны БД/TEST): закрыть и ПРОВЕРИТЬ все открытые чек-листы с evidence, добить безопасность, и привести
**TEST-сервер к полностью рабочему PRE-PRODUCTION состоянию** — со старыми/legacy таблицами очищенными и **Rubitime
удалённым**. **Инкрементально, БЕЗ чистого дампа/reset.**

## Шаг 0 — синхронизация ветки

```
git fetch origin feat/doctor-ui-rebuild
git checkout feat/doctor-ui-rebuild
git reset --hard origin/feat/doctor-ui-rebuild
git log -1 --format='%h %s'   # ожидаем кончик ночной передачи
```

## Шаг 1 — прочитать (в этом порядке)

1. `NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` — что сделано ночью + что осталось.
2. `../../CURRENT_AUTHORITY_MAP.md` (`docs/CURRENT_AUTHORITY_MAP.md`) — где актуальный источник по каждой области.
3. `PRODUCTION_READINESS_LEDGER_2026-07-23.md` §4 (остаток кодом) + §6 (рычаги владельца) + §8 (перепроверка).
4. `CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md`.
5. `ORCHESTRATOR_PROMPT.md` + `WORK_ORDER.md` + `AGENTS.md` + `docs/ORCHESTRATION_BINDINGS.md`
   (§«Документация и токен-дисциплина», §supersession, §«Урок 2026-07-22»).
6. Карта пациента: `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` (+ бэклог §2/3/5/6 — модель содержимого).
7. Безопасность: `SECURITY_REVIEW_2026-07-23.md`, `SECURITY_CI_STACK_PLAN.md`.

## Шаг 2 — границы (важно!)

- **DEV+TEST only.** Прод (135.x) вне scope. Коммиты только в `feat`; в git-ветки `main`/`test` не пушить.
- **TEST деплоится ИНКРЕМЕНТАЛЬНО:** `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` — он **СОХРАНЯЕТ**
  существующую `bersoncarebot_test` БД. **НЕ использовать** `deploy-test-full-reset.sh` и НЕ тянуть свежий
  прод-дамп. Эволюционировать существующую TEST-БД на месте: forward-миграции, **DROP rubitime-таблиц (R7)**,
  чистка старых/legacy таблиц.
- **OWNER AUTHORIZATION (2026-07-23):** владелец РАЗРЕШАЕТ дроп Rubitime-таблиц и чистку старых/legacy таблиц **на
  TEST** (не на проде). Выполнять Track C R7 на TEST.

## Шаг 3 — что доделать (привести TEST к рабочему pre-prod)

Backend код + БД (по LEDGER §4):

1. **mark-read 500** — применить миграцию на TEST (`deploy/postgres/patient-support-mark-read-grant.sql`), проверить
   `POST /api/patient/messages/read` = 200 (owner) / 0-row (cross-user).
2. **Isolation CRITICAL `role_pool_mismatch`** — диагностика на TEST + фикс.
3. **Track C** — drain/cutoff (RR-PROOF-09): остановить обмен, drain outbox; убрать `branchServiceId` (R3C-11,
   ~51 webapp-файл); затем **R7: архив + DROP rubitime-таблиц на TEST + снять residual-гранты**; наблюдать поломки,
   чинить (booking-экраны). Закрыть инцидент #839 (create падал `Rubitime sync failed`).
4. **Track D** — D1→D10: вкрутить готовый D1-скаффолд (`apps/integrator/src/infra/db/directPublic/`) + написать
   D2-D10; убрать projection/outbox-путь после доказанной parity + reconciliation.
5. **PII Task A** — org-колонка + backfill + write-стемпинг на `platform_user_contacts` / `user_phone_history`.
6. **FORCE-RLS cutover на TEST** — после Task A: включить `locked`+FORCE, прогнать 2-org/2-patient isolation smoke,
   чинить поломки.
7. **Delivery-alerting P0/P-guard** — live fault-injection на TEST (сломать SMTP → громкий red-alert).
8. **Безопасность:** первый живой Semgrep/Trivy triage (разобрать шум осознанно); решить полный CSP; SVG-upload и
   CSRF-matcher scope (см. `SECURITY_REVIEW_2026-07-23.md`).
9. **Карта UI-5b тело** — слить Обзор/Записи/Коммуникации/Финансы в «Карточку» по CURRENT-SPEC (с визуальной
   приёмкой владельца).

**Отметки грамотно:** закрыть и ПОСТРОЧНО проверить каждый открытый checkbox с evidence (code `path:line` | тест |
runtime | SHA). Ничего не тикать на веру. На границах — зелёный полный CI.

## Шаг 4 — приёмка TEST

Инкрементальный деплой на TEST; ломать/чинить, пока locked product smoke не зелёный, **rubitime дропнут, старые
таблицы очищены, все чек-листы закрыты и проверены**. TEST = готов к переносу на прод. Владельцу отправить:
(а) точные шаги входа, (б) единый список решений владельца.

## Решения владельца — собрать ОДНИМ листом

SMTP-креды для TEST (вход); age-ключ для backup DR-drill; session TTL (D1, реком. 7 дней); платный биллинг в первом
прод-скоупе? (да/нет — влияет на объём C5B/C/D); подпись полного CSP; всё, что блокирует.

## Дисциплина

Opus = оркестратор + аудит high-risk (auth/tenant/деньги/миграции/**destructive DROP**); Sonnet = воркеры/тесты/
механика. Код важнее прозы (evidence — исполняемый gate/тест, не эссе). Supersession-гигиена + двусторонние ссылки.
Приёмка владельца — в СЕРЕДИНЕ, не только в финале. «audit PASS» ≠ «готово».
