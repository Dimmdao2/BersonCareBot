# Strict purge / manual merge — execution log

Журнал выполнения инициативы по плану «Strict purge and manual merge» (см. `.cursor/plans/strict_purge_merge_8c41d5a7.plan.md`). Фиксируются реализация, решения, файлы, проверки и ограничения.

## Этап 1 — `admin_audit_log` инфраструктура (2026-04-09)

### Реализовано

- **Миграция** `apps/webapp/migrations/066_admin_audit_log.sql`: таблица `admin_audit_log` с полями и индексами по плану §0; частичный уникальный индекс по `conflict_key` для одной открытой строки на конфликт (`resolved_at IS NULL`).
- **Сервис** `apps/webapp/src/infra/adminAuditLog.ts`:
  - `writeAuditLog` — append-only INSERT; ошибки БД логируются через pino, не пробрасываются (политика fire-and-forget для вызывающего кода).
  - `upsertOpenConflictLog` — дедуп открытых `auto_merge_conflict` в отдельной транзакции (`SELECT … FOR UPDATE` → UPDATE или INSERT); ключ `computeConflictKeyFromCandidateIds` = sha256(sorted unique ids), hex; агрегация `seenEventTypes` и `repeat_count`.
  - `listAdminAuditLog` — пагинация и фильтры для API.
- **API** `GET /api/admin/audit-log` — `apps/webapp/src/app/api/admin/audit-log/route.ts`; guard `requireAdminModeSession()`; query: `page`, `limit`, `action`, `target`, `status`, `from`, `to` (даты `YYYY-MM-DD` в UTC-границах суток).
- **UI** — вкладка «Лог операций» в `/app/settings` (`AdminSettingsTabsClient`, `AdminAuditLogSection`): таблица, черновик фильтров и кнопка «Применить фильтры» (запрос без refetch на каждый ввод), пагинация, раскрытие JSON `details`, ссылка на `/app/doctor/clients/{uuid}` для целей-UUID.

### Решения

- На самом Этапе 1 была заложена только инфраструктура; подключение `writeAuditLog` / `upsertOpenConflictLog` к конкретным purge/merge/integrator-route handlers действительно закрывалось уже следующими этапами и отражено ниже в этом журнале.
- `upsertOpenConflictLog` реализован через явную транзакцию и блокировку строки, без `INSERT ON CONFLICT` по частичному индексу (проще поддерживать и одинаково на всех версиях PG).
- Аномалия без `candidateIds`: по-прежнему ожидается `writeAuditLog` с `action = auto_merge_conflict_anomaly` без `conflict_key` (контракт плана §0); не вызывать `upsertOpenConflictLog` с пустым списком.

### Изменённые / добавленные файлы

- `apps/webapp/migrations/066_admin_audit_log.sql`
- `apps/webapp/src/infra/adminAuditLog.ts`
- `apps/webapp/src/infra/adminAuditLog.test.ts`
- `apps/webapp/src/app/api/admin/audit-log/route.ts`
- `apps/webapp/src/app/api/admin/audit-log/route.test.ts`
- `apps/webapp/src/app/app/settings/AdminSettingsTabsClient.tsx`
- `apps/webapp/src/app/app/settings/AdminAuditLogSection.tsx`
- `apps/webapp/src/app/app/settings/page.tsx`
- `docs/ARCHITECTURE/DB_STRUCTURE.md`
- `apps/webapp/src/app/app/settings/settings.md`
- `apps/webapp/src/app/api/api.md`

### Проверки

- `pnpm --dir apps/webapp exec vitest run src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.test.ts`
- После правок: `read_lints` по изменённым файлам.

### Ограничения / риски

- Таблица пуста до подключения записи из сценариев (purge, settings, merge, integrator conflict handling).
- Нет отдельного API для «grouped» конфликтов — список плоский; фильтр по `action=auto_merge_conflict` и колонки `repeat_count` / `conflict_key` готовят почву для UI из плана.

## Финальная проверка Этапа 1 (2026-04-09, code review)

### Что проверено

- Соответствие миграции `admin_audit_log` плану (§0) по полям, индексам и инвариантам `conflict_key`/`resolved_at`.
- Контракт helper/service: `writeAuditLog`, `upsertOpenConflictLog`, поведение при ошибках, дедуп unresolved конфликтов.
- API чтения: guard (`requireAdminModeSession`), фильтры, пагинация, валидация query.
- UI вкладка «Лог операций»: фильтры, отображение `status`, `resolved_at`, `repeat_count`, раскрытие details.
- Тестовое покрытие по сервису и API в рамках Этапа 1.

### Найдено и исправлено

1. **Anomaly-path hole**: при `candidateIds.length === 0` `upsertOpenConflictLog` только логировал ошибку в pino и не создавал запись в `admin_audit_log`.
   - Исправлено: теперь выполняется `writeAuditLog(... action='auto_merge_conflict_anomaly', conflict_key=NULL ...)`, как требует план.
2. **Race-risk при dedup**: конкурентный `INSERT` по одному `conflict_key` мог падать на unique index (`resolved_at IS NULL`) и терять инкремент `repeat_count`.
   - Исправлено: добавлен race-safe fallback — при `23505` повторный `SELECT ... FOR UPDATE` и `UPDATE` существующей open-строки.
3. **Неполное объединение `seenEventTypes[]`**: в merge учитывался только `eventType`, но не входящий `details.seenEventTypes`.
   - Исправлено: объединяются оба источника, массив стабилизируется.
4. **UI filter mismatch к плану**: фильтр действия был свободным input, а в плане зафиксирован dropdown по типу действия.
   - Исправлено: заменён на dropdown со списком ключевых action codes.

### Какие файлы дополнительно изменены в рамках проверки

- `apps/webapp/src/infra/adminAuditLog.ts`
- `apps/webapp/src/infra/adminAuditLog.test.ts`
- `apps/webapp/src/app/app/settings/AdminAuditLogSection.tsx`

### Какие тесты/проверки прогнаны

- `pnpm --dir apps/webapp exec vitest run src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.test.ts`
- `pnpm --dir apps/webapp run typecheck`
- `pnpm --dir apps/webapp exec eslint src/infra/adminAuditLog.ts src/infra/adminAuditLog.test.ts src/app/app/settings/AdminAuditLogSection.tsx src/app/api/admin/audit-log/route.ts src/app/api/admin/audit-log/route.test.ts`
- `read_lints` по изменённым файлам

### Что осталось допустимым ограничением

- После следующих этапов критические v1-сценарии уже подключены к аудиту (`user_purge`, `user_merge`, `auto_merge_conflict` / anomaly), но grouped read model по `conflict_key` так и не выделялся в отдельный endpoint.
- Отдельного серверного grouped-endpoint по `conflict_key` пока нет; текущий список уже отражает open/resolved/`repeat_count`, но полноценный grouped read model можно выделить в следующих этапах.

## Этап 2 — strict purge service (2026-04-09)

### Реализовано

- **`runStrictPurgePlatformUser`** (`apps/webapp/src/infra/strictPlatformUserPurge.ts`): транзакция webapp с **`pg_advisory_xact_lock(hashtext(userId))` (exclusive)** → **`collectPurgeArtifactKeys`** (intake + `media_files`) → **`runWebappPurgeCoreInTransaction`** → `COMMIT`; post-commit **параллельно** S3 (`deleteS3ObjectsWithPerKeyResults`) и **`deleteIntegratorPhoneDataWithResult`** (оба шага до конца, без short-circuit); после успешного S3 — `DELETE` строк `media_files`.
- **`retryStrictPurgeExternalCleanup`**: повтор внешнего хвоста по `PurgeArtifactKeys` + телефон / `integrator_user_id`; аудит `user_purge_external_retry`.
- **`withUserLifecycleLock`** (`userLifecycleLock.ts`): shared | exclusive на том же `hashtext(userId)`.
- **Lock protocol:** `POST /api/media/presign` — `insertPendingMediaFileTx` внутри **shared** lock; **`createLfkRequest`** (LFK intake) — **`pg_advisory_xact_lock_shared`** сразу после `BEGIN`.
- **Аудит:** `writeAuditLog` отдельно от tx purge; `action` `user_purge` / `user_purge_external_retry`.
- **Route / CLI:** `permanent-delete` передаёт `actorId` admin; `purge-by-id` вызывает strict purge и печатает `details` при не-`completed`.

### Lock protocol / transaction boundaries

| Участник | Режим | Момент |
|----------|--------|--------|
| Strict purge | exclusive xact lock | После `BEGIN`, до preflight |
| Media presign | shared xact lock | Вставка `media_files` pending |
| Intake LFK create | shared xact lock | После `BEGIN`, до INSERT заявки |

Webapp DELETE — одна транзакция. S3 и integrator — после `COMMIT`, параллельно. Audit — отдельный implicit transaction.

### Result / retry semantics

| `outcome` | Условие |
|-----------|---------|
| `completed` | Внешние шаги успешны (или integrator pool отсутствует без ошибок S3/media) |
| `partial_failed` | Ошибки S3 или post-delete `media_files` |
| `needs_retry` | Integrator cleanup неуспешен при наличии пула, S3/media без ошибок |

### Audit behavior

- Rollback основной транзакции не откатывает строку аудита.
- В фильтре UI добавлен **`user_purge_external_retry`**.

### Проверки

- `pnpm --dir apps/webapp exec vitest run src/infra/strictPlatformUserPurge.test.ts src/infra/userLifecycleLock.test.ts src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts src/app/api/media/presign/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `eslint` по изменённым файлам webapp

### Ограничения v1

- На момент фиксации Этапа 2 manual merge engine ещё не был реализован; позже Этап 4 закрыл этот хвост через `withTwoUserLifecycleLocksExclusive`.
- Расширенный preflight «dependent counts» (брони, напоминания и т.д.) в strict purge не реализован — в `details` есть счётчики ключей/медиа, см. план §1.

## Финальная проверка Этапа 2 (2026-04-09, code review)

### Что проверено (соответствие плану §1)

| Требование | Статус |
|------------|--------|
| Preflight в **той же** транзакции, что и DELETE (`BEGIN` → lock → `collectPurgeArtifactKeys` → `runWebappPurgeCoreInTransaction` → `COMMIT`) | OK (`strictPlatformUserPurge.ts`) |
| Advisory **exclusive** lock **до** preflight | OK (`pg_advisory_xact_lock` сразу после `BEGIN`) |
| Ключи из `online_intake_attachments` + `media_files` до каскадного удаления intake / `DELETE platform_users` | OK (`collectPurgeArtifactKeys` до `clearPlatformUserDeleteBlockers` / удаления пользователя) |
| Post-commit S3 + integrator **параллельно**, без short-circuit | OK (`Promise.all([runS3AndMedia, runIntegrator])`) |
| Аудит отдельной транзакцией; при rollback webapp — `status: error` | OK |
| `media/presign`: shared lock + INSERT в tx, presign URL после `COMMIT` | OK (`withUserLifecycleLock` + `insertPendingMediaFileTx`) |
| LFK `createLfkRequest`: shared lock после `BEGIN`, до INSERT заявки/вложений | OK |
| `retryStrictPurgeExternalCleanup` не трогает `platform_users` | OK |

### Findings (issues / слабые места)

1. **S3 выключен в env (`!isS3MediaEnabled`):** post-commit удаляет строки `media_files`, но **не** вызывает удаление объектов в bucket для ключей intake (и не трогает только-intake ключи). Риск сирот в MinIO при переносе конфигурации или одноразовом purge без S3.
2. **Идемпотентность retry (план):** повторный `deleteIntegratorPhoneData` и `DeleteObject` в S3 без предварительного HEAD считаются приемлемыми (DELETE идемпотентны); явная проверка «строка integrator ещё есть» не реализована — ок для v1.
3. **Тесты:** покрытие через моки `getPool` / частичный mock `platformUserFullPurge`; нет интеграционного теста с реальным Postgres на блокировки — осознанное ограничение.
4. **`createNutritionRequest`:** без shared lock — уже в ограничениях v1.
5. **`actor_id` в аудите:** при невалидном UUID актора INSERT мог бы молча не записаться (FK); для admin UI обычно UUID — низкий риск.

### Что исправлено в ходе review

- В **`details`** и в payload аудита добавлено поле **`intakeS3ObjectsNotDeletedBucketDisabled`**: `true`, если при отключённом S3 в процессе purge были ненулевые ключи intake и/или `media_files` с `s3_key`, чтобы в логе было явно видно риск сирот в bucket (операционная прозрачность без смены `outcome`).

### Прогоны после правок

- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec vitest run src/infra/strictPlatformUserPurge.test.ts src/infra/userLifecycleLock.test.ts src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts`
- `read_lints` по `strictPlatformUserPurge.ts`

### Ограничения после review (без изменения кода)

- Полное устранение сирот при `S3` отключённом в webapp потребует либо обязательного S3 на purge, либо отдельного ops-скрипта по ключам из аудита.
- E2E на гонку purge vs presign в CI по-прежнему не обязателен для Этапа 2.

## Повторная проверка Этапа 2 (2026-04-09, 2nd pass)

### Подтверждено повторно

- **Одна транзакция webapp:** `BEGIN` → `pg_advisory_xact_lock` (exclusive) → `collectPurgeArtifactKeys` → `runWebappPurgeCoreInTransaction` → `COMMIT` — без отдельного preflight вне tx.
- **Lock до preflight:** строки 219–221 `strictPlatformUserPurge.ts`.
- **Ключи до каскада:** `collectPurgeArtifactKeys` вызывается до `runWebappPurgeCoreInTransaction`, где первым значимым шагом при наличии телефона идут phone-keyed deletes, затем `clearPlatformUserDeleteBlockers` (в т.ч. `online_intake_requests`).
- **Post-commit:** `Promise.all([runS3AndMedia, runIntegrator])` — оба промиса создаются; integrator не прерывает S3 и наоборот.
- **media_files:** при `s3Enabled` удаление строк только при `keyOk.get(m.s3Key) === true`; при `!s3Enabled` — только DELETE по id из preflight.
- **Аудит:** rollback → `status: error` + `phase: webapp_transaction`; успех post-commit → `ok` / `partial_failure` + полный `details` (включая `intakeS3ObjectsNotDeletedBucketDisabled`).
- **presign / intake:** `withUserLifecycleLock` + shared; LFK `createLfkRequest` — `pg_advisory_xact_lock_shared` после `BEGIN` (см. `pgOnlineIntake.ts`).
- **Retry:** `retryStrictPurgeExternalCleanup` только `runPostCommitArtifactCleanup` + аудит; таблица `platform_users` не затрагивается.

### Findings (2nd pass)

- **Новых блокеров нет.** Семантика `outcome`: при «только» флаге `intakeS3ObjectsNotDeletedBucketDisabled` без ошибок S3/integrator/`mediaRowDeleteErrors` итог остаётся `completed` — осознанно: риск сирот отражён в `details`/аудите, без принудительного `partial_failed` (см. предыдущую финальную проверку).
- **Тесты:** по-прежнему моки; интеграционный Postgres для advisory locks не добавлялся.

### Исправления кода

- Нет (повторный проход без изменений реализации).

### Прогоны (этот проход)

- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec vitest run src/infra/strictPlatformUserPurge.test.ts src/infra/userLifecycleLock.test.ts src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts src/app/api/media/presign/route.test.ts`
- `pnpm --dir apps/webapp exec eslint src/infra/strictPlatformUserPurge.ts src/infra/userLifecycleLock.ts`

### Ограничения (актуализировано)

- Сироты bucket при `!isS3MediaEnabled` — операционный контур (флаг `intakeS3ObjectsNotDeletedBucketDisabled` в `details`/аудите).

### Доделано (закрытие хвостов Этапа 2)

- **`createNutritionRequest`:** добавлен тот же **`pg_advisory_xact_lock_shared(hashtext(userId))`** после `BEGIN`, что и у LFK — заявка nutrition не коммитится параллельно с exclusive purge на том же пользователе.
- **Документация API:** `apps/webapp/src/app/api/api.md` — описание `POST .../permanent-delete` (strict purge, поля ответа `outcome`, `details`).
- **UI:** `DoctorClientLifecycleActions` — при `outcome !== 'completed'` показывается предупреждение о неполной внешней очистке; при `purge_transaction_failed` выводится `message`; предупреждение про отсутствие integrator pool — только если `outcome === 'completed'` и `integratorSkipped` (без двойного alert при partial + skipped).
- Ограничение «nutrition без lock» снято; полный **preflight «dependent counts»** по плану (брони, reminders, …) в strict purge по-прежнему не собирается — только ключи S3 и счётчики вложений/медиа в `details`.

## Доппроверка качества Этапа 1 (2026-04-09, follow-up)

### Дополнительно проверено

- Стойкость `upsertOpenConflictLog` к отказу подключения (`pool.connect` failure).
- Корректность API фильтра даты на неконсистентный диапазон (`from > to`).
- Повторно проверены тесты/lint/typecheck после точечных правок.

### Дополнительно исправлено

- `apps/webapp/src/infra/adminAuditLog.ts`:
  - `upsertOpenConflictLog` теперь не может уронить вызывающий код при ошибке `pool.connect`; ошибка логируется, функция завершается безопасно.
- `apps/webapp/src/app/api/admin/audit-log/route.ts`:
  - добавлена валидация диапазона дат: `from > to` → `400 invalid_date_range`.
- Тесты:
  - `apps/webapp/src/infra/adminAuditLog.test.ts`: кейс на swallow connect failure.
  - `apps/webapp/src/app/api/admin/audit-log/route.test.ts`: кейс на invalid date range.

### Прогоны

- `pnpm --dir apps/webapp exec vitest run src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.test.ts`
- `pnpm --dir apps/webapp run typecheck`
- `pnpm --dir apps/webapp exec eslint src/infra/adminAuditLog.ts src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.ts src/app/api/admin/audit-log/route.test.ts src/app/app/settings/AdminAuditLogSection.tsx`
- `read_lints` по изменённым файлам

## Этап 3 — merge preview API и backend resolution model (2026-04-09)

### Реализовано

- **Сервис** `apps/webapp/src/infra/platformUserMergePreview.ts`:
  - `buildMergePreview(pool, targetId, duplicateId)` — загрузка двух `platform_users` (все скалярные поля из текущей схемы), `user_channel_bindings`, `user_oauth_bindings`, счётчиков зависимостей, проверок overlap/LFK/meaningful-data (SQL выровнен с `pgPlatformUserMerge.ts`: `assertPatientBookingsSafeToMerge`, `assertPatientLfkAssignmentsSafe`, `assertSharedPhoneGuard`).
  - `analyzeMergePreviewModel(...)` — чистая модель для тестов: hard blockers, конфликты, auto-merge скаляры, `recommendation` через **`pickMergeTargetId`** из `pgPlatformUserMerge.ts`.
  - `searchMergeCandidates(pool, anchorUserId, q?)` — кандидаты по общему телефону, email, integrator id или общему binding; опциональный фильтр `q`.
  - Лог: pino `info` `[merge-preview] computed` с `mergeAllowed`, `v1MergeEngineCallable` и счётчиками конфликтов.
- **API**
  - `GET /api/doctor/clients/:userId/merge-candidates` — `requireAdminModeSession`, ответ с `candidates` (camelCase).
  - `GET /api/doctor/clients/merge-preview?targetId=&duplicateId=` — JSON preview (camelCase), **без apply**.

### Preview contract (кратко)

- `hardBlockers[]`: коды `target_is_alias`, `duplicate_is_alias`, **`different_non_null_integrator_user_id`**, `active_bookings_time_overlap`, `active_lfk_template_conflict`, `shared_phone_both_have_meaningful_data`.
- `scalarConflicts` / `channelConflicts` / `oauthConflicts` / `autoMergeScalars` / `dependentCounts` / `recommendation` / `mergeAllowed` / **`v1MergeEngineCallable`** (нет hard blockers и нет пары разных non-null телефонов — иначе текущий `mergePlatformUsersInTransaction` бросает `MergeConflictError`).
- Разные non-null `integrator_user_id` — **всегда** hard blocker (без ослабления).

### Где использованы существующие репозитории/helpers

- `pickMergeTargetId` — `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`.
- Логика SQL overlap/LFK/shared-phone — зеркало приватных guard-функций в `pgPlatformUserMerge.ts` (не импортируются, чтобы не экспортировать assert из repo).

### Документация

- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — секция «Manual merge — preview».
- `apps/webapp/src/app/api/api.md` — описание двух endpoints.

### Проверки

- `pnpm --dir apps/webapp exec vitest run src/infra/platformUserMergePreview.test.ts src/app/api/doctor/clients/merge-preview/route.test.ts src/app/api/doctor/clients/\[userId\]/merge-candidates/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec eslint` по перечисленным в Этапе 3 файлам
- `read_lints` по изменённым TS-файлам

### Не в scope этапа

- Ручной merge apply, UI compare/confirm, доработки strict purge сверх уже сделанного, integrator-side v2 (по плану — отдельный шаг после v1).

## Финальная проверка Этапа 3 (2026-04-09, review)

### Findings

1. **Семантика `mergeAllowed` vs текущий merge engine:** hard blockers совпадают с планом, но **два разных non-null `phone_normalized`** дают `MergeConflictError` в `mergePlatformUsersInTransaction` до dependent-guard’ов, при этом в плане телефон отнесён к **конфликтным полям**, а не к hard blockers. Риск: UI мог трактовать `mergeAllowed: true` при телефонном конфликте как возможность вызвать существующий merge.
2. **Скалярные конфликты (email / имя) vs COALESCE в SQL:** текущий движок при обоих non-null для `first_name`/`last_name`/`email` оставляет значение target через `COALESCE(pu, dup)`; preview всё равно показывает `scalarConflicts` для ручного будущего шага — это намеренно, но должно быть явно в документации.
3. **Зависимые счётчики:** план упоминает «diary» — в preview это `symptom_trackings` + `lfk_complexes` (без отдельного счётчика `lfk_sessions`); для pre-merge обзора достаточно, уточнено в архитектурном doc.
4. **Мёртвый код:** в типе ошибки preview фигурировал `invalid_uuid`, фактически не использовался (валидация в route) — удалён из union.

### Исправления в ходе review

- Добавлено поле **`v1MergeEngineCallable`**: `mergeAllowed && !(оба non-null phone && разные)` — явная совместимость с **`mergePlatformUsersInTransaction` v1**.
- Обновлены `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md`, `apps/webapp/src/app/api/api.md`, тесты и лог preview.
- Уточнены пояснения про `scalarConflicts` и COALESCE для email/имени.

### Прогоны (после правок)

- `pnpm --dir apps/webapp exec vitest run src/infra/platformUserMergePreview.test.ts src/app/api/doctor/clients/merge-preview/route.test.ts src/app/api/doctor/clients/\[userId\]/merge-candidates/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec eslint` по затронутым файлам Этапа 3
- `read_lints` по изменённым TS-файлам

## Повторная проверка Этапа 3 (2026-04-09, 2nd pass)

### Findings

1. **Регрессий не выявлено:** hard blockers, SQL overlap/LFK/shared-phone, блокер `different_non_null_integrator_user_id`, alias-guard, `v1MergeEngineCallable`, non-client / alias / missing user для API — согласованы с `pgPlatformUserMerge.ts` и планом §2–3.
2. **Контракт ответа:** camelCase, явные `mergeAllowed` / `v1MergeEngineCallable`, отсутствие обещаний про apply / `media_files` — в `PLATFORM_USER_MERGE.md` и `api.md` отражены.
3. **Ограничение (известное):** при аномалии «несколько строк `user_channel_bindings` на один `channel_code` у одного пользователя» preview берёт первую строку по `find` — для реальных данных обычно 0–1 на канал; полный разбор множеств не требовался для Этапа 3.
4. **Покрытие тестов:** добавлены кейсы **`invalid_user`** на merge-candidates (до вызова `searchMergeCandidates`) и **403** на merge-preview при отказе admin gate.

### Fixes

- Два дополнительных unit-теста маршрутов (`merge-candidates`: невалидный UUID; `merge-preview`: `requireAdminModeSession` → 403). Код preview-сервиса не менялся.

### Прогоны (2nd pass)

- `pnpm --dir apps/webapp exec vitest run src/infra/platformUserMergePreview.test.ts src/app/api/doctor/clients/merge-preview/route.test.ts src/app/api/doctor/clients/\[userId\]/merge-candidates/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec eslint` по изменённым тестам
- `read_lints` по изменённым файлам

## Этап 4 — manual merge engine + projection conflict handling (2026-04-09)

### Реализовано

- **`ManualMergeResolution`** (`apps/webapp/src/infra/repos/manualMergeResolution.ts`): `targetId`, `duplicateId`, `fields` (скаляры), `bindings` (`telegram` / `max` / `vk`), `oauth` по провайдеру, `channelPreferences`.
- **`mergePlatformUsersInTransaction(..., "manual", { resolution })`**: выбор скаляров через `CASE`, ручные channel/oauth ветки, **`UPDATE media_files SET uploaded_by = …`**, `channelPreferences` (`keep_target` удаляет prefs duplicate; `keep_newer`/`merge` — merge по `updated_at` как раньше). Авто-пути `projection` / `phone_bind` без изменения контракта (COALESCE / прежние INSERT биндингов).
- **`MergeDependentConflictError`**: добавлен **`candidateIds`** (как у `MergeConflictError`); throw-sites в guard’ах merge передают `[targetId, duplicateId]`.
- **`runManualPlatformUserMerge`** + **`withTwoUserLifecycleLocksExclusive`**: два exclusive advisory lock на отсортированной паре UUID, затем merge; аудит **`user_merge`** отдельной транзакцией (`manualPlatformUserMerge.ts`).
- **`POST /api/doctor/clients/merge`**: admin gate, body `{ resolution }`, `409` при ошибке merge.
- **Integrator ingestion** (`modules/integrator/events.ts` + `POST /api/integrator/events/route.ts`): selective catch — `MergeConflictError` / `MergeDependentConflictError` → `conflictAudit.logAutoMergeConflict` → `upsertOpenConflictLog` / anomaly → **`accepted: true`** (**HTTP 202**); прочие ошибки — прежний retryable path (**503**). Identity-события не мутируют платформу при конфликте. **`appointment.record.upserted`**: при конфликте в `ensureClient` — аудит, upsert projection строки, **без** `findByPhone` / `findByIntegratorId`, `applyRubitimeUpdate` с `userId: null`.

### Где меняется 202 / 503

- Репозиторий проекций только бросает typed errors.
- **`handleIntegratorEvent`** решает accepted; **`route.ts`** маппит `result.accepted` → **202**, иначе `retryable === false` → **422**, иначе **503**.

### Документация

- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — секции Manual merge apply и Projection ingestion.
- `apps/webapp/src/app/api/api.md` — `POST doctor/clients/merge`, уточнение по integrator events.

### Проверки

- `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts src/modules/integrator/events.test.ts src/app/api/doctor/clients/merge/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `eslint` по изменённым файлам этапа

### Ограничения v1 (сохранены)

- Два разных non-null `integrator_user_id` — merge по-прежнему запрещён.
- Нет replay для `preferences.updated` при отложенном конфликте.
- Integrator DB merge — вне scope.

## Финальная проверка Этапа 4 (2026-04-09, review)

### Findings

| Тема | Статус |
|------|--------|
| `MergeDependentConflictError.candidateIds` + throw-sites в `assertSharedPhoneGuard` / `assertPatientBookingsSafeToMerge` / `assertPatientLfkAssignmentsSafe` с `[targetId, duplicateId]` | OK (`platformUserMergeErrors.ts`, `pgPlatformUserMerge.ts`) |
| Решение HTTP **202** vs **503** в repo (`pgUserProjection`) | OK: только ROLLBACK + rethrow typed errors; **нет** выбора статуса в репозитории |
| Selective catch в `events.ts`: merge-class → `accepted: true`; иное → `accepted: false` (503) | OK; добавлен тест на **не**-merge `Error` → без `logAutoMergeConflict`, `accepted: false` |
| Fallback «первый кандидат» в appointment compat | OK: при `appointmentMergeConflict` отключены `findByPhone` / `findByIntegratorId` |
| `preferences.updated`: при merge-conflict до `upsertNotificationTopics` | OK: порядок try — сначала `upsertFromProjection`, при throw topics не вызываются |
| `user_merge` audit vs план (`conflictsResolved`, `dependentRowsMoved`) | Был gap: в success-details не было полей плана — **исправлено** в `manualPlatformUserMerge.ts` + doc |
| `conflictAudit` отсутствует в deps | Ранее: merge-class всё равно `accepted: true` без DB dedup — **уточнено** в `reason` строки handler’а при отсутствии `conflictAudit` |
| Dedup `auto_merge_conflict` | OK: `computeConflictKeyFromCandidateIds` + `upsertOpenConflictLog` в route (стабильный sorted set) |

### Fixes в ходе review

- `runManualPlatformUserMerge`: в успешный `user_merge` добавлены `conflictsResolved: []` и `dependentRowsMoved` (v1-семантика).
- `acceptAfterMergeConflict`: пометка в `reason`, если `conflictAudit` не передан (наблюдаемость).
- Тест: `user.upserted` с обычной ошибкой БД не вызывает conflict audit.

### Прогоны (после правок)

- `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts src/modules/integrator/events.test.ts src/app/api/doctor/clients/merge/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `eslint` по изменённым файлам этапа
- `read_lints` по затронутым TS-файлам

### Остаётся осознанным ограничением

- Вызовы `handleIntegratorEvent` **без** `conflictAudit` (не production route) по-прежнему возвращают `accepted: true` на merge-class, но без записи в `admin_audit_log` — только пометка в `reason`.

## Повторная проверка Этапа 4 (2nd pass, 2026-04-09)

### Findings

- Повторно сверены: `manualMergeResolution.ts`, `pgPlatformUserMerge.ts` (scalar CASE, channel/oauth manual, `UPDATE media_files`, hard blocker `iA && iB && iA !== iB`, `MergeDependentConflictError` + `[targetId, duplicateId]`), `manualPlatformUserMerge.ts` (`user_merge` + `conflictsResolved` / `dependentRowsMoved`), `events.ts` + `integrator/events/route.ts` (selective catch, `appointmentMergeConflict` без compat fallbacks, `preferences.updated` порядок вызовов), `pgUserProjection.ts` — **нет** HTTP/accepted-логики в repo.
- Новых багов, скрытых mutation-paths или расхождений с планом §3 (этап 4) **не выявлено** относительно состояния после первой финальной проверки.

### Fixes

- Нет (исходный код в рамках этой повторной проверки не менялся).

### Прогоны

- `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts src/modules/integrator/events.test.ts src/app/api/doctor/clients/merge/route.test.ts` — OK (83 теста).
- `pnpm --dir apps/webapp exec tsc --noEmit` — OK.
- `eslint` по перечисленным выше модулям этапа 4 — OK.
- `read_lints` по затронутым путям — без замечаний.

## Этап 5 — Admin UI: compare/confirm manual merge и unresolved `auto_merge_conflict` (2026-04-09)

### Реализовано

- **Карточка клиента** (`/app/doctor/clients/[userId]`), только при **admin + admin mode** (тот же флаг `canPermanentDelete`, что и purge):
  - **`AdminMergeAccountsPanel`**: кандидаты (`merge-candidates`), выбор дубликата, `merge-preview` с **автовыравниванием** target/duplicate по `recommendation` (повторный запрос при другой ориентации), side-by-side скаляры, каналы (`telegram`/`max`/`vk`), OAuth, prefs, dependent counts, **жёсткие блокировки** с русскими пояснениями (`hardBlockerUi`), финальный текстовый предпросмотр, **двойное подтверждение** (confirm + ввод UUID дубликата), `POST /api/doctor/clients/merge`.
  - **`AdminClientAuditHistorySection`**: `GET /api/admin/audit-log?involvesPlatformUserId=…` — строки с этим пользователем в `target_id` или в `details.candidateIds` у `auto_merge_conflict`; локальный счётчик нерешённых в выборке.
- **`adminMergeAccountsLogic.ts`**: чистые функции контракта (`getAlignedMergePreviewRequest`, `buildDefaultManualMergeResolution`, `canSubmitManualMerge`, тексты блокеров) + unit-тесты.
- **API `GET /api/admin/audit-log`**: параметр **`involvesPlatformUserId`** (UUID); в ответе **`openAutoMergeConflictCount`** (открытые строки `auto_merge_conflict`, `resolved_at IS NULL`).
- **`AdminAuditLogSection`**: бейдж при `openAutoMergeConflictCount > 0`.
- **Документация**: `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` (секция Admin UI), `apps/webapp/src/app/api/api.md`.

### Проверки (целевые)

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx src/app/api/admin/audit-log/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `eslint` по изменённым файлам этапа

### Отображение

- **Hard blockers**: красная панель со списком кодов и пояснениями; кнопка merge неактивна.
- **Конфликты полей / bindings**: radio (target / duplicate / both для каналов без конфликта как «авто»).
- **Нерешённые конфликты**: глобальный бейдж в «Лог операций»; на карточке — фильтр по участию пользователя и пометки «открыт».

### Ограничения (v1, без integrator-side v2)

- Два разных non-null `integrator_user_id` остаются hard blocker в UI и в backend.

## Финальная проверка Этапа 5 (2026-04-09, review)

### Findings

| Тема | Вердикт |
|------|--------|
| **Admin-only** | Блоки merge + audit на карточке только при `canPermanentDelete` (admin + admin mode); API те же `requireAdminModeSession`. |
| **Hard blockers** | `canSubmitManualMerge` требует `mergeAllowed`, пустой `hardBlockers`, согласованный `resolution`; кнопка завязана на `canMerge`. Обход только через прямой вызов API — сервер отклонит guard’ами. |
| **Двойное подтверждение** | confirm + UUID дубликата; добавлено сравнение UUID **без учёта регистра** (`uuidEqualsNormalized`). |
| **Badge / counter** | `openAutoMergeConflictCount` = `COUNT(*)` по открытым строкам (`resolved_at IS NULL`), не `repeat_count`; соответствует одной открытой строке на `conflict_key` после dedup. |
| **v1 ограничения** | Добавлено заметное пояснение при `mergeAllowed && !v1MergeEngineCallable` (авто-путь vs ручной). |
| **Ошибки API** | Улучшены сообщения при `403`, не-JSON ответе merge, ошибочном теле списка кандидатов. |
| **Счётчик на карточке** | Уточнён текст: только среди загруженных строк (до 20), не повторы события. |
| **Тесты** | Добавлены тесты `uuidEqualsNormalized`; остальное покрытие без изменения scope. |

### Исправления в ходе review

- `AdminMergeAccountsPanel`: 403 для кандидатов/merge; безопасный разбор JSON для `POST /merge`; подсказка `v1MergeEngineCallable`; ключи списка предпросмотра; `uuidEqualsNormalized` для prompt.
- `AdminClientAuditHistorySection`: 403 copy; подпись счётчика конфликтов.
- `adminMergeAccountsLogic.ts` + тесты: `uuidEqualsNormalized`.
- Документы: `PLATFORM_USER_MERGE.md` (уточнения flow), этот лог.

### Прогоны

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx src/app/api/admin/audit-log/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `pnpm --dir apps/webapp exec eslint` по изменённым файлам этапа

## Повторная проверка Этапа 5 (2nd pass, 2026-04-09)

### Findings

| Тема | Статус |
|------|--------|
| Admin-only (`canPermanentDelete` + API `requireAdminModeSession`) | OK, без изменений логики |
| Hard blockers / `canSubmitManualMerge` / disabled кнопка | OK; обход только через прямой API |
| Двойное подтверждение + `uuidEqualsNormalized` | OK |
| Бейдж `openAutoMergeConflictCount` (строки `resolved_at IS NULL`, не `repeat_count`) | OK |
| v1 баннер при `!v1MergeEngineCallable` | OK |
| Ошибки merge / кандидатов | OK; **зазор**: `merge-preview` и загрузка audit-лога при `403` показывали сырой код/англ. текст — выровняно с остальным UI |

### Fixes (2nd pass)

- `AdminMergeAccountsPanel`: для неуспешного `merge-preview` и второго запроса выравнивания — явное сообщение при `HTTP 403`.
- `AdminAuditLogSection`: при `403` — тот же смысл, что и для других admin-only запросов; иначе `request_failed_<status>` если нет `error` в теле.

### Прогоны (после 2nd pass)

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx src/app/api/admin/audit-log/route.test.ts`
- `pnpm --dir apps/webapp exec tsc --noEmit`
- `eslint` по затронутым файлам

---

## Этап 6 — документация, targeted tests, edge cases, финальная полировка v1 (2026-04-09)

### Верификация реализации этапов 1–5 (соответствие плану)

| Область | Статус |
|--------|--------|
| **Strict purge** — lock → preflight S3 → DELETE в одной webapp tx; post-commit S3 ∥ integrator без short-circuit; `outcome` / `details`; аудит отдельной tx | Соответствует `strictPlatformUserPurge.ts`, тесты `strictPlatformUserPurge.test.ts` |
| **Audit** — `user_purge`, `user_merge`, `auto_merge_conflict` / anomaly; запись после commit или после rollback основной операции | Соответствует `adminAuditLog.ts`, маршруты |
| **Manual merge blockers** — разные non-null `integrator_user_id`, alias, overlap LFK/bookings, shared phone + meaningful data | Preview + engine + UI согласованы |
| **Projection conflicts** — typed errors из repo; `events.ts` → 202 + audit, без identity mutation; appointment без compat fallback при конфликте | Соответствует `events.ts`, `events.test.ts` |
| **Unresolved conflict visibility** — `openAutoMergeConflictCount`, карточка `involvesPlatformUserId`, dedup по `conflict_key` | Соответствует API и UI этапа 5 |
| **v2 (integrator canonical merge)** | Не трогалось (вне scope этапа 6) |

### Документация (обновлено / синхронизировано)

- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — уточнён **реализованный** v1 lock protocol для manual merge (`withTwoUserLifecycleLocksExclusive`), убрана устаревшая формулировка «до реализации merge engine».
- `docs/REPORTS/DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md` — `userLifecycleLock`: dual lock + nutrition intake в shared-lock пути; пункт истории §7 про этап 6.
- `apps/webapp/src/app/api/api.md` — `user_purge_external_retry` при повторе внешней очистки; permanent-delete bullet.

### Тесты (добавлено / усилено на этапе 6)

- **`manualPlatformUserMerge.test.ts`** (новый): порядок merge vs dual lock, успешный `user_merge` audit (`conflictsResolved` / `dependentRowsMoved`), error audit при падении merge (без дублирующего ok-audit).

### Прогоны (этап 6)

- Targeted `vitest` (strict purge, lifecycle lock, admin audit, merge preview + routes, `pgPlatformUserMerge`, `manualPlatformUserMerge`, integrator `events`, merge UI tests, permanent-delete, media presign): **15 файлов, 145 тестов — OK**.
- Исправление CI: `src/app/api/integrator/events/route.test.ts` — частичный mock `getPool` (через `importOriginal`), т.к. после добавления `conflictAudit` в `POST` маршрут всегда вызывает `getPool()`; без `DATABASE_URL` в окружении CI ломались 4 теста idempotency.
- Полный **`pnpm run ci`** (корень репозитория): lint, typecheck, integrator + webapp tests, build — **OK** (webapp: 277 файлов тестов, 1340 passed).
- `pnpm --dir apps/webapp exec eslint` по затронутым файлам этапа — OK.

### Что покрыто тестами (сводка v1)

- Admin audit: сервис, API audit-log (включая `involvesPlatformUserId`, date range).
- Strict purge: порядок BEGIN/lock/collect/core, post-commit оба внешних шага, partial/needs_retry, audit при rollback.
- User lifecycle lock: unit-smoke.
- Merge preview + routes merge-candidates / merge-preview.
- Manual merge: `pgPlatformUserMerge`, merge route, **`runManualPlatformUserMerge`** (audit semantics).
- Integrator events: conflict → accepted, anomaly path, appointment conflict без fallback.
- Admin UI logic / panel tests для merge и audit.

### Что сознательно оставлено в v1 limitations

- Merge **двух разных** non-null `integrator_user_id` — по-прежнему hard blocker до **отдельного** проекта v2 (integrator-side canonical merge в плане).
- Нет replay для `preferences.updated` при отложенном конфликте.
- Операционный флаг `intakeS3ObjectsNotDeletedBucketDisabled` при отключённом S3 — без принудительного `partial_failed` только из-за флага (см. этап 2 review).
- Нет E2E Postgres на advisory locks в CI; гонки покрыты unit-моками и код-ревью протокола.
- `handleIntegratorEvent` без `conflictAudit`: merge-class всё ещё `accepted: true` без DB-записи (некритичный dev/test path).

### Риски, снятые реализацией v1

- Потеря S3-ключей из-за каскада до сбора — снято транзакцией + lock + preflight.
- Бесконечный 503 на projection merge-conflicts — снято selective catch + 202 + audit.
- Нестабильный «первый кандидат» при appointment compat — снято флагом конфликта и отключением fallback.
- Phantom user при merge разных integrator id — предотвращено hard blocker’ом (не «снято» навсегда — см. v2).

### Риски, остающиеся до v2

- Пока запрещён merge разных integrator id: продуктовые сценарии с двумя живыми integrator-пользователями на одного человека требуют **integrator-side** canonical merge и realignment проекций (в `.cursor/plans/...` — отдельный шаг **v2**, не этап 6 работ по документации/тестам).
- До v2: stale loser `integratorUserId` в integrator DB при отдельных сбоях рассинхрона — вне объёма webapp-only v1.
- Legacy/редкие write paths без shared lock — только если появятся новые «user-owned» INSERT без участия в протоколе (ревью при новых фичах).

### v2: integrator-side canonical merge (не «этап 6» плана про docs/tests)

- **Не выполнялся** в рамках этапа 6 инициативы (явное требование заказчика).

---

## Финальная верификация Этапа 6 (2026-04-09, review-only)

### Findings

| Тема | Вердикт |
|------|--------|
| **Strict purge** — docs (`DOCTOR_CLIENT_ARCHIVE_AND_PURGE`, `PLATFORM_USER_MERGE` §locks) vs `strictPlatformUserPurge.ts` / `platformUserFullPurge` delegation | Согласовано: exclusive lock, preflight до DELETE, post-commit S3 ∥ integrator, `outcome`, `intakeS3ObjectsNotDeletedBucketDisabled`, `retry` / `user_purge_external_retry` в `api.md`. |
| **Manual merge blockers + preview** | Коды hard blockers и `v1MergeEngineCallable` соответствуют `platformUserMergePreview` / `pgPlatformUserMerge`. |
| **Projection conflicts** | Документы и `api.md` описывают 202 + audit; `preferences.updated` — нет replay; разные integrator id — blocker до v2 плана. |
| **Execution log** | Отражает этап 6 (доки, тесты, CI, mock `getPool` в `integrator/events/route.test.ts`). Нет противоречий с текущим кодом. |
| **Полусделанный v2 в коде** | Не обнаружено: нет заготовок integrator `merged_into_user_id` и т.п. в рамках проверки. |
| **Doc drift** | В `PLATFORM_USER_MERGE.md` оставались формулировки «следующие этапы» / «до появления ManualMergeResolution» при уже реализованном ручном merge — **исправлено** в этой верификации. |
| **Targeted tests vs критические ограничения v1** | Блокер разных `integrator_user_id` покрыт preview-тестами и merge; audit manual merge — `manualPlatformUserMerge.test.ts`; integrator conflict semantics — `events.test.ts`. Полного интеграционного теста advisory locks в PG нет — осознанное ограничение, зафиксировано в логе этапа 6. |

### Fixes (в ходе финальной верификации)

- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — уточнены абзацы про `v1MergeEngineCallable` и **авто** vs **ручной** merge (без обещаний «будущих этапов» для уже существующего `POST /merge`).
- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — формулировки «Phase 6 плана» заменены на явное **v2 / integrator-side canonical merge**, чтобы не путать с **этапом 6** плана (docs/tests), где v2 не входит.
- `docs/REPORTS/DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md` — в §3.5 добавлены строки про `strictPlatformUserPurge.test.ts` и `manualPlatformUserMerge.test.ts`.

### Прогоны (финальная верификация)

- `pnpm --dir apps/webapp exec vitest run src/infra/manualPlatformUserMerge.test.ts src/infra/strictPlatformUserPurge.test.ts src/infra/platformUserMergePreview.test.ts src/modules/integrator/events.test.ts src/app/api/integrator/events/route.test.ts` — **5 файлов, 99 тестов — OK**.
- Изменения только в markdown: новых lint-замечаний по TS не ожидается.
- Полный **`pnpm run ci`** на этапе 6 уже проходил зелёным; после правок только в `.md` повторный полный CI не запускался.

---

## Повторная финальная верификация Этапа 6 (pass 2, 2026-04-09)

### Findings

| Тема | Вердикт |
|------|--------|
| Соответствие docs этапов 1–5 коду | Без новых расхождений; strict purge, merge, audit, integrator 202 — как в репозитории. |
| Execution log | Дополнительно убраны остаточные формулировки **«Phase 6»** там, где имелся в виду **v2 / integrator-side** (исторические строки этапов 3–5 и блок рисков этапа 6), чтобы не путать с **этапом 6** плана (docs/regression). |
| Ограничения v1 | `preferences.updated` (no replay), разные `integrator_user_id` (blocker до v2) — явно в `PLATFORM_USER_MERGE.md` §«Ограничения v1» и ingestion. |
| Полусделанный v2 | Не выявлено в проверенных docs/код-путях. |
| Targeted tests | Критические ограничения по-прежнему покрыты перечисленными в этапе 6 тестами; advisory locks в PG — без интеграционного теста (осознанно). |

### Fixes (pass 2)

- `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` — preview: явно «до `POST /merge`», без формулировки «отдельный apply-этап» как о будущем.
- `docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md` — выравнивание терминов v2 vs этап 6 (см. таблицу findings).

### Прогоны (pass 2)

- `pnpm --dir apps/webapp exec vitest run src/infra/manualPlatformUserMerge.test.ts src/infra/strictPlatformUserPurge.test.ts src/infra/platformUserMergePreview.test.ts src/modules/integrator/events.test.ts src/app/api/integrator/events/route.test.ts` — **OK** (после правок только в `.md` повторный запуск опционален; выполнен для отчёта).

---

## Повторная финальная верификация Этапа 6 (pass 3, 2026-04-09)

### Findings

| Тема | Вердикт |
|------|--------|
| Основные docs инициативы | Новых расхождений с кодом не найдено: strict purge, manual merge blockers, conflict handling и v1 limitations согласованы. |
| Execution log | После pass 2 явных противоречий или хвостов v2 в формулировках по инициативе не осталось. |
| Targeted tests / edge cases | Критические v1 ограничения по-прежнему покрыты выбранным regression-набором; интеграционный PG-lock test всё ещё сознательно вне scope. |

### Fixes (pass 3)

- Новых правок в код/документацию, кроме этой verification-записи, не потребовалось.

### Прогоны (pass 3)

- `pnpm --dir apps/webapp exec vitest run src/infra/manualPlatformUserMerge.test.ts src/infra/strictPlatformUserPurge.test.ts src/infra/platformUserMergePreview.test.ts src/modules/integrator/events.test.ts src/app/api/integrator/events/route.test.ts` — **5 файлов, 99 тестов — OK**.
- `read_lints` по обновлённым markdown-файлам — замечаний нет.

---

## Итоговая сквозная верификация инициативы (2026-04-09, final pass)

### Что проверено

- **Этап 1 / audit**: отдельная транзакция `writeAuditLog`, пригодность лога для расследования purge/merge/conflict-сценариев, `involvesPlatformUserId`, `openAutoMergeConflictCount`, актуальность docs.
- **Этап 2 / strict purge**: rollback-safe audit, preflight в той же tx, post-commit S3 ∥ integrator, отсутствие хвостов в `media_files`, пригодность audit payload для повторной внешней очистки.
- **Lock protocol**: shared/exclusive paths из v1 (`media/presign`, intake, dual merge lock), а также отсутствие неожиданных bypass'ов в проверенных маршрутах инициативы.
- **Этап 3–4 / merge + projection conflicts**: hard blocker по разным non-null `integrator_user_id`, `candidateIds` contract для `MergeConflictError` / `MergeDependentConflictError`, отсутствие бесконечного 503-loop, appointment compat-path без ambiguous relink после merge-class конфликта.
- **Этап 5 / UI**: hard blockers, невозможность пройти channel-conflict через `both`, admin-only gating, актуальность текстов `v1` / `v2`.
- **Этап 6 / docs**: execution log, архитектурный doc и `api.md` приведены к фактическому коду v1 без обещаний integrator-side v2.

### Cross-stage проблемы, найденные в этом финальном проходе

1. **Manual merge принимал не-client пары** при прямом вызове `POST /api/doctor/clients/merge`: preview-route это запрещал, но сам merge engine не перепроверял `role`.
2. **Channel conflict можно было отправить как `both`**: UI показывал `авто` даже при реальном конфликте, а backend позволял получить два binding одного `channel_code` на одном пользователе.
3. **Merge терял `email_verified_at`**: surviving email сохранялся, но verified-state не переносился, если итоговый email приходил с duplicate или совпадал только по duplicate-стороне.
4. **`appointment.record.upserted` мог пропустить ensure-path**, если телефон приходил только в `payloadJson.phone`; это оставляло compat fallback без merge-conflict guard для такого payload.
5. **Strict purge не собирал DB-only `media_files`** (`s3_key IS NULL`) и поэтому мог оставить webapp-tail; одновременно audit не сохранял полный retry payload, хотя docs уже ссылались на «артефакт из аудита».
6. **Doc drift**: в execution log оставались устаревшие формулировки про «audit ещё не подключён» и «manual merge пока без exclusive lock»; в purge-доках сохранялся старый тезис про `media_files` с `uploaded_by = NULL`; в UI/логике оставалось `Phase 6` вместо явного `v2`.

### Что исправлено

- `apps/webapp/src/infra/repos/pgPlatformUserMerge.ts`
  - merge теперь серверно запрещён для любых не-`client` пар;
  - `both` отклоняется при реальном channel-conflict;
  - surviving `email` теперь сохраняет совместимый `email_verified_at`.
- `apps/webapp/src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx`
  - для конфликтных каналов UI оставляет только `target` / `duplicate`.
- `apps/webapp/src/app/app/doctor/clients/adminMergeAccountsLogic.ts`
  - `canSubmitManualMerge` дополнительно запрещает `both` для channel-conflict;
  - blocker-copy переведён с расплывчатого `Phase 6` на явное **v2**.
- `apps/webapp/src/modules/integrator/events.ts`
  - `appointment.record.upserted` теперь берёт телефон и из `payloadJson.phone` / `payloadJson.phoneNormalized`, чтобы `ensureClientFromAppointmentProjection` и merge-conflict guard работали и для такого payload.
- `apps/webapp/src/infra/platformUserFullPurge.ts`
  - preflight purge собирает **все** `media_files` по `uploaded_by`, включая строки без `s3_key`.
- `apps/webapp/src/infra/strictPlatformUserPurge.ts`
  - DB-only `media_files` удаляются post-commit как webapp-only artifacts;
  - audit для `user_purge` / `user_purge_external_retry` теперь сохраняет `artifact`, `phoneNormalized`, `webappIntegratorUserId`, `resolvedIntegratorUserIds` для retry/investigation.
- `apps/webapp/src/app/app/doctor/clients/AdminClientAuditHistorySection.tsx`
  - copy уточнён: секция показывает не только integration conflicts, но и вообще операции, где пользователь фигурирует как `target`.
- Docs:
  - `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md`
  - `docs/REPORTS/DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md`
  - `apps/webapp/src/app/api/api.md`
  - этот execution log

### Tests / checks, прогнанные в final pass

- `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts src/infra/strictPlatformUserPurge.test.ts src/modules/integrator/events.test.ts src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx` — **5 файлов, 102 теста — OK**.
- `pnpm --dir apps/webapp exec vitest run src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.test.ts src/infra/platformUserMergePreview.test.ts src/infra/manualPlatformUserMerge.test.ts src/app/api/doctor/clients/merge-preview/route.test.ts src/app/api/doctor/clients/merge/route.test.ts src/app/api/doctor/clients/[userId]/merge-candidates/route.test.ts src/app/api/integrator/events/route.test.ts src/app/api/media/presign/route.test.ts src/infra/userLifecycleLock.test.ts src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts` — **11 файлов, 57 тестов — OK**.
- `pnpm --dir apps/webapp exec vitest run src/infra/adminAuditLog.test.ts src/app/api/admin/audit-log/route.test.ts src/infra/platformUserMergePreview.test.ts src/infra/manualPlatformUserMerge.test.ts src/infra/repos/pgPlatformUserMerge.test.ts src/infra/strictPlatformUserPurge.test.ts src/modules/integrator/events.test.ts src/app/api/integrator/events/route.test.ts src/app/api/doctor/clients/merge-preview/route.test.ts src/app/api/doctor/clients/merge/route.test.ts src/app/api/doctor/clients/[userId]/merge-candidates/route.test.ts src/app/api/media/presign/route.test.ts src/infra/userLifecycleLock.test.ts src/app/api/doctor/clients/[userId]/permanent-delete/route.test.ts src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx` — **16 файлов, 159 тестов — OK**.
- `pnpm --dir apps/webapp exec vitest run` — **277 файлов passed, 3 skipped; 1348 тестов passed, 5 skipped — OK**.
- `pnpm --dir apps/webapp run typecheck` — **OK**.
- `pnpm --dir apps/webapp exec eslint src/infra/repos/pgPlatformUserMerge.ts src/infra/repos/pgPlatformUserMerge.test.ts src/app/app/doctor/clients/AdminMergeAccountsPanel.tsx src/app/app/doctor/clients/AdminMergeAccountsPanel.test.tsx src/infra/platformUserFullPurge.ts src/infra/strictPlatformUserPurge.ts src/infra/strictPlatformUserPurge.test.ts src/modules/integrator/events.ts src/modules/integrator/events.test.ts src/infra/repos/manualMergeResolution.ts src/app/app/doctor/clients/adminMergeAccountsLogic.ts src/app/app/doctor/clients/adminMergeAccountsLogic.test.ts src/app/app/doctor/clients/AdminClientAuditHistorySection.tsx` — **OK**.
- `pnpm --dir apps/webapp run build` — **OK**.
- `read_lints` по изменённым TS/TSX-файлам — замечаний нет.

### Остающиеся ограничения v1

- `outcome === "completed"` всё ещё **не эквивалентно** «integrator точно очищен»: при `integratorSkipped: true` bot-side хвосты остаются возможными, поэтому оператору нужно смотреть и `integratorSkipped`, а не только `outcome`.
- Отдельного user-facing route/CLI для `retryStrictPurgeExternalCleanup` по audit payload всё ещё нет; после этого прохода payload хотя бы гарантированно сохраняется в `admin_audit_log`.
- Merge разных non-null `integrator_user_id` остаётся жёстким blocker до **v2 / integrator-side canonical merge**.
- Для `preferences.updated` нет replay после ручного разрешения конфликта.
- Интеграционного Postgres-test'а на advisory lock concurrency в CI по-прежнему нет; покрытие — unit/review + полный webapp suite.
- Вызовы `handleIntegratorEvent` без `conflictAudit` (dev/test path) всё ещё могут вернуть `accepted: true` без DB-записи конфликта.
