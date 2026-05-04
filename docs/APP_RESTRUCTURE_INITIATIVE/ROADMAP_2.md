# ROADMAP_2 — следующий цикл после закрытия A1–A5 / B1–B7 / D1–D6 и E2E acceptance

**Статус:** живой документ. Создан 2026-05-04 по итогам [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md).
**Синхронизация 2026-05-04 (owner):** редизайн **раздела «Назначения»** в кабинете врача (кластер меню, списки каталогов, общий UX блока) — **практически закрыт**; возможны точечные хвосты по приёмке. **Шаблоны программ лечения** — остаются **небольшие правки** (список/конструктор); **не блокер** для пунктов §3 (patient) и §4 (карточка врача). **Курсы** — **отложены** владельцем (см. [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md), §6.2 здесь).
**Синхронизация 2026-05-04 (код):** пункт **§1.2** — закрыт **технический хвост** (legacy URL → `next.config`, no-op `createLfkComplex`, empty state без самосоздания комплекса); полный UX «сегодня в фокусе / read-only история» — **в backlog** внутри §1.2 (см. DoD ниже, [`LOG.md`](LOG.md)).
**Синхронизация 2026-05-05 (docs):** инициатива **`PATIENT_APP_SHADCN_ALIGNMENT`** перенесена в архив; правила shadcn/shared при переработке страниц закреплены в **§1 п.4**; бывший единый Phase 7 — в мини-инициативах по экрану (см. [`LOG.md`](LOG.md) 2026-05-05).
**Синхронизация 2026-05-05 (планирование):** добавлен пункт **§1.1b** — визуальный редизайн `/treatment-programs/[instanceId]` до эталонного дизайна (hero с badges, карточка контроля, `Collapsible` для этапа 0, превью текущего этапа + маршрут `stages/[stageId]`, компактный список предыдущих этапов). Разблокирован закрытием `PATIENT_APP_SHADCN_ALIGNMENT` Phase 1 (`Collapsible`/`Accordion` теперь в `components/ui/`). Зафиксированы **batch-комбинации** для §1.4 (cabinet + `CabinetPastBookings` → `Collapsible`) и §1.6 (profile + `ProfileAccordionSection` → `Collapsible`). Приоритетная очерёдность: `1.1b` → `1.2` → `1.3` → `1.4` → `1.5` → `1.6`.
**Синхронизация 2026-05-05 (§1.1b уточнение):** на detail программы развёрнутый список результатов тестов заменяется точкой входа **«История тестирования»** (полный UX — по ходу, см. §1.1b **B7**); иконка **Play** у «Открыть план» — статический ассет в репозитории (`apps/webapp/public/...`); **цветовые зоны** макета — приоритет существующих `--patient-surface-*` / `patientSurface*Class` (см. §1.1b); **порядок секций** задан эталонным списком в §1.1b, финальная перестановка — по ходу; для главной при необходимости те же правила для иконок блоков.
**Назначение:** зафиксировать порядок работ на следующий период с важными деталями (scope, файлы, риски, DoD), чтобы агенты могли брать пункты в работу без переоткрытия контекста.
**Не заменяет:** [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) (общий стратегический документ) и [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) (план кабинета врача). Этот документ — операционная нарезка «что брать сейчас», ссылающаяся на оба.

**Связанные документы:**

- Стратегический roadmap: [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md).
- Цели IA пациента: [`TARGET_STRUCTURE_PATIENT.md`](TARGET_STRUCTURE_PATIENT.md).
- Цели IA врача: [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md).
- План кабинета врача: [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md).
- Свежая приёмка: [`E2E_ACCEPTANCE_AFTER_AB.md`](E2E_ACCEPTANCE_AFTER_AB.md).
- Закрытые A-этапы: [`../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md).
- Закрытые B/D-этапы: [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md), [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md).
- Стандарт UI пациента: [`../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md).
- Архитектура БД: [`../ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](../ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md), [`../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md), [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md).
- Мини-инициатива по пунктам **1.0 / 1.1 / 1.1a** (часть 1): [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md).
- Shadcn/Base UI alignment patient-слоя — **архив** (2026-05-05): Phases 0–6 выполнены; бывший Phase 7 перенесён в мини-инициативы по экранам; см. [`../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md) · [`LOG.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md). Операционные правила для новых переработок — §1 п.4 ниже.

---

## 0. Что считаем закрытым на момент 2026-05-04

| Блок | Статус | Источник правды |
|------|--------|-----------------|
| PROGRAM_PATIENT_SHAPE A1–A5 (модель плана, группы, action_log, инбокс «К проверке», бейджи, calendar_timezone) | ✅ PASS / merge-ready | `archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/AUDIT_GLOBAL.md` |
| ASSIGNMENT_CATALOGS_REWORK B1–B7 (типизация тестов, measure_kinds, sets editor, recommendations, LFK UX, конструктор шаблонов, локальные комментарии) | ✅ PASS | `archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md` |
| Defer-wave D1–D4, D6 | ✅ PASS | `archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_DEFER_CLOSURE_GLOBAL.md` |
| D5 (`recommendations.domain` → `kind`) | ⏸ DEFERRED (owner pause) | `archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md` |
| PLAN_DOCTOR_CABINET этапы 1–8 (CMS C, меню, бейджи, «Сегодня», единый чат, REPACK карточки, usage/archive каталогов, density) | ✅ PASS | `done/*_EXECUTION_AUDIT.md` + `LOG.md` |
| Этап 6 PLAN_DOCTOR_CABINET — глубокая часть карточки пациента (hero / табы / таб «Назначения») | ❄ FROZEN намеренно | `PLAN_DOCTOR_CABINET.md` §этап 6 |
| Patient Plan polish первого прохода (Stage 0 badge, формат тестов, «Снять Новое», LFK-форма в теле этапа, sort_order, goals/objectives в диалоге, swap-confirm) | ✅ закрыто 2026-05-04 | `E2E_ACCEPTANCE_AFTER_AB.md` §4–§6 |
| Patient treatment programs polish (**1.0** + **1.1a** + **1.1**, этапы A→B→C) | ✅ закрыто 2026-05-04 | [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md) |
| **PATIENT_APP_SHADCN_ALIGNMENT** — Phases **0–6** (patient shadcn/Base UI alignment: примитивы, patient-экраны, уведомления, формы + FAB дневника и intake) | ✅ закрыто 2026-05-05 | [`../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md) · [`LOG.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md) · [`AUDIT_RESULTS.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/AUDIT_RESULTS.md) |
| Редизайн **раздела «Назначения»** в кабинете врача (IA/UI кластера: меню, списки, навигация по каталогам) | ✅ практически закрыто 2026-05-04 | owner sync; детали каталогов — execution в [`../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md`](../archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/AUDIT_GLOBAL.md) |
| **Шаблоны программ** внутри «Назначений» — мелкий хвост (список/конструктор, UX) | ⚡ неблокирующий хвост | [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §шапка; не блокирует §1.2–§2.x |
| **Курсы** (`COURSES_INITIATIVE`, roadmap этап 7) | ⏸ отложены владельцем | [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md) |
| **Patient `/diary` §1.2** — тех. согласованность (legacy URL, no-op создания комплекса, empty state) | ⚡ частично закрыто 2026-05-04 в коде | [`LOG.md`](LOG.md) 2026-05-04; UX «сегодня» / read-only история — см. §3 §1.2 DoD |

**Доменно ядро готово.** Дальше — поверхностная полировка пациента (в т.ч. завершение UX §1.2 дневника), разморозка кусков карточки врача и фоновые хвосты. Работа по шаблонам программ идёт **параллельно** низким приоритетом и не стопорит patient IA / doctor card.

---

## 1. Принципы порядка работ

1. **Пациент → врач → инфраструктура.** После того, как доменная модель программы лечения работает сквозной связкой (E2E PASS), ценнее всего полировать поверхности пациента: на них смотрит конечный пользователь, и их состояние диктует, какой именно hero/табы нужны в карточке врача.
2. **Маленькими мини-инициативами.** Каждая поверхность пациента (`/treatment-programs` список, `/diary`, `/cabinet`, `/messages+/support`, `/profile`, `/help`) — отдельный мини-проход с собственным `LOG.md`, узкими проверками, без слияния в один большой план.
3. **Без правок A/B/D-моделей (с одним явным исключением).** Ничего из закрытого ядра (`db/schema/treatmentProgram*`, `programActionLog`, `recommendations`, `clinical_tests`, `lfk_*`) в этом цикле не пересматривается. **Единственное согласованное исключение этого цикла:** добавить `started_at` в `treatment_program_instance_stages` как data-enabler для расчёта даты ожидаемого контроля по этапу. Любая другая необходимость изменения ядра — стоп и обсуждение, не самостоятельное расширение scope.
4. **Patient UI primitives обязательны; shadcn/shared при переработке экранов.** Сначала `apps/webapp/src/shared/ui/patientVisual.ts` + `apps/webapp/src/components/ui/*` + `app/globals.css#app-shell-patient` (см. `.cursor/rules/patient-ui-shared-primitives.mdc`); custom геометрия — только при явной продуктовой причине, фиксируется в `LOG.md` мини-инициативы. Любая **переработка страниц** в этом roadmap и в связанных мини-инициативах — по возможности через примитивы **`components/ui/*`** (shadcn/Base UI) и существующие **shared**-слои (patient-компоненты, `patientVisual`, гайд). Сырой HTML и одноразовый route-level chrome избегаем, если от них **нет** выигрыша в простоте кода при проигрыше по поддерживаемости, доступности и единообразию. Нормативный детальный слой — [`PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md). Исторический пакет alignment (Phases 0–6; единый Phase 7 не ведётся) — [`../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/README.md) (архив 2026-05-05).
5. **Полный `pnpm run ci` — только перед push.** В рамках мини-итераций — узкие проверки (lint затронутых файлов, `tsc --noEmit` пакета, узкий `vitest`). Перед push — всегда барьер из `.cursor/rules/pre-push-ci.mdc`.
6. **Команды на prod — только из `.cursor/rules/host-psql-database-url.mdc`.** Никаких голых `psql "$DATABASE_URL"`. Любой ops-шаг описывается полным copy-paste блоком с `set -a && source /opt/env/bersoncarebot/<env> && set +a`.

---

## 2. Сводная таблица направлений

| № | Направление | Тип | Размер | Зависит от | Можно параллельно с |
|---|-------------|-----|--------|------------|---------------------|
| **—** | **Doctor «Назначения»** — редизайн блока (shell/IA) | UI / doctor | — | ✅ практически закрыто 2026-05-04 (хвосты — точечно) | — |
| **—** | **Шаблоны программ** — мелкие правки в списке/конструкторе | UI / doctor | S | ⚡ не блокер для §1.x–§2.x | — |
| 1.0 | Data enabler: `started_at` у этапа программы | data / migration | S | — | 1.2–1.7, 2.x, 3.x |
| 1.1 | Patient `/treatment-programs` список polish (без % прогресса в MVP) | UI / patient | S–M | 1.0 | 1.2–1.7, 3.x |
| 1.1a | Patient `/treatment-programs/[instanceId]` MVP-проход (текущий этап + архив + этап 0) | UI / patient | M | 1.0 | 1.2–1.7, 3.x |
| 1.1b | Patient `/treatment-programs/[instanceId]` визуальный редизайн: hero + badges + Play (ассет), карточка контроля, Collapsible этапа 0, превью этапа → `stages/[stageId]`, компактный архив; на detail — **«История тестирования»** вместо развёрнутого списка результатов | UI / patient | M | 1.1a + SHADCN Phase 1 ✅ | 1.2–1.7, 3.x |
| 1.2 | Patient `/diary` → режим «сегодня» (read-only past); **тех. хвост 2026-05-04 закрыт в коде** | UI / patient | S | — | 1.1, 1.1a, 1.3–1.6, 3.x |
| 1.3 | Patient `/reminders` в основное меню | UI / nav | S | — | все |
| 1.4 | Patient `/cabinet` hero визита + объединение intake/past | UI / patient | M | — | 1.1, 1.2, 1.3, 1.5, 1.6 |
| 1.5 | Patient `/messages` + `/support` → одна «Поддержка» | UI / data | M | — | 1.1–1.4, 1.6 |
| 1.6 | Patient `/profile` сжатие | UI / patient | S | — | все |
| 1.7 | Patient `/help` как article-контент | content / CMS | M | этап 2 roadmap (CMS типизация enum) | 2.x, 3.x |
| 2.1 | Doctor card этап 6: hero программы + tab-layout | UI / doctor | L | желательно 1.1, 1.4 | 1.7, 3.x |
| 2.2 | Cross-patient inbox «К проверке» в «Сегодня» врача | UI / data | M | — | 1.x, 2.1, 3.x |
| 2.3 | «Открыть тест» → акцент на конкретный тест в `TreatmentProgramInstanceDetailClient` | UI | S | 2.2 опц. | 1.x |
| 3.1 | D5 `recommendations.domain` → `kind` | data / refactor | M | owner unfreeze | 1.x, 2.x |
| 3.2 | Prod-применение миграции `0040` (DROP `tests.scoring_config`) | ops | — | runbook | независимо |
| 3.3 | CMS типизация до полного enum (этап 2 roadmap) | CMS | M | — | 1.7 включается после |
| 4.1 | Inbox событий пациентов / proactive doctor assistant | UI / data | L | 2.1 желательно | — |
| 4.2 | Курсы (полноценная инициатива) | feature | XL | ⏸ отложены owner 2026-05-04 | — |

---

## 3. Часть 1 — Patient Cabinet polish (приоритет цикла)

Общий принцип: каждая поверхность — отдельная мини-инициатива в `docs/<NAME>_INITIATIVE/` со структурой `README.md` + `STAGE_PLAN.md` + `LOG.md` (закрытые пакеты переносятся в `docs/archive/2026-05-initiatives/<NAME>/`; пример — [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md)). UI-реализация — с учётом **§1 п.4** (shadcn/`components/ui/*` + shared, см. выше). По умолчанию контракт API/портов в этой части **не меняется**, кроме явного data-enabler `1.0 started_at`.

**Канон исполнения для 1.0 / 1.1 / 1.1a:** [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md) · [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/STAGE_PLAN.md) · [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/LOG.md).

### 1.0 Data enabler: `started_at` у этапа программы

**Цель.** Убрать ложный расчёт «даты контроля от старта всей программы» и считать ожидание контроля от фактического старта этапа.

**Что делать.**

- Добавить колонку `started_at` в `treatment_program_instance_stages` (nullable, `timestamptz`).
- При первом переводе этапа в `in_progress` выставлять `started_at`, если он ещё `NULL`.
- Backfill для уже активных этапов: безопасная эвристика от `instance.created_at` (как временное приближение до появления полноценной историзации стартов этапов).
- Протащить поле в Drizzle schema, типы `TreatmentProgramInstanceStageRow`, репозитории (`pg` + `inMemory`) и read-модели.

**Файлы (ожидаемые места правок).**

- `apps/webapp/db/schema/treatmentProgramInstances.ts`.
- `apps/webapp/src/modules/treatment-program/types.ts`.
- `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts`.
- `apps/webapp/src/infra/repos/inMemoryTreatmentProgramInstance.ts`.
- `apps/webapp/src/modules/treatment-program/progress-service.ts` (точка перевода `available -> in_progress`).

**Что НЕ делать.**

- Не вводить в MVP новую отдельную сущность контролей.
- Не добавлять «много контролей на этап» в этом шаге (это post-MVP).

**DoD.**

- `started_at` доступен в detail-модели этапа.
- Для новых запусков этапов поле заполняется автоматически.
- Для старых активных этапов заполнено через backfill-эвристику.

### 1.1 `/treatment-programs` (список) polish

**Цель.** Превратить плоский список в рабочий экран «что назначено сейчас + где архив», без вводящей в заблуждение аналитики в MVP.

**Что делать.**

- Hero текущей активной программы:
  - название программы;
  - текущий этап (`current_stage_title`);
  - бейдж «План обновлён» (через тот же `planUpdatedLabel`, что использует `PatientHomePlanCard`);
  - CTA → `/app/patient/treatment-programs/[instanceId]`.
- Архивные/завершённые программы — отдельной секцией ниже под `<details>` с заголовком «Завершённые программы».
- Если активной программы нет — empty state с пояснением «Здесь появится программа после назначения врачом» и ссылкой на `/messages` для связи с клиникой.

**Файлы (ожидаемые места правок).**

- `apps/webapp/src/app/app/patient/treatment-programs/page.tsx` — RSC, дополнить data loader (получение текущего активного instance + current stage + nudge «План обновлён»).
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx` (если есть) или соответствующий клиентский/server-компонент списка.
- `apps/webapp/src/shared/ui/patientVisual.ts` — переиспользуемые токены (без новых custom).

**Что НЕ делать.**

- Не считать проценты прогресса (`daily checklist`, `% этапа`, `% программы`) в этом MVP-проходе.
- Не вводить пациентское создание программ.

**Узкие проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

**DoD.**

- Hero виден при наличии активной программы; empty state — когда её нет.
- Архив скрыт по умолчанию.
- В UI списка нет процентной «аналитики прогресса».
- Все стили — patient primitives / shadcn base; новых одноразовых chrome-компонентов нет.

### 1.1a `/treatment-programs/[instanceId]` MVP-проход (деталь программы)

**Цель.** Сделать страницу программы рабочим экраном пациента: текущий этап, что делать сейчас, этап 0 как постоянные рекомендации, архив этапов — без ложных процентов.

**Что делать.**

- Верхний блок: название программы, номер/название текущего этапа, CTA «Открыть текущий этап» и ссылка «Архив этапов».
- Этап 0 (`sort_order = 0`) — отдельным блоком «Общие рекомендации»; не участвует в прогрессе/условиях перехода.
- Основной блок — текущий этап с единым списком назначений (exercise / lfk_complex / recommendation / test_set / lesson).
- Завершённые/пропущенные этапы — под `<details>` как архив.
- Убрать «Чек-лист на сегодня» из detail-страницы в рамках этого MVP-прохода.
- Показать «План обновлён» (это сигнал изменений от врача, не прогресс).
- Показать дату ожидаемого контроля: `stage.started_at + stage.expected_duration_days` (только если оба значения есть).

**Файлы (ожидаемые места правок).**

- `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx`.
- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`.
- `apps/webapp/src/modules/treatment-program/stage-semantics.ts` (если нужно уточнение отбора текущего/архивного этапов).

**Что НЕ делать.**

- Не возвращать процентные метрики (`за сегодня`, `% этапа`, `% программы`) до появления корректной модели периодичности.
- Не добавлять в MVP комментарий к факту выполнения для `exercise/lesson/recommendation` (post-MVP).

**Узкие проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

**DoD.**

- Этап 0 рендерится отдельно от текущего этапа.
- Текущий этап визуально выделен; архив этапов скрыт по умолчанию.
- «План обновлён» показан как отдельный сигнал изменения плана.
- Дата ожидаемого контроля считается от `started_at` этапа, а не от старта программы.

#### Схема исполнения для блока 1.x

1. **Этап A (данные):** `1.0 started_at`.
2. **Этап B (detail UX MVP):** `1.1a`.
3. **Этап C (detail visual redesign):** `1.1b`.
4. **Этап D (list UX):** `1.1`.

Post-MVP (отдельно, не блокирует MVP): множественные контроли внутри этапа и комментарий к факту выполнения `exercise/lesson/recommendation`.

---

### 1.1b `/treatment-programs/[instanceId]` — визуальный редизайн (эталон-дизайн)

**Цель.** Привести страницу детали программы в соответствие с утверждённым эталоном: hero-карточка с branded-бейджами, отдельный блок контроля/записи, этап 0 как свёрнутый `Collapsible`, текущий этап как превью с переходом на отдельную страницу этапа, компактный список предыдущих этапов. Результаты тестов на detail **не** разворачивать длинным списком: первично точка входа **«История тестирования»** (маршрут/модалка/полноэкран — прорабатывается по ходу).

**Предусловие.** `1.1a` закрыт; `PATIENT_APP_SHADCN_ALIGNMENT` Phase 1 закрыт (`Collapsible` / `Accordion` — в `components/ui/` ✅).

**Мини-инициатива.** `docs/PATIENT_PROGRAMS_DETAIL_REDESIGN_INITIATIVE/` (`README.md` + `STAGE_PLAN.md` + `LOG.md`).

**Порядок секций сверху вниз (эталон из обсуждения, финальный порядок может уточняться по ходу).**

1. Hero «Мой план»: бейджи, название программы, описание (если есть данные), CTA «Открыть план», строка «План обновлён», опционально место под иллюстрацию справа.
2. Карточка «Следующий контроль» / запись: дата, подпись про консультацию, CTA «Выполнить тесты» и «Записаться на приём» (пока только маршруты/якоря — см. B3).
3. Блок «Рекомендации на период» (этап 0) — `Collapsible`, свёрнут по умолчанию.
4. Карточка «Текущий этап» — превью + «Открыть этап».
5. Точка входа **«История тестирования»** вместо развёрнутого списка результатов на detail (см. B7).
6. Секция «Предыдущие этапы» — компактный список.

**Цветовые зоны макета — приоритет существующих токенов `#app-shell-patient` / `patientVisual.ts`.**

- Hero (lavender / мягкий primary): по умолчанию `patientSurfaceInfoClass` (`--patient-surface-info-*`); при несовпадении — один семантический токен `patientSurfaceProgramClass` в `patientVisual.ts` + при необходимости переменные в `globals.css` (не плодить одноразовые inline-цвета в компоненте).
- Карточка контроля / «кремовый» тон макета: `patientSurfaceWarningClass` (`--patient-surface-warning-*`), если визуально совпадает; иначе уточнить на ревью без новых произвольных hex в JSX.
- Блок рекомендаций (этап 0, бледно-зелёный): `patientSurfaceSuccessClass` (`--patient-surface-success-*`), если совпадает с макетом.
- Карточка текущего этапа и строки списка: существующие `patientCardClass` / `patientListItemClass` и `@/components/ui/card` там, где уместно по §1 п.4.

**Иконки и статические ассеты.**

- Иконка **Play** у CTA «Открыть план»: статический файл в репозитории (например `apps/webapp/public/patient/ui/play.svg` или соседний каталог под patient UI-ассеты); импорт через `next/image` / `<img>` по принятому в проекте паттерну. Допустимо захардкодить путь к ассету на первом проходе.
- Для **главной** (`/app/patient`) при необходимости те же принципы: выделенная папка под иконки блоков, без CDN на первом этапе — зафиксировать в `LOG.md` мини-инициативы при первом добавлении файлов.

**Что делать.**

**B1–B2. Hero-карточка программы.**

- Badge «МОЙ ПЛАН» — `Badge` из `components/ui/badge` + `patientPillClass`-like className; левый верхний угол.
- Badge «Этап X из Y» — `patientPillClass`; правый верхний угол; X = `currentWorkingStage.sortOrder`, Y = `pipeline.length` (из `splitPatientProgramStagesForDetailUi`).
- Фон hero: см. блок «Цветовые зоны» выше (`patientSurfaceInfoClass` или `patientSurfaceProgramClass`).
- Описание программы под заголовком: проверить `TreatmentProgramInstanceDetail` / `snapshot` шаблона — если поле есть, рендерить; без schema-изменений.
- Индикатор «● План обновлён»: `<span>` с точкой (`text-destructive` или `text-[var(--patient-color-danger)]`) + дата из `planUpdatedLabel`.
- CTA «Открыть план» (`Link` + `patientPrimaryActionClass`, полная ширина) + **иконка Play** из статического ассета (см. выше) → scroll к `#patient-program-current-stage`.

**B3. Карточка «Следующий контроль»** (новый компонент `PatientProgramControlCard`).

- Рендерить только при `controlLabel != null`.
- Поверхность карточки: см. «Цветовые зоны» (`patientSurfaceWarningClass` или согласованный семантический класс).
- Иконка `CalendarCheck` (lucide-react), дата крупным шрифтом, подпись «Консультация со специалистом».
- Кнопка «Выполнить тесты» (`patientButtonWarningOutlineClass`) — поведение уточняется по ходу: якорь к тестам на странице этапа, переход на `stages/[stageId]` с фокусом, или связка с «Историей тестирования».
- Кнопка «Записаться на приём» (`patientButtonSuccessClass`) → `routePaths.patientCabinet`.

**B4. Этап 0 — `Collapsible`, закрыт по умолчанию.**

- Поверхность блока: см. «Цветовые зоны» (`patientSurfaceSuccessClass` для бледно-зелёного тона макета, если совпадает).
- Обернуть `PatientInstanceStageBody` для `sort_order = 0` в `Collapsible` из `@/components/ui/collapsible`.
- Trigger: иконка `Shield` (lucide-react, `text-[var(--patient-color-success)]`), заголовок «Рекомендации на период», subtitle «Общие рекомендации, которые действуют на протяжении всей программы», шеврон.
- `open` по умолчанию — `false`.

**B5. Текущий этап — превью-карточка + CTA «Открыть этап».**

- Заменить полный inline `PatientInstanceStageBody` на компактную секцию:
  - label «Текущий этап» + badge «Этап X из Y»;
  - крупный заголовок этапа — новый `patientStageTitleClass` в `patientVisual.ts` (`text-xl font-bold text-[var(--patient-color-primary)]`);
  - subtitle из `stage.goals` или `stage.objectives` (первые ~80 символов), `patientMutedTextClass`;
  - кнопка-ссылка «Открыть этап» (`Link` + `patientPrimaryActionClass`) → `routePaths.patientTreatmentProgramStage(instanceId, stageId)`.
- Полный `PatientInstanceStageBody` переносится на страницу `stages/[stageId]`.

**B6. Предыдущие этапы — компактный список.**

- Заменить `<details>` с развёрнутым inline-содержимым на список строк (`patientListItemClass`):
  - `CheckCircle2` (lucide-react, `text-[var(--patient-color-success)]`) + «Этап N. Название» + «Завершён DD мм» (из `stage.completedAt`, если поле доступно) + `ChevronRight` → `Link` на `stages/[stageId]`.
- Если `stage.completedAt` отсутствует в типе — не показывать дату (не вводить поле в этом проходе).

**B7. Результаты тестов на detail — «История тестирования».**

- Убрать с detail-страницы развёрнутый блок «Ваши результаты тестов» как основной режим; заменить на одну явную точку входа: кнопка/ссылка **«История тестирования»** (иконка по желанию — lucide или маленький ассет).
- Полный список результатов, фильтры, переход к конкретному тесту — прорабатываются по ходу (отдельный маршрут под программу, модалка, секция на странице этапа — решается в реализации и фиксируется в `LOG.md` мини-инициативы). Данные по-прежнему из существующих API/read-моделей; контракт портов не расширять без отдельного решения.

**C1–C4. Новый маршрут `stages/[stageId]`.**

- Создать `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` (RSC).
- Загружает detail программы через `deps.treatmentProgramInstance.getInstanceForPatient`; находит stage по `stageId`.
- Шапка страницы: «Этап N из M · Название», цели/задачи/длительность, статус.
- Тело: `PatientInstanceStageBody` (перенесённый из detail-страницы) — группы, элементы, ЛФК-форма, тест-блоки.
- `AppShell backHref` → `routePaths.patientTreatmentProgram(instanceId)`.

**Новый `routePath`.**

- Добавить `patientTreatmentProgramStage(instanceId, stageId)` в `apps/webapp/src/app-layer/routes/paths.ts`.

**Файлы (ожидаемые места правок).**

- `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`.
- `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx`.
- `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` (новый).
- `apps/webapp/src/app-layer/routes/paths.ts`.
- `apps/webapp/src/shared/ui/patientVisual.ts` (новые: `patientStageTitleClass`; при необходимости `patientSurfaceProgramClass`).
- `apps/webapp/src/app/globals.css` (только если недостаточно существующих `--patient-surface-*` для hero программы).
- Статические ассеты: `apps/webapp/public/...` (Play и др. patient UI; точный путь — в `LOG.md` при добавлении).

**Что НЕ делать.**

- Не возвращать процентные метрики.
- Не менять портовые контракты и схему БД.
- Не переписывать `PatientInstanceStageBody` — только перенести на новую страницу.
- «Записаться на приём» — простая ссылка на `/cabinet`; не реализовывать booking wizard.
- Иллюстрацию (SVG/изображение справа в hero) — не обязательна в первом проходе; зарезервировать место в разметке.

**Узкие проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

**DoD.**

- Hero-карточка с badges «МОЙ ПЛАН» и «Этап X из Y» отображается корректно; CTA «Открыть план» с иконкой Play из статического ассета.
- Блок контроля — отдельная карточка с двумя CTA; не отображается при отсутствии `controlLabel`; тон карточки через семантический surface-класс (см. «Цветовые зоны»).
- Этап 0 (Рекомендации) свёрнут по умолчанию через `Collapsible`, раскрывается без ошибок; фон секции согласован с токенами (success-surface, если применимо).
- Текущий этап — только превью с CTA «Открыть этап», ведущим на `stages/[stageId]`.
- На detail вместо длинного списка результатов тестов — точка входа **«История тестирования»**; детали потока зафиксированы в `LOG.md` при реализации.
- Страница `stages/[stageId]` рендерит полное тело этапа; back-link возвращает на detail.
- Предыдущие этапы — компактный список с датами (там, где `completedAt` есть) и шевронами.
- Нет процентных метрик.
- Все новые стили — через `patientVisual.ts` и существующие `--patient-surface-*`; нет одноразового route-level chrome.

**Кому отдать.** Sonnet 4.6 (UI-M).

---

### 1.2 `/diary` → режим «сегодня» (read-only past)

**Тех. согласованность (2026-05-04, до полного UX-прохода):** legacy URL `/app/patient/diary/symptoms` и `/app/patient/diary/lfk` (включая вариант со слэшем) → permanent-редиректы в [`apps/webapp/next.config.ts`](../../apps/webapp/next.config.ts); server action `createLfkComplex` — no-op; на единой [`diary/page.tsx`](../../apps/webapp/src/app/app/patient/diary/page.tsx) убрана форма самосоздания комплекса, empty state и CTA ведут на программы лечения и сообщения. Детали — [`LOG.md`](LOG.md) записи 2026-05-04.

**Цель.** Открыть страницу как «давай отметим занятие за сегодня», а не как дашборд. Пациентское создание ЛФК-комплекса убрать (противоречит модели «комплексы из назначений врача»).

**Что делать.**

- Верхний блок — сегодняшняя ЛФК-задача (если есть назначение): кнопка отметки сессии (`PatientLfkChecklistRow`-форма) + быстрая отметка симптомов дня.
- История — табом/секцией ниже, read-only (просмотр прошлых записей и сессий).
- ~~Удалить из UI пациентское `createLfkComplex` и форму «Создайте комплекс упражнений» в empty state. Empty state заменить на «Комплексы появятся после назначения врачом» + ссылка на `/treatment-programs` или `/messages`.~~ **Сделано (2026-05-04)** для empty state на единой странице дневника; см. шапку §1.2 выше.
- ~~Подчищать legacy redirect-роуты (`diary/symptoms`, `diary/lfk`) — отдельным микро-PR, если безопасно (предварительный `rg` runtime references).~~ **Сделано (2026-05-04):** `next.config` + удалены `page.tsx`-заглушки; см. [`LOG.md`](LOG.md).

**Файлы.**

- `apps/webapp/src/app/app/patient/diary/**` (страница + клиентские компоненты).
- Возможно — `modules/lfk/**` сервисный метод `createComplex`-визибилити (не удалять метод; убрать только пациентский путь к нему). Проверить, использует ли админская поверхность тот же метод — если да, оставить, скрыть только UI у пациента.

**Что НЕ делать.**

- Не менять схему `patient_lfk_assignments` / `lfk_*` (см. clean-architecture-module-isolation.mdc «product absolutes»).
- Не трогать врачебные представления.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/patient/diary
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/diary
```

**DoD.**

- **Закрыто в коде (2026-05-04):** нет пациентского пути «создать ЛФК-комплекс» в UI единой страницы дневника; empty state согласован с назначениями врача; legacy `/diary/symptoms` | `/diary/lfk` → `next.config` permanent (включая слэш на конце); server action `createLfkComplex` — no-op после auth.
- **Остаётся (UX §1.2):** открытие `/diary` показывает «сегодня» в фокусе; история read-only и не первичный экран; при необходимости `PatientLfkChecklistRow` / симптомы дня в верхнем блоке — см. список «Что делать» выше незачёркнутые пункты.

**Кому отдать.** Sonnet 4.6 (UI-S).

---

### 1.3 `/reminders` в основное меню

**Цель.** Перестать прятать существующую полезную страницу.

**Что делать.**

- Добавить пункт «Напоминания» в `/profile` или в основной нижний таб-бар (по решению из `TARGET_STRUCTURE_PATIENT.md` §3 — профиль).
- Связать с `/notifications` единой семантикой «правила vs темы рассылок» (минимум — крест-ссылки и пояснение).

**Файлы.**

- `apps/webapp/src/shared/ui/patientNavLinks.ts` (или эквивалент).
- `apps/webapp/src/app/app/patient/profile/**` (если решение — через профиль).

**Что НЕ делать.**

- Не менять API/правила напоминаний.
- Не объединять `/reminders` и `/notifications` в одну страницу в этом проходе (это потенциально отдельная M-инициатива).

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/shared/ui apps/webapp/src/app/app/patient
pnpm --dir apps/webapp exec tsc --noEmit
```

**DoD.** Пункт «Напоминания» виден из основной навигации; deep-link не сломан; запись в `LOG.md`.

**Кому отдать.** Composer-2 / Sonnet 4.6 (S).

---

### 1.4 `/cabinet` hero визита + объединение intake/past

**Цель.** В `/cabinet` ближайший визит — приоритетный блок; история intake (`CabinetIntakeHistory`) и прошлых приёмов (`CabinetPastBookings`) — единая хронологическая лента.

**Что делать.**

- Hero ближайшего визита: дата/время, врач/услуга, branch, CTA «Подготовка» → `/help/<подходящая статья>` или `/cabinet/[bookingId]`.
- Единая лента «Прошлые визиты и обращения» с типом записи (intake / booking) и кратким описанием.
- Сохранить «Адрес» как обычный link-блок (без iframe — см. рекомендацию из `RECOMMENDATIONS_AND_ROADMAP.md` I.2 «Запись и кабинет»).
- **Batch с SHADCN alignment:** в рамках этого же прохода перевести `CabinetPastBookings` c raw `<button>` + local state на `Collapsible` из `components/ui/collapsible` (теперь доступен); `AppointmentStatusBadge` — на shadcn `Badge`. Scope ограничить этими двумя компонентами; не трогать остальной cabinet UI.

**Файлы.**

- `apps/webapp/src/app/app/patient/cabinet/**` (страница + `CabinetInfoLinks`, `CabinetIntakeHistory`, `CabinetPastBookings`).
- Возможно — порт `bookings` / `intake` для агрегированной выдачи.

**Что НЕ делать.**

- Не реформировать booking wizard — это отдельный пункт (заявка на S-итерацию позже).
- Не менять модель intake.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/patient/cabinet
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/cabinet
```

**DoD.** Ближайший визит выделен; лента истории объединяет два источника; iframe-карты убраны.

**Кому отдать.** Sonnet 4.6 (M).

---

### 1.5 `/messages` + `/support` → одна «Поддержка»

**Цель.** Один сценарий «связаться с клиникой» — одна точка входа.

**Что делать.**

- На уровне UI — единая страница «Поддержка» (предпочтительно сохранить URL `/support`, а `/messages` оставить redirect).
- Внутри — чат с клиникой как основной режим; форма «отправить письмо администратору» — fallback внутри той же страницы (не отдельный URL).
- Навигация пациента: один пункт «Поддержка» (или вынесен в `/profile`).

**Файлы.**

- `apps/webapp/src/app/app/patient/messages/**`, `apps/webapp/src/app/app/patient/support/**`.
- `modules/messaging/**` — без изменений API; возможно объединение клиентских компонентов.
- `apps/webapp/src/shared/ui/patientNavLinks.ts`.

**Что НЕ делать.**

- Не менять серверный контракт чата/поддержки.
- Не трогать врачебную сторону единого чата (она уже закрыта в этапе 5 PLAN_DOCTOR_CABINET).

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/patient
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/messages src/app/app/patient/support
```

**DoD.** Один пункт меню, один URL, redirect второго; функциональность не потеряна; запись в `LOG.md`.

**Кому отдать.** Sonnet 4.6 (M).

---

### 1.6 `/profile` сжатие

**Цель.** Убрать дублирующие точки входа (`Уведомления` как ссылка vs страница `/notifications`), привести `/profile` к компактному списку «аккаунт + настройки + установка + выход».

**Что делать.**

- Убрать аккордеоны-обёртки, ведущие на отдельные страницы; оставить прямые ссылки.
- Раздел «Установить приложение» в одном виде.
- Группа «Связь с клиникой» — единый пункт «Поддержка» (после 1.5).
- **Batch с SHADCN alignment:** перевести `ProfileAccordionSection` c raw `<button>` + local state на `Collapsible` из `components/ui/collapsible`; сохранить `defaultOpen`, `statusIcon`, визуальный patient card chrome.

**Файлы.**

- `apps/webapp/src/app/app/patient/profile/**`.

**Что НЕ делать.**

- Не менять модель `platform_users` / `system_settings`.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/patient/profile
pnpm --dir apps/webapp exec tsc --noEmit
```

**DoD.** Профиль умещается в один экран без скролла на типовом mobile; все ссылки рабочие.

**Кому отдать.** Composer-2 / Sonnet 4.6 (S).

---

### 1.7 `/help` как article-контент

**Цель.** Превратить `/help` в реальную базу знаний (статьи), а не пустую страницу.

**Зависит от.** Этап 2 roadmap — CMS типизация до полного enum (`kind`/`system_parent_code` уже введены вариантом C, но для `/help` нужно зафиксировать `kind = help_article` или эквивалент и завести admin-управление). Либо реализовать на текущей модели через `system_parent_code='help'` с осознанной пометкой «to be migrated».

**Что делать (когда зависимость готова).**

- CMS-форма для статей `kind=help_article`.
- `/help` — каталог статей; `/help/[slug]` — рендер статьи (использовать существующие markdown-/video-блоки `/content/[slug]`).
- Перепривязать ссылки `CabinetInfoLinks` («Как подготовиться», «Стоимость») на реальные статьи.

**Файлы.**

- `apps/webapp/src/app/app/patient/help/**`.
- `apps/webapp/src/app/app/admin/content/**` (CMS-форма).
- `db/schema/contentArticles.ts` (если используется единая таблица — без новой таблицы, только enum `kind`).

**Что НЕ делать.**

- Не плодить новую таблицу под help — использовать `content_articles` с `kind`.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/patient/help apps/webapp/src/app/app/admin/content
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/help src/modules/cms
```

**DoD.** `/help` рендерит реальные статьи; CMS управляет ими; редиректы из cabinet работают.

**Кому отдать.** Codex 5.3 (трогает CMS контракт + UI).

---

## 4. Часть 2 — Снять заморозку doctor card этапа 6

После того, как пациентские поверхности `/treatment-programs` и `/cabinet` отполированы (как минимум 1.1 + 1.4), доктору сразу понятно, какие именно метрики и табы нужны.

### 2.1 Doctor card hero программы + tab-layout

**Цель.** В карточке пациента (`ClientProfileCard`) программа лечения становится видимой сущностью, а не «ещё одной секцией».

**Что делать.**

- Hero текущей активной программы: название, % выполнения этапа, бейдж «Plan обновлён», CTA «Открыть программу».
- Tab-layout карточки: «Программы», «Тесты к проверке», «ЛФК», «Чат», «История» — табами вместо вертикального скролла. Сохранить anchor-link совместимость старых hash-`#section-*`.
- Бейдж непрочитанного / «К проверке» на табе.

**Файлы.**

- `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`.
- `apps/webapp/src/app/app/doctor/clients/[userId]/page.tsx` (RSC loader, если меняется).
- `apps/webapp/src/shared/ui/doctor/**` (общие табы).

**Что НЕ делать.**

- Не менять портовые контракты (`pendingProgramTestEvaluations`, `program_action_log` — уже на месте).
- Не трогать unified chat (этап 5 PLAN_DOCTOR_CABINET).

**Зависимости.**

- Размораживается этап 6 PLAN_DOCTOR_CABINET — отметить это в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) §этап 6 «снято с заморозки» с датой и ссылкой на ROADMAP_2.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/doctor/clients
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients
```

**DoD.** Карточка с hero + табами; e2e-тест карточки зелёный; новый `*_EXECUTION_AUDIT.md` в `done/`.

**Кому отдать.** Sonnet 4.6 (UI-L) с переключением на Codex 5.3, если затронутся порты.

---

### 2.2 Cross-patient inbox «К проверке» в «Сегодня» врача

**Цель.** Вместо инбокса per-patient сделать сводный «К проверке» в `/app/doctor` (этап 4 PLAN_DOCTOR_CABINET — Today).

**Что делать.**

- На `DoctorTodayDashboard` добавить блок «К проверке у всех пациентов» (количество + первые N с CTA «Открыть»).
- Новый порт `doctorPendingReview.list({ limit, offset })` или расширение существующего `pendingProgramTestEvaluations` до cross-patient.
- Бейдж в меню «Сегодня».

**Файлы.**

- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx`, `loadDoctorTodayDashboard.ts`.
- `apps/webapp/src/modules/treatment-program/**` или новый модуль `doctor-review-inbox` с собственным `ports.ts` + `service.ts`.
- `apps/webapp/src/infra/repos/pgTreatmentProgram.ts` (или новый репо).

**Что НЕ делать.**

- Не повторять данные из `program_action_log` без необходимости — реиспользовать существующие read-методы.

**Проверки.**

```bash
pnpm --dir apps/webapp lint --max-warnings=0 -- apps/webapp/src/app/app/doctor apps/webapp/src/modules/treatment-program apps/webapp/src/modules/doctor-review-inbox
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program src/modules/doctor-review-inbox
```

**DoD.** Сводный список виден на «Сегодня»; CTA открывает конкретный тест/занятие.

**Кому отдать.** Codex 5.3 (порт + UI).

---

### 2.3 «Открыть тест» → акцент на конкретный тест

**Цель.** При переходе из «К проверке» (в карточке пациента или из кросс-инбокса 2.2) экземпляр программы открывается с фокусом на нужном тесте.

**Что делать.**

- В URL `/app/doctor/treatment-program-instances/[id]?focusItemId=…` или `?testResultId=…`.
- В `TreatmentProgramInstanceDetailClient` — scroll/highlight соответствующего блока.

**Файлы.**

- `apps/webapp/src/app/app/doctor/treatment-program-instances/[id]/**`.

**DoD.** Параметр URL поддержан; визуальный акцент работает.

**Кому отдать.** Composer-2 / Sonnet 4.6 (S).

---

## 5. Часть 3 — Фоновые хвосты

### 3.1 D5 `recommendations.domain` → `kind`

**Статус сейчас.** ⏸ owner pause. Снимается отдельным решением владельца.

**Когда возьмём.** После завершения 1.1–1.4 (когда доменно ничего не двигается). Это инвазивный рефактор переименования; дешевле делать в спокойный момент.

**Детали.**

- План есть: `archive/2026-05-initiatives/ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/STAGE_D5_PLAN.md`.
- Затрагивает: схема `recommendations`, миграция (rename column), Drizzle schema, типы в `modules/recommendations`, UI ярлыки, тесты.
- Совместимость: в одной миграции — `ALTER TABLE … RENAME COLUMN domain TO kind` + одновременный код-релиз (без длинной dual-read фазы — таблица модерируемого размера).
- Sync с integrator не требуется (не относится к `system_settings`), но проверить, что integrator-side ничего не читает по имени `domain`.

**Кому отдать.** Codex 5.3.

**DoD.** Полный `pnpm run ci` зелёный, dev-миграция применена, обновлены: AUDIT_DEFER_CLOSURE_GLOBAL.md (D5 → PASS), `LOG.md`, `STAGE_D5_PLAN.md` (статус «реализовано»).

---

### 3.2 Prod-применение миграции `0040` (DROP `tests.scoring_config`)

**Статус сейчас.** Миграция в репо, на dev применена, prod ждёт runbook.

**Что делать.**

- Подготовить ops-runbook в `deploy/RUNBOOK_DROP_SCORING_CONFIG.md` (если ещё нет): backup → миграция → smoke (`SELECT count(*) FROM tests` + сценарий «открыть существующий тест»).
- Применить с полным префиксом env (см. `.cursor/rules/host-psql-database-url.mdc`):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
# далее — drizzle:migrate из проекта или ручной апдейт по runbook
```

- После — отметка в `LOG.md` и `AUDIT_DEFER_CLOSURE_GLOBAL.md`.

**Кому отдать.** Shell / ops агент с явным согласием владельца.

---

### 3.3 CMS типизация до полного enum (этап 2 roadmap)

**Цель.** Зафиксировать `kind` для всех типов контентных сущностей, чтобы `/help`, `/sections`, ситуации, разминки, уроки курсов имели явный тип.

**Зависит от.** —
**Блокирует.** 1.7 (`/help` как article-контент).

**Что делать.**

- Аудит текущих значений `kind` / `system_parent_code` (см. `done/CMS_RESTRUCTURE_PLAN.md`).
- Закрепить enum (TS + Drizzle + UI) для всех практически используемых типов.
- Миграция данных — точечная, не reformatting.

**Кому отдать.** Codex 5.3 (трогает schema + порт).

---

## 6. Часть 4 — Дальняя перспектива (не сейчас)

### 4.1 Inbox событий пациентов / proactive doctor assistant

Этап 8 `RECOMMENDATIONS_AND_ROADMAP.md`. Включается, когда `2.1` и `2.2` отработают и появится понимание, какие именно события доктору нужны проактивно.

### 4.2 Курсы

Отдельная инициатива [`../COURSES_INITIATIVE/README.md`](../COURSES_INITIATIVE/README.md). **Статус (2026-05-04, owner):** **отложены** — не входят в ближайшую очередь работ; не блокируют patient IA (`ROADMAP_2` §3), карточку врача §4 и полировку шаблонов. Ранее планировалось стартовать после ядра `PROGRAM_PATIENT_SHAPE` и оплаты; фактическая дата возврата — по отдельному решению.

---

## 7. Definition of Done всего цикла ROADMAP_2

Цикл считается закрытым, когда:

1. Закрыты пункты 1.0, 1.1, 1.1a, **1.1b**, 1.2–1.6 (1.7 — отдельно после 3.3).
2. Закрыт пункт 2.1 (с `*_EXECUTION_AUDIT.md` в `done/`) и 2.3.
3. Пункт 2.2 либо закрыт, либо явно отложен в backlog с причиной в [`LOG.md`](LOG.md).
4. По 3.1, 3.2, 3.3 — каждый отдельно: либо закрыт, либо явно зафиксирован отложенным с владельцем решения.
5. Полный `pnpm install --frozen-lockfile && pnpm run ci` зелёный на финальном коммите цикла.
6. Обновлены документы:
   - [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) — этапы 5 (patient IA) и кусок этапа 6 (doctor card) помечены как продвинутые/закрытые.
   - [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) — этап 6 «снято с заморозки» / закрыт.
   - [`LOG.md`](LOG.md) — финальная запись «ROADMAP_2 завершён» со списком закрытых пунктов и ссылками на мини-инициативы.

---

## 8. Что намеренно вне scope этого цикла

- Любые правки моделей `treatmentProgram*`, `programActionLog`, `recommendations` (поля), `clinical_tests`, `lfk_*` (см. `.cursor/rules/clean-architecture-module-isolation.mdc` «product absolutes»), **кроме уже согласованного пункта 1.0 (`started_at` у stage)** и D5 (3.1).
- Курсы как продукт (**явно отложены** владельцем на 2026-05-04 — см. §6, подпункт «Курсы» / таблица §2 строка 4.2).
- Биллинг / `/purchases` функционально.
- Замена unified chat / messaging API.
- Любые новые env-переменные для интеграционной конфигурации (см. `.cursor/rules/000-critical-integration-config-in-db.mdc`).
- Изменение GitHub Actions workflow (см. `.cursor/rules/clean-architecture-module-isolation.mdc` «process absolutes»).
- Множественные контроли внутри одного этапа (history/reschedule/next-control) — отдельный post-MVP контур.
- Комментарий пациента к факту выполнения `exercise` / `lesson` / actionable `recommendation` — отдельный post-MVP контур.

---

## 9. Как агент берёт пункт в работу

1. Прочитать ROADMAP_2 целиком + соответствующий пункт §3 или §4.
2. Прочитать `.cursor/rules/clean-architecture-module-isolation.mdc`, `.cursor/rules/patient-ui-shared-primitives.mdc` (для patient), `.cursor/rules/no-unsolicited-followups.mdc`.
3. Создать мини-инициативу `docs/<NAME>_INITIATIVE/` с `README.md`, `STAGE_PLAN.md`, `LOG.md` (для **1.0–1.1a** закрытый пример в архиве: [`PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/README.md); для **1.1b** — `docs/PATIENT_PROGRAMS_DETAIL_REDESIGN_INITIATIVE/`).
4. Реализовать минимально, узкие проверки.
5. Обновить ROADMAP_2 (отметить пункт как `done` со ссылкой на мини-инициативу).
6. Запись в [`LOG.md`](LOG.md) этой папки.
7. Перед push — полный `pnpm install --frozen-lockfile && pnpm run ci`.
