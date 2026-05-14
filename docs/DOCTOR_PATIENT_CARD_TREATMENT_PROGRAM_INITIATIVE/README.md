# DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE

Инициатива по **кабинету врача**: карточка пациента как место **назначения программ лечения из шаблонов** и **корректировки `treatment_program_instance`** (без дублирования каноничных спецификаций — только ссылки и дорожная карта).

**Статус:** живой roadmap и журнал — см. [`ROADMAP.md`](ROADMAP.md), [`LOG.md`](LOG.md) (в т.ч. parity конструктор ↔ экран инстанса и пост-аудит 2026-05-07).

**Операционный roadmap:** [`ROADMAP.md`](ROADMAP.md).

**Журнал:** [`LOG.md`](LOG.md).

**Мастер-план исполнения (ЛФК → программа, модалка назначения):** [`MASTER_PLAN.md`](MASTER_PLAN.md).

**Декомпозиция по этапам + слабые места / эскалация:** [`DECOMPOSITION.md`](DECOMPOSITION.md).

---

## Зачем отдельная папка

Связанные материалы размазаны по `APP_RESTRUCTURE_INITIATIVE`, `PROGRAM_PATIENT_SHAPE_PLAN`, архиву `PROGRAM_PATIENT_SHAPE_INITIATIVE`, `PLAN_DOCTOR_CABINET` и правилам `TREATMENT_PROGRAM_INITIATIVE`. Здесь — **одна точка входа** и **приоритизированный roadmap** по задаче «врач в карточке пациента: шаблон → инстанс → правки».

---

## Каноничные спецификации (не копировать сюда дословно)

| Тема | Документ |
|------|----------|
| Целевая IA кабинета, Tab «Назначения», CTA «Назначить новое» | [`../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5–§6 |
| Заморозка глубокой карточки в прошлом проходе + «что после» | [`../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md`](../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md) этап 6, §«Этап 10» |
| Домен плана лечения, deep copy, правка инстанса, inbox, §4 UX врача | [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) |
| Сводка инициатив и статус A1–A5 / B1–B7 | [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md) |
| Каталоги «Назначений», comment pattern, хвост по шаблонам | [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) |
| Пациент: страницы программы (смежный контур) | [`../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`](../archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md) · актуальные хвосты lifecycle: [`../PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md`](../PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md) |
| Реестр HTTP webapp (doctor/patient, test-results + accept) | [`../../apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) |
| Правила исполнения (Drizzle, LFK, фазы) | [`../TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md`](../TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md) |

---

## Принципы из workspace rules

- Модули без прямого `@/infra/db/*` / `@/infra/repos/*`; маршруты тонкие — см. `.cursor/rules/clean-architecture-module-isolation.mdc`.
- Не менять запрещённые LFK-таблицы ради фичи — см. `EXECUTION_RULES` и тот же `.mdc`.
- Интеграционная конфигурация не в env — `.cursor/rules/000-critical-integration-config-in-db.mdc` (к этой задаче обычно не относится).
