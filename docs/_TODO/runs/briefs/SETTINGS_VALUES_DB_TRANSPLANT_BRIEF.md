# Worker brief — Ч7: перенести значения runtime-настроек в БД

Перед работой прочитать `AGENTS.md` по маршруту для `apps/webapp/src/modules/**`, миграций, тестов и
оркестрации, затем authority `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § Ч7.

Источник оракула: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § Ч7 — «строка на каждую настройку
заводится миграцией (начальное значение — данные в базе, а не константа в коде); таблицы `*_DEFAULTS`
удалены; читатель берёт значение только из базы» и «База моргнула — мы ничего не требуем. Мы просто не
пускаем пока не поднимется».

## Источник и граница

Рабочая ветка создана от актуального `feat/doctor-ui-rebuild`. Старый carrier `wt/settings-to-db` целиком
не сливать: в его истории есть чужие тарифные/биллинговые коммиты и старые merge-коммиты.

Перенести продуктовый смысл только этой цепочки, в указанном порядке:

1. `3afeeb0cb` — основной typed runtime settings path;
2. `7ec886998` — fail-closed для `auth_2fa_enabled` (из коммита не тащить старую редакцию плана/аудит-отчёт);
3. `e78f6aa29` — legacy readers fail closed;
4. `4ef13090c` — отдельный anonymous public auth read path;
5. `0bb207cb1` — пропущенный второй аргумент legacy-вызова;
6. `e64dc0397` — configured accessors, конструктивное разделение публичного и credential-bearing чтения;
7. `6764822a8` — остаточные webapp runtime settings fail closed.

Начать с последовательных `git cherry-pick`, конфликты разрешить по актуальному коду. Не переносить коммиты
`4ca49ccd8`, `79c4a95e5`, merge-коммиты старой ветки, удаление принуждения 2FA `92388d1df` или любые тарифные,
биллинговые и посторонние изменения.

## Миграции

Соседний тарифный workstream резервирует `0298` и `0299`. Для этой цепочки зарезервированы:

- `0300_runtime_settings_values_live_in_db.sql`;
- `0301_legacy_runtime_settings_values_live_in_db.sql`;
- `0302_public_auth_channel_configured_accessors.sql`.

Перед финальным коммитом повторно проверить номера в актуальном `feat`. Обновить `_journal.json` с монотонными
`idx`/`when`; чужие миграции не переименовывать. `0303` оставить удалению платформенного принуждения 2FA.

## Приёмка

- Значения и operational defaults читаются из `system_settings`; код не подставляет второе значение при ошибке
  чтения или отсутствии обязательного ключа.
- Anonymous/public auth path получает только явно разрешённые configured-флаги и не может прочитать credential
  values.
- Добровольный TOTP и существующее платформенное принуждение пока сохранить: его удаляет следующий отдельный
  коммит.
- Не применять миграции к DEV/TEST/PROD и не поднимать сервер.
- Запустить targeted unit/route tests из перенесённых изменений, webapp typecheck, webapp lint,
  `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` и релевантные settings/config gates.
- Один coherent commit с `#1082`; в строке Ч7 плана записать только актуальный SHA/evidence, без заявления о land.

## Разрешённый scope

`apps/webapp/src/**`, `apps/webapp/scripts/video-hls-backfill-legacy.ts`,
`apps/webapp/db/drizzle-migrations/**`, `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql`,
`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`, `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`,
новый bounded worker report под `docs/_TODO/runs/testsuite-v2/`.
