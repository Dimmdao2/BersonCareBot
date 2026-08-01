# Независимый аудит Ч7 — значения runtime-настроек в БД

Роль: `auditor-live`. Сначала классифицировать каждый пункт как **«тест или взгляд»** по `AGENTS.md` §24.4.
Перед аудитом прочитать `AGENTS.md`: «Как решать, что делать», разделы для system_settings, миграций, тестов и
§24. Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § Ч7.

Аудируется ветка `wt/settings-values-db`, продуктовый коммит `d23028a50` и плановый commit `cde1d0563` после
синхронизации с актуальным `feat`. Worker report — только handoff, не evidence:
`docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_REPORT.md`.

## Путь человека и обязательные последствия

1. Администратор меняет runtime-настройку в БД → все реальные потребители получают это значение, а не вторую
   константу из кода.
2. Строки нет или БД не отвечает → вход/операция временно отказывает с наблюдаемой недоступностью; система не
   подменяет политику на `false`, `true`, пустую строку или hardcoded object. Исключение authority — только TTL и
   security delays, нужные до ответа БД.
3. Анонимный пользователь получает configured-состояние разрешённых login-каналов, но не может прочитать SMTP,
   API keys, OAuth secrets и другие credential-bearing values. Администратор с правильным principal продолжает
   читать/редактировать их через существующую дверь.
4. Человек может войти разрешённым каналом; выключенный/не настроенный канал не рекламируется и не запускается.
5. Этот этап не удаляет добровольный TOTP и пока не удаляет платформенное принуждение — это отдельная миграция
   `0303` после land.

## Blind kill-set до чтения worker report/diff

Составить именованные поломки минимум для:

- reintroduced/default value при missing row и DB error;
- consumer, который всё ещё читает старый env/default, хотя админка пишет БД;
- anonymous configured accessor, позволяющий credential key или произвольный key;
- admin path, ошибочно переведённый на публичную обрезанную проекцию;
- migration/journal, который не доезжает на существующей и на disposable базе либо перезаписывает уже заданное
  администратором значение;
- новая настройка, объявленная миграцией, но отсутствующая в typed registry/accessor, и наоборот;
- regressions password/SMS/Telegram/MAX/public alternatives path;
- auth 2FA fail-open при недоступной setting.

Fault injection или acceptance-test нужен для повторяемого поведения; разовые schema/import свойства можно
доказать inspection. Искать реальный разрыв пути, не новые абстракции и не гипотезы без существующего caller.

## Scope и проверки

- Product diff `d23028a50` против parent/current feat; плановый `cde1d0563` только на честность evidence.
- Разрешены чтение всех callers, disposable PostgreSQL и временные production mutations с обязательным откатом.
- DEV/TEST/PROD базы и сервер не использовать.
- Targeted tests + settings/config gates, migration/journal checks, webapp typecheck/lint. Полный repo CI не нужен.
- Не исправлять product code. Оставить только намеренный acceptance-test и
  `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_BLIND_AUDIT_REPORT.md`.

Вердикт бинарный PASS/FAIL. Finding существует только при достижимом последствии для человека или нарушенном
явном требовании authority; назвать точный сценарий, impact, команду и oracle. При FAIL закоммитить report/test,
но не fix.
