# Аудит этапов 2–6: Booking Rework City Service

**Дата:** 2026-04-01  
**Версия:** финальная (после Stage 6)  
**Статус:** **approve**

---

## 1. Метод

1. Просмотр кода и тестов по областям: миграции и каталог (Stage 2), admin API (Stage 3), patient booking + public API + UI (Stage 4), integrator M2M v2 + legacy изоляция (Stage 5), тест-матрица и регрессии (Stage 6).
2. Сверка с `MIGRATION_CONTRACT_V2.md` и `API_CONTRACT_V2.md`.
3. Классификация замечаний: critical / major / minor; повторная проверка после исправлений в рамках ветки.

---

## 2. Stage 1 и реестр закрытых замечаний этапов 1–5

**Stage 1 (спеки и контракты):** отдельный код-дифф невелик; требования зафиксированы в `BOOKING_MODULE_SPEC.md`, `API_CONTRACT_V2.md`, `MIGRATION_CONTRACT_V2.md`, `SEED_MAPPING_TOCHKA_ZDOROVYA.md`. Закрытые по аудиту правки перечислены в `EXECUTION_LOG.md` в блоках **Audit fixes** у задач S1.T01–S1.T05.

**Этапы 2–5 (сводка):** все задачи в логе имеют `Status: done`; пост-аудитные правки Stage 3 и Stage 5 зафиксированы в логе в разделах **Stage 3 — audit remediation** и **Stage 5 — audit remediation**. Открытых пунктов по этим этапам нет.

| Этап | Где искать детали закрытых замечаний |
|------|-------------------------------------|
| 1 | `EXECUTION_LOG.md` → Stage 1 → `Audit fixes` у S1.T01–S1.T05 |
| 2 | `EXECUTION_LOG.md` → Stage 2 → `Audit fixes` у S2.T01, S2.T05, S2.T06 |
| 3 | `EXECUTION_LOG.md` → **Stage 3 — audit remediation** |
| 4 | `EXECUTION_LOG.md` → **Stage 4 — закрытие замечаний аудита** |
| 5 | `EXECUTION_LOG.md` → **Stage 5 — audit remediation** |

---

## 3. Соответствие контрактам

| Тема | Ожидание (документ) | Подтверждение |
|------|---------------------|---------------|
| DDL каталога + `patient_bookings` | Nullable v2 колонки, индексы, порядок миграций | `046_*`, `047_*` согласованы с `MIGRATION_CONTRACT_V2.md` |
| In-person v2 M2M | `version: v2`, explicit `rubitime*Id`, без category/city в теле v2 | `internalContract.ts`, `schema.ts`, маршруты `recordM2mRoute.ts` |
| `slotEnd` | Webapp не обязан слать в v2 create; длительность из услуги | Отражено в `API_CONTRACT_V2.md`; integrator принимает v2 без `slotEnd` в схеме |
| Legacy resolve | Отключаемый путь v1 через env + v2 без профилей | `legacyResolveFlag.ts`, тесты `legacy_resolve_disabled` |
| Idempotency / local booking | `localBookingId` опционально в v2 create | `RubitimeCreateRecordV2Schema` |

---

## 4. Замечания и статус

### Critical

- Нет открытых critical: блокирующих расхождений с контрактом безопасности данных или M2M не выявлено.

### Major

- **M-1 (закрыто):** явная изоляция legacy profile resolve от v2 — зафиксирована флагом и тестами.
- **M-2 (закрыто):** dual-read legacy vs v2 в кабинете — покрыто репозиторием и подписями.

### Minor

- **m-1 (принято):** операторский порядок деплоя описан в `CUTOVER_RUNBOOK.md`; при смене шагов деплоя обновлять runbook — обязанность релиз-ответственного.
- **m-2 (принято):** полный браузерный E2E по шагам кабинета не входит в CI; сценарии перечислены в `TEST_MATRIX.md` §1–2; smoke вручную перед cutover.

### Stage 6 — закрытие внешних замечаний ревью (2026-04-01)

- Добавлен **реестр этапов 1–5** (§2) со ссылками на `EXECUTION_LOG.md`.
- В `TEST_MATRIX.md` добавлена **traceability: ID матрицы → автотесты** (§6).
- В `EXECUTION_LOG.md` зафиксированы **коммит и повторный `pnpm run ci`** для воспроизводимости.
- В `CHECKLISTS.md` уточнены пункты про CI на релизном коммите и самоаттестацию §1.

---

## 5. Повторный аудит (rework)

После добавления Stage 6: тест-матрица, расширенные unit/integration тесты webapp/integrator, полный `pnpm run ci` — замечаний, требующих кода, не осталось.

---

## 6. Итог

**Финальный статус: `approve`**

Рекомендация: выполнить production cutover по `CUTOVER_RUNBOOK.md` после операторского sign-off на seed/backfill в целевой среде.
