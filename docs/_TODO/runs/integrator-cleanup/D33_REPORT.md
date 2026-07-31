# D33 + D31-часть — отчёт по резу мёртвого кода (worker-d33-dead-code)

Брифинг: `docs/_TODO/runs/integrator-cleanup/D33_DEAD_CODE_BRIEF.md`. Решение владельца 31.07: «делать API
для VK, инсту удалять» (развилка №4 карты) + развилка №9 снята фактом (бэкфил-скрипта уже нет).

## Что удалено

### 1. Instagram целиком (часть развилки №4 / D31)

- `apps/integrator/src/integrations/instagram/index.ts` (20 строк) — дескриптор + inbound/outbound placeholder-адаптеры.
- `apps/integrator/src/integrations/instagram/config.ts` (16 строк) — zod-конфиг, `enabled: false` по умолчанию.
- `apps/integrator/src/integrations/registry.ts` — снят импорт `instagramIntegration` и строка в массиве `integrationRegistry` (2 строки).
- `apps/webapp/src/modules/system-settings/platformIntegrationAvailability.ts` — комментарий, упоминавший
  «VK/Instagram placeholder», переписан на «VK» + пояснение, что Instagram-плейсхолдер удалён (#987 D33).
  Функциональный код файла (каталог `PLATFORM_INTEGRATION_CATALOG`) Instagram и раньше не перечислял —
  правка чисто документирующая.
- Добавлен тест-сторож `apps/integrator/src/integrations/registry.test.ts`: `integrationRegistry` не должен
  содержать `id === 'instagram'`.

### 2. `stage6HistoricalBackfillPoolProvider.ts` (часть развилки №9 / D33)

- `apps/integrator/src/infra/scripts/stage6HistoricalBackfillPoolProvider.ts` (18 строк) — фабрика `Pool` для
  завершённого бэкфила.
- `scripts/check-db-chokepoint.mjs` — снята строка `apps/integrator/src/infra/scripts/stage6HistoricalBackfillPoolProvider.ts`
  из `allowedPoolProviderFiles` (тем же коммитом, как требовал бриф).

### 3. Чек-лист приёмки (тот же коммит, что и код)

- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`: пункт D33 — `[x]` с доказательством. Составной
  пункт D31 расщеплён на атомарные: «D31 (часть 1/2) — Instagram удалить» — `[x]`; «D31 (часть 2/2) — VK как
  настоящий канал» остаётся `[ ]` (не входило в этот прогон).

## Доказательство недостижимости — три источника

### Instagram

1. **Контент сценариев (kernel).** `grep -rl "instagram" apps/integrator/src/kernel` → 0 совпадений. Ядро
   (`kernel/contracts/unifiedMessage.ts:14`) объявляет тип `Channel = 'telegram' | 'max' | 'smsc' | 'email' |
   'web_push'` — Instagram (и VK) в этом union никогда не было; сценарии/executor физически не могут выбрать
   Instagram как канал доставки.
2. **Код обоих приложений.** `grep -rn "'instagram'|\"instagram\"" apps/integrator/src apps/webapp/src` до
   реза находил только сам дескриптор (`instagram/index.ts:6`) и конфиг (`instagram/config.ts:11`) — двух
   файлов, которые и удаляются. `integrationRegistry` (`apps/integrator/src/app/server.ts:35-45`) — его
   единственный потребитель — читает массив только для строки лога `'integration registry loaded'` при
   старте; ни один dispatch/delivery путь (`infra/adapters/dispatchPort.ts`) реестр не читает и решения по
   нему не принимает. Значит удаление меняет только содержимое стартового лога.
3. **Смысловой поиск.** `node /home/dev/brain/tools/code-search.mjs "instagram integration channel delivery"
   --repo bcb -k 10` — все совпадения ограничены `instagram/index.ts`, `instagram/config.ts`, `registry.ts`
   (импорт) и одним упоминанием в комментарии `platformIntegrationAvailability.ts`; ни одного попадания в
   dispatch/delivery/executor рантайм.

### `stage6HistoricalBackfillPoolProvider.ts`

1. **Контент сценариев.** Неприменимо по природе куска — это ops-скрипт пула соединений для одноразового
   бэкфила времени, не канал доставки и не участвует в сценариях бота.
2. **Код обоих приложений.** `grep -rn "stage6HistoricalBackfillPoolProvider" apps packages` до реза — ноль
   импортёров (только объявление в самом файле). Самого скрипта-потребителя `stage6-historical-time-backfill.ts`
   в репозитории уже нет (проверено `find` — не найден).
3. **Смысловой поиск.** `node /home/dev/brain/tools/code-search.mjs "stage6 historical backfill pool provider"
   --repo bcb -k 8` — совпадения только в архивных доках инициативы `TIMEZONE_UTC_NORMALIZATION` (2026-04,
   исторический архив) и в `DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` (датированный audit-снимок
   2026-07-04) — ни одного рантайм-файла.

## База и настройки — проверка хранимых данных

Проверено на DEV БД (`bcb_webapp_dev`, env `/home/dev/dev-projects/BersonCareBot/.env`, роль
`bcb_webapp_dev_user`), таблицы со столбцами `channel`/`channel_code`:

| Таблица | `= 'instagram'` |
|---|---|
| `integrator.delivery_attempt_logs` | 0 |
| `public.channel_link_secrets` | 0 |
| `public.notification_delivery_attempts` | 0 |
| `public.outgoing_delivery_queue` | 0 |
| `public.phone_messenger_bind_secrets` | 0 |
| `public.user_channel_bindings` | 0 |
| `public.user_channel_preferences` | 0 |
| `public.user_notification_topic_channels` | 0 |
| `public.system_settings` (key/value ILIKE `%instagram%`) | 0 |

**Не удалось проверить напрямую** (гейт доступа к БД: RLS-функции `is_staff` / `current_integrator_user_id`
блокируют прямой `psql` без принципала приложения — permission denied): `integrator.user_reminder_delivery_logs`,
`public.reminder_delivery_events`, `public.support_conversations`, `public.support_delivery_events`. По этим
четырём — только код-путь: ни в `apps/integrator/src`, ни в `apps/webapp/src` нет ни одного места, где литерал
`'instagram'` присваивается полю `channel`/`channel_code` (см. доказательство пункта 2 выше) — значит писать
туда это значение было физически нечем. Ни SQL-миграции, ни `CHECK`-constraint со списком каналов, включающим
`instagram`, в репозитории нет (`grep -rn "'instagram'" --include="*.sql" .` — 0 совпадений), так что рез кода
не меняет читаемость уже существующих строк ни в одной из этих таблиц.

**Вывод:** код-рез Instagram не ломает чтение исторических данных ни в одной из проверенных и непроверенных
напрямую таблиц.

## Гейт приёмки — прогоны до/после

Тестовый мьютекс хоста `/home/dev/brain/host-orch/run-tests.sh` недоступен из этого worker-сэндбокса
(`/home/dev/brain/host-orch/locks` — read-only file system в изолированном контейнере воркера). Прогоны
выполнены напрямую в изолированном воркер-контейнере (свой overlay, не общий хост-процесс), это отклонение
зафиксировано здесь явно.

| Проверка | До | После |
|---|---|---|
| `pnpm --dir apps/integrator test` | 154 passed, 9 skipped (26 файлов) | **155 passed** (+1 тест-сторож), 9 skipped (27 файлов) |
| `pnpm run typecheck` (все воркспейсы) | зелёный | зелёный |
| `npx eslint .` (root) | зелёный (exit 0) | зелёный (exit 0) |
| `node scripts/check-db-chokepoint.mjs` | **красный**, 2 offender'а: `check-d30-outgoing-delivery-claim-concurrency.ts`, `check-d30-scheduler-lock-concurrency.ts` (`.connect()` вне allowlist) | **тот же красный, те же 2 offender'а** — не изменилось, `stage6HistoricalBackfillPoolProvider` не появляется как offender |
| `node scripts/check-no-new-raw-sql.mjs` | **красный**, 3 offender'а (те же 2 D30-скрипта + `outgoingDeliveryWorker.finalize.test.ts`) | **тот же красный, те же 3 offender'а** |
| `apps/webapp` eslint (`npx eslint .` внутри `apps/webapp`) | зелёный (exit 0) | зелёный (exit 0) |
| `apps/webapp` vitest `src/modules/system-settings` | 0 тестовых файлов (нет тестов на этот модуль) | 0 тестовых файлов — без изменений |

**check-db-chokepoint и check-no-new-raw-sql были красными ДО этого прогона** — оба падения относятся к
скриптам D30 (`check-d30-outgoing-delivery-claim-concurrency.ts`, `check-d30-scheduler-lock-concurrency.ts`),
никак не связанным с Instagram или бэкфил-провайдером. Это чужая, предсуществующая поломка вне границ этого
прогона (см. «Границы» в брифе — «не чистить заодно соседнее мёртвое»); я её не трогал и не чинил, только
подтвердил, что мой рез не добавил новых offender'ов и не убрал старые.

**Тест-сторож:** `apps/integrator/src/integrations/registry.test.ts` — красный, если код канала `instagram`
вернётся в `integrationRegistry` (проверено логически: тест сравнивает `.some(id === 'instagram')`, что
покраснеет при возврате записи).

## Развилки владельцу

Нет новых развилок сверх уже решённых брифом (№4, №9). Отдельно фиксирую два наблюдения, не требующих решения
сейчас, но важных для контекста:

1. Документы `docs/_TODO/runs/integrator-cleanup/D20_INTEGRATOR_MAP.md`,
   `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_SOL.md`,
   `docs/archive/legacy-underscore/OPERATOR_HEALTH_ALERTING_INITIATIVE/MASTER_PLAN.md`,
   `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` и `log.md`,
   `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` продолжают упоминать Instagram/`stage6HistoricalBackfillPoolProvider.ts`.
   Это датированные аудит-снимки/логи (историческая констатация состояния на момент написания), а не живая
   архитектурная документация — правкой их текста я бы переписывал историю решений, а не исправлял неверный
   текущий факт. Живые документы (`ARCHITECTURE.md`, `apps/webapp/ARCHITECTURE.md`,
   `docs/ARCHITECTURE/*.md`, `docs/README.md`) Instagram вообще не упоминали — проверено, правки не нужны.
   Если владелец хочет, чтобы датированные snapshot-доки тоже правились при последующих резах — это отдельное
   правило, не изобретаю его сам.
2. Четыре RLS-защищённые таблицы с `channel`/`channel_code` не проверены прямым SQL (см. раздел «База и
   настройки» выше) — блокирует не задача, а сам гейт доступа к БД (permission denied на `is_staff`/
   `current_integrator_user_id` без принципала приложения). Вывод об отсутствии данных для них сделан через
   код-путь, не через прямой запрос.

## Чего не смог

- Не смог прогнать тесты через обязательный по правилу `run-tests.sh` мьютекс — директория лока
  read-only в этом воркер-сэндбоксе. Прогнал тесты напрямую в изолированном контейнере (см. таблицу выше).
- Не push'ил и не мёрджил: роль воркера в этом прогоне — коммит с доказательством, push/merge/deploy не
  мои полномочия (независимый аудит и решение владельца — следующий шаг).
- Не чинил предсуществующие красные `check-db-chokepoint`/`check-no-new-raw-sql` (offenders D30) — вне границ
  этого прогона по брифу.
