# AUDIT_STAGE_B7 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B7 (универсальный паттерн комментария: template `comment` → instance frozen snapshot + `local_comment` / override, read/fallback, граница с `body_md`)  
**Source plan:** [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md), [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) (B7 ЛФК, Q7), [`MASTER_PLAN.md`](MASTER_PLAN.md) §9, продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §2.9 / §3 B7  
**Execution log:** [`LOG.md`](LOG.md) — разделы «Stage B7 — EXEC», «Stage B7 — FIX»

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Паттерн copy / override / clear / fallback для элементов этапа программы и для ЛФК сохранён. **B7-M1 закрыт:** в снимок `test_set` добавлен `comment` из `test_set_items`; пациент и врач видят комментарии позиций набора в контексте элемента программы. Рекомендации (Q7): `body_md` по-прежнему не смешан с item-`comment`. Полный **`pnpm run ci`** в сессии FIX не прогонялся — **обязателен перед push** ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9, [`pre-push-ci.mdc`](../../../../.cursor/rules/pre-push-ci.mdc)).

## 2. Матрица покрытия контейнеров (проверка по коду)

| Контейнер | Template / каталог `comment` | Instance / runtime | Copy | Override + fallback | Doctor UI | Patient read | Статус |
|-----------|-------------------------------|--------------------|------|---------------------|-----------|---------------|--------|
| `treatment_program_template_stage_items` → instance | `comment` | `comment` + `local_comment` | `createInstanceTree` | `effectiveInstanceStageItemComment` + PATCH | конструктор + экземпляр | `PatientTreatmentProgramDetailClient` | **PASS** |
| `test_set_items` → snapshot в элементе `test_set` | `comment` в БД | в JSON снимка `tests[].comment` | при `buildSnapshot` из строк набора | N/A (override строк набора вне B7 v1) | каталог + **экземпляр** ([`TestSetCatalogSnapshotLines`](../../../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx)) | **PASS** ([`TestSetBlock`](../../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) + [`parseTestSetSnapshotTests`](../../../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts)) |
| ЛФК template → instance | `comment` | `comment` + `local_comment` | assign | effective + PATCH | да | дневник | **PASS** |
| Рекомендация (Q7) | без отдельного catalog comment | item comment программы отдельно | snapshot `bodyMd` | — | `bodyMd` в форме | снимок | **PASS** |

## 3. Copy / override / clear / fallback

Без изменений относительно первичного аудита EXEC; см. [`LOG.md`](LOG.md) B7 EXEC и тесты `instance-service`, `lfkComplexExerciseComment`.

## 4. `bodyMd` и `comment`

**PASS** — см. первичный аудит §4; регрессий FIX не вносилось.

## 5. Соответствие `STAGE_B7_PLAN.md` §6

Чеклист в плане отмечен выполненным в EXEC; FIX дополняет матрицу `test_set` без смены §6 пунктов.

## 6. Ограничения и остаточные риски

- **In-memory snapshot ЛФК / дневник:** прежнее ограничение dev — см. первичный аудит; **defer** (minor): не блокер prod.
- **E2E:** в репозитории нет обязательного Playwright-контура для цепочки ЛФК; **defer** (minor): ручной/QA smoke по [`LOG.md`](LOG.md) B7 EXEC.
- **Полный `pnpm run ci`:** перед **push** ветки — обязателен по правилам репозитория (в сессии FIX не выполнялся).

## 7. DoD B7

- [x] Матрица контейнеров — полная после FIX.
- [x] ЛФК `local_comment` + read path.
- [x] Комментарий строк набора в контексте элемента `test_set` (snapshot + UI).
- [x] `body_md` не смешан с item-`comment`.

---

## 8. Findings (первичный аудит → статус после FIX)

| ID | Уровень | Статус |
|----|---------|--------|
| B7-M1 | major | **Закрыт** (см. §12 FIX) |
| B7-m1 | minor | **Deferred** — нет стандартного E2E в репо; QA smoke перед релизом |
| B7-m2 | minor | **Deferred** — in-memory by design для dev без БД |

---

## 9. MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03 FIX)**

### critical

*N/A.*

### major

1. **~~Снимок `test_set` + UI~~** — **done:**
   - [`pgTreatmentProgramItemSnapshot.ts`](../../../../apps/webapp/src/infra/repos/pgTreatmentProgramItemSnapshot.ts) — в `tests[]` добавлено `comment: it.comment ?? null`.
   - [`testSetSnapshotView.ts`](../../../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.ts) + [`testSetSnapshotView.test.ts`](../../../../apps/webapp/src/modules/treatment-program/testSetSnapshotView.test.ts) — парсер и legacy-без ключа `comment`.
   - [`PatientTreatmentProgramDetailClient.tsx`](../../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx) — отображение «Комментарий к позиции» в `TestSetBlock`.
   - [`TreatmentProgramInstanceDetailClient.tsx`](../../../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx) — блок «Набор тестов (каталог)» для `item.itemType === "test_set"`.
   - [`PatientTreatmentProgramDetailClient.test.tsx`](../../../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx) — регрессия на текст из снимка.

### minor

1. **Deferred (B7-m1):** автоматизированный E2E «ЛФК assign → override → patient card» — вне текущего tooling; оставить в QA чеклисте релиза.  
2. **Deferred (B7-m2):** in-memory порты без PostgreSQL — без изменений.

## 10. Закрытие

- Verdict: **PASS** при целевых проверках FIX; **перед push** — полный `pnpm install --frozen-lockfile && pnpm run ci` ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

---

## 11. История вердикта (для трассировки)

- Первичный аудит: **CONCERNS** (B7-M1: отсутствовал `comment` в snapshot `test_set`).
- После FIX 2026-05-03: **PASS**.

## 12. MANDATORY FIX INSTRUCTIONS — первичный черновик (до FIX)

Сохранён для истории: major требовал расширить snapshot и UI; см. §9 **выполнено** выше.
