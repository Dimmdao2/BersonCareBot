# Backfill: Rubitime CSV → webapp-канон (записи + клиенты)

> **АРХИВ / ИСТОРИЧЕСКИЙ ONE-SHOT, НЕ RUNBOOK:** Rubitime выведено `2026-07-27`; этот backfill повторно не запускается.
> Текущий `151.241.228.122` — DEV/TEST, PROD находится на `135.106.162.170`. Старые local `webapp.prod`,
> `/opt/projects/bersoncarebot` и PROD-БД на `151.x` больше не являются допустимыми target.

Разовый перенос исторических записей и клиентов из CSV-выгрузки Rubitime в webapp-канон
(`public.appointment_records` + `public.platform_users`), который видит кабинет врача.

## Что закрывает (три пересекающихся пробела, один проход «по телефону»)

|       | Пробел                                                                       | Действие                                                    |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A** | Записи из CSV, которых нет в `appointment_records`                           | INSERT (резолв клиента по телефону + филиала по названию)   |
| **B** | Клиенты из CSV, которых нет в `platform_users`                               | создаются попутно из A; хвост без записей — отдельной фазой |
| **C** | Записи в БД без `platform_user_id` (незавершённый relink до фикса ~май 2026) | resolve-or-create по телефону → проставить связь            |

Почему именно эти таблицы: приложение читает `public.appointment_records` (+ `platform_users`),
а **не** integrator-зеркало `integrator.rubitime_records` (оно — сырой приёмник вебхуков, его читают
только ops/аудит-скрипты). Подробнее о слоях — [`DATABASE_UNIFIED_POSTGRES.md`](../../ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md).

## Источник (CSV)

Выгрузка из Rubitime, два файла (разделитель `;`, кавычки `"`, BOM):

| Файл            | Ключ                                              | Колонки (важные)                                                        |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `records.csv`   | `#` = rubitime record id (`integrator_record_id`) | Филиал, ФИО, Телефон, Email, Дата записи, Статус, Дата создания, Услуга |
| `clients-2.csv` | `#` = rubitime client id                          | Имя, Фамилия, Отчество, Телефон, Email                                  |

Заливаются на хост в `.tmp/rubitime-import/` (каталог **gitignore** — там ПДн пациентов и дампы,
в репозиторий не коммитить). Перенос с локальной машины — `scp` (см. историю ниже).

## Скрипт

|              |                                                                    |
| ------------ | ------------------------------------------------------------------ |
| Файл         | `apps/webapp/scripts/backfill-rubitime-records-and-clients.ts`     |
| npm          | `pnpm --dir apps/webapp run backfill-rubitime-records-and-clients` |
| По умолчанию | **dry-run** (без записи)                                           |

### Флаги

| Флаг             | Назначение                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `--commit`       | применить (всё в одной транзакции; без флага — только подсчёт)                                          |
| `--records=PATH` | путь к `records.csv` (по умолчанию `../../.tmp/rubitime-import/records.csv` относительно `apps/webapp`) |
| `--clients=PATH` | путь к `clients-2.csv`                                                                                  |

### Логика и безопасность

- **Идемпотентно:** записи матчатся по `integrator_record_id` (UNIQUE), клиенты — по `phone_normalized`. Повторный прогон — no-op.
- **Нормализация телефона 1-в-1** с боевой `normalizeRuPhoneE164` (`apps/webapp/src/shared/phone/`), резолв клиента 1-в-1 с `findCanonicalUserIdByPhone` (`apps/webapp/src/infra/repos/pgCanonicalPlatformUser.ts`): ровно один канон → link; ноль → create; **>1 (аномалия) → SKIP** + репорт (дубли не плодим).
- **Trust политика:** созданный клиент получает `patient_phone_trust_at = now()` — как боевой путь «публичная запись по телефону» (`resolveOrCreateUserByPhone`). То есть rubitime-клиент = trusted phone = tier **patient**. Это осознанно; см. обязательный чек-лист [`apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md`](../../../apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md).
- **Время:** даты CSV (`dd/mm/yyyy HH:MM`) трактуются как Europe/Moscow (+03:00, без DST).
- **Статус:** `Записан`→`created`, `Отменён`→`canceled`.
- **Аудит/откат:** при `--commit` пишет `.tmp/rubitime-import/backfill-applied-<ts>.json` (id всех созданных юзеров и затронутых записей).

## Запуск

> Среды разнесены: DEV/TEST находятся на `151.x`, PROD — только на `135.x`
> (см. [`SERVER CONVENTIONS.md`](../../ARCHITECTURE/SERVER%20CONVENTIONS.md)). Команды ниже сохраняются только
> как история выполненного переноса и не разрешают новый запуск.

**Dev** (под `dev`):

```bash
cd /home/dev/dev-projects/BersonCareBot
set -a && source apps/webapp/.env.dev && set +a
pnpm --dir apps/webapp run backfill-rubitime-records-and-clients -- \
  --records=$PWD/.tmp/rubitime-import/records.csv --clients=$PWD/.tmp/rubitime-import/clients-2.csv
# числа ок → добавить --commit
```

**PROD:** повторный запуск отменён вместе с retirement Rubitime. Историческая PROD-операция выполнялась до
разнесения топологии; её старые команды для `151.x` удалены, чтобы их нельзя было принять за актуальный runbook.

### Проверка после

```bash
psql "$DATABASE_URL" -Atc "SELECT 'appt='||count(*)||' orphans_with_phone='||count(*) filter(where platform_user_id is null and coalesce(phone_normalized,'')<>'')||' users='||(select count(*) from platform_users) FROM appointment_records;"
# ждём: appt +N, orphans_with_phone=0, users +M
```

## Известные пропуски

Записи с пустым телефоном линковать не к чему → пропускаются (видны в SUMMARY как `recInvalidPhone`
и в строке `invalid-phone record ids`). Чтобы добрать — проставить телефон в источнике и прогнать снова (идемпотентно).

## История прогонов

### 2026-06-13 — первичный бэкфилл

Контекст: dev-база восстановлена из прод-дампа 11:15 + миграции ветки `feat/doctor-ui-rebuild`
(см. [`DB_DUMPS/README.md`](../../ARCHITECTURE/DB_DUMPS/README.md)). CSV (`records.csv` 330, `clients-2.csv` 141)
залиты в `.tmp/rubitime-import/`.

| Среда                                        | Результат                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| dev (commit)                                 | записи 252→**375** (+123), осиротевших с телефоном 166→**0**, клиентов +**49**; повторный dry-run — no-op (идемпотентность подтверждена) |
| prod (commit, бэкап `manual` снят до записи) | то же: +**123** записи, relink **164** (146 link + 18 new), +**49** клиентов; проверка `appt=375 orphans_with_phone=0 users=245`         |

Пропущено намеренно: 2 записи без телефона — `7678521`, `7678522` («Валя Толик»).
Скрипт + рантбук — коммит `087779c7`.
