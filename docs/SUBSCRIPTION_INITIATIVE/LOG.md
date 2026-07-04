# SUBSCRIPTION (АБОНЕМЕНТ) INITIATIVE — LOG

> Execution log (§6.10 / plan-authoring-execution-standard). Append-only. Что сделано, какие проверки, какие решения.

## 2026-06-20 — Planner (Opus), фаза планирования (§3)
- Прочитан канон `docs/AGENT_AUTORUN_SCHEME.md` (§3/§6/тиринг ⚖️/acceptance 🎯), `orch/roles/ROLE_PROMPTS_v3.md` (роль Planner), `AGENTS.md` + `.cursor/rules/*` (список).
- READ-ONLY исследование кода (грепы + чтение). **Ключевая находка:** абонементы УЖЕ существуют как зрелая подсистема `modules/memberships` + таблицы `be_subscription_packages`/`be_patient_packages`/`be_package_usages` (миграции 0094/0095/0105). Частично закрыты боли #3 (календарь ✅-пометка+фильтр) и #5 (KPI-виджет в «Обзоре»). Боль #1 есть, но на вкладке «Записи», не «Финансы». Боль #2 (bulk-«Пересчитать») — НЕТ. Боль #4 (признак на визите) — НЕТ.
- Создана инфра инициативы: `REQUIREMENTS.md` (боли дословно + карта покрытия), `ROADMAP.md` (ST-01..ST-07, backend/ui разделены, тиринг по риску), `OPEN_QUESTIONS.md` (OQ-1..OQ-11), `LOG.md`, `audit/`.
- Код НЕ менялся (READ-ONLY). Dev-сервер не поднимался.

### НАШЁЛ/ИЗМЕНИЛ (инструментация §⚖️)
`НАШЁЛ: да | Существующая система абонементов modules/memberships + be_*_packages (миграции 0094/0095/0105): создание с soldAt, ledger be_package_usages, balanceCalculator, FEFO, doctor-панель DoctorClientMembershipsPanel на вкладке «Записи», календарь ✅-пометка+фильтр «По абонементу» (ScheduleCalendarTab), KPI-виджет Package в «Обзоре». Финансы-вкладка (PatientTabFinances) работает с ОТДЕЛЬНОЙ patient_payment (cash/acquiring) — абонемента там нет. Net-new: bulk-«Пересчитать» (списать прошедшие записи в окне [soldAt; now]), вывод во «Финансы», признак абонемента в проекции визита (listVisits). ИЗМЕНИЛ КОД: нет (планирование, READ-ONLY).`

## 2026-07-04 — ST-01: сервис-операция bulk-«Пересчитать» (ядро боли #2) `backend` `complex`
Воркер (Opus). Изолированный worktree `/tmp/st01-recalc`, ветка `feat/subscription-recalc` от `feat/integration`.

**Реализовано:**
- `apps/webapp/src/modules/memberships/service.ts` — новый метод `recalcPastSessionsForPackage({ organizationId, patientPackageId, createdByPlatformUserId?, nowIso? })`. Идемпотентная bulk-операция: находит прошедшие записи пациента по услугам пакета в окне `[soldAt; now)`, состоявшиеся (`completed`/`visit_confirmed`), с `linkage === "none"`, и списывает по одному сеансу на запись до исчерпания баланса позиции (без минуса). Каждое списание: `appendUsage(consume)` в append-only `be_package_usages` + `setAppointmentPackageUsageRef` (пометка записи для календаря/визита) + `appendHistoryEvent("recalc_consumed")` + best-effort `refreshPackageCalendarForAppointment`. Возврат сводки `{ patientPackageId, debited[], skipped[], outOfBalance[] }`.
- `apps/webapp/src/modules/memberships/ports.ts` — новый порт-метод `listRecalcCandidateAppointments(...)` (выборка прошедших записей пациента по услугам пакета в окне + их usages). Существующий `listPackageAppointmentSessionSources` **НЕ переиспользован для выборки**: он стартует от `be_package_usages` и возвращает только записи, уже привязанные к пакету — не находит легаси-записи БЕЗ usage, которые и нужно бэкфилить. Переиспользованы `computeItemBalances`, `computeAppointmentPackageLinkage`, `isPatientPackageWithinValidity`, `refreshPatientPackageRecord`.
- `apps/webapp/src/modules/memberships/types.ts` — типы `RecalcPastSessionsSummary`, `RecalcDebitedEntry`, `RecalcSkippedEntry`, `RecalcSkipReason`.
- `apps/webapp/src/infra/repos/pgMemberships.ts` — реализация `listRecalcCandidateAppointments` на drizzle (join `be_appointments` по `platformUserId` + `serviceId ∈ услуги пакета` + `startAt ∈ [soldAt; now)`, подтяжка usages). Без сырого SQL.

**Решения владельца:** OQ-5/OQ-7 — только `completed`/`visit_confirmed` (константа `RECALC_ELIGIBLE_STATUSES`), отменённые/неявки/незакрытые НЕ трогаем. OQ-6 — до нуля, без минуса, БЕЗ warning-UI (surplus → `outOfBalance`, не «не хватило на M»). OQ-4 — метод на конкретный пакет по id; при нескольких пакетах вызывается по каждому (FEFO-порядок — на слое вызова/API ST-02). Идемпотентность — `linkage!=none` пропускается.

**Проверки:** `apps/webapp/src/modules/memberships/service.test.ts` +11 unit-тестов (пустое окно; окно передаётся корректно; уже списана=idempotent; услуга вне пакета; неeligible-статус; исчерпание баланса=стоп без минуса; ledger+ref+history+calendar на каждое списание; несколько записей списываются; повторный вызов=no-op; inactive/expired пакет=no-op). Прогон через `/home/dev/orch/run-tests.sh`: **27 passed (27)** (16 существующих + 11 новых). `tsc --noEmit` по webapp — чисто (exit 0).

**Границы/сомнения для аудитора:**
- Окно фильтруется в SQL (`gte(startAt, soldAt)`, `lt(startAt, now)`); тест «до soldAt» проверяет корректность передаваемого окна, а не результат SQL (репо-выборку проверит интеграционный/трассировочный аудит на живой БД).
- `soldAt` fallback: если `null`, берём `validFrom`, затем `createdAt`.
- Concurrency: списание идёт последовательно, баланс декрементируется локально в пределах одного прохода. При двух ОДНОВРЕМЕННЫХ вызовах «Пересчитать» на один пакет теоретически возможно двойное списание одной записи (нет транзакционного локирования на уровне записи) — API-слой (ST-02) должен исключить параллельный повторный вызов, либо добавить unique-guard на (appointmentId, consume). Пометить для Opus-аудита.
- `charged_to_package` НЕ входит в eligible-статусы: такие записи уже несут consume-usage → отсекаются по `linkage!=none` (двойная защита).
