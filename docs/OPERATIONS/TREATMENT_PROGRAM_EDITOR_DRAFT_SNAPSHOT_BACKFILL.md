# Backfill: снимки пунктов программы (editor-batch draft preview)

## Симптом

В кабинете пациента упражнения из назначенной программы показываются **только как картинка** (превью), без видеоплеера — хотя в каталоге ЛФК у упражнения есть видео.

## Причина

Редактор назначенной программы (`InstanceEditorDraft` → `POST …/editor-batch`) до исправления сохранял в `treatment_program_instance_stage_items.snapshot` **preview-черновик из браузера**, а не канонический снимок каталога:

- упражнения: `mediaUrl: "/api/media/{uuid}/preview/sm"`, `mediaType: "image"` (поля `url` / `type` отсутствуют);
- рекомендации / тесты: `mediaUrl` только на preview URL.

Источник черновика: `treatmentProgramLibraryDraftSnapshot.ts` (`libraryRowToItemDraftSnapshot`) — только для UI preview редактора.

**Исправление в коде (после деплоя):** `applyInstanceEditorBatch` при `itemCreates` / replace вызывает `snapshots.buildSnapshot` — см. `instanceEditorBatchApply.ts`, тест `instanceEditorBatch.test.ts` («persist catalog buildSnapshot»).

Уже записанные в БД снимки **сами не чинятся** — нужен backfill ниже.

## Детектор битых снимков

`apps/webapp/src/modules/treatment-program/editorDraftSnapshotDetect.ts`:

| Тип | Признак |
|-----|---------|
| `exercise` | в `snapshot.media[]` есть `mediaUrl` или `mediaType` без `type`, либо URL с `/preview/sm` / `/preview/md` |
| `recommendation` | в `snapshot.media[]` у `mediaUrl` / `url` только preview path |
| `clinical_test` | то же в `snapshot.tests[].media[]` |

Тесты: `editorDraftSnapshotDetect.test.ts`.

SQL-префильтр для backfill: `EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE` (PostgreSQL jsonpath `@?`). Скрипт дополнительно проверяет строки в JS тем же детектором.

## Скрипт backfill

| | |
|--|--|
| Файл | `apps/webapp/scripts/backfill-treatment-program-editor-draft-snapshots.ts` |
| npm | `pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots` |
| Логика | SELECT только кандидатов (SQL + JS) → `buildSnapshot(itemType, itemRefId)` → `UPDATE snapshot` |
| По умолчанию | **dry-run** (без `UPDATE`) |

### Флаги

| Флаг | Назначение |
|------|------------|
| `--commit` | записать исправленные снимки в БД |
| `--since-days=N` | только инстансы с `treatment_program_instances.updated_at` за последние N суток |
| `--instance-id=UUID` | одна программа |
| `--limit=N` | максимум **кандидатов** за один батч (по умолчанию 5000); `LIMIT` после SQL-фильтра битых снимков |
| `--all` | обработать **все** кандидаты батчами по `--limit` (keyset по `ti.id`, без пропусков из-за LIMIT) |

### Production (copy-paste)

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
cd /opt/projects/bersoncarebot

# Dry-run: сколько кандидатов в БД (candidatesTotal)
pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots

# Недавно правленные программы
pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots -- --since-days=14

# Применить один батч (до --limit кандидатов, приоритет недавних инстансов)
pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots -- --commit

# Применить все кандидаты в БД
pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots -- --commit --all

# Одна программа
pnpm --dir apps/webapp run backfill-treatment-program-editor-draft-snapshots -- --commit --instance-id=<UUID>
```

Вывод JSON: `candidatesTotal`, `fetched`, `candidates`, `updated` / `wouldUpdate`, `unchanged`, `skipped`, `errors` (с `instanceId`, `itemType`, `itemRefId`).

**Пропуски (`skipped`):** обычно архивный или удалённый объект каталога — `buildSnapshot` не находит `item_ref_id`; снимок остаётся битым, нужна ручная правка программы.

### Проверка до / после (SQL)

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT ti.id, ti.item_type, snap->>'title' AS title, snap->'media' AS media
FROM public.treatment_program_instance_stage_items ti
JOIN public.treatment_program_instance_stages st ON st.id = ti.stage_id
JOIN public.treatment_program_instances inst ON inst.id = st.instance_id
WHERE ti.item_type = 'exercise'
  AND ti.snapshot::text LIKE '%preview/sm%'
  AND ti.snapshot::text LIKE '%mediaUrl%'
LIMIT 20;
"
```

После backfill у упражнений в `media` ожидаются поля **`url`** и **`type`** (например `"type": "video"`, `"url": "/api/media/{uuid}"`), не только `mediaUrl` на preview.

Пациенту после backfill достаточно заново открыть пункт программы.

## Стабильность сохранения черновика (2026-06-09)

Отдельно от snapshot backfill — исправления нестабильного **`POST …/editor-batch`** при редактировании **ещё не сохранённых** строк:

| Проблема | Решение |
|----------|---------|
| Патчи `localComment` / нагрузки / structural на `draft:` попадали в `itemPatches` → **404 «Элемент не найден»** | Клиент: fold в `itemCreates`; сервер: skip `draft:` в `itemPatches` / `itemStructuralPatches` |
| Устаревший baseline (второй таб / долгая сессия) | `saveDraft` → refresh baseline перед POST; при stale not-found — повторный sync + toast |
| Невалидная нагрузка (reps=0 и т.п.) | `instanceEditorLoadSettings.ts` — проверка до POST и в форме |
| DnD группы на строках разворота комплекса до save | per-line `groupId` / `status` в `itemCreates` expand lines |

Код: `treatment-program-shared/instanceEditorDraft.ts`, `InstanceEditorDraftContext.tsx`, `instanceEditorLoadSettings.ts`, `instanceEditorBatchApply.ts`. Тесты: `instanceEditorBatch.test.ts`, `InstanceEditorDraftContext.test.tsx`.

## Связанные файлы

- Канонический снимок: `pgTreatmentProgramItemSnapshot.ts` (`buildSnapshot`)
- Editor-batch apply: `instanceEditorBatchApply.ts`
- Preview-черновик (не для БД): `treatmentProgramLibraryDraftSnapshot.ts`
- Нагрузка / stale save: `instanceEditorLoadSettings.ts`
- HTTP status: `doctorInstanceRouteErrorStatus.ts`
- Пациентский UI: `PatientProgramStageItemPageClient.tsx` (`ModalMediaBlock` + `PatientMediaPlaybackVideo` при `type: video`)
