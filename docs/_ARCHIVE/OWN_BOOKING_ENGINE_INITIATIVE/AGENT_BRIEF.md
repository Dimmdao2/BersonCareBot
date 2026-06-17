# AGENT_BRIEF — ТЗ для агента-исполнителя этапа

Этот документ — инструкция для агента, который берёт **один этап** из [`ROADMAP.md`](ROADMAP.md) и строит по нему **декомпозированный план** `.cursor/plans/<stage>.plan.md`, затем исполняет его. Мастер-план и чек-листы (`STAGE_CHECKLISTS.md`, `UI_SURFACES_CHECKLIST.md`) — твоё ТЗ; ты их **не сужаешь**.

## 0. Перед началом (обязательно)
0. Рабочая git-ветка: **`initiative/own-booking-engine`** (см. `MASTER_PLAN.md` §Git-ветка). Не коммитить код инициативы в `main` до согласованного merge.
1. Прочитать: `SOURCE_SPEC.md`, `MASTER_PLAN.md`, `STAGE_CHECKLISTS.md` (свой этап целиком), `UI_SURFACES_CHECKLIST.md` (пункты своего этапа), `DATA_MODEL_REFERENCE.md`, `SCOPE_DECISIONS.md`.
2. Прочитать обязательные `.cursor/rules/*`: `clean-architecture-module-isolation.mdc`, `000-critical-integration-config-in-db.mdc`, `runtime-config-env-vs-db.mdc`, `system-settings-integrator-mirror.mdc`, `plan-authoring-execution-standard.mdc`, `pre-push-ci.mdc`, `test-execution-policy.md`, `patient-ui-shared-primitives.mdc`, `ui-copy-no-excess-labels.mdc`, `ui-select-trigger-display-label.mdc`, `server-conventions-and-doc-onboarding.mdc`.
3. Изучить текущий код области: `apps/webapp/src/modules/patient-booking/*`, `infra/repos/pgDoctorAppointments.ts`, `modules/integrator/bookingM2mApi.ts`, `db/schema/schema.ts`, `modules/system-settings/types.ts`, `docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`.

## 1. Как строить план этапа
- Формат: `.cursor/plans/own_booking_<stage>.plan.md` с валидным YAML frontmatter (`name`, `overview`, `todos[]`, `isProject:false`) — см. `plan-authoring-execution-standard.mdc`.
- Декомпозиция: этап → шаги → проверки → критерии закрытия. **Каждый** пункт чек-листа этапа из `STAGE_CHECKLISTS.md` должен отобразиться в `todos` (ничего не теряем).
- Запрещены формулировки «опционально/по желанию/если успеем». Пункт либо в Definition of Done, либо `cancelled` с причиной (+ запись в `SCOPE_DECISIONS.md`), либо вынесен в backlog со ссылкой.
- На каждый шаг — локальные проверки (rg, целевые unit/интеграционные тесты, lint/typecheck по затронутому пакету, короткий smoke). Полный `pnpm run ci` — один раз в конце крупного этапа и обязательно перед push.
- Явно зафиксировать **scope boundaries**: какие директории трогать; что вне scope (не менять соседние системы/UI/миграции вне задачи без согласования).

## 2. Архитектурные обязательства (для кода этапа)
- Новые таблицы — Drizzle + миграции; без raw SQL для новых фич; полиморфные ссылки без FK.
- Доменная логика в `modules/<domain>/service.ts` + `ports.ts`; инфраструктура реализует порт в `infra/repos/pg*.ts`; сборка в `buildAppDeps`; route-хендлеры тонкие.
- `organization_id` (C1) на всех новых доменных таблицах.
- Платёжные ключи/настройки интеграций — только `system_settings` (+`ALLOWED_KEYS`), синк в integrator через `updateSetting`. **Никаких новых ENV под секреты/URL интеграций.**
- Append-only события для истории (C3); статусная модель (C2); идемпотентность платежей/вебхуков.
- Rubitime/GCal — через изолированный адаптер; ядро не знает про внешние системы; мост управляется настройкой (C8).

## 3. Сквозные требования (проверять в каждом этапе)
C1 multi-tenant · C2 статусы · C3 история · C4 уведомления · C5 идентификация/мердж · C6 связь оплаты/абонемента на переходах · C7 анти-обход штрафа · C8 Rubitime-мост · C9 UI-паритет (все три кабинета) · C10 конфигурируемость. Детали — `MASTER_PLAN.md` §4.

## 4. UI-паритет (обязательно)
Для каждого пункта своего этапа из `UI_SURFACES_CHECKLIST.md` реализовать поверхность в нужном кабинете (A/B/C/P). Этап не закрывается, если данные есть, а управлять/видеть их в UI нельзя. Соблюдать UI-правила (shared-примитивы пациента, без лишних подписей, displayLabel в селектах).

## 5. Definition of Done этапа
- Все пункты чек-листа этапа выполнены или явно `cancelled` (с причиной в `SCOPE_DECISIONS.md`).
- Применимые C1–C10 закрыты; UI-поверхности на месте во всех затронутых кабинетах.
- Целевые тесты + lint/typecheck зелёные; для крупного этапа — финальный `pnpm run ci`.
- Обновлены: `LOG.md` (что сделано/проверки/решения/что намеренно не делали), доменная документация (README модуля, `apps/webapp/src/app/api/api.md`, `docs/ARCHITECTURE/DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md` при изменении моста), статусы в `ROADMAP.md` и frontmatter плана.
- Не смешивать фазы: не начинать следующий этап до прохождения gate текущего.

## 6. Что делать при неоднозначности
- Пункты с тэгом `[need-decision]` (список платёжных провайдеров, выбор календарного компонента и др.) — не угадывать: сформулировать вопрос, получить решение владельца, записать в `SCOPE_DECISIONS.md`, и только потом реализовывать.
- Любое сужение объёма — только через явную запись в `SCOPE_DECISIONS.md` с причиной. Молча пропускать «несущественные» опции запрещено.

## 7. Рекомендуемая последовательность для оркестрации (если запускается через субагентов)
1. Агент-планировщик: строит `.cursor/plans/own_booking_<stage>.plan.md` из чек-листа этапа.
2. Агент-ревьюер: проверяет план на полноту покрытия чек-листа и соответствие правилам, возвращает замечания.
3. Агент-исполнитель: реализует план по шагам с локальными проверками.
4. Агент-аудитор: сверяет результат с DoD этапа и UI-паритетом, отчитывается в `LOG.md`.
5. Агент-фиксер: устраняет замечания; финальный `pnpm run ci`; обновление статусов.
Между этапами — gate (см. `ROADMAP.md`). Не стартовать N+1 до закрытия N.
