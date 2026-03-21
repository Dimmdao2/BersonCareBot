# UI Rebuild Fix: обзор

Исправления найденные при ревью 10 этапов UI_REBUILD.

## Порядок выполнения

| # | Файл плана | Приоритет | Суть | Сложность |
|---|-----------|-----------|------|-----------|
| 1 | `01_ROLE_DOWNGRADE.md` | **CRITICAL** | Понижение роли когда env не подтверждает токен | Средняя |
| 2 | `02_YOUTUBE_VIDEO_TYPE.md` | **HIGH** | YouTube videoType не маппится в videoSource | Простая |
| 3 | `03_CONTENT_SLUG_SECTION.md` | **HIGH** | Slug collision + section edit dupe + валидация | Средняя |
| 4 | `04_DB_ROWCOUNT_CHECKS.md` | **HIGH** | updateRole/updateDisplayName не проверяют rowCount | Простая |
| 5 | `05_SERVER_ACTION_ERRORS.md` | **HIGH** | Silent failures во всех server actions | Средняя |
| 6 | `06_LINK_HREF_VALIDATION.md` | **HIGH** | appointment.link без валидации схемы | Простая |
| 7 | `07_PROFILE_STALE_STATE.md` | **MEDIUM** | ProfileForm не обновляет displayName после save | Простая |
| 8 | `08_SUBSCRIPTIONS_STUB.md` | **MEDIUM** | SubscriptionsList показывает фейковое состояние | Простая |
| 9 | `09_INPUT_LENGTH_LIMITS.md` | **MEDIUM** | Нет ограничений длины в server actions | Простая |
| 10 | `10_MISC_MEDIUM_LOW.md` | **MEDIUM/LOW** | Сборник: seed транзакция, catch логирование, ChannelLinks/settings, dev:doctor | Средняя |

## Зависимости

Этапы независимы друг от друга. Можно выполнять в любом порядке.

## Правила для агента

1. Перед каждым изменением — прочитать целевой файл.
2. После каждого этапа — `pnpm run ci`.
3. Один коммит на каждый завершённый этап.
4. Не менять бэкенд (integrator) если не указано явно.
