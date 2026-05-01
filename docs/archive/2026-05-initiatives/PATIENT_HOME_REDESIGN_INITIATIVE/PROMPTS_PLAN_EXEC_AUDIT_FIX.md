# PROMPTS — PLAN / EXEC / AUDIT / FIX / GLOBALAUDIT / GLOBALFIX

Готовые copy-paste промпты для последовательного запуска агентов по инициативе `PATIENT_HOME_REDESIGN_INITIATIVE`.

Правила использования:

- Промпты идут строго сверху вниз.
- Не пропускать AUDIT после EXEC.
- Не запускать следующую фазу, пока FIX текущей фазы не закрыт или AUDIT явно не сказал `NO MANDATORY FIXES`.
- Ничего не подставлять вручную: все номера фаз, файлы и формулировки уже указаны.
- Перед каждым EXEC/FIX убедиться, что текущая ветка: `patient-home-redesign-initiative`.
- Коммитить только если пользователь явно попросил commit.
- Проверки запускать по `.cursor/rules/test-execution-policy.md`: step/phase-level в обычной работе, full CI только на Phase 9, перед push или при реальном repo-level scope. Не выполнять `pnpm run ci` “если возможно” после каждой фазы.
- AUDIT-промпты не должны начинаться с запуска тестов или CI. Сначала анализ диффа, определение scope, проверка уже выполненных прогонов/reuse; только потом добор недостающих проверок нужного уровня.

Абсолютное правило для всех промптов: slug-и из `CONTENT_PLAN.md` (`office-work`, `office-neck`, `face-self-massage` и т.п.) не хардкодить в runtime-коде. Они только редакционный ориентир и fixture-примеры для тестов.

Абсолютное правило по БД: все новые runtime-запросы и репозитории только через Drizzle ORM. В новых runtime-файлах запрещены `getPool()`, `pool.query(...)`, `client.query(...)`. SQL допустим только в Drizzle migration files и `ROLLBACK_SQL.md`.

Модельная стратегия: **Composer 2 по умолчанию**. Эскалация только когда Composer 2 с высокой вероятностью наделает дорогих ошибок: Codex 5.3 для тяжёлого кода/миграций/интегратора, GPT 5.5 для критичных аудитов и только с учётом скидки 50% до 2 мая. Sonnet 4.6 не используется в базовом маршруте.

---

**Рекомендуемый агент:** Composer 2 — это план по уже подробному ТЗ; эскалация на GPT 5.5 только если план противоречит README.

## PROMPT 01 — PLAN PHASE 1

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй и не запускай миграции.

Прочитай:
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md полностью
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md
- .cursor/rules/clean-architecture-module-isolation.mdc
- .cursor/rules/000-critical-integration-config-in-db.mdc
- .cursor/rules/system-settings-integrator-mirror.mdc

Составь детальный план реализации Phase 1 — “БД и CMS: медиа разделов + настройка блоков главной”.

Обязательно учти:
- НЕ добавлять home_slot, home_sort_order, access_type в content_sections.
- Разделы CMS получают только cover_image_url и icon_image_url.
- Главная управляется через patient_home_blocks и patient_home_block_items.
- Нужна отдельная страница /app/settings/patient-home.
- Все новые runtime DB-запросы через Drizzle, без getPool/pool.query.
- Preview в admin-настройке не кликабельный.
- Добавление/изменение items только для daily_warmup, situations, subscription_carousel, courses, sos.
- Показать/скрыть доступно для всех блоков.
- Порядок блоков меняется отдельной модалкой.
- Никаких slug-ов из CONTENT_PLAN.md в runtime-коде.

Верни:
1. Список файлов, которые нужно изменить/создать.
2. Порядок шагов реализации.
3. Какие тесты добавить.
4. Риски/уточнения.
5. Готовность к EXEC или блокеры.
```

**Рекомендуемый агент:** Codex 5.3 — тяжёлая фаза с миграциями, CMS и admin UI; Composer 2 здесь рискован.

## PROMPT 02 — EXEC PHASE 1

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 1 из docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md.

Перед началом:
- Убедись, что ветка patient-home-redesign-initiative.
- Прочитай docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md раздел Phase 1.
- Прочитай docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md, но НЕ хардкодь slug-и оттуда.
- Прочитай docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md.

Сделай только Phase 1:
- Добавь в content_sections только cover_image_url и icon_image_url.
- Создай patient_home_blocks.
- Создай patient_home_block_items.
- Добавь seed фиксированных блоков: daily_warmup, booking, situations, progress, next_reminder, mood_checkin, sos, plan, subscription_carousel, courses.
- Реализуй порт/репозиторий для блоков главной через Drizzle ORM, без getPool/pool.query/client.query.
- Расширь CMS-форму раздела только обложкой и иконкой.
- Создай admin-страницу /app/settings/patient-home с preview блоков, меню ⋯, show/hide, add item, edit items, reorder blocks.
- Реализуй модалки item-list и add item.
- Реализуй reorder items с drag-drop; если готового паттерна нет, используй кнопки ↑/↓ и зафиксируй fallback в LOG.md.
- Добавь тесты, указанные в Phase 1.
- Создай/обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md с записью Phase 1.

Запрещено:
- Не переписывать клиентскую главную пациента.
- Не трогать content_pages.
- Не добавлять ALLOWED_KEYS.
- Не менять модель курсов.
- Не добавлять home_slot, home_sort_order, access_type в content_sections.
- Не хардкодить slug-и из CONTENT_PLAN.md.

В конце запусти проверки правильного уровня по `.cursor/rules/test-execution-policy.md`: targeted tests для изменённых файлов, `pnpm --dir apps/webapp typecheck`, `pnpm --dir apps/webapp lint`, и phase-level `pnpm test:webapp` при закрытии фазы. Не запускай full CI на Phase 1, если не было repo-level изменений. В финальном ответе кратко укажи: что сделано, какие тесты прошли, что не удалось проверить.
```

**Рекомендуемый агент:** Composer 2 — аудит по чёткому чеклисту; GPT 5.5 только при спорном результате.

## PROMPT 03 — AUDIT PHASE 1

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит результата Phase 1.

Прочитай:
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md полностью
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md

Проверь код и тесты после Phase 1:
- content_sections содержит только cover_image_url и icon_image_url из новых полей.
- НЕТ home_slot, home_sort_order, access_type в content_sections.
- Есть patient_home_blocks и patient_home_block_items.
- Есть seed фиксированных блоков.
- target_ref полиморфный, без FK на content_pages/content_sections/courses.
- Есть порт и infra repo для блоков главной.
- Новый infra repo использует Drizzle ORM, не getPool/pool.query/client.query.
- modules/* не импортируют infra напрямую.
- route handlers/server actions тонкие.
- /app/settings/patient-home существует и работает по ТЗ.
- Preview item не кликабельный.
- Меню ⋯ содержит правильные действия.
- Нет runtime-хардкода slug-ов из CONTENT_PLAN.md.
- Тесты Phase 1 существуют и проходят.

Создай docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md.

Структура отчёта:
1. Verdict: PASS / PASS WITH MINOR NOTES / FAIL
2. Mandatory fixes
3. Minor notes
4. Tests reviewed/run
5. Explicit confirmation: no CONTENT_PLAN slug hardcode found / found violations

Если есть Mandatory fixes, сформулируй точные инструкции для FIX PHASE 1.
```

**Рекомендуемый агент:** Composer 2 — сначала дешёвый fix; Codex 5.3 только если audit требует править миграции/DI.

## PROMPT 04 — FIX PHASE 1

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только обязательные замечания из docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md.

Ограничения:
- Не выходить за Phase 1.
- Не добавлять новые фичи.
- Не менять архитектуру сверх замечаний аудита.
- Не хардкодить slug-и из CONTENT_PLAN.md.

После исправлений:
- Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.
- Запусти тесты, относящиеся к исправлениям.
- Запусти только проверки уровня, нужного для исправлений по `.cursor/rules/test-execution-policy.md`; full CI не запускать без repo-level scope.
- В финальном ответе перечисли исправленные mandatory items и проверки.
```

---

**Рекомендуемый агент:** Composer 2 — план небольшой, контекст уже задан в ТЗ.

## PROMPT 05 — PLAN PHASE 2

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай:
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md полностью
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md

Составь детальный план Phase 2 — “Промо-материал курса + целевые настройки главной”.

Обязательно учти:
- Разминка дня выбирается через /app/settings/patient-home блок daily_warmup, а НЕ через system_settings slug.
- НЕ добавлять patient_home_daily_warmup_page_slug.
- Добавить только patient_home_daily_practice_target в system_settings.
- Не добавлять ключи утреннего пинга в Phase 2.
- Добавить linked_course_id в content_pages.
- Runtime-изменения БД делать через Drizzle ORM, не pool.query.
- Не менять модель курсов.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Верни список файлов, миграций, тестов, рисков и порядок реализации.
```

**Рекомендуемый агент:** Composer 2 — умеренная фаза; Codex 5.3 только если Composer 2 ломает миграцию/форму.

## PROMPT 06 — EXEC PHASE 2

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 2 из README.

Сделай только Phase 2:
- Добавь content_pages.linked_course_id с FK на courses(id) ON DELETE SET NULL.
- Расширь pgContentPages и ContentPageRow.
- Если затрагиваешь runtime queries в pgContentPages, не добавляй новый raw SQL для новых полей; предпочитай Drizzle или минимально не расширяй raw SQL сверх legacy-паттерна.
- Добавь выбор связанного курса в CMS-форму материала.
- На странице пациента /app/patient/content/[slug] показывай CTA курса, если linked_course_id указывает на опубликованный курс.
- Добавь system_settings key patient_home_daily_practice_target в ALLOWED_KEYS и ADMIN_SCOPE_KEYS.
- Добавь UI для patient_home_daily_practice_target на /app/settings/patient-home или в settings-параметрах, предпочтительно на /app/settings/patient-home рядом с блоками.
- Создай getPatientHomeTodayConfig, который берёт daily_warmup из patient_home_blocks / patient_home_block_items.
- Обнови LOG.md.
- Добавь тесты Phase 2.

Запрещено:
- Не добавлять patient_home_daily_warmup_page_slug.
- Не добавлять patient_home_morning_ping_enabled и patient_home_morning_ping_local_time в Phase 2.
- Не делать второй UI выбора разминки дня в AppParametersSection.
- Не менять модель курсов сверх linked_course_id.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки по `.cursor/rules/test-execution-policy.md`. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — аудит узкий, с чёткими критериями.

## PROMPT 07 — AUDIT PHASE 2

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 2.

Проверь:
- linked_course_id есть в content_pages и корректно сохраняется.
- FK на courses(id) ON DELETE SET NULL есть.
- Для новых runtime-сущностей нет getPool/pool.query/client.query.
- CMS-форма материала умеет выбирать курс.
- CTA курса на странице материала работает и мягко скрывается, если курс не найден.
- patient_home_daily_practice_target добавлен в ALLOWED_KEYS и ADMIN_SCOPE_KEYS.
- patient_home_daily_warmup_page_slug НЕ добавлен.
- patient_home_morning_ping_enabled и patient_home_morning_ping_local_time НЕ добавлены в Phase 2.
- getPatientHomeTodayConfig читает daily_warmup из patient_home_blocks/items.
- Нет runtime-хардкода slug-ов из CONTENT_PLAN.md.
- Тесты Phase 2 есть и проходят.

Создай docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md со структурой: Verdict, Mandatory fixes, Minor notes, Tests reviewed/run, Explicit confirmation about no slug hardcode.
```

**Рекомендуемый агент:** Composer 2 — если fixes локальные; Codex 5.3 при поломке миграции.

## PROMPT 08 — FIX PHASE 2

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только mandatory fixes из AUDIT_PHASE_2.md.

Ограничения:
- Только Phase 2.
- Не добавлять patient_home_daily_warmup_page_slug.
- Не хардкодить slug-и из CONTENT_PLAN.md.
- Не менять модель курсов сверх согласованного linked_course_id.

Обнови LOG.md и запусти релевантные targeted/phase-level проверки. Full CI не запускать без repo-level scope.
```

---

**Рекомендуемый агент:** Composer 2 — план UI по готовому ТЗ; GPT 5.5 только если нужна продуктовая переоценка.

## PROMPT 09 — PLAN PHASE 3

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, CONTENT_PLAN, LOG, AUDIT_PHASE_2.

Составь детальный план Phase 3 — мобильная главная пациента.

Обязательно:
- Главная берёт структуру из patient_home_blocks/items.
- DailyWarmupCard берёт первый visible item блока daily_warmup.
- SituationsRow берёт visible items блока situations.
- SubscriptionCarousel берёт visible items блока subscription_carousel.
- SosCard берёт первый visible item блока sos.
- Progress и Mood пока заглушки.
- BookingCard всегда видим, если блок booking visible.
- Preview/компоненты не должны зависеть от конкретных slug-ов из CONTENT_PLAN.md.
- На Phase 3 не делать progress/mood реальные сущности.

Верни файлы, шаги, тесты и риски.
```

**Рекомендуемый агент:** Composer 2 — попробовать сначала; Codex 5.3 только если провалит структуру React/Next.

## PROMPT 10 — EXEC PHASE 3

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 3.

Сделай:
- Перепиши /app/patient/page.tsx на новую главную «Сегодня» в мобильной одной колонке.
- Создай компоненты PatientHomeToday, Greeting, DailyWarmupCard, BookingCard, SituationsRow, ProgressBlock, NextReminderCard, MoodCheckin, SosCard, PlanCard, SubscriptionCarousel.
- Используй patient_home_blocks/items как runtime-источник.
- Учитывай видимость блоков и items.
- Для гостя не показывай персональные данные.
- Для patient показывай персональные блоки, где данные доступны.
- ProgressBlock и MoodCheckin пока заглушки.
- Удали или перестань использовать PatientMiniAppPatientHome, PatientHomeBrowserHero, PatientHomeExtraBlocks.
- Добавь тесты Phase 3.
- Обнови LOG.md.

Запрещено:
- Не делать реальные таблицы progress/mood.
- Не менять страницы /app/patient/sections/[slug].
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — аудит по чеклисту; GPT 5.5 только если есть сомнения в UX/архитектуре.

## PROMPT 11 — AUDIT PHASE 3

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 3.

Проверь:
- /app/patient/page.tsx использует новую главную.
- Runtime-источник блоков — patient_home_blocks/items.
- Нет списков slug-ов из CONTENT_PLAN.md в runtime.
- Гость/без tier/patient получают корректный набор блоков.
- Progress и Mood являются заглушками, без новых таблиц.
- Старые компоненты удалены или не используются.
- Тесты Phase 3 есть и проходят.

Создай AUDIT_PHASE_3.md с verdict, mandatory fixes, minor notes, tests reviewed/run, no slug hardcode confirmation.
```

**Рекомендуемый агент:** Composer 2 — для локальных UI-fix; Codex 5.3 если сломана структура данных.

## PROMPT 12 — FIX PHASE 3

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только mandatory fixes из AUDIT_PHASE_3.md.

Если mandatory fixes отсутствуют, сделай только согласованный micro-fix по minor notes:
- удалить неиспользуемый import buildAppDeps из apps/webapp/src/app/app/patient/page.tsx, если он всё ещё есть;
- не реализовывать публичную anonymous-главную;
- не добавлять большой snapshot всей главной;
- не менять расчёт следующего напоминания.

Публичная anonymous-главная вынесена в Phase 4.5. Большой тест целой главной — туда же. Точный расчёт следующего напоминания — Phase 8.

Не выходить за Phase 3. Не делать progress/mood реальные сущности. Не хардкодить slug-и из CONTENT_PLAN.md.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — план layout-фазы простой.

## PROMPT 13 — PLAN PHASE 4

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_3.

Составь план Phase 4 — планшет и десктоп для главной пациента.

Обязательно:
- Расширенный patient-wide layout только для /app/patient.
- Остальные patient pages остаются узкими.
- На lg+ две колонки + полноширинная подписочная карусель.
- На md одна колонка.
- Не менять данные и CMS.
- Не хардкодить slug-и.

Верни файлы, шаги, тесты, риски.
```

**Рекомендуемый агент:** Composer 2 — responsive layout без новых данных.

## PROMPT 14 — EXEC PHASE 4

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 4.

Сделай:
- Добавь patient-wide layout или параметр wide в AppShell.
- Примени wide только на /app/patient.
- Реализуй двухколоночную сетку на lg+.
- Оставь md и mobile в одной колонке.
- SubscriptionCarousel полноширинно под колонками.
- Добавь тесты/снапшоты, доступные в проекте.
- Обнови LOG.md.

Запрещено:
- Не менять остальные patient pages.
- Не менять CMS/БД.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — узкий аудит layout-ограничений.

## PROMPT 15 — AUDIT PHASE 4

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 4.

Проверь:
- wide layout применён только к /app/patient.
- На lg+ две колонки, на md/mobile одна.
- SubscriptionCarousel полноширинно.
- Остальные patient routes не изменили контейнер.
- Нет slug hardcode.
- Тесты Phase 4 есть и проходят.

Создай AUDIT_PHASE_4.md.
```

**Рекомендуемый агент:** Composer 2 — локальные правки layout.

## PROMPT 16 — FIX PHASE 4

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_4.md.

Только Phase 4. Не менять CMS/БД. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — auth/layout изменение умеренное; Codex 5.3 только если ломается Next layout/session policy.

## PROMPT 16A — PLAN PHASE 4.5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай:
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md полностью
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_4.md
- apps/webapp/src/app/app/patient/layout.tsx
- apps/webapp/src/app/app/patient/page.tsx
- apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx
- apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts

Составь план Phase 4.5 — публичная главная пациента и auth-on-drilldown.

Обязательно:
- Открыть без сессии только точный маршрут /app/patient.
- Все /app/patient/... без сессии должны продолжать редиректить на логин с next.
- PatientHomeToday должен поддержать session=null без персональных запросов.
- Anonymous guest видит только non-personal блоки.
- Не менять /api/media/:id access policy; protected media не раскрывать публично, UI должен деградировать fallback-ами.
- Добавить тесты для exact /app/patient, внутренних route redirects и whole-home сценариев anonymous / без tier / patient.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Верни файлы, порядок реализации, тесты и риски.
```

**Рекомендуемый агент:** Composer 2 — реализация локальная; Codex 5.3 при проблемах с layout/headers/redirect tests.

## PROMPT 16B — EXEC PHASE 4.5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 4.5.

Сделай:
- Разреши отсутствие сессии только для точного /app/patient.
- Оставь все внутренние /app/patient/... за авторизацией.
- Обнови /app/patient/page.tsx: при !session рендери non-personal главную, не redirect.
- Обнови PatientHomeToday на session: AppSession | null.
- Не делай персональных запросов без session/personalTierOk.
- Добавь UX для guest: без имени, без персональных блоков, CTA на вход/активацию где уместно.
- Добавь whole-home тесты для anonymous / authorized без tier / patient.
- Добавь тесты route/layout policy.
- Обнови LOG.md.

Запрещено:
- Не открывать публично /app/patient/sections/*, /app/patient/content/*, кабинет, дневник, покупки, reminders, messages.
- Не менять auth/session model.
- Не менять /api/media/:id access policy.
- Не менять CMS/БД.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — аудит по чёткому чеклисту; GPT 5.5 только если есть сомнения по security/auth boundary.

## PROMPT 16C — AUDIT PHASE 4.5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 4.5.

Проверь:
- /app/patient открывается без сессии.
- /app/patient/... без сессии редиректит на логин с next.
- Без сессии нет персональных запросов и имени пользователя.
- PatientHomeToday корректно работает с session=null.
- Protected media не стали публичными.
- Whole-home тесты покрывают anonymous / без tier / patient.
- Нет slug hardcode из CONTENT_PLAN.md.
- Тесты Phase 4.5 есть и проходят.

Создай docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_4_5.md со структурой: Verdict, Mandatory fixes, Minor notes, Tests reviewed/run, Explicit security/auth boundary confirmation, No slug hardcode confirmation.
```

**Рекомендуемый агент:** Composer 2 — локальные фиксы; Codex 5.3 при auth/layout regressions.

## PROMPT 16D — FIX PHASE 4.5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь только mandatory fixes из AUDIT_PHASE_4_5.md.

Только Phase 4.5. Не менять CMS/БД. Не менять /api/media/:id access policy. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — план по подробному ТЗ; GPT 5.5 только если Composer 2 не учтёт timezone.

## PROMPT 17 — PLAN PHASE 5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_4, AUDIT_PHASE_4_5.

Составь план Phase 5 — прогресс выполнения и стрик.

Обязательно:
- Новая таблица patient_practice_completions.
- Runtime-репозиторий только через Drizzle ORM.
- Нет FK на users.
- FK content_page_id на content_pages(id) ON DELETE CASCADE.
- Module isolation через modules/patient-practice.
- Тонкие API routes.
- Кнопка «Я выполнил(а) практику» на странице материала.
- ProgressBlock показывает реальные данные.
- Не трогать дневники ЛФК/симптомов.
- Не хардкодить slug-и.

Верни файлы, миграции, API, тесты, риски.
```

**Рекомендуемый агент:** Codex 5.3 — новая таблица, сервис, API, UI и тесты; ошибка тут дороже модели.

## PROMPT 18 — EXEC PHASE 5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 5.

Сделай:
- Добавь patient_practice_completions через Drizzle.
- Создай modules/patient-practice с ports/service/types/md.
- Создай infra repo pgPatientPracticeCompletions через Drizzle ORM и in-memory repo.
- Добавь DI в buildAppDeps.
- Добавь POST /api/patient/practice/completion.
- Добавь GET /api/patient/practice/progress.
- Добавь кнопку «Я выполнил(а) практику» на странице материала.
- После клика предложи feeling 1..5 или пропуск.
- PatientHomeProgressBlock показывает todayDone, todayTarget, streak.
- Обнови LOG.md.
- Добавь тесты Phase 5.

Запрещено:
- Не менять дневники симптомов/ЛФК.
- Не делать gamification badges.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — аудит по чеклисту; GPT 5.5 только для перепроверки timezone/streak.

## PROMPT 19 — AUDIT PHASE 5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 5.

Проверь:
- patient_practice_completions соответствует ТЗ.
- pgPatientPracticeCompletions использует Drizzle ORM, не getPool/pool.query/client.query.
- Нет FK на users.
- Есть CHECK для source и feeling.
- Module isolation соблюдён.
- API routes тонкие.
- Стрик учитывает timezone.
- Кнопка выполнения работает.
- ProgressBlock реальные данные.
- Дневники не изменены.
- Нет slug hardcode.
- Тесты Phase 5 есть и проходят.

Создай AUDIT_PHASE_5.md.
```

**Рекомендуемый агент:** Composer 2 — сначала дешёвый fix; Codex 5.3 только при правках сервиса/SQL/API.

## PROMPT 20 — FIX PHASE 5

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_5.md.

Только Phase 5. Не менять дневники. Не добавлять gamification. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — mood-фаза похожа на Phase 5, проще.

## PROMPT 21 — PLAN PHASE 6

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_5.

Составь план Phase 6 — чек-ин самочувствия.

Обязательно:
- Новая таблица patient_daily_mood.
- Runtime-репозиторий только через Drizzle ORM.
- Primary key user_id + mood_date.
- Score 1..5.
- Date рассчитывать по getAppDisplayTimeZone.
- Module isolation через modules/patient-mood.
- Тонкие API routes.
- UI на главной: 5 emoji-кнопок, optimistic update.
- Не связывать mood с дневником симптомов.
- Не хардкодить slug-и.

Верни файлы, миграции, API, тесты, риски.
```

**Рекомендуемый агент:** Composer 2 — фаза похожа на Phase 5, но проще; Codex 5.3 только при миграционных ошибках.

## PROMPT 22 — EXEC PHASE 6

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 6.

Сделай:
- Добавь patient_daily_mood через Drizzle.
- Создай modules/patient-mood с ports/service/types/md.
- Создай pgPatientDailyMood через Drizzle ORM и in-memory repo.
- Добавь DI.
- Добавь POST /api/patient/mood.
- Добавь GET /api/patient/mood/today.
- Реализуй PatientHomeMoodCheckin с 5 emoji-кнопками.
- Подсвечивай сохранённый score.
- Обнови LOG.md.
- Добавь тесты Phase 6.

Запрещено:
- Не связывать mood с symptom diary.
- Не добавлять комментарии/теги настроения.
- Не делать историю mood.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — критерии проверки простые и узкие.

## PROMPT 23 — AUDIT PHASE 6

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 6.

Проверь:
- patient_daily_mood соответствует ТЗ.
- pgPatientDailyMood использует Drizzle ORM, не getPool/pool.query/client.query.
- mood_date считается по app timezone.
- score 1..5 enforced.
- Module isolation соблюдён.
- API routes тонкие.
- UI сохраняет/перезаписывает score.
- Нет связи с symptom diary.
- Нет slug hardcode.
- Тесты Phase 6 есть и проходят.

Создай AUDIT_PHASE_6.md.
```

**Рекомендуемый агент:** Composer 2 — локальные fixes; Codex 5.3 при проблемах миграции/API.

## PROMPT 24 — FIX PHASE 6

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_6.md.

Только Phase 6. Не связывать mood с дневниками. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — простая UI/бейдж-фаза.

## PROMPT 25 — PLAN PHASE 7

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_6.

Составь план Phase 7 — подписочная карусель и бейджи.

Обязательно:
- Карусель использует patient_home_block_items блока subscription_carousel.
- Бейджи берутся из badgeLabel или default «По подписке».
- Контент остаётся открытым.
- Никакого gating.
- Никаких платежей.
- Страница раздела показывает информационный бейдж, если раздел добавлен в subscription_carousel.
- Не хардкодить slug-и.

Верни файлы, шаги, тесты, риски.
```

**Рекомендуемый агент:** Composer 2 — карусель и бейджи без БД/gating.

## PROMPT 26 — EXEC PHASE 7

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 7.

Сделай:
- Доведи PatientHomeSubscriptionCarousel до горизонтального scroll/snap/peek.
- Показывай imageUrlOverride или target image.
- Показывай titleOverride или target title.
- Показывай badgeLabel или default «По подписке».
- На странице раздела показывай информационный блок, если раздел добавлен в subscription_carousel.
- Контент не закрывать.
- Добавь тесты Phase 7.
- Обнови LOG.md.

Запрещено:
- Никаких платежей.
- Никакого gating.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level webapp проверки. Full CI не запускать без repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — узкий аудит no-gating/no-payments.

## PROMPT 27 — AUDIT PHASE 7

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 7.

Проверь:
- Карусель строится из patient_home_block_items.
- Нет gating.
- Нет платежей.
- Бейджи generic, без slug hardcode.
- Страница раздела реагирует на наличие item в subscription_carousel.
- Тесты Phase 7 есть и проходят.

Создай AUDIT_PHASE_7.md.
```

**Рекомендуемый агент:** Composer 2 — локальные UI-fix.

## PROMPT 28 — FIX PHASE 7

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_7.md.

Только Phase 7. Никакого gating или платежей. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — сначала дешёвый план; GPT 5.5 только если не найдёт правильную точку worker/schedule.

## PROMPT 29 — PLAN PHASE 8

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_7.
Прочитай apps/integrator/src/infra/runtime/worker/main.ts и существующие scheduled/reminder jobs.

Составь план Phase 8 — бот: утренний пинг разминки и связь с напоминаниями.

Обязательно:
- Добавить patient_home_morning_ping_enabled и patient_home_morning_ping_local_time в ALLOWED_KEYS/ADMIN_SCOPE_KEYS в Phase 8.
- Использовать daily_warmup из patient_home_blocks/items.
- Заменить упрощённый pickNextReminderRuleForHome на точный расчёт ближайшего срабатывания по daysMask/window/interval/timezone.
- Не добавлять персональные расписания.
- Не менять reminder_rules схему.
- Учесть throttle/rate-limit.
- Не хардкодить slug-и.

Верни точку расширения интегратора, файлы, тесты, риски.
```

**Рекомендуемый агент:** Codex 5.3 — интегратор/worker/system_settings; Composer 2 здесь рискован.

**Phase 8 — режим плана:** `EXEC` (фиксация в README § Phase 8).

## PROMPT 30 — EXEC PHASE 8

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 8.

Сделай:
- Добавь system_settings keys patient_home_morning_ping_enabled и patient_home_morning_ping_local_time.
- Добавь UI настройки этих ключей.
- Реализуй утренний пинг в интеграторе через минимально инвазивную точку расширения.
- Пинг включается только если enabled=true.
- Время HH:MM в timezone приложения.
- Сообщение: «Доброе утро! Разминка дня готова — 3 минуты. Открыть?»
- Кнопка ведёт в mini-app /app/patient?from=morning_ping.
- Используй текущий daily_warmup из блоков главной.
- Замени эвристику «самое свежее updatedAt» для NextReminderCard на точный расчёт ближайшего срабатывания по daysMask/windowStartMinute/windowEndMinute/intervalMinutes/timezone.
- Добавь тесты Phase 8.
- Обнови LOG.md.

Запрещено:
- Не менять reminder_rules schema.
- Не делать персональные schedule для каждого пользователя.
- Не хардкодить slug-и из CONTENT_PLAN.md.

Запусти релевантные targeted/phase-level проверки: webapp для settings/UI и integrator для worker/ping. Full CI только если реально затронут repo-level scope.
```

**Рекомендуемый агент:** Composer 2 — аудит по чеклисту; GPT 5.5 только если есть сомнения в scheduling/throttle.

## PROMPT 31 — AUDIT PHASE 8

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 8.

Проверь:
- Ключи system_settings добавлены корректно и mirrored.
- Пинг выключен по default.
- Используется daily_warmup из блоков главной.
- Нет изменения reminder_rules schema.
- Есть throttle/rate-limit или обоснованное использование существующего механизма.
- NextReminderCard больше не использует эвристику updatedAt; ближайшее время считается по daysMask/window/interval/timezone.
- Deeplink корректный.
- Нет slug hardcode.
- Тесты Phase 8 есть и проходят.

Создай AUDIT_PHASE_8.md.
```

**Рекомендуемый агент:** Composer 2 — сначала дешёвый fix; Codex 5.3 только при правках integrator/runtime.

## PROMPT 32 — FIX PHASE 8

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_8.md.

Только Phase 8. Не менять reminder_rules schema. Не хардкодить slug-и.

Обнови LOG.md и запусти релевантные тесты.
```

---

**Рекомендуемый агент:** Composer 2 — релизный checklist по готовому ТЗ.

## PROMPT 33 — PLAN PHASE 9

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: PLAN. Ничего не редактируй.

Прочитай README, LOG, AUDIT_PHASE_8 и все AUDIT_PHASE_*.md.

Составь план Phase 9 — QA, rollback SQL, snapshots, релизная подготовка.

Обязательно:
- Проверить все acceptance criteria.
- Подготовить ROLLBACK_SQL.md.
- Подготовить RELEASE_SNAPSHOTS структуру.
- Обновить docs/README.md ссылкой на инициативу.
- Создать/обновить module docs.
- Финальный full CI: `pnpm install --frozen-lockfile && pnpm run ci`.
- Проверить отсутствие slug hardcode из CONTENT_PLAN.md.

Верни checklist и порядок выполнения.
```

**Рекомендуемый агент:** Composer 2 — документация, rollback и проверки.

## PROMPT 34 — EXEC PHASE 9

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: EXEC. Реализуй Phase 9.

Сделай:
- Проверь acceptance criteria всех фаз.
- Создай/обнови ROLLBACK_SQL.md для миграций 0008–0011.
- Создай папку RELEASE_SNAPSHOTS с README.md-инструкцией для скриншотов.
- Обнови docs/README.md ссылкой на PATIENT_HOME_REDESIGN_INITIATIVE.
- Создай/обнови module docs для новых modules.
- Проведи поиск по коду на slug-и из CONTENT_PLAN.md и убедись, что нет runtime-hardcode.
- Запусти pnpm install --frozen-lockfile.
- Запусти pnpm run ci.
- Обнови LOG.md итоговым gate verdict.

Не делать deploy и не push без отдельной команды пользователя.
```

**Рекомендуемый агент:** Composer 2 — релизный аудит по чеклисту; GPT 5.5 только если есть красные флаги.

## PROMPT 35 — AUDIT PHASE 9

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: AUDIT. Проведи аудит Phase 9 и всей релизной готовности.

Проверь:
- ROLLBACK_SQL.md есть и покрывает миграции.
- RELEASE_SNAPSHOTS/README.md есть.
- docs/README.md обновлён.
- module docs есть.
- LOG.md содержит статусы всех фаз.
- pnpm run ci зелёный или есть явная причина, почему не запускался.
- Нет runtime-hardcode slug-ов из CONTENT_PLAN.md.
- Не сделан deploy/push без команды пользователя.

Создай AUDIT_PHASE_9.md.
```

**Рекомендуемый агент:** Composer 2 — документационные/релизные fixes.

## PROMPT 36 — FIX PHASE 9

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: FIX. Исправь mandatory fixes из AUDIT_PHASE_9.md.

Только релизная подготовка. Не добавлять новые продуктовые фичи. Не делать deploy/push без отдельной команды пользователя.

Обнови LOG.md и запусти необходимые проверки.
```

---

**Рекомендуемый агент:** GPT 5.5 — единственная обязательная дорогая проверка: глобальный аудит всей инициативы со скидкой 50%.

## PROMPT 37 — GLOBALAUDIT

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: GLOBALAUDIT. Проведи полный аудит всей инициативы после Phase 9.

Прочитай:
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_3.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_4.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_5.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_6.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_7.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_8.md
- docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_9.md
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md

Проверь глобально:
- Все фазы выполнены в рамках scope.
- Нет запрещённых изменений из NOT IN SCOPE.
- Нет runtime-hardcode slug-ов из CONTENT_PLAN.md.
- Не добавлены env vars для integration/config.
- system_settings ключи в ALLOWED_KEYS и ADMIN_SCOPE_KEYS.
- module isolation соблюдён.
- route handlers тонкие.
- Drizzle schema/migrations согласованы.
- Все новые runtime DB-запросы идут через Drizzle ORM; нет getPool/pool.query/client.query в новых runtime-репозиториях.
- Нет изменений LFK-таблиц.
- Нет изменений CI workflow.
- Нет gating/платежей подписки.
- Главная управляется через patient_home_blocks/items.
- Разделы CMS не содержат home_slot/home_sort_order/access_type.
- pnpm run ci зелёный или причины documented.

Создай docs/PATIENT_HOME_REDESIGN_INITIATIVE/GLOBAL_AUDIT.md.

Структура:
1. Verdict: READY / NOT READY
2. Release blockers
3. Mandatory fixes
4. Minor notes
5. CI/test status
6. Explicit no slug hardcode confirmation
7. Explicit no out-of-scope confirmation
```

**Рекомендуемый агент:** Composer 2 — сначала дешёвый global fix; Codex 5.3 только если fixes затрагивают сложный код/миграции.

## PROMPT 38 — GLOBALFIX

```text
Работаем в инициативе PATIENT_HOME_REDESIGN_INITIATIVE.

Режим: GLOBALFIX. Исправь только release blockers и mandatory fixes из docs/PATIENT_HOME_REDESIGN_INITIATIVE/GLOBAL_AUDIT.md.

Ограничения:
- Не добавлять новые фичи.
- Не менять scope инициативы.
- Не делать платежи/gating.
- Не менять CI workflow.
- Не хардкодить slug-и из CONTENT_PLAN.md.
- Не делать deploy/push без отдельной команды пользователя.

После исправлений:
- Обнови LOG.md.
- Обнови GLOBAL_AUDIT.md секцией “Global fix result”.
- Запусти pnpm install --frozen-lockfile.
- Запусти pnpm run ci.
- В финальном ответе дай список исправлений и статус готовности к commit/push.
```
