# DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE

Инициатива по **кабинету врача**: карточка пациента как место **назначения программ лечения из шаблонов** и **корректировки `treatment_program_instance`** (без дублирования каноничных спецификаций — только ссылки и дорожная карта).

**Статус:** ✅ **MASTER_PLAN закрыт** (2026-05-05); ручной smoke назначения — ✅ owner 2026-06-01. ✅ **Карточка врача (2A–2B)** и ✅ **задачи специалиста (2C)** — 2026-06-02. ✅ **Черновик редактора программы (фаза 3)** — 2026-06-02. ✅ **Фильтры picker «добавить из библиотеки» (фаза 4)** — 2026-06-02. ✅ **Cross-patient inbox «К проверке» на «Сегодня» (фаза 5)** — 2026-06-02 (`count`+preview, `focusItemId`, бейдж меню, `GET …/pending-program-tests/summary`). **Следующий контур:** фаза **6** (CMS enum + `/help`) — [`docs/TODO.md`](../TODO.md) §CMS; очередь [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](../../.cursor/plans/archive/active_workqueue_plan_30236040.plan.md).

**Операционный roadmap:** [`ROADMAP.md`](ROADMAP.md).

**Журнал:** [`LOG.md`](LOG.md).

**Мастер-план исполнения (ЛФК → программа, модалка назначения):** [`MASTER_PLAN.md`](MASTER_PLAN.md).

**Декомпозиция по этапам + слабые места / эскалация:** [`DECOMPOSITION.md`](DECOMPOSITION.md).

**Редизайн карточки (2A → 2B, Tabs + Hero):** [`CARD_REDESIGN_PLAN.md`](CARD_REDESIGN_PLAN.md) — **закрыто**. **Задачи специалиста (2C):** [`SPECIALIST_TASKS.md`](SPECIALIST_TASKS.md) — **закрыто**.

---

## Зачем отдельная папка

Связанные материалы размазаны по `APP_RESTRUCTURE_INITIATIVE`, `PROGRAM_PATIENT_SHAPE_PLAN`, архиву `PROGRAM_PATIENT_SHAPE_INITIATIVE`, `PLAN_DOCTOR_CABINET` и [`docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`](../RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md). Здесь — **одна точка входа** и **приоритизированный roadmap** по задаче «врач в карточке пациента: шаблон → инстанс → правки».

---

## Каноничные спецификации (не копировать сюда дословно)

| Тема | Документ |
|------|----------|
| Целевая IA кабинета, Tab «Назначения», CTA «Назначить новое» | [`../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5–§6 |
| Заморозка глубокой карточки в прошлом проходе + «что после» | [`../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md`](../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md) этап 6, §«Этап 10» |
| Домен плана лечения, deep copy, правка инстанса, inbox, §4 UX врача | [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) |
| Сводка инициатив и статус A1–A5 / B1–B7 | [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md) |
| Каталоги «Назначений», comment pattern, хвост по шаблонам | [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) |
| Пациент: страницы программы (смежный контур), инициатива **закрыта** | [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md) · [`LOG.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md) |
| Реестр HTTP webapp (doctor/patient, test-results + accept) | [`../../apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) |
| Правила исполнения (Drizzle, LFK, фазы) | [`../RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`](../RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md) |

---

## Принципы из workspace rules

- Модули без прямого `@/infra/db/*` / `@/infra/repos/*`; маршруты тонкие — см. `.cursor/rules/clean-architecture-module-isolation.mdc`.
- Не менять запрещённые LFK-таблицы ради фичи — см. `EXECUTION_RULES` и тот же `.mdc`.
- Интеграционная конфигурация не в env — `.cursor/rules/000-critical-integration-config-in-db.mdc` (к этой задаче обычно не относится).
