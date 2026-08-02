# Статистика кабинета — независимый аудит тарифной механики (2026-08-02)

## Граница

Проверены продуктовый коммит `f8e51d8c1` и его совмещение с текущим `feat` в `187ccc6ca`.
Аудит ограничен уже существующими clinic-поверхностями: KPI записей в расписании и блоком
«Источники публичных записей» в настройке формы. Отдельного clinic analytics route и
patient-facing экрана в продукте нет; их отсутствие не считалось finding и не расширяло scope.

## Слепой kill-set

Составлен до чтения тестов:

1. При `doctor_statistics=disabled` KPI не видны и запрос `/api/doctor/schedule-kpis` не выполняется.
2. При выключенной механике блок источников публичной записи не виден и не загружает данные.
3. Механика не гейтит календарь и публичную запись и не меняет сохранённую attribution data.
4. Настройки календаря, записи и приёма платежей сохраняют собственное независимое поведение.
5. `read_only` остаётся видимым режимом для статистики, поскольку у этих поверхностей нет mutation-path.

## Вердикт: PASS

Реальных нарушений в заявленной границе не найдено.

- Каноническое решение `doctor_statistics` вычисляется на серверной странице расписания и одним
  boolean передаётся обоим существующим статистическим блокам.
- KPI при выключенной механике не только скрыты, но и не запрашиваются; календарный feed продолжает
  загружаться.
- Скрытый attribution-блок не монтируется, поэтому не выполняет запрос; его форматирование и API
  чтения не изменены.
- Product diff не касается публичного booking route, записи attribution или платёжного домена.
- Совмещённый экран получает независимые `paymentsVisible`/`paymentsReadOnly`, поэтому выключение
  статистики не скрывает и не изменяет настройки платежей.
- Пункт 4.4 плана честно оставлен частично открытым: несуществующие экраны не объявлены готовыми.

## Проверки

`pnpm --dir packages/db-principal build && pnpm --dir packages/operator-db-schema build && pnpm --dir packages/error-tracking build` → сборка локальных зависимостей прошла.

`/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.ui.test.tsx src/app/app/settings/BookingPublicAttributionSection.ui.test.tsx src/app/app/settings/BookingPaymentsSection.ui.test.tsx src/app/api/tariffMechanics.route.test.ts"` → `4` файла, `42` теста прошли.

`pnpm --dir apps/webapp typecheck` → `exit 0`.

`git diff --check` → `exit 0`.

Первый запуск целевого набора до сборки локальных workspace-пакетов завершился ошибкой импорта
`@bersoncare/db-principal`, следующий — `@bersoncare/operator-db-schema`; после штатной сборки обоих
пакетов тот же набор прошёл. Это состояние чистого клона, не дефект продуктового этапа.
