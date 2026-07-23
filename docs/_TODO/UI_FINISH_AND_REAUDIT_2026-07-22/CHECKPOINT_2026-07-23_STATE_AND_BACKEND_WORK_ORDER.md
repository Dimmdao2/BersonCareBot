# CHECKPOINT 2026-07-23 — реальное состояние + backend-first порядок работ

**Назначение:** снимок для перезапуска оркестрации при смене исполнителя (Codex → Claude Opus/Sonnet). Читать
ПЕРВЫМ, затем `WORK_ORDER.md`. Статусы ниже проверены по коду/миграциям/CI (7 независимых read-only разборов
2026-07-23), а не по «done»-лейблам в доках.

**Границы (неизменны):** этот бокс = DEV + TEST. Прод (135.x) вне scope.
- **На TEST-сервере работать по максимуму** — деплой `feat` через `deploy/host/deploy-test.sh feat/doctor-ui-rebuild`,
  ломать/наблюдать/чинить/перепроверять. Тест-сервер деплоится ИЗ ветки `feat` (force-align), отдельная ветка не нужна.
- **«Не пушить в `main`/`test`» — про git-ВЕТКИ с такими именами, НЕ про тест-сервер.** Тест-сервер ветку `test`
  не использует. Коммиты пушить только в `feat/doctor-ui-rebuild`; в git-ветки `main`/`test` не пушить (перенос на
  прод — отдельный поздний owner-шаг). Prod-миграции не гнать. Всё разрушающее и юр-гейты — owner-gated.

---

## 0. TL;DR

1. **Owner-accepted = 0 / 167.** По планке владельца (живой PNG + клик) не закрыт НИ ОДИН этап — потому что ты ещё
   не заходил на TEST. Это не значит «ничего нет»: значительная часть кода реально написана и протестирована.
2. **Единственный разблокиратор всей приёмки — вход владельца на TEST (Track B).** Он заблокирован SMTP: фикс
   ридера в HEAD не задеплоен + на TEST нет SMTP-конфига. **Нужно твоё действие: дать SMTP-креды для TEST.**
3. **Фронтенд — самое сложное для агентов и требует твоих глаз.** Отложен на твою ручную приёмку. Этот checkpoint
   приоритизирует **backend, не зависящий от фронта**, который в любом случае надо довести до прода.
4. **Главный вывод по backend:** ядро (мультитенант-изоляция, тарифы/entitlements, платежи-эквайринг, логи,
   error-tracking, бэкап-скрипт, delivery-worker) **написано и протестировано**, но живёт **в дормант-режиме** —
   его прод-ценность не реализована, пока не выполнены owner-gated cutover/drill. Зато **security-CI (Gitleaks/
   Semgrep/Trivy/CVE-скан) и часть RU-privacy — отсутствуют / только план.**

---

## 1. Состояние по трекам (фронт-контур) — кратко

| Трек | Что | Реально |
|------|-----|---------|
| **A — UI** | Doctor/SaaS интерфейс | ~30% evidence-real, **0% принято**. Фундамент + экран Clients + ядро Today реальны; обе названные регрессии (фон DNA, карточка в правой панели) **починены**. UI-1 Расписание (0/20 живых), UI-5b карточка пациента + UI-7 (48 пунктов) — не начаты; UI-3 (1/8). |
| **B — вход владельца** | email-OTP → global admin + PWA/push на TEST | Код готов. **Логин не работает** (SMTP, см. §3). |
| **C — вывод Rubitime** | R1–R7 на TEST | R1–R2 сделано; R3–R6 в коде; `branchServiceId` жив (R3C-11 просрочен); **R7 (архив+DROP таблиц) не начат, DROP-миграции нет**; 348 файлов ещё ссылаются на rubitime. |
| **D — прямые записи integrator→public** | D0…D10 | **Только D0** (честный gate). D1–D10 не начаты. |

---

## 2. Backend-готовность к проду (ФОКУС)

Легенда: **DONE** — реально в коде+тесты; **DORMANT** — код готов, но выключен/не активирован (owner-gate);
**PARTIAL** — частично; **PLAN** — только план; **—** не начато.

| Область | Статус | Суть / что осталось | Evidence |
|---------|--------|---------------------|----------|
| Tenant isolation — модель+RLS | **DONE** | Роли `app_staff/app_patient`, two-pool provider, RLS-политики, 3-режимный switch + FORCE-cutover скрипт | `packages/db-principal`, `deploy/postgres/phase4-force-rls-cutover.sql` |
| Tenant isolation — активация | **DORMANT** | Дефолт `legacy-guc` (стены есть, спят). Прод-флип `locked`+FORCE — owner-runbook, не выполнен | `PHASE4_ROLLOUT_RUNBOOK.md` |
| PII bootstrap-таблицы под enforce | **—** | `platform_user_contacts`, `user_phone_history` допускают org=NULL глобально — 3 flip-blocker'а до FORCE | `TASK_A_PII_TIGHTEN_PLAN.md` |
| Тарифы / entitlements / trial | **DONE** | 15-мех. реестр, resolver (override>tariff>default), trial-lifecycle, admin API `/api/admin/commercial` (capability-gated, audited), guard в ~40 роутах + coverage-checker | `modules/org-entitlements/*`, миграции `0180/0225` |
| Quota enforcement | **PARTIAL** | Жёстко только `courses` (DB-триггер). Остальные мех. = `declared_no_enforcement` | `saasEntitlements` types |
| Платежи-эквайринг (пациент→клиника) | **DONE (dormant по конфигу)** | 5 реальных провайдеров (alfa/cloud/tinkoff/yookassa/mock)+webhooks+тесты; дефолт mock, нужны per-org креды | `infra/payments/*` |
| SaaS-биллинг (платформа→клиника) | **PLAN/DORMANT** | Контракты типизированы, `activation: dormant_until_s4_4`; тариф назначается вручную оператором; PSP не подключён | `modules/payments/saasActivationContract.ts` |
| Магазин / marketplace | **PLAN** | Owner-deferred; есть только фундамент `content_access_grants`, flow покупки нет | `SEQUENCE.md` |
| Абонементы (patient memberships) | **DONE** | Схема+gated-роут+тест | `db/schema/bookingMemberships.ts` |
| **Security CI (Gitleaks/Semgrep/Trivy/ZAP)** | **PLAN** | **В CI нет ни одного** несмотря на прошлую утечку `.env`. SEC-01 `#881` scoped, не реализован | `SECURITY_CI_STACK_PLAN.md`, `ci.yml` |
| **Dependency CVE-скан** | **PARTIAL/вводит в заблуждение** | CI-job `audit` — это НЕ `pnpm audit`, а набор saas-регрессий. CVE не сканируется. Dependabot добавлен | `package.json:92` |
| RLS-conformance в CI | **DONE** | Эфемерный Postgres, cross-org denial, FORCE fail-closed — реальный merge-gate | `ci.yml` job `saas-rls-conformance` |
| DB-access chokepoint / no-raw-SQL | **DONE (enforced)** | Lint-гард блокирует сырой SQL вне репозиториев | `scripts/check-db-chokepoint.mjs` |
| SECURITY DEFINER accessor-слой | **DONE** | 177 вхождений, fixed search_path, fail-closed | `deploy/postgres/*.sql` |
| RU privacy / 152-ФЗ / крипто/retention | **PLAN** | `FINAL_ACCEPTANCE.md` весь пуст; consent/retention/crypto/host-hardening/backups — owner+legal gate | `RU_PRIVACY_AND_PRODUCTION_READINESS/` |
| Бэкап БД — скрипт | **DONE** | 818 строк, age-шифрование, sha256-манифест, fail-closed, retention; висит на `pre-migrations` | `deploy/postgres/postgres-backup.sh` |
| Бэкап — реальный ключ + restore-drill | **—** | Реальное шифрование/восстановление НИКОГДА не выполнялось (DR-01/DR-02 owner-gated) | `deploy/postgres/README.md` |
| Бэкап — расписание | **PLAN** | Cron только в примерах; в `deploy/host/cron.d/` шаблона бэкапа НЕТ. Авто — только `pre-migrations` | `README.md:86` |
| Логи (structured) | **DONE** | pino во всех сервисах, `LOG_LEVEL` | `infra/*/logger.ts` |
| Error-tracking | **DONE** | `packages/error-tracking` (Sentry+PII-scrub), инициализирован во всех 5 рантаймах, DB-opt-in | `packages/error-tracking` |
| Admin audit log | **DONE** | `admin_audit_log`, org-scoped, admin API | `infra/adminAuditLog.ts` |
| Outbound delivery worker | **DONE** | retry/dead-letter/backoff + ledger попыток | `worker/outgoingDeliveryWorker.ts` |
| Delivery-failure alerting | **PARTIAL** | P1–P4 в коде (critical signals, cadence, SMS, red-stop UI); **P0/P-guard live-акцепт на TEST открыты**; alert-cron только шаблоны | `OUTBOUND_DELIVERY_ALERTING_PLAN.md` |
| Сообщения — отправка | **DONE** | patient send 200 | `api/patient/messages/route.ts` |
| Сообщения — mark-read | **BROKEN** | HTTP 500, см. §3 | `pgSupportCommunication.ts:1218` |
| Scheduler / reminders | **DONE** | systemd-юнит подтверждён живым на проде 2026-05-14, lock+restart, web-push tick | `REMINDER_SCHEDULER_ROLLOUT_LOG.md` |

---

## 3. Открытые дефекты — чинить независимо от фронта (точные места)

1. **mark-read HTTP 500.** `pgSupportCommunication.ts:1218` делает прямой `UPDATE support_conversation_messages`, а
   `deploy/postgres/p0-5b-grants.sql:373` даёт пациентской роли только `SELECT, INSERT`. → `42501`.
   **Фикс:** грант `UPDATE (read_at)` пациентской роли (RLS-политика `saas_org_dormant_p0_8_4` уже `FOR ALL` на свой
   диалог) ЛИБО `SECURITY DEFINER` функция. Привилегированная миграция.
2. **SMTP `restricted_setting_read_failed`.** OTP `start` → HTTP 503 `email_send_failed` на TEST. Фикс ридера в HEAD
   `58c577ef` (`runWithBootstrapPrincipal`) **не задеплоен**; плюс на TEST **нет `smtp_outbound`-конфига** (6 полей).
   **Блокирует вход владельца → всю приёмку.**
3. **Isolation diagnostics CRITICAL `role_pool_mismatch`** на TEST (посл. 2026-07-23T14:36, 3 группы/17 вхождений) —
   коррелирует с mark-read denial. Не переклассифицировать в историческое.
4. **Инцидент #839** — создание записи падает `Rubitime sync failed` (реопенит runtime-приёмку R3/R4 в Track C).

---

## 4. BACKEND-FIRST порядок работ (что делать СЕЙЧАС, не завися от фронта)

Пока ты не сел за ручную приёмку UI — гнать это. Приоритет сверху вниз; owner-gate помечен.

- **P0. Разблокировать вход владельца (Track B).** Дать TEST `smtp_outbound` (⛔ owner) → задеплоить HEAD на TEST →
  живой OTP-прогон до 200 + письмо → сессия резолвится в `admin`. Затем PWA/push-проверка. *Открывает приёмку всего.*
- **P0. Починить mark-read 500** (§3.1) — маленький, привилегированная миграция + тест.
- **P0. Разобрать isolation CRITICAL** (§3.3) — не оставлять красным.
- **P1. Security-CI стек (SEC-01/`#881`).** Добавить в `ci.yml` Gitleaks (full-history на main), Semgrep, Trivy-fs;
  реальный CVE-скан (`pnpm audit`/Trivy). **Самый ценный отсутствующий контроль** (была утечка кред).
- **P1. Track D — начать D1→D2** (прямые записи identity/notification-prefs, затем diary/LFK). Крупный backend-пласт,
  полностью независим от фронта. Дальше строгая цепочка D3→D4, D5→D6→D7, D8, финал D10. Каждый пакет = заменить
  `tryEmitWebappProjectionThenEnqueue` в `apps/integrator/src/infra/db/writePort.ts` на транзакционную прямую запись.
- **P1. Delivery-alerting P0 + P-guard** — live fault-injection на TEST (сломать SMTP → громкий red-alert по всем
  каналам + T+1h + red digest). Установить operator-health cron-шаблоны.
- **P2. Task A — закрыть 3 PII flip-blocker'а** (bootstrap phone-write под enforce; NULL-org close-prior UPDATE vs
  unique index; locked base-role assertion). *Предусловие безопасного FORCE-cutover.*
- **P2. Backup DR-01/DR-02** (⛔ owner: ключ) — один реальный age-бэкап + `age -d | pg_restore` end-to-end +
  repo-tracked cron/systemd-timer расписания. *Крупнейшая непроверенная надёжность.*
- **P2. Track C — довести drain/cutoff (RR-PROOF-09) и подготовить R7** (⛔ owner на DROP): убрать `branchServiceId`
  (R3C-11, ~51 webapp-файл — пересекается с booking-экранами Track A), сгенерировать DROP-миграцию (её нет), архив,
  дроп 6 таблиц на TEST, снять residual-гранты.
- **P3. Quota enforcement** — расширить за пределы `courses`, если что-то должно быть жёстко ограничено на GA (owner).
- **P3. Stability residuals** — D1 session revocation + doctor TTL (`#970`, owner на значения), E3 Zod SSOT транспорта
  (`#980`, superseded Track D — только переиспользуемые схемы).

---

## 5. Лист решений владельца (свести и закрыть за присест)

| # | Вопрос | Рекомендация / safe-default |
|---|--------|------------------------------|
| 1 | SMTP-креды для TEST (`smtp_outbound`: host/port/secure/user/password/from) | Дать TEST-only креды → разблокирует вход и alerting-тест |
| 2 | Платный биллинг в первом прод-скоупе? | Если GA = ручное назначение тарифов оператором (без PSP) → SaaS-биллинг/магазин/patient-paid-subs вне scope, backend сильно ближе к готовности |
| 3 | Backup: сгенерировать age-ключ + разрешить DR-drill на TEST | Да — без этого надёжность бэкапа не доказана |
| 4 | FORCE-RLS cutover на TEST (после Task A) | Отрепетировать на TEST: включить `locked`+FORCE, прогнать 2-org/2-patient smoke |
| 5 | Rubitime R7: разрешение на DROP таблиц на TEST | После drain-proof — да, на TEST |
| 6 | Doctor/admin session TTL (D1 `#970`) | 7 дней |
| 7 | Quota: какие механики жёстко капать на GA кроме `courses` | По умолчанию — никакие (soft), уточнить при необходимости |

---

## 6. Перезапуск оркестрации (Codex → Claude Opus/Sonnet)

- Миссия без изменений: `ORCHESTRATOR_PROMPT.md` (обновлён 2026-07-23 разделом «code-first token discipline»).
- **Модели:** Opus — оркестратор + аудит high-risk (auth/tenant/деньги/миграции/данные/необратимое). Sonnet —
  воркеры, тесты, механика, UI-итерации. Не тратить Opus на механические правки.
- **Токен-дисциплина (новое):** верификация обязательна, но её артефакт — дешёвый/исполняемый (gate-скрипт как D0,
  contract-тест), не эссе. Статус писать В МЕСТЕ (checkbox + строка evidence + SHA), не плодить reality-audit/
  reconciliation файлы. Смелл-тест: доков больше, чем кода → стоп. Канон: `ORCHESTRATION_BINDINGS.md` §«Документация
  и токен-дисциплина».
- Приёмка владельца — в СЕРЕДИНЕ (не только в финале); «audit PASS» ≠ «готово».

---

_Провенанс: сведено из 7 read-only разборов кода 2026-07-23 (треки A/B/C/D + backend: SaaS-монетизация, security,
ops). Первоисточники — файлы под `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/`, `docs/_TODO/SAAS_FOUNDATION/`,
`docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/`, `docs/_TODO/SECURITY_CI_STACK_PLAN.md`,
`docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` и код, процитированный в колонках Evidence._
