# Тест или взгляд

Repeatable timezone mapping/formatting behavior is verified by the cheapest public behavioral tests and a blind
kill-set. One-time typed-read-model wiring and absence of a second formatter/repository/API are verified by
inspection. Visual taste is not part of this audit.

# Independent audit: doctor encounter branch timezone

Ты независимый `auditor-live` кандидатной ветки `wt/clinical-encounter-branch-timezone-20260906` после завершения
product worker. До действий прочитай карту `AGENTS.md`, затем полностью §5, §10a, §10b, §16, §17, §21 и §24,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34 и полный P4.5 owner-чек-листа.

Не меняй product code. Разрешены только действительно необходимые поведенческие acceptance tests в уже
существующих test-файлах/канонически названном test-файле рядом с тестируемой публичной границей и краткий
audit-artifact. Все fault injections обязательно откати. Не push, land, deploy, full CI, screenshots или visual
taste review.

Агент работает один ход: не заканчивай его в ожидании фоновой команды; точечные проверки выполни foreground.
Перед завершением явно закоммить только разрешённые tests/audit artifacts либо оставь worktree чистым.

## Точные owner-пункты

- `ENCOUNTER-PAGE-04` — в верхнем информационном блоке показана дата приёма.
- `ENCOUNTER-PAGE-05` — время приёма показано по IANA timezone именно филиала, не приложения/браузера; doctor UI
  не показывает рядом `UTC` или предупреждение о timezone устройства.
- `ENCOUNTER-PAGE-06` — показан филиал.
- `ENCOUNTER-PAGE-07` — показан специалист.
- `ENCOUNTER-PAGE-08` — при наличии связи показана конкретная календарная запись.
- `ENCOUNTER-PAGE-08A` — дата/время связанной записи и шапки форматируются в одной timezone её филиала независимо
  от браузера; один приём не показывает два разных времени.
- `ENCOUNTER-PAGE-08B` — canonical appointment/read-model передаёт IANA timezone выбранного филиала; UI не
  угадывает её по названию и не подменяет глобальным `app_display_timezone`.
- `ENCOUNTER-PAGE-08C` — запись без филиала использует один явно определённый fallback, не выдаваемый за timezone
  физического филиала.

## Слепой kill-set — составь до чтения тестов

Проверь независимо следующие поломки:

1. `PatientAppointmentItem` теряет timezone филиала либо repository перестаёт передавать `br.timezone`.
2. Связанный visit снова форматируется через `app_display_timezone` при отличающейся branch timezone.
3. Строка связанной записи снова форматируется timezone браузера.
4. Branch timezone заменена литералом `Europe/Moscow` либо выведена из названия филиала.
5. Шапка приёма и строка записи показывают разные даты/время для одного UTC instant.
6. У записи без филиала код падает либо UI выдаёт fallback за timezone филиала.
7. Doctor UI начинает показывать `UTC`, `!` или сравнивать timezone устройства.

Для каждого сохраняемого теста назови конкретную поломку, наблюдаемое последствие и owner oracle. Один раз внеси
минимальную временную поломку на каждый независимый класс и запиши, какое утверждение покраснело. Не пиши тесты на
строки исходника, CSS, импорт или текст SQL. Repository mapping проверяй через существующую публичную тестовую
границу; не изобретай новую test DSL.

## Required result

Дай один бинарный PASS/FAIL. Каждый FAIL содержит достижимый сценарий, impact, owner-ID и evidence; стиль и
рекомендации findings не являются. Запусти targeted tests, webapp typecheck, scoped ESLint и `git diff --check`.
Отчёт должен назвать candidate SHA, audit SHA, точные команды/числа, каждый fault injection и подтвердить, что
product diff после инъекций чист.
