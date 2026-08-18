# Охрана строк спрашивается 38 тысяч раз на страницу

Владелец, 18.08: «все эти 28 тысяч вызовов в 311 проходах — конечно оптимизировать по максимуму (безопасно)».

## Замер (TEST, холодный рендер)

| страница | сканирований `app_ext.accepted_port_contexts` |
|---|---:|
| `/app/doctor` | 38 221 |
| `/app/doctor/patients` | 72 331 |
| `/app/doctor/schedule` | 164 |

Причина: `app.current_org_id()` и `app.require_accepted_context(...)` объявлены `VOLATILE`, поэтому
PostgreSQL обязан звать их **на каждую строку**, а каждый зов читает таблицу контекста. Ни одна из них
не принимает колонок строки — ответ для всего запроса один и тот же.

## Независимый разбор безопасности (18.08) — вердикт «безопасно при условиях»

Опровергнуто замером: закэшированный план **не** переносит результат между транзакциями (8 транзакций на
одном плане дали 8 разных значений). Ни одна из 489 политик не передаёт в эти функции колонку строки.
Десятки корней-функций **уже** объявлены `STABLE` и зовут ту же проверку — схема уже несёт нагрузку.

## Чек-лист

- [x] 1. `volatility: 'VOLATILE'` → `'STABLE'` для обеих функций в `deploy/postgres/privileges/declaration.ts`
      (≈ строки 4958 и 5067) и ключевое слово в телах в `deploy/postgres/port-context/contract.sql` (≈ 365, 445)
      — `declaration.ts:4961`, `declaration.ts:5067`, `contract.sql:366`, `contract.sql:446`.
      На DEV: `provolatile='s'`, `proparallel='u'` у обеих (`pg_proc`, 18.08)
- [x] 2. Обернуть вызовы в предикатах в `(SELECT ...)`, **не вынося их из своей ветки `CASE`**.
      Вынос наверх ломает роли без организации (платформенный админ, пресессия) отказом 42501 на каждом чтении
      — гейт `declaration.ts:5930`; 65 вызовов `app.current_org_id()` в org-предикатах
      (`declaration.ts:6084…6546`); один общий проход для предикатов, приходящих из
      `renderPhase4StrictPredicate` — `declaration.ts:6537` (regex с lookbehind, подстановка НА МЕСТЕ).
      Итог в артефакте: 1235/1235 вызовов в политиках обёрнуты, ни одного голого.
      Живая проверка отсутствия выноса: `app_platform_settings` с валидным platform-контекстом читает
      `be_organizations`=4, `system_settings`=121, `platform_users`=294 строк; `app_worker` — `system_settings`=4
- [x] 3. Перегенерировать `deploy/postgres/generated/privileges.*.sql` (не править руками)
      — `generate-cli.mjs --all`, затем `--check`: «артефакты соответствуют декларации побайтно»
- [x] 4. Доказательство А: живой тест вставки и upsert на таблице с охраной — с контекстом и без
      — `public.reference_items`, роль `app_staff`: INSERT / UPDATE / `ON CONFLICT DO UPDATE`
      без контекста → 42501 и до, и после; с контекстом → все три проходят и до, и после.
      Стена аренды цела: чужая организация в INSERT и перенос строки в чужую организацию → 42501
- [x] 5. Доказательство Б: `EXPLAIN (ANALYZE, VERBOSE)` — проверка считается один раз, сравнение по
      `organization_id` стало индексным
      — `SELECT id FROM public.reference_items` под `app_staff` (359 строк в таблице):
      было `Filter: app.require_accepted_context(...) AND organization_id = app.current_org_id()`,
      **718** seq-сканов `app_ext.accepted_port_contexts` за оператор;
      стало `Filter: ($0 AND organization_id = $1)` + `InitPlan 1/2 (actual rows=1 loops=1)`, **2** скана.
      С `enable_seqscan=off`: `Index Cond: (organization_id = $1)` по `idx_reference_items_organization_id`
- [x] 6. Доказательство В: матрица шести ролей (`app_platform_settings`, `app_patient`, `app_worker`,
      `app_tenant_service`, `app_integrator_request`, `app_clinic_billing`) на чужих таблицах, до и после
      — 133 пары роль×таблица (все таблицы, где у роли есть SELECT хотя бы на колонку), без контекста.
      Изменились ровно три, все «тихий ноль → 42501 accepted organization context required»:
      `app_patient` × `content_section_slug_history`, `app_tenant_service` × `doctor_notes`,
      `app_tenant_service` × `test_attempts`. Остальные 130 — без изменений
- [x] 7. Повторный замер страницы на dev
      — `/app/doctor`: 559 → 556, `/app/doctor/patients`: 441 → 385 сканов `accepted_port_contexts`.
      **Выигрыш на DEV не виден и не может быть виден**: на DEV гейтованные таблицы отдают единицы строк,
      и 2 скана на порт-транзакцию (установка + снятие контекста) — неустранимый пол. Механизм доказан
      пунктом 5: было 2×(число просмотренных строк), стало 2 на оператор. Числа TEST (38 221 / 72 331)
      перепроверяются только на TEST

## Условия, нарушать нельзя

- `PARALLEL UNSAFE` не трогать
- `pg_current_xact_id_if_assigned()` в этот заход не тащить — отдельная правка, отдельный разбор
- Ожидаемое изменение поведения: роль, которая сегодня молча получает ноль строк, начнёт получать отказ.
  Это строже, а не слабее, но маршруты, живущие на пустом ответе, могут сломаться — за этим и пункт 6

## Не сделано / вне скоупа

- Запрос страницы открывает 311 транзакций (по одной на запрос к базе) — отдельная тема
- `app.current_patient_user_id()`, `app.current_actor_user_id()`, `app.current_integrator_user_id()`,
  `app.require_attested_context_for_roles()`, `app.require_platform_principal()` остались `VOLATILE`
  и без обёртки — в этот заход правились только две названные функции
- `PARALLEL UNSAFE` и `pg_current_xact_id()` не тронуты
- TEST не трогали: `bersoncarebot_test` не деплоили, замер страниц там не повторяли
