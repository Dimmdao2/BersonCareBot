# LOG — PROGRAM_PATIENT_SHAPE_INITIATIVE

Формат: дата, этап (A1...A5), что сделано, проверки, решения, вне scope.

---

## 2026-05-03 — Добавлен файл промптов EXEC/AUDIT/FIX/GLOBAL (docs-only)

**Контекст:**

- Пользователь попросил создать файл с промптами для инициативы «как в других инициативах».

**Сделано:**

- Создан файл [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md) с copy-paste промптами:
  - общий блок правил;
  - циклы `EXEC -> AUDIT -> FIX` для этапов `A1..A5`;
  - `GLOBAL AUDIT`, `GLOBAL FIX`, `PREPUSH POSTFIX AUDIT`;
  - явная фиксация scope: только `treatment-program`-контур, с прямым запретом media/HLS-контуров.
- Обновлён [`README.md`](README.md): добавлена ссылка на новый файл промптов.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Любые изменения бизнес-логики и runtime-кода.

---

## 2026-05-03 — Уточнение инструкций по scope: только treatment-program контур (docs-only)

**Контекст:**

- Пользователь запросил явно зафиксировать в инструкциях, что работы по инициативе не должны выходить в `VIDEO_HLS_DELIVERY`/media-контур.

**Сделано:**

- Обновлён [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - в scope добавлено явное правило «держаться в treatment-program-контуре»;
  - в out-of-scope и архитектурные запреты добавлен media/HLS-контур (`apps/media-worker`, `modules/media`, `api/media`, `app/patient/content`).
- Уточнены allowed/do-not-edit в этапах:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md)
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md)
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md)
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md)
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md)
- Во всех этапах patient-path сужен до `apps/webapp/src/app/app/patient/treatment-programs/**` вместо широкого `patient/**`.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Любые изменения в `docs/VIDEO_HLS_DELIVERY` или media/HLS коде.

---

## 2026-05-03 — Пред-реализационная фиксация решений и карты кодовой базы (docs-only)

**Контекст:**

- Пользователь попросил принять необходимые решения заранее и дополнить документацию до старта кода.
- Цель: снять неопределённость по stage-gates (O1/O2/O3/O4) и заранее зафиксировать конкретные модули/роуты/схемы.

**Сделано:**

- Обновлён [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - добавлен §3.1 с картой кодовой базы (domain, doctor/patient API, patient/doctor UI, Drizzle schema);
  - зафиксированы решения по O1/O2/O3/O4 в stage-gates.
- Обновлены этапные планы:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) — O1 закреплён как `objectives TEXT`, добавлены явные API-зоны.
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md) — O4 закреплён как instance-only `is_actionable`, добавлены явные API-зоны.
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md) — добавлены целевые API-зоны для стадий/групп.
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md) — O2/O3 закреплены (complex-level + note в action_log), добавлены явные API-зоны.
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md) — добавлены конкретные patient API точки для mark-viewed/read.
- Синхронизирован продуктовый ТЗ [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md):
  - §1.3: `objectives` закреплён как `TEXT`;
  - §1.5: добавлено поле `note` в `program_action_log`;
  - §5: удалены O1-O4 из открытых вопросов;
  - §8.3: добавлен блок принятых решений и ссылка на execution-карту.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация A1-A5 в коде.

---

## 2026-05-03 — Усиление планов под composer-safe исполнение (docs-only)

**Контекст:**

- Пользователь попросил проверить достаточность папки и затем усилить планы «для композера»: больше декомпозиции, явные UI-компоненты, теги, классы и запреты там, где есть риск ошибиться.

**Сделано:**

- Добавлен [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) — шаблон обязательной записи после каждого EXEC/FIX прохода.
- Добавлен [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) — шаблон stage/full audit.
- Усилен [`MASTER_PLAN.md`](MASTER_PLAN.md):
  - добавлен `Composer-Safe Execution Standard`;
  - перечислены разрешённые UI primitives для doctor/admin и patient UI;
  - перечислены запреты (home-only стили, raw controls, новые UI-библиотеки, direct infra imports);
  - добавлены stage-gates по O1/O2/O3/O4 и backfill A5;
  - добавлено правило обязательного LOG/audit после этапов.
- Полностью усилены этапные планы:
  - [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) — schema/service/UI цепочка, allowed files, doctor/patient UI contract, atomized steps, rollback.
  - [`STAGE_A2_PLAN.md`](STAGE_A2_PLAN.md) — actionable/persistent/disabled/Stage 0, event semantics, UI labels/classes, hard delete ban.
  - [`STAGE_A3_PLAN.md`](STAGE_A3_PLAN.md) — group tables, no drag dependency, explicit move controls, native `<details>/<summary>` fallback for patient groups.
  - [`STAGE_A4_PLAN.md`](STAGE_A4_PLAN.md) — action log, checklist, session form, doctor inbox, exact UI labels, no pain scale/per-exercise comments.
  - [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md) — backfill gate, mark-viewed idempotency, badge labels/classes, cache revalidation.
- Обновлён [`README.md`](README.md) — добавлены ссылки на templates.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация A1–A5 в коде.

---

## 2026-05-03 — Инициализация папки инициативы (docs-only)

**Сделано:**

- Создана папка `docs/PROGRAM_PATIENT_SHAPE_INITIATIVE`.
- Добавлены: `README.md`, `MASTER_PLAN.md`, `STAGE_A1_PLAN.md` ... `STAGE_A5_PLAN.md`, `LOG.md`.
- Проставлены связи с roadmap и продуктовым ТЗ.

**Проверки:**

- Документация; код не менялся; CI не запускался.

**Вне scope:**

- Реализация этапов A1–A5 в коде.
