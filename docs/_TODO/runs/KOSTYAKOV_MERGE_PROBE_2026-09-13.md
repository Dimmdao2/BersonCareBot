# Костяков / КОСТЯКОВ — read-only probe на TEST

Дата наблюдения: 2026-09-13. PROD не открывался и не опрашивался. Все обращения к
`bersoncarebot_test` были либо `BEGIN READ ONLY ... ROLLBACK`, либо Node/`pg` с
`options='-c default_transaction_read_only=on'`. Ни одного `INSERT`, `UPDATE`, `DELETE`, merge POST,
worker/scheduler или отправки не выполнялось.

## Итог

По действующим правилам merge эта пара **разрешена**: реальный
`analyzeMergePreviewModel` на фактических TEST-строках вернул `hardBlockers: []`,
`mergeAllowed: true`, `v1MergeEngineCallable: true`. Достижимого конфликта данных нет: обе строки
сейчас canonical, телефоны не совпадают как два non-null значения (телефон есть только у первой),
пересекающихся активных записей, одинаковых активных ЛФК-шаблонов, двух active non-promo программ и
общих открытых test attempts нет. Отказ старого PROD согласуется со stale-правилом ветки `main`:
там всё ещё есть blocker `different_non_null_integrator_user_id`, а Track D (`#987`, commit
`31e5a01c8de2514c2c70008762f404d1bf3ade82`) удалил публичную числовую личность и этот blocker из
`feat/doctor-ui-rebuild`. Точные прежние numeric ids из текущего TEST восстановить нельзя: миграция
Track D удалила `platform_users.integrator_user_id`, и schema-introspection подтверждает отсутствие
этой колонки. Поэтому связь конкретного старого отказа именно с двумя различными numeric ids — сильный
вывод из owner-report + кода `main`, но не прямое наблюдение прежних значений.

Отдельно обнаружен не относящийся к данным пары текущий runtime-разрыв: заявленный в brief GET на
`feat/doctor-ui-rebuild` сейчас намеренно отвечает `404 { error: 'not_available' }`, а прямой
`buildMergePreview` на TEST падает до анализа с PostgreSQL `42703 column "email" does not exist`.
Ниже поэтому приведены раздельно verbatim-результат настоящего `buildMergePreview` и verbatim-результат
экспортированного настоящего `analyzeMergePreviewModel`, которому переданы фактические строки и
счётчики из SELECT. Продуктовый код в рамках probe не исправлялся.

## 1. Пара в TEST

Команда и запрос, которыми подтверждены target database, состав полей и все exact/substring matches:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS db_user, inet_server_port() AS server_port;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'platform_users'
  AND (
    column_name IN ('id','display_name','created_at','role','merged_into_id','phone_normalized','email',
                    'is_archived','archived_at','is_deleted','deleted_at')
    OR column_name ILIKE '%archiv%'
    OR column_name ILIKE '%delet%'
  )
ORDER BY ordinal_position;
SELECT
  pu.id,
  pu.display_name AS legacy_display_name,
  ui.display_name AS current_display_name,
  ui.first_name,
  ui.last_name,
  ui.patronymic,
  pu.created_at,
  pu.role,
  pu.merged_into_id,
  pu.is_archived,
  pu.is_blocked,
  phone.value_normalized AS phone_normalized,
  email.value_normalized AS email,
  email.confirmed_at AS email_verified_at,
  CASE WHEN lower(btrim(ui.display_name)) = lower('Костяков') THEN 'exact_current'
       WHEN lower(btrim(pu.display_name)) = lower('Костяков') THEN 'exact_legacy'
       ELSE 'substring' END AS match_kind
FROM platform_users pu
LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id
LEFT JOIN LATERAL (
  SELECT uc.value_normalized, uc.confirmed_at
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true
  LIMIT 1
) phone ON true
LEFT JOIN LATERAL (
  SELECT uc.value_normalized, uc.confirmed_at
  FROM user_contacts uc
  WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'email' AND uc.is_primary = true
  LIMIT 1
) email ON true
WHERE lower(btrim(COALESCE(ui.display_name, ''))) = lower('Костяков')
   OR lower(btrim(COALESCE(pu.display_name, ''))) = lower('Костяков')
   OR COALESCE(ui.display_name, '') ILIKE '%Костяков%'
   OR COALESCE(pu.display_name, '') ILIKE '%Костяков%'
   OR COALESCE(ui.last_name, '') ILIKE '%Костяков%'
ORDER BY pu.created_at, pu.id;
ROLLBACK;
SQL
```

Результат database/schema:

```text
database_name       | db_user  | server_port
bersoncarebot_test  | postgres |

column_name    | data_type
id             | uuid
display_name   | text
role           | text
created_at     | timestamp with time zone
is_archived    | boolean
merged_into_id | uuid
(6 rows)
```

В `platform_users` нет `deleted`, `is_deleted`, `deleted_at`, `archived_at`, `phone_normalized` и
`email`; актуальные primary phone/email читаются из `user_contacts`, актуальный FIO — из
`user_identity`. Единственный архивный флаг строки — `is_archived`.

Результат поиска:

| id | current / legacy display | structured FIO | created_at | role | merged_into_id | is_archived | is_blocked | phone_normalized | email / verified_at | match |
|---|---|---|---|---|---|---|---|---|---|---|
| `89ff45cf-caf6-4490-a4be-f66b9c5e87f3` | `Костяков Дмитрий` / `Костяков Дмитрий` | `Дмитрий` / `Костяков` / `null` | `2026-07-14 05:12:23.996124+03` | `client` | `null` | `false` | `false` | `+79152345074` | `null` / `null` | substring |
| `edb8b9cd-abea-4efa-bc0f-ca329ef522c8` | `КОСТЯКОВ ДМИТРИЙ` / `КОСТЯКОВ ДМИТРИЙ` | `null` / `null` / `null` | `2026-07-18 10:31:25.331096+03` | `client` | `null` | `false` | `false` | `null` | `dima190586@mail.ru` / `2026-07-18 10:31:41.476827+03` | substring |

Запрос вернул `(2 rows)`, поэтому третьего кандидата с таким exact/substring FIO в TEST нет. Обе
строки сейчас canonical по определению `merged_into_id IS NULL`; существующего alias→canonical
отношения между ними нет. Рекомендация preview ниже выбирает первой canonical target строку
`89ff45cf-caf6-4490-a4be-f66b9c5e87f3` и второй duplicate строку
`edb8b9cd-abea-4efa-bc0f-ca329ef522c8`.

## 2. Реальный preview-код

### 2.1 `buildMergePreview`: фактический результат

В worktree не было `node_modules`, поэтому исполняемый bundle был собран установленным esbuild соседнего
checkout. Равенство preview-кода и его runtime-зависимостей проверено этой командой:

```bash
git diff --name-only \
  9d7a6108a515b43f841a4cd340e28f2a1176a24e \
  eca920694aa8108c7100f0c50ffbe92137129750 -- \
  apps/webapp/src/infra/platformUserMergePreview.ts \
  apps/webapp/src/infra/repos/userIdentityFioSql.ts \
  apps/webapp/src/infra/repos/userContactsSql.ts \
  apps/webapp/src/infra/repos/autoMergeScalarEffective.ts \
  apps/webapp/src/infra/repos/pgPlatformUserMerge.ts \
  apps/webapp/src/infra/db/runWebappSql.ts \
  apps/webapp/src/infra/logging/logger.ts \
  packages/platform-merge
```

Результат: пустой stdout (различий нет).

Фактический запуск текущего `buildMergePreview(pool, targetId, duplicateId)` выполнялся так; temporary
entry импортировал функцию из `apps/webapp/src/infra/platformUserMergePreview.ts`, pool был локальным
peer-auth PostgreSQL с `default_transaction_read_only=on`:

```bash
NODE_PATH=/home/dev/dev-projects/BersonCareBot/apps/webapp/node_modules:/home/dev/dev-projects/BersonCareBot/node_modules \
  /home/dev/dev-projects/BersonCareBot/apps/webapp/node_modules/.bin/esbuild \
  apps/webapp/scripts/.tmp-kostyakov-preview.ts --bundle --platform=node --format=cjs \
  --target=node22 --tsconfig=apps/webapp/tsconfig.json --outfile=/tmp/bcb-kostyakov-preview.cjs
sudo -n -u postgres env NODE_ENV=test /usr/bin/node /tmp/bcb-kostyakov-preview.cjs
```

Verbatim существенная часть результата:

```text
error: column "email" does not exist
code: '42703'
file: 'parse_relation.c'
routine: 'errorMissingColumn'
```

Причина видна точным чтением loader:

```bash
sed -n '493,520p' apps/webapp/src/infra/platformUserMergePreview.ts
```

`loadPlatformUser` уже добавляет `USER_CONTACTS_PRIMARY_LATERALS`, но по-прежнему выбирает голые
`email` / `email_verified_at`; таких колонок после Track D в `platform_users` нет, а lateral aliases
называются `uc_pri_email.value_normalized` / `uc_pri_email.confirmed_at`. Loader также не добавляет
`USER_IDENTITY_FIO_JOIN`. Поэтому HTTP-shaped `buildMergePreview` не успевает вернуть модель.

### 2.2 `analyzeMergePreviewModel`: вердикт настоящего анализатора

Чтобы не переписывать hard-blocker rules, тем же temporary entry были загружены фактические строки,
bindings и OAuth через SELECT, meaningful scores получены вызовом настоящего `countMeaningfulData`, а
затем вызван экспортированный настоящий `analyzeMergePreviewModel`. Pair-conflict counters и
`dependentCounts` переданы из запросов разделов ниже. Команда запуска — та же bundle-команда выше.

Verbatim output выбранных возвращённых полей:

```json
{
  "hardBlockers": [],
  "mergeAllowed": true,
  "v1MergeEngineCallable": true,
  "recommendation": {
    "suggestedTargetId": "89ff45cf-caf6-4490-a4be-f66b9c5e87f3",
    "suggestedDuplicateId": "edb8b9cd-abea-4efa-bc0f-ca329ef522c8",
    "basis": "pick_merge_target_heuristic",
    "defaultWinnerBias": "older_created_at"
  },
  "dependentCounts": {
    "target": {
      "patientBookings": 1,
      "reminderRules": 1,
      "supportConversations": 1,
      "symptomTrackings": 2,
      "lfkComplexes": 0,
      "mediaFilesUploadedBy": 0,
      "onlineIntakeRequests": 0,
      "materialRatings": 20,
      "patientContentRatingFeedback": 0,
      "patientPracticeCompletions": 0,
      "treatmentProgramInstances": 2,
      "programActionLog": 496,
      "beAppointments": 2,
      "platformUserContacts": 0
    },
    "duplicate": {
      "patientBookings": 0,
      "reminderRules": 1,
      "supportConversations": 1,
      "symptomTrackings": 2,
      "lfkComplexes": 0,
      "mediaFilesUploadedBy": 0,
      "onlineIntakeRequests": 0,
      "materialRatings": 0,
      "patientContentRatingFeedback": 0,
      "patientPracticeCompletions": 0,
      "treatmentProgramInstances": 1,
      "programActionLog": 0,
      "beAppointments": 0,
      "platformUserContacts": 0
    }
  },
  "scalarConflicts": [
    {
      "field": "display_name",
      "targetValue": "Костяков Дмитрий",
      "duplicateValue": "КОСТЯКОВ ДМИТРИЙ",
      "recommendedWinner": "target",
      "reason": "older_created_at_preferred"
    }
  ],
  "channelConflicts": [],
  "oauthConflicts": [],
  "conflictCounters": {
    "hardBlockerCount": 0,
    "scalarConflictCount": 1,
    "channelConflictCount": 0,
    "oauthConflictCount": 0
  },
  "meaningfulDataScores": {
    "target": 3,
    "duplicate": 2
  }
}
```

`scalarConflicts` — compare/UI choice, не hard blocker. Meaningful data есть у обеих сторон, но
`shared_phone_both_have_meaningful_data` неприменим, потому что primary phone есть только у target.

### 2.3 Заявленный HTTP door сегодня

Сравнение фактических route-файлов:

```bash
git show main:apps/webapp/src/app/api/doctor/clients/merge-preview/route.ts | sed -n '1,180p'
sed -n '1,80p' apps/webapp/src/app/api/doctor/clients/merge-preview/route.ts
```

`main` содержит полный GET с `targetId`/`duplicateId`; текущий файл содержит:

```ts
/** Global patient merge preview is intentionally unavailable in U1. */
export async function GET() {
  const adminGate = await requireAdminApiContext();
  if (!adminGate.ok) return adminGate.response;
  return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
}
```

То есть утверждение brief «HTTP door today is GET ... preview» верно для `main`, но не для текущего
`feat/doctor-ui-rebuild`.

## 3. Счётчики и строки hard blockers

### 3.1 `dependentCounts`

Все числа из JSON выше получены одним SELECT:

```sql
WITH ids(side, subject_id) AS (
  VALUES
    ('target', '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid),
    ('duplicate', 'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid)
)
SELECT side,
  (SELECT COUNT(*) FROM patient_bookings WHERE platform_user_id = ids.subject_id) AS patient_bookings,
  (SELECT COUNT(*) FROM reminder_rules WHERE platform_user_id = ids.subject_id) AS reminder_rules,
  (SELECT COUNT(*) FROM support_conversations WHERE platform_user_id = ids.subject_id) AS support_conversations,
  (SELECT COUNT(*) FROM symptom_trackings WHERE platform_user_id = ids.subject_id OR user_id = ids.subject_id::text) AS symptom_trackings,
  (SELECT COUNT(*) FROM lfk_complexes WHERE platform_user_id = ids.subject_id OR user_id = ids.subject_id::text) AS lfk_complexes,
  (SELECT COUNT(*) FROM media_files WHERE uploaded_by = ids.subject_id) AS media_files_uploaded_by,
  (SELECT COUNT(*) FROM online_intake_requests WHERE user_id = ids.subject_id) AS online_intake_requests,
  (SELECT COUNT(*) FROM material_ratings WHERE user_id = ids.subject_id) AS material_ratings,
  (SELECT COUNT(*) FROM patient_content_rating_feedback WHERE user_id = ids.subject_id) AS patient_content_rating_feedback,
  (SELECT COUNT(*) FROM patient_practice_completions WHERE user_id = ids.subject_id) AS patient_practice_completions,
  (SELECT COUNT(*) FROM treatment_program_instances WHERE patient_user_id = ids.subject_id) AS treatment_program_instances,
  (SELECT COUNT(*) FROM program_action_log WHERE patient_user_id = ids.subject_id) AS program_action_log,
  (SELECT COUNT(*) FROM be_appointments WHERE platform_user_id = ids.subject_id) AS be_appointments,
  (SELECT COUNT(*) FROM platform_user_contacts WHERE platform_user_id = ids.subject_id) AS platform_user_contacts
FROM ids
ORDER BY side DESC;
```

Команда-оболочка для этого и следующих запросов:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -P pager=off
-- BEGIN READ ONLY; <query>; ROLLBACK;
```

### 3.2 Bindings / OAuth и конфликтные строки

Фактические bindings/OAuth:

```sql
SELECT user_id, channel_code, external_id, created_at
FROM user_channel_bindings
WHERE user_id IN (
  '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid,
  'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
)
ORDER BY user_id, channel_code;

SELECT user_id, provider, provider_user_id, email, created_at
FROM user_oauth_bindings
WHERE user_id IN (
  '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid,
  'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
)
ORDER BY user_id, provider;
```

Результат: у target `(2 rows)` (`max=222210566`, `telegram=321630058`), у duplicate bindings нет;
OAuth-запрос вернул `(0 rows)`. Поэтому channel/OAuth conflicts отсутствуют.

Ни один hard blocker не сработал, поэтому offending row ids нет. Это подтверждено не одним aggregate,
а точными row-producing запросами условий текущего preview:

```sql
-- active_bookings_time_overlap
SELECT pb1.id AS target_booking_id, pb1.status AS target_status,
       pb1.slot_start AS target_slot_start, pb1.slot_end AS target_slot_end,
       pb2.id AS duplicate_booking_id, pb2.status AS duplicate_status,
       pb2.slot_start AS duplicate_slot_start, pb2.slot_end AS duplicate_slot_end
FROM patient_bookings pb1
JOIN patient_bookings pb2
  ON pb1.platform_user_id = '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid
 AND pb2.platform_user_id = 'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
 AND pb1.id <> pb2.id
 AND tstzrange(pb1.slot_start, pb1.slot_end, '[)') && tstzrange(pb2.slot_start, pb2.slot_end, '[)')
 AND pb1.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed')
 AND pb2.status IN ('confirmed', 'rescheduled', 'creating', 'cancelling', 'cancel_failed');

-- active_lfk_template_conflict
SELECT a.id AS target_assignment_id, a.organization_id, a.template_id,
       a.is_active AS target_is_active,
       b.id AS duplicate_assignment_id, b.is_active AS duplicate_is_active
FROM patient_lfk_assignments a
JOIN patient_lfk_assignments b
  ON a.patient_user_id = '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid
 AND b.patient_user_id = 'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
 AND a.organization_id = b.organization_id
 AND a.template_id = b.template_id
 AND a.is_active = true
 AND b.is_active = true;

-- active_treatment_program_conflict
SELECT t.id AS target_program_id, t.status AS target_status,
       t.assignment_source AS target_assignment_source,
       d.id AS duplicate_program_id, d.status AS duplicate_status,
       d.assignment_source AS duplicate_assignment_source
FROM treatment_program_instances t
JOIN treatment_program_instances d
  ON t.patient_user_id = '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid
 AND d.patient_user_id = 'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
 AND t.status = 'active'
 AND d.status = 'active'
 AND t.assignment_source <> 'promo'
 AND d.assignment_source <> 'promo';

-- open_test_attempt_conflict
SELECT t.id AS target_attempt_id, t.instance_stage_item_id,
       t.submitted_at AS target_submitted_at,
       d.id AS duplicate_attempt_id, d.submitted_at AS duplicate_submitted_at
FROM test_attempts t
JOIN test_attempts d
  ON t.patient_user_id = '89ff45cf-caf6-4490-a4be-f66b9c5e87f3'::uuid
 AND d.patient_user_id = 'edb8b9cd-abea-4efa-bc0f-ca329ef522c8'::uuid
 AND t.submitted_at IS NULL
 AND d.submitted_at IS NULL
 AND t.instance_stage_item_id = d.instance_stage_item_id;
```

Каждый из четырёх запросов вернул `(0 rows)`. Alias blockers исключены исходным row-query
(`merged_into_id = null` у обеих). Shared-phone blocker исключён тем же row-query: target phone
`+79152345074`, duplicate phone `null`; scores `3` и `2`, полученные настоящим `countMeaningfulData`,
при разных/null phones blocker не создают.

## 4. `main` против `feat/doctor-ui-rebuild`

Точные сравниваемые refs:

```bash
git rev-parse main feat/doctor-ui-rebuild
```

```text
078a3dd8d0a395d121992ab46aeecbbd2414290c
eca920694aa8108c7100f0c50ffbe92137129750
```

Старое правило в `main`:

```bash
git grep -n -E \
  'different_non_null_integrator_user_id|integrator_canonical_merge_required|integrator_merge_status_unavailable|two different non-null integrator_user_id' \
  main -- apps/webapp/src/infra/platformUserMergePreview.ts \
  apps/webapp/src/app/api/api.md docs/ARCHITECTURE/PLATFORM_USER_MERGE.md \
  packages/platform-merge/src/pgPlatformUserMerge.ts
```

Существенный output:

```text
main:apps/webapp/src/infra/platformUserMergePreview.ts:71:  | "different_non_null_integrator_user_id"
main:apps/webapp/src/infra/platformUserMergePreview.ts:72:  | "integrator_canonical_merge_required"
main:apps/webapp/src/infra/platformUserMergePreview.ts:73:  | "integrator_merge_status_unavailable"
main:apps/webapp/src/infra/platformUserMergePreview.ts:336:        code: "different_non_null_integrator_user_id",
main:packages/platform-merge/src/pgPlatformUserMerge.ts:258:      throw new MergeConflictError("merge: two different non-null integrator_user_id", [targetId, duplicateId]);
```

Текущие допустимые blocker codes:

```bash
sed -n '60,82p' apps/webapp/src/infra/platformUserMergePreview.ts
```

```text
target_is_alias
duplicate_is_alias
active_bookings_time_overlap
active_lfk_template_conflict
active_treatment_program_conflict
open_test_attempt_conflict
shared_phone_both_have_meaningful_data
```

Удаление numeric identity и blocker локализуется так:

```bash
git log feat/doctor-ui-rebuild --date=iso \
  --format='%H %ad %s' -S'different_non_null_integrator_user_id' -- \
  apps/webapp/src/infra/platformUserMergePreview.ts \
  docs/ARCHITECTURE/PLATFORM_USER_MERGE.md apps/webapp/src/app/api/api.md
```

Первый removal-коммит в истории:

```text
31e5a01c8de2514c2c70008762f404d1bf3ade82 2026-08-28 15:01:46 +0300 wip(identity): salvage public identity cutover after agent interruption (#987)
```

Итоговый cleanup-коммит Track D:

```bash
git show --stat --oneline 67eb3b7874883eb22862f41aa5f597136d376d2e --
```

```text
67eb3b787 fix(identity): retire public integrator identity (#987)
95 files changed, 822 insertions(+), 2620 deletions(-)
```

`docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` в `feat` прямо фиксирует: Track D вытеснил публичную
числовую личность, поэтому `different_non_null_integrator_user_id`,
`integrator_canonical_merge_required`, `integrator_merge_status_unavailable`, feature flag и
integrator-merge route сняты. Фактические TEST-строки не активируют ни один из оставшихся blockers.

## Проверка после правки 13.09

Проверен commit `b4d2baf5801375b732d54dd5e90047fa9c9cf0e0` в текущем checkout. PROD не открывался и
не опрашивался. Временный Node entry получил один `PoolClient`, выполнил `BEGIN READ ONLY`, передал
его (как `Pick<Pool, 'query'>`) настоящему `buildMergePreview`, затем выполнил `ROLLBACK`; поэтому
все параллельные SELECT функции оставались в одном read-only transaction. Ни POST, merge, worker,
scheduler или отправка сообщений не запускались.

### Настоящий `buildMergePreview`

Команда (entrypoint импортирует `buildMergePreview` из текущего checkout, вызывает его для
`89ff45cf-caf6-4490-a4be-f66b9c5e87f3` / `edb8b9cd-abea-4efa-bc0f-ca329ef522c8` и печатает только
поля ниже):

```bash
NODE_PATH=/home/dev/dev-projects/BersonCareBot/apps/webapp/node_modules:/home/dev/dev-projects/BersonCareBot/node_modules \
  NODE_ENV=test /home/dev/dev-projects/BersonCareBot/apps/webapp/node_modules/.bin/esbuild \
  /tmp/bcb-kostyakov-preview.ts --bundle --platform=node --format=cjs --target=node22 \
  --tsconfig=apps/webapp/tsconfig.json --outfile=/tmp/bcb-kostyakov-preview.cjs && \
sudo -n -u postgres env NODE_ENV=test /usr/bin/node /tmp/bcb-kostyakov-preview.cjs
```

Verbatim результат требуемых полей:

```json
{
  "ok": true,
  "hardBlockers": [],
  "mergeAllowed": true,
  "v1MergeEngineCallable": true,
  "target": {
    "id": "89ff45cf-caf6-4490-a4be-f66b9c5e87f3",
    "email": null
  },
  "duplicate": {
    "id": "edb8b9cd-abea-4efa-bc0f-ca329ef522c8",
    "email": "dima190586@mail.ru"
  }
}
```

Это подтверждает, что fixed loader берёт почту из `user_contacts`: у одной стороны primary email
действительно отсутствует, у второй пришло фактическое значение, а не оба `null` из-за неверного
select. Ошибки `42703` нет.

Результат совпадает с прежним прямым вызовом `analyzeMergePreviewModel`: `hardBlockers: []`,
`mergeAllowed: true`, `v1MergeEngineCallable: true`. Расхождения по трём сравниваемым полям нет.

### Сверка SQL с фактической схемой TEST

Следующая команда сравнила каждую колонку, на которую ссылаются `loadPlatformUser`,
`countMeaningfulData`, `searchMergeCandidates`, `searchMergeUsersForManualMerge`, четыре счётчика
конфликтов и `countDependents`, с `information_schema.columns` в `bersoncarebot_test`:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test \
  -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
BEGIN READ ONLY;
WITH expected(table_name, column_name) AS (
  VALUES
    ('platform_users','id'),('platform_users','merged_into_id'),('platform_users','display_name'),('platform_users','first_name'),('platform_users','last_name'),('platform_users','patronymic'),('platform_users','role'),('platform_users','created_at'),('platform_users','updated_at'),('platform_users','is_blocked'),('platform_users','is_archived'),('platform_users','blocked_at'),('platform_users','blocked_reason'),('platform_users','blocked_by'),
    ('user_contacts','platform_user_id'),('user_contacts','value_normalized'),('user_contacts','confirmed_at'),('user_contacts','contact_kind'),('user_contacts','is_primary'),
    ('user_channel_bindings','user_id'),('user_channel_bindings','channel_code'),('user_channel_bindings','external_id'),('user_channel_bindings','created_at'),
    ('user_oauth_bindings','user_id'),('user_oauth_bindings','provider'),('user_oauth_bindings','provider_user_id'),('user_oauth_bindings','email'),('user_oauth_bindings','created_at'),
    ('user_identity','platform_user_id'),('user_identity','display_name'),('user_identity','first_name'),('user_identity','last_name'),
    ('patient_bookings','platform_user_id'),('patient_bookings','id'),('patient_bookings','slot_start'),('patient_bookings','slot_end'),('patient_bookings','status'),
    ('doctor_notes','user_id'),('online_intake_requests','user_id'),('symptom_trackings','platform_user_id'),('symptom_trackings','user_id'),('lfk_complexes','platform_user_id'),('lfk_complexes','user_id'),('patient_lfk_assignments','patient_user_id'),('patient_lfk_assignments','organization_id'),('patient_lfk_assignments','template_id'),('patient_lfk_assignments','is_active'),('message_log','platform_user_id'),('message_log','user_id'),
    ('reminder_rules','platform_user_id'),('support_conversations','platform_user_id'),('media_files','uploaded_by'),('material_ratings','user_id'),('patient_content_rating_feedback','user_id'),('patient_practice_completions','user_id'),('treatment_program_instances','patient_user_id'),('treatment_program_instances','status'),('treatment_program_instances','assignment_source'),('program_action_log','patient_user_id'),('be_appointments','platform_user_id'),('platform_user_contacts','platform_user_id'),('test_attempts','patient_user_id'),('test_attempts','submitted_at'),('test_attempts','instance_stage_item_id')
), missing AS (
  SELECT e.table_name, e.column_name
  FROM expected e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = e.table_name
   AND c.column_name = e.column_name
  WHERE c.column_name IS NULL
)
SELECT COALESCE(json_agg(json_build_object('table', table_name, 'column', column_name) ORDER BY table_name, column_name), '[]'::json) AS missing_columns
FROM missing;
ROLLBACK;
SQL
```

Результат:

```text
missing_columns
-----------------
[]
```

Следовательно, обращений к отсутствующим в текущей TEST-схеме колонкам в перечисленных запросах не
найдено; перечислять нечего. Это отдельная schema-introspection проверка, не вывод из успешного
прогона одной пары.

### Контракт новой GET-двери

Форма почти совпадает: `serializePreview` отдаёт все top-level поля, profiles, bindings,
`dependentCounts`, blockers и verdicts, которые ожидает `MergePreviewApiOk`.

Но контракт не точен для `patronymic`. `buildMergePreview` включает его в
`MergePreviewScalarFieldKey` и может вернуть его в `scalarConflicts` и `autoMergeScalars`; route
сериализует эти массивы без фильтра. В `accountMergeLogic.ts` оба API-типа разрешают только
`phone_normalized`, `display_name`, `first_name`, `last_name`, `email`, а
`ManualMergeResolution.fields` также не имеет `patronymic`. При паре с разными отчествами сервер
может вернуть поле, которое клиентский тип и `resolution.fields[c.field]` не представляют. Это
достижимое несоответствие формы, но по brief не исправлялось.
