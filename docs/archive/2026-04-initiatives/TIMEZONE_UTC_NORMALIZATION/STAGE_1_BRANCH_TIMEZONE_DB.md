# Stage 1 - IANA-зона филиала в БД

## Цель этапа

Сделать timezone филиала явной и устойчивой частью модели данных: у каждого филиала есть IANA-зона, доступная для integrator и webapp, с безопасным fallback `Europe/Moscow`.

Этот этап закрывает фундамент для корректной интерпретации наивных дат на следующих этапах.

## Scope (только Stage 1)

- Миграции схемы для timezone в таблицах филиалов.
- Первичное заполнение timezone для существующих данных.
- Подготовка API/репозитория для получения timezone филиала.
- Простое UI-поле в админке для редактирования timezone.
- Базовый in-memory TTL cache в integrator.

Не включать:
- Нормализацию `recordAt`/`dateTimeEnd`.
- Массовый backfill исторических `record_at`.
- Удаление хардкодов `+03:00` в других местах.

## Контекст и зависимости

- База webapp и integrator уже используются одновременно.
- Есть `system_settings`, но timezone филиала должна лежать именно в таблицах филиалов.
- Ожидаемый дефолт для РФ-сценария: `Europe/Moscow`.

## План реализации (детально)

### S1.T01 - Миграция timezone для `branches`

Сделать migration-файл в webapp migrations:

- `ALTER TABLE branches ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';`
- После добавления колонки убедиться, что старые строки получили дефолт.

Критерии:

- Миграция применима повторно по цепочке миграций.
- Rollback (если используется) не ломает соседние миграции.

### S1.T02 - Миграция timezone для `booking_branches`

Сделать migration-файл:

- `ALTER TABLE booking_branches ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';`

Критерии:

- Колонка обязательна (`NOT NULL`).
- Дефолт одинаковый с `branches`.

### S1.T03 - Seed/инициализация существующих филиалов

Добавить seed/скрипт (или SQL-блок внутри миграции по принятому в проекте стандарту):

- Для branch `17356` явно установить `Europe/Moscow`.
- Для остальных не перетирать вручную поставленные значения.
- При наличии справочника offset -> IANA добавить маппинг в документацию/код:
  - `-1 -> Europe/Kaliningrad`
  - `0 -> Europe/Moscow`
  - `+1 -> Europe/Samara`
  - `+2 -> Asia/Yekaterinburg`
  - `+3 -> Asia/Omsk`
  - `+4 -> Asia/Krasnoyarsk`
  - `+5 -> Asia/Irkutsk`
  - `+6 -> Asia/Yakutsk`
  - `+7 -> Asia/Vladivostok`
  - `+8 -> Asia/Magadan`
  - `+9 -> Asia/Kamchatka`

Критерии:

- Для известных филиалов timezone не пустая.
- Повторный запуск seed не приводит к разрушению данных (idempotent поведение).

### S1.T04 - Поле timezone в админке webapp

Внести минимум UI/validation:

- Поле `timezone` в форме филиала.
- Placeholder: `Europe/Moscow`.
- Серверная валидация: непустая строка.
- Клиентская валидация: непустая строка + trim.

Критерии:

- Можно сохранить timezone через админку.
- Значение читается обратно в форме без искажения.

### S1.T05 - `getBranchTimezone(branchId)` в integrator

Реализовать accessor с TTL cache (60 секунд):

- Источник: БД (таблица филиалов/связанный каталог, фактический источник по текущей архитектуре).
- Если branch не найден или timezone пустая/битая -> fallback `Europe/Moscow`.
- Логировать fallback в warn (без спама: желательно через дедуп или на miss cache).

**Обязательно вместе с S1.T06:** сам по себе `warn` в логе **недостаточен** — без инцидента и Telegram-алерта fallback считается «тихим» и не проходит Gate Stage 1.

### S1.T06 - Наблюдаемость fallback и конфигурационных ошибок

Для fallback-кейсов (`branch not found`, `empty timezone`, `invalid IANA`) добавить обязательную операционную реакцию:

- Запись инцидента конфигурации в отдельное хранилище инцидентов (с ключом дедупа: `integration + branchId + reason`).
- Отправка Telegram-алерта администратору (один алерт на дедуп-ключ в окно времени).
- Правило должно быть переиспользуемым для любых интеграций, где timezone берется по branch.

Критерии:

- Повторные вызовы в течение TTL не долбят БД.
- После TTL значение подтягивается заново.
- Fallback стабильно работает.
- Fallback не "тихий": есть инцидент + админ-алерт.

## Проверки и тесты

Минимум после завершения stage:

- Прогнать тесты, затронутые изменениями.
- Прогнать `pnpm run ci`.

Проверки вручную:

- SQL-проверка наличия колонок `timezone` в обеих таблицах.
- SQL-проверка `COUNT(*) WHERE timezone IS NULL` == 0.
- Smoke админки: открыть филиал, сменить timezone, сохранить, перечитать.

## Gate (обязателен для PASS)

- `branches.timezone` и `booking_branches.timezone` существуют и `NOT NULL`.
- У всех текущих филиалов timezone заполнена.
- `getBranchTimezone` возвращает timezone из БД или fallback `Europe/Moscow`.
- Fallback-кейсы фиксируются в инцидент-хранилище и доставляются в Telegram админу (с дедупом).
- `pnpm run ci` зеленый.

## Артефакты в лог

В `AGENT_EXECUTION_LOG.md` зафиксировать:

- Commit SHA или рабочий SHA (если без коммита).
- Какие migration-файлы добавлены.
- Результаты SQL-проверок.
- Результат `pnpm run ci`.
- Что было fallback-кейсом и как проверено.
