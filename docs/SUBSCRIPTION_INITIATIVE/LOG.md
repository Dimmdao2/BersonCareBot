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

## 2026-07-04 — ST-02: API «Пересчитать» (доктор) + закрытие гонки `backend` `complex`
Воркер (Opus). Тот же worktree `/tmp/st01-recalc`, ветка `feat/subscription-recalc` поверх ST-01 (HEAD ff2cb715). Предыдущий запуск был прерван вхолостую (0 коммитов) — переделано заново.

**Реализовано:**
- `apps/webapp/src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts` — `POST` по шаблону соседнего `consume/route.ts`: гейт `requireDoctorBookingEngine()`, `id` пакета из params (body не требуется), вызов `deps.memberships.recalcPastSessionsForPackage({ organizationId (из гейта), patientPackageId, createdByPlatformUserId })`, best-effort calendar-sync (`emitPackageLinkedCalendarSync`) по каждой списанной записи, возврат сводки для тоста `{ ok, summary: { debited, skipped, outOfBalance } }` (счётчики). 503 если memberships недоступен, 400 на ошибку сервиса.
- `apps/webapp/src/app/api/admin/booking-engine/patient-packages/[id]/recalc/route.ts` — admin-зеркало (у `consume` есть admin-пара → мостим ту же структуру; гейт `requireAdminBookingEngine`, без calendar-sync — как в admin/consume).

**IDOR/владение (OQ-1):** как в `consume/route.ts` — `organizationId` берётся из аутентифицированного гейта, а сервис грузит пакет через `getPatientPackage(id, organizationId)`. Пакет чужой организации резолвится в `null` → `package_not_found` (400). Recalc не может тронуть чужой пакет. Дублирующей проверки на роуте `consume` не делает — не плодим и мы (единый organizationId-фильтр в методе).

**Закрытие гонки (обязательный acceptance аудита):**
- Новый порт-метод `runWithPackageLock<T>(patientPackageId, organizationId, fn)` (`ports.ts`). PG-реализация (`pgMemberships.ts`): `db.transaction()` + `SELECT pg_advisory_xact_lock(hashtextextended(<packageId>, 0))` — транзакционно-скоупленный advisory-lock, авто-снимается на COMMIT/ROLLBACK. Второй параллельный POST recalc БЛОКИРУЕТСЯ до коммита первого, поэтому читает баланс из ledger УЖЕ после списаний первого прохода → двойного списания нет.
- Сервис (`service.ts`): весь проход «прочитать баланс → списать» обёрнут в `runWithPackageLock`. Чтение `listUsagesForPackage` перенесено ВНУТРЬ лока (не до), плюс внутри лока — свежая пере-проверка `already_debited` по только что прочитанным usages (второй проход пропускает записи, списанные первым). ST-01 сервис-слой доработан минимально, 27 тестов ST-01 сохранены зелёными.
- Fake-порт (`makePort`) получил `runWithPackageLock` = сериализующий per-key promise-mutex (семантика PG advisory-lock для теста).
- **Доказательство:** тест «two parallel recalc passes do NOT double-debit» — пакет с остатком 1 + 1 подходящая запись, два `Promise.all` вызова recalc на общий stateful-порт (ledger, который `listUsagesForPackage` отдаёт, а `appendUsage` пополняет). Проверка: ровно 1 `consume` в ledger, `appendUsage` вызван 1 раз, суммарно `debited=1`. ⛔ Жёсткий unique-constraint на consume НЕ добавлялся (сломал бы refund→re-consume).

**Тесты:** `recalc/route.test.ts` (+4: happy-path со счётчиками+org+calendar-sync per debit; 403 без роли — сервис не вызван; идемпотентный повтор=no-op пустая сводка без sync; ошибка сервиса→400) + `service.test.ts` (+1: race). Прогон через `/home/dev/orch/run-tests.sh`: **service.test.ts 28 passed (27 ST-01 + 1 race)**, **recalc/route.test.ts 4 passed**. `tsc --noEmit` по webapp — чисто (exit 0).

**Сомнения для аудитора:**
- Порт-методы списания (`appendUsage`/`setAppointmentPackageUsageRef`/`appendHistoryEvent`) внутри `fn` идут через `getDrizzle()` (пул), НЕ через tx-хендл транзакции лока — каждый авто-коммитится. Advisory-lock всё равно корректен: он сериализует проходы (второй ждёт коммита первого), и т.к. пул-запросы авто-коммитятся, списания первого видны второму после снятия лока. Транзакция-обёртка нужна только чтобы дать advisory-lock время жизни до конца прохода. Полноценная единая транзакция потребовала бы прокинуть tx-хендл во все порт-методы (крупный рефактор ST-01) — не делал.
- `hashtextextended(text, int8)` — стандарт PG 12+; коллизия хэша дала бы лишнюю сериализацию двух разных пакетов (безопасно, лишь чуть медленнее), не пропуск лока.
- Race-тест — на fake-мьютексе (семантика advisory-lock), не на живой БД. Живую сериализацию подтвердит интеграционный/трассировочный аудит на реальном Postgres.
- Admin-зеркало добавлено по факту наличия admin/consume; если admin-путь для recalc не нужен продукту — удалить один файл.
