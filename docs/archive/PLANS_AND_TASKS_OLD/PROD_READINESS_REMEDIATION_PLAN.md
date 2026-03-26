# План исправлений для прод-режима (этапы 1–13)

**Адаптировано для выполнения агентом:** Chat GPT-5.3 Codex / Cursor Agent / иные авто-агенты.  
Задачи заданы пошагово, с указанием файлов, искомых фрагментов и проверок. Выполнять строго по порядку R1 → R2 → … → R7.

**Основа:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), [STAGES_1-13_AUDIT_REPORT.md](./STAGES_1-13_AUDIT_REPORT.md), [DB_MIGRATION_PREPARATION_FOUNDATION.md](./DB_MIGRATION_PREPARATION_FOUNDATION.md).

---

## Инструкция для агента

1. Выполнять задачи строго по порядку: **R1 → R2 → R3 → R4 → R5 → R6 → R7**.
2. В каждой задаче: один логический блок; шаги — атомарные изменения; после задачи — верификация (команды из раздела Verification).
3. Не редактировать текст плана (этот документ) и не менять нумерацию этапов в DB_ZONES_RESTRUCTURE.md.
4. После каждой задачи с изменением кода/скриптов запускать `pnpm run ci` (или указанную в задаче команду); не помечать задачу выполненной при красном CI.
5. Если шаг требует решения оператора (например, какой скрипт backup использовать на хосте), оформить как документированный контракт и placeholder в скрипте, не падать по отсутствию скрипта в репо.

---

## Порядок выполнения

| ID   | Приоритет | Кратко |
|------|-----------|--------|
| R1   | Критично  | Backup перед webapp migrate в deploy-webapp-prod.sh |
| R2   | Средне    | Runbook: контракт backup (какие БД, куда пишется) |
| R3   | Средне    | Channel analytics: зафиксировать решение в ownership/плане |
| R4   | Низко     | Pre/post migrate checklist в deploy |
| R5   | Низко     | Комментарий в коде: eventId message-retry с Date.now() |
| R6   | Низко     | Обновить Foundation: webapp migrations уже с ledger |
| R7   | Низко     | Семантика bookings.forUser: при необходимости проверить и задокументировать |

---

## R1 (Критично): Backup перед webapp migrate при webapp-only deploy

**Источник:** STAGES_1-13_AUDIT_REPORT.md, п. 1 итоговой таблицы; DB_MIGRATION_PREPARATION_FOUNDATION.md «Webapp-only deploy без pre-migration backup».

**Цель:** При деплое только webapp перед запуском миграций выполнять backup webapp БД, чтобы при падении миграции был возможен откат.

**Зависимости:** Нет. Выполнить первым.

### Шаг R1.1: Добавить переменную и проверку backup-скрипта в deploy-webapp-prod.sh

**Файл:** `deploy/host/deploy-webapp-prod.sh`

**Действие:**

1. После строки с `WEBAPP_SERVICE=bersoncarebot-webapp-prod.service` (приблизительно строка 6) добавить:
   ```bash
   BACKUP_SCRIPT=/opt/backups/scripts/postgres-backup.sh
   ```

2. После блока `require_sudo_rule "webapp status check"` и перед `export CI=true` добавить проверку наличия backup-скрипта и прав sudo:
   ```bash
   require_file "${BACKUP_SCRIPT}" "Backup script (for pre-migration backup)"
   require_sudo_rule "backup script" "${BACKUP_SCRIPT}" pre-migrations
   ```
   (Использовать те же функции `require_file` и `require_sudo_rule`, что уже есть в скрипте.)

**Верификация:** Скрипт не падает при запуске (если на хосте нет BACKUP_SCRIPT — `require_file` вызовет `fail`; это ожидаемо до установки скрипта на хосте).

### Шаг R1.2: Вызвать backup перед migrate в deploy-webapp-prod.sh

**Файл:** `deploy/host/deploy-webapp-prod.sh`

**Найти:**
```bash
# Run webapp DB migrations (DATABASE_URL from webapp.prod)
set -a
source "${ENV_FILE}"
set +a
pnpm --dir apps/webapp run migrate
```

**Заменить на:**
```bash
# Run webapp DB migrations (DATABASE_URL from webapp.prod)
set -a
source "${ENV_FILE}"
set +a

# Backup webapp DB before migrations (same contract as deploy-prod: pre-migrations → /opt/backups/postgres/pre-migrations/)
sudo -n "${BACKUP_SCRIPT}" pre-migrations

pnpm --dir apps/webapp run migrate
```

**Верификация:** При наличии на хосте `/opt/backups/scripts/postgres-backup.sh` и sudo-прав вызов `bash deploy/host/deploy-webapp-prod.sh` доходит до миграций только после выполнения backup.

### Шаг R1.3: Описать в HOST_DEPLOY_README поведение webapp-only deploy

**Файл:** `deploy/HOST_DEPLOY_README.md`

**Место:** В подразделе «Отдельный webapp deploy» (где перечислены шаги скрипта).

**Действие:** В список шагов скрипта добавить пункт:
- «Перед миграциями: вызов backup (`BACKUP_SCRIPT` pre-migrations). Требуется наличие скрипта и sudo-прав (см. Sudoers).»

И при первом упоминании backup в этом подразделе добавить предложение:
«Скрипт backup должен быть тем же, что в full prod deploy (`/opt/backups/scripts/postgres-backup.sh`), или эквивалентным; контракт аргумента и каталога см. в разделе Backup contract ниже.»

**Верификация:** В README явно указано, что webapp-only deploy делает backup перед migrate.

### R1 Verification

- Выполнить: `bash deploy/host/deploy-webapp-prod.sh` в среде, где нет реального BACKUP_SCRIPT — скрипт должен завершиться с ошибкой на `require_file` или при вызове sudo, а не на migrate.
- После добавления R2 (runbook) убедиться, что в runbook указано: при webapp-only deploy backup обязан включать webapp DB (или отдельный регламент).

### R1 DoD

- В deploy-webapp-prod.sh перед migrate выполняется backup (после source ENV_FILE).
- В HOST_DEPLOY_README зафиксировано, что webapp-only deploy делает pre-migration backup.

---

## R2 (Средне): Runbook — контракт backup (какие БД, куда пишется)

**Источник:** STAGES_1-13_AUDIT_REPORT.md, п. 2; Foundation «до первого data move зафиксировать в runbook хоста фактическое поведение postgres-backup.sh».

**Цель:** В репозитории зафиксировать контракт: что должен делать скрипт backup при аргументе pre-migrations, какие БД должны попадать в дамп, куда писать файлы. Это не реализация скрипта, а описание ожиданий для оператора и для проверки на хосте.

**Зависимости:** Нет. Желательно после R1.

### Шаг R2.1: Добавить раздел «Backup contract (pre-migrations)» в HOST_DEPLOY_README

**Файл:** `deploy/HOST_DEPLOY_README.md`

**Место:** После таблицы «Кратко» (или после раздела «Production layout»), отдельный подраздел уровня ##.

**Действие:** Вставить новый раздел со следующим содержимым (можно скорректировать формулировки, не меняя смысла):

```markdown
## Backup contract (pre-migrations)

Скрипт `/opt/backups/scripts/postgres-backup.sh` вызывается с первым аргументом `pre-migrations` перед миграциями в deploy-prod и в deploy-webapp-prod.

**Ожидаемое поведение (оператор должен обеспечить на хосте):**

1. **Вызов:** `postgres-backup.sh pre-migrations`
2. **Назначение:** снимок БД перед применением миграций для возможности отката.
3. **Куда писать:** каталог `/opt/backups/postgres/pre-migrations/` (или эквивалент, зафиксированный на хосте). Имена файлов — на усмотрение оператора (например, по дате/времени и имени БД).
4. **Какие БД:**
   - **Full prod deploy (deploy-prod.sh):** должны быть включены все БД, используемые в этом деплое: минимум БД integrator (из api.prod) и при наличии webapp unit — БД webapp (из webapp.prod). Если на хосте один скрипт дампит одну БД — оператор обязан настроить вызов так, чтобы перед миграциями создавались снимки обеих БД (или зафиксировать иначе в runbook хоста).
   - **Webapp-only deploy (deploy-webapp-prod.sh):** должна быть включена БД webapp (DATABASE_URL из webapp.prod). Либо тот же скрипт с аргументом pre-migrations дампит только webapp, либо на хосте настроен отдельный регламент (например, отдельный скрипт или второй вызов с параметром).

**Проверка на хосте:** перед первым production data move оператор должен убедиться, что при запуске `postgres-backup.sh pre-migrations` в указанном каталоге появляются дампы нужных БД.
```

**Верификация:** В README есть однозначное описание контракта backup и перечень БД для full deploy и webapp-only deploy.

### R2 Verification

- Убедиться, что раздел читается без противоречий с R1 (в R1 мы вызываем тот же BACKUP_SCRIPT pre-migrations в webapp-only deploy).

### R2 DoD

- В deploy/HOST_DEPLOY_README.md добавлен раздел «Backup contract (pre-migrations)» с пунктами: вызов, назначение, каталог, какие БД для full deploy и для webapp-only deploy, и рекомендация проверки на хосте.

---

## R3 (Средне): Channel analytics — зафиксировать решение в ownership/плане

**Источник:** STAGES_1-13_AUDIT_REPORT.md, п. 3; этап 11 плана (subscription/mailing + channel analytics).

**Цель:** Явно зафиксировать в документации, что считается «channel analytics» и «SMS delivery accounting» после этапа 13: только webapp.message_log или также будущая проекция integrator.delivery_attempt_logs. Код в этой задаче не менять.

**Зависимости:** Нет.

### Шаг R3.1: Добавить подраздел «Channel analytics и SMS accounting» в STAGE13_OWNERSHIP_MAP

**Файл:** `docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md`

**Место:** После раздела «subscription_mailing», перед разделом «Projection».

**Действие:** Вставить подраздел:

```markdown
### Channel analytics и SMS delivery accounting

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| webapp.message_log | **webapp** | Аудит сообщений врача (doctor-facing); уже в webapp. |
| integrator.delivery_attempt_logs | **integrator** | Transport/delivery попытки; проекция в webapp не реализована на этапах 1–13. |
| Агрегаты «доставлено/не доставлено», SMS-учёт по каналам | **Отложено** | После этапа 13: отчётность может опираться на message_log и при необходимости на отдельную проекцию delivery_attempt_logs (запланировать в Stage 14 или отдельной задачей). |

Итог: единый слой «channel analytics» в webapp на момент Stage 13 — message_log; интеграция delivery_attempt_logs и SMS-учёта — в плане Stage 14 или отдельного бэклога.
```

**Верификация:** В ownership map нет противоречий с текущим кодом (проекции delivery_attempt_logs в webapp нет).

### R3 DoD

- В STAGE13_OWNERSHIP_MAP.md добавлен подраздел, фиксирующий текущее состояние channel analytics и отнесение доработки к Stage 14/бэклогу.

---

## R4 (Низко): Pre/post migrate checklist в deploy

**Источник:** STAGES_1-13_AUDIT_REPORT.md, п. 4; Foundation «Документированный operator checklist pre/post migrate».

**Цель:** Иметь в репозитории краткий операционный чеклист «до и после миграций», чтобы оператор мог проверить окружение и результат.

**Зависимости:** Нет.

### Шаг R4.1: Добавить раздел «Pre/post migrate checklist» в HOST_DEPLOY_README или DATA_MIGRATION_CHECKLIST

**Файл:** `deploy/HOST_DEPLOY_README.md` (предпочтительно) или `deploy/DATA_MIGRATION_CHECKLIST.md`

**Место:** В HOST_DEPLOY_README — после раздела «Backup contract» (или рядом с описанием deploy-prod). В DATA_MIGRATION_CHECKLIST — в конец, перед «Сохранность данных».

**Действие:** Добавить раздел (пример для HOST_DEPLOY_README):

```markdown
## Pre/post migrate checklist

**Перед миграциями (integrator и/или webapp):**
- [ ] Backup выполнен (pre-migrations) и файлы дампа присутствуют в целевом каталоге.
- [ ] Переменные окружения (api.prod / webapp.prod) указывают на нужные БД.
- [ ] Доступ к БД с хоста проверен (например, `psql` или приложение подключается).

**После миграций:**
- [ ] Миграции завершились без ошибок (код выхода 0).
- [ ] Сервисы перезапущены и в статусе active.
- [ ] Health check возвращает ok (API и webapp).
- [ ] При необходимости: запуск backfill/reconcile по [DATA_MIGRATION_CHECKLIST.md](DATA_MIGRATION_CHECKLIST.md) (при первом деплое или cutover).
```

**Верификация:** В выбранном файле есть раздел с пунктами до и после миграций.

### R4 DoD

- В deploy добавлен явный pre/post migrate checklist (в README или DATA_MIGRATION_CHECKLIST).

---

## R5 (Низко): Комментарий в коде — eventId message-retry с Date.now()

**Источник:** STAGES_1-13_AUDIT_REPORT.md, п. 5; guardrail про idempotency key.

**Цель:** Убрать неоднозначность: eventId с Date.now() для message-retry — намеренно уникальный идентификатор попытки, а не idempotency key проекции.

**Зависимости:** Нет.

### Шаг R5.1: Добавить комментарий над строкой с eventId в writePort.ts

**Файл:** `apps/integrator/src/infra/db/writePort.ts`

**Найти:**
```ts
                meta: {
                  eventId: `message-retry:${phoneNormalized}:${Date.now()}`,
```

**Заменить на:**
```ts
                meta: {
                  // Intentionally unique per attempt (not a projection idempotency key); retry events must not dedupe.
                  eventId: `message-retry:${phoneNormalized}:${Date.now()}`,
```

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm run ci` проходят.

### R5 DoD

- В writePort.ts рядом с eventId message-retry добавлен комментарий о намеренно уникальном идентификаторе.

---

## R6 (Низко): Обновить Foundation — webapp migrations уже с ledger

**Источник:** DB_MIGRATION_PREPARATION_FOUNDATION.md раздел 4 описывает run-migrations.mjs «без таблицы учёта»; фактически в коде уже есть schema_migrations и транзакции.

**Цель:** Привести описание в Foundation в соответствие с кодом, чтобы не вводить в заблуждение при следующих ревизиях.

**Зависимости:** Нет.

### Шаг R6.1: Исправить описание run-migrations.mjs в Foundation

**Файл:** `docs/PLANS AND TASKS/DB_MIGRATION_PREPARATION_FOUNDATION.md`

**Найти (раздел 4. Webapp migration safeguards):**
```markdown
- [apps/webapp/scripts/run-migrations.mjs](apps/webapp/scripts/run-migrations.mjs): перечисляет все `.sql`, сортирует, выполняет `client.query(sql)` **без**:
  - таблицы учёта применённых миграций;
  - транзакции на файл;
  - checksum / версионирования.
```

**Заменить на:**
```markdown
- [apps/webapp/scripts/run-migrations.mjs](apps/webapp/scripts/run-migrations.mjs): перечисляет все `.sql`, сортирует, выполняет каждую миграцию в транзакции и записывает имя файла в таблицу `schema_migrations` (аналог ledger). Уже применённые миграции пропускаются. Checksum/версионирование не реализовано.
```

**Найти (в том же разделе):**
```markdown
2. Нет явного **migration ledger** для webapp — нельзя безопасно нарастить только additive миграции без дисциплины.
```

**Заменить на:**
```markdown
2. ~~Нет явного migration ledger для webapp~~ — ledger введён (schema_migrations); новые миграции по-прежнему должны быть по возможности additive и идемпотентные (IF NOT EXISTS).
```

**Верификация:** Документ не ссылается на отсутствие ledger; при необходимости запустить `pnpm run ci` (если правки только в .md, CI не обязан перезапускаться).

### R6 DoD

- В Foundation раздел 4 обновлён: указано наличие schema_migrations и транзакций в run-migrations.mjs; пункт про отсутствие ledger отмечен как закрытый.

---

## R7 (Низко): Семантика bookings.forUser — при необходимости проверить и задокументировать

**Источник:** STAGES_1-13_AUDIT_REPORT.md, раздел «Этапы 9–10»: «userId в contextQuery может быть phone или integrator user id; при расхождении возможна ошибка привязки».

**Цель:** Убедиться, что вызов API активных записей (bookings.forUser) и webapp API используют одну и ту же семантику идентификатора (phone vs integrator_user_id). Если всё согласовано — кратко задокументировать; если найдено расхождение — исправить или явно зафиксировать ограничение.

**Зависимости:** Нет. Можно выполнять последним.

### Шаг R7.1: Проверить передачу userId в contextQuery bookings.forUser и в appointmentsReadsPort

**Файлы:**  
- `apps/integrator/src/infra/adapters/contextQueryPort.ts` (case 'bookings.forUser', query.userId).  
- `apps/integrator/src/infra/db/readPort.ts` (case 'booking.activeByUser', appointmentsReadsPort.getActiveRecordsByPhone(userId)).  
- Webapp API активных записей (например, route или сервис, принимающий параметр для «по пользователю»).

**Действие:** Проследить цепочку: откуда приходит query.userId в contextQuery (orchestrator/планы), что передаётся в readPort (userId), что ожидает appointmentsReadsPort (getActiveRecordsByPhone — по смыслу телефон или идентификатор?). Проверить webapp API: по какому полю ищет активные записи (phone_normalized, integrator_user_id, platform_user_id).

**Ожидание:** Либо везде используется один и тот же идентификатор (например, phone_normalized), либо явная конвертация (userId → phone) в одном месте. Если конвертации нет и в одном месте передаётся integrator_user_id, а API webapp ожидает phone — это баг.

### Шаг R7.2: Задокументировать результат в STAGE13_OWNERSHIP_MAP или в комментарии

**Файл:** `docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md` или код (комментарий в contextQueryPort/readPort).

**Действие:**  
- Если семантика согласована: добавить в STAGE13_OWNERSHIP_MAP в раздел appointments одну строку, например: «bookings.forUser: идентификатор, передаваемый в webapp API активных записей — phone_normalized (источник: …).»  
- Если найдено расхождение: завести задачу на исправление (или явно описать ограничение в ownership map и в коде комментарием).

**Верификация:** Документ или комментарий отражают фактическую семантику; при расхождении зафиксировано ограничение или следующая задача.

### R7 DoD

- Проведена проверка цепочки bookings.forUser → readPort → appointmentsReadsPort → webapp API.
- Результат зафиксирован в ownership map или в коде; при расхождении — ограничение или задача на исправление.

---

## Итоговая верификация после всех задач

1. Выполнить все шаги R1–R7 по порядку.
2. Запустить: `pnpm run ci` (после любых изменений в коде).
3. Убедиться, что в deploy:
   - webapp-only deploy делает backup перед migrate (R1);
   - в README описан контракт backup и pre/post migrate checklist (R2, R4);
   - ownership map отражает channel analytics и при необходимости семантику bookings (R3, R7).
4. Обновить при необходимости [STAGES_1-13_AUDIT_REPORT.md](./STAGES_1-13_AUDIT_REPORT.md): в таблице отклонений отметить закрытые пункты 1, 2, 3, 4, 5 (и при наличии — 6, 7).

---

## Связанные документы

- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) — общий план этапов.
- [STAGES_1-13_AUDIT_REPORT.md](./STAGES_1-13_AUDIT_REPORT.md) — отчёт ревизии.
- [DB_MIGRATION_PREPARATION_FOUNDATION.md](./DB_MIGRATION_PREPARATION_FOUNDATION.md) — Stage 1, backup и safeguards.
- [deploy/HOST_DEPLOY_README.md](../../deploy/HOST_DEPLOY_README.md) — операционный deploy.
- [deploy/DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md) — порядок backfill/reconcile/gate.
- [docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md](../ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md) — финальная карта владения данными.
