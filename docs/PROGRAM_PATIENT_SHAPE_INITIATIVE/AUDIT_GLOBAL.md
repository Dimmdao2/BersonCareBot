# GLOBAL AUDIT — PROGRAM_PATIENT_SHAPE (после A1…A5)

**Дата:** 2026-05-03  
**Область:** полная инициатива [`PROGRAM_PATIENT_SHAPE_INITIATIVE`](.) после закрытия этапов **A1–A5**.  
**Канон ТЗ:** [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md)  
**Операционные источники:** [`MASTER_PLAN.md`](MASTER_PLAN.md), [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) … [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md), [`LOG.md`](LOG.md), [`AUDIT_STAGE_A1.md`](AUDIT_STAGE_A1.md) … [`AUDIT_STAGE_A5.md`](AUDIT_STAGE_A5.md).

---

## 1. Итоговый вердикт

| Критерий | Статус | Комментарий |
|---|---|---|
| Цикл **EXEC → AUDIT → FIX** по этапам | **PASS** | Все этапы имеют `AUDIT_STAGE_A*.md`; FIX отражены в `LOG`. Структура **`LOG.md`** исправлена global fix (**GLOBAL-LOG-STRUCT-01**). |
| Соответствие **`PROGRAM_PATIENT_SHAPE_PLAN.md`** и stage-планам | **PASS** | Доменная модель, O1–O4, группы, лог, бейджи — реализованы в коде с известными отложенными backlog-пунктами (UTC-сутки, несколько активных программ на Today и т.д.). |
| **O1 / O2 / O3 / O4** в зафиксированном виде | **PASS** | См. §3 (проверка по коду). |
| Scope **treatment-program** контура | **PASS с оговоркой** | Ядро — `modules/treatment-program`, patient/doctor API программ, UI `patient/treatment-programs/**`. Законные точки интеграции: **Today** (`patient/home/*` для бейджа плана), **карточка клиента** (`doctor/clients/*` для inbox A4) — соответствуют §2.1 ТЗ и карте `MASTER_PLAN` §3.1. |
| Этап 0, группы, action log, бейджи — согласованность | **PASS** | См. §5. |
| Документация и **LOG** синхронизированы | **PASS** | После global fix: шапка ТЗ, [`README.md`](README.md), §4/§7 [`MASTER_PLAN.md`](MASTER_PLAN.md), структура [`LOG.md`](LOG.md). |
| Полный **`pnpm run ci`** на финальном дереве | **PASS** | Зафиксировано в записи «Global fix» в [`LOG.md`](LOG.md) (**GLOBAL-CI-01**). |

**Общий статус инициативы (после global fix 2026-05-03):** **PASS / merge-ready** при условии повторения CI на том же коммите перед push (см. [`MASTER_PLAN.md`](MASTER_PLAN.md) §7).

---

## 2. Цикл EXEC → AUDIT → FIX по этапам

| Этап | EXEC в `LOG.md` | `AUDIT_STAGE_*.md` | FIX / POST-FIX | Замечание |
|---|---|---|---|---|
| **A1** | Да | [`AUDIT_STAGE_A1.md`](AUDIT_STAGE_A1.md) — PASS | Да (`A1-DOC-01/02`, api.md, чек-лист плана) | — |
| **A2** | Да | [`AUDIT_STAGE_A2.md`](AUDIT_STAGE_A2.md) — PASS | Да (`A2-READ-01`, `A2-TXN-01`) | Исправление журнала — см. §6 / global fix. |
| **A3** | Да | [`AUDIT_STAGE_A3.md`](AUDIT_STAGE_A3.md) — PASS | Да (`A3-ASSIGN-DEF`) | — |
| **A4** | Да | [`AUDIT_STAGE_A4.md`](AUDIT_STAGE_A4.md) — PASS | Документальный POST-FIX (defer идентификаторов) | Critical/Major в первичном аудите не заводились. |
| **A5** | Да | [`AUDIT_STAGE_A5.md`](AUDIT_STAGE_A5.md) — PASS | Да (`A5-PLAN-OPENED-SILENT-01`, `A5-PG-MAX-TYPE-01`) | Info-деферы зафиксированы в аудите. |

**Вывод:** цикл соблюдён; форма **`LOG.md`** приведена в порядок global fix (**GLOBAL-LOG-STRUCT-01**).

---

## 3. O1 / O2 / O3 / O4 — проверка реализации

Источник решений: [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §8.3; [`MASTER_PLAN.md`](MASTER_PLAN.md) §6.4.

| ID | Зафиксированное решение | Проверка | Статус |
|---|---|---|---|
| **O1** | `objectives` — **TEXT (markdown)** на этапах шаблона и экземпляра; без JSONB-чеклиста в этой волне | `treatmentProgramTemplateStages.objectives` и instance stages — `text`; JSDOC O1 в `treatmentProgramTemplates.ts`; копирование в `instance-service`; тест deep copy A1 | **PASS** |
| **O2** | ЛФК в MVP: одна запись `program_action_log` на **уровне комплекса**, не per-exercise | `patientSubmitLfkPostSession` — один `insertAction` на `stageItemId` комплекса, `payload.source: "lfk_session"` | **PASS** |
| **O3** | Текст формы «Как прошло занятие?» → **`program_action_log.note`**; отдельное поле сессии в БД не добавлять | `patient-program-actions.ts`: `note: noteTrim` при `actionType: "done"` | **PASS** |
| **O4** | `is_actionable` только на **`treatment_program_instance_stage_items`**; каталогный default не вводить | Схема instance items; `grep` по репозиторию не находит `default_is_actionable` / `defaultIsActionable`; комментарии O4 в `stage-semantics.ts` | **PASS** |

---

## 4. Scope: treatment-program контур

**Ожидаемое ядро (из планов):**

- `apps/webapp/src/modules/treatment-program/**`
- API `.../treatment-program-templates/**`, `.../treatment-program-instances/**`, patient routes программы
- UI пациента: `apps/webapp/src/app/app/patient/treatment-programs/**`

**Законные расширения поверхности (продуктово обоснованные):**

- **`PatientHomeToday` / `PatientHomePlanCard`** — бейдж «План обновлён» и вход на план ([`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §2.1).
- **`ClientProfileCard` и страницы `doctor/clients/**`** — inbox «К проверке» (§4.3 ТЗ).

**Вывод:** выхода в курсы, отдельный catalog rework (B1–B7 домен), integrator — не обнаружено в рамках описанной реализации в аудитах и `LOG`. Нет признаков новых env для интеграций.

---

## 5. Согласованность: Этап 0, группы, action log, бейджи

| Тема | Ожидание ТЗ | Факт реализации | Статус |
|---|---|---|---|
| **Этап 0** | `sort_order === 0`; вне FSM completion; всегда видим; `progress-service.maybeCompleteStageFromItems` не завершает этап 0 по items | `isStageZero` в `stage-semantics.ts`; ранние `return` в `progress-service.ts`; UI: блок «Общие рекомендации» + `ignoreStageLockForContent`; чек-лист берёт этап 0 если не `skipped` | **PASS** |
| **Группы** | Template + instance таблицы; `group_id` на items; копирование при assign; UI пациента `<details>`; пустые группы скрываются после фильтра disabled | Миграция A3, `omitDisabled…` + фильтр групп в `PatientInstanceStageBody`; чек-лист обогащён `groupTitle` из `st.groups` | **PASS** |
| **Action log** | `program_action_log`; чек-лист, ЛФК post-session, маркер теста; исключить disabled / persistent / test_set из чек-листа | Таблица + сервисы; `isProgramChecklistItem`, `pickStagesForPatientChecklist`; прогресс-сервис — маркер после теста | **PASS** |
| **Бейджи** | «План обновлён» из событий после last opened; «Новое» по `last_viewed_at`; backfill | Миграция A5, `patientPlanUpdatedBadgeForInstance`, `touchPatientPlanLastOpenedAt`, mark-viewed, coerce max timestamp | **PASS** |

**Известные продуктовые ограничения (не блокируют PASS по §5):** несколько активных программ на Today (**A5-TODAY-INSTANCE-01**); UTC-сутки чек-листа (**A4-UTC-01**).

---

## 6. Документация и LOG

| Артефакт | Проблема (на момент аудита) | Серьёзность | Статус после global fix (2026-05-03) |
|---|---|---|---|
| [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) строка 3 | Текст **«Код не менялся»** противоречил реализации | Low | **Закрыто** — шапка обновлена (**GLOBAL-TZ-HEADER-01**) |
| [`README.md`](README.md) и [`MASTER_PLAN.md`](MASTER_PLAN.md) §4 | Нет канонической ссылки на итоговый аудит | Medium | **Закрыто** — **`AUDIT_GLOBAL.md`** (**GLOBAL-DOC-INDEX-01**) |
| [`LOG.md`](LOG.md) | Фрагмент **POST-AUDIT FIX A2** был внутри записи A3 | Medium | **Закрыто** — отдельная секция (**GLOBAL-LOG-STRUCT-01**) |

---

## 7. MANDATORY FIX INSTRUCTIONS (severity)

Ниже — обязательные действия перед финальной фиксацией статуса инициативы и merge в sense [`MASTER_PLAN.md`](MASTER_PLAN.md) §7 / DoD.

**Выполнение:** закрыто **2026-05-03** — см. §9 и верхнюю запись «Global fix» в [`LOG.md`](LOG.md).

| ID | Severity | Инструкция | Обоснование |
|---|---|---|---|
| **GLOBAL-CI-01** | **BLOCKER** | Выполнить на актуальном дереве: `pnpm install --frozen-lockfile && pnpm run ci`. Зафиксировать результат в [`LOG.md`](LOG.md). | Корневой DoD и барьер качества; текущий журнал многократно исключает полный CI. |
| **GLOBAL-LOG-STRUCT-01** | **Major** | Отредактировать [`LOG.md`](LOG.md): вынести блок **A2 POST-AUDIT FIX** из середины записи A3 в правильное место **хронологически после** записи Stage A2 (или объединить с существующей записью A2 без дублирования); сохранить единый поток дат. | Исполнитель и ревьюер должны однозначно читать историю EXEC/FIX. |
| **GLOBAL-DOC-INDEX-01** | **Medium** | Обновить [`README.md`](README.md) и §4 [`MASTER_PLAN.md`](MASTER_PLAN.md): добавить ссылку на **`AUDIT_GLOBAL.md`**; явно указать, что он заменяет/дополняет черновой `PROGRAM_PATIENT_SHAPE_EXECUTION_AUDIT.md` **или** переименовать файл по решению команды (один канонический URL). | Избежать расхождения «ожидали execution audit — лежит global audit». |
| **GLOBAL-TZ-HEADER-01** | **Low** | Обновить шапку [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md): убрать или заменить **«Код не менялся»** на актуальный статус («реализовано по этапам A1–A5», дата). | Синхронность продуктового ТЗ с реальностью репозитория. |

### Деферы из stage-аудитов (не обязательный FIX до следующего продукта)

| ID | Severity | Статус |
|---|---|---|
| A4-LOG-TYPES-01 | Info / Future | Отдельные строки лога с `action_type: "viewed"` / как тип **note** — defer (см. [`AUDIT_STAGE_A4.md`](AUDIT_STAGE_A4.md)). |
| A4-UTC-01 | Info | Чек-лист по UTC — defer до timezone из `system_settings`. |
| A5-TODAY-INSTANCE-01 | Info | Несколько активных программ на Today — defer. |
| A3-UI-INST-01 | Info | Полноценный UI редактирования instance-группы — defer. |
| A2-LEGACY-01 | Info | Контент шаблонов с конфликтующим `sort_order` — defer. |

---

## 8. Закрытие

После выполнения **GLOBAL-CI-01**, **GLOBAL-LOG-STRUCT-01** и **GLOBAL-DOC-INDEX-01** статус инициативы может быть повышён до **PASS / merge-ready** при зелёном CI.

**Текущий статус (после global fix):** **PASS / merge-ready** по документам и CI локально — см. §9.

Этот документ — **глобальный аудит** после A1…A5; дальнейшие изменения домена фиксировать новыми записями в [`LOG.md`](LOG.md) и при необходимости точечными аудитами.

---

## 9. Global fix — статус закрытия (2026-05-03)

| ID | Результат |
|---|---|
| **GLOBAL-CI-01** | Закрыт при записи в [`LOG.md`](LOG.md): полный `pnpm install --frozen-lockfile && pnpm run ci` — см. запись «Global fix». |
| **GLOBAL-LOG-STRUCT-01** | Закрыт: блок **A2 POST-AUDIT FIX** вынесен из записи A3 в отдельную секцию между исполнением A3 и исполнением A2 (обратный хронологический журнал). |
| **GLOBAL-DOC-INDEX-01** | Закрыт: [`README.md`](README.md), §4 [`MASTER_PLAN.md`](MASTER_PLAN.md), §7 Completion Criteria — ссылка на **`AUDIT_GLOBAL.md`** как канон итогового аудита. |
| **GLOBAL-TZ-HEADER-01** | Закрыт: шапка [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) обновлена (статус реализации A1…A5). |

**Minor / defer из §7:** без изменения кодовой базы — деферы stage-аудитов остаются осознанным backlog (см. таблицу в §7 исходного аудита).
