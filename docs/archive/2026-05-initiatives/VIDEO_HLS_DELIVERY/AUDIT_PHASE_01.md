# AUDIT — VIDEO_HLS_DELIVERY Phase 01 (Data model & dual-delivery foundation)

**Дата аудита:** 2026-05-03  
**Объект:** реализация phase-01 после мержа кода (миграция `0018`, схема Drizzle, `MediaRecord`, `s3MediaStorage` list/getById, парсеры `videoHlsFields`).

**Источники проверки:**  
`apps/webapp/db/drizzle-migrations/0018_media_files_hls_foundation.sql`, `apps/webapp/db/schema/schema.ts`, `apps/webapp/src/infra/repos/s3MediaStorage.ts`, `apps/webapp/src/app/api/media/[id]/route.ts`, `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/02-target-architecture.md`, `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-03-storage-layout-and-artifact-management.md`, `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md`.

---

## Вердикт

**PASS.** Блокирующих дефектов по четырём пунктам запроса не выявлено. Замечания **minor** из первоначального аудита закрыты **FIX 2026-05-03** (см. конец файла).

---

## 1) Миграции additive и безопасны для отката кода

**Проверено**

- `0018_media_files_hls_foundation.sql` только **ADD COLUMN** (nullable), **CREATE INDEX**, **ADD CONSTRAINT** CHECK. Нет backfill данных, нет `UPDATE` массовых, нет `NOT NULL DEFAULT` на больших таблицах.
- Откат **кода** без отката БД: новые колонки nullable и не участвуют в INSERT текущих потоков загрузки → старый билд с прежними `SELECT` по явному списку колонок продолжит работать при уже применённой миграции (если не деплоить новый код, который в SELECT тянет новые поля — см. ниже).

**Риск (операционный, не дефект реализации)**

- Новый код в `getById` / `list` **расширяет SELECT** новыми колонками. Деплой такого билда **без** применённой миграции приведёт к ошибке SQL (`column does not exist`). Это ожидаемый forward-only контракт: **сначала миграция, затем (или одновременно) приложение.**

**Severity:** не кодовый critical; зафиксировать в runbook деплоя (minor / ops).

---

## 2) MP4 path не изменён функционально

**Проверено**

- `GET /api/media/[id]` (`apps/webapp/src/app/api/media/[id]/route.ts`) по-прежнему резолвит объект через `getMediaS3KeyForRedirect(id)` → в `s3MediaStorage.ts` это **`SELECT s3_key FROM media_files WHERE …`** без использования HLS-полей.
- `getUrl` в порте хранилища — тот же паттерн `SELECT s3_key`.
- Новые поля используются только в **list** и **getById** для метаданных библиотеки/детали файла.

**Вывод:** поведение выдачи MP4 по presigned redirect **не изменено** логикой phase-01.

---

## 3) Новые поля/типы согласованы с целевой архитектурой phase-02/03

**Согласовано**

| Цель (02/03 / phase-01) | Реализация |
|-------------------------|------------|
| `media_files` + ключи master / prefix / poster | `hls_master_playlist_s3_key`, `hls_artifact_prefix`, `poster_s3_key` |
| Статус обработки / ошибка | `video_processing_status`, `video_processing_error` |
| Длительность, лестница качеств | `video_duration_seconds`, `available_qualities_json` |
| Override режима выдачи | `video_delivery_override` (`mp4` / `hls` / `auto`) |
| Индекс для выборки video / backfill | `idx_media_files_video_processing_status` с фильтром `mime_type ~~ 'video/%'` |
| Source MP4 остаётся в `s3_key` | Не дублировали `video_source_s3_key` (как допускало phase-01) |

**Расхождение документации (не блокер phase-01)**

- ~~В `02-target-architecture.md` §5 и диаграмме встречаются формулировки вроде `hls_ready` / `pending_transcode`~~ — **снято** FIX 2026-05-03: документ и диаграмма приведены к канону миграции `0018`.

**Severity:** ~~**minor**~~ — закрыто.

---

## 4) Тесты и проверки фазы реально выполнены

**Проверено по артефактам**

- В `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md` зафиксирован прогон `pnpm lint`, `typecheck`, `test` в `apps/webapp` со статусом успеха на окружении исполнителя.
- Добавлен целевой unit-файл `apps/webapp/src/modules/media/videoHlsFields.test.ts`.

**Ограничение аудита**

- ~~Повторный полный прогон CI…~~ — для phase-01 FIX выполнен целевой прогон webapp (см. execution-log).

**Severity:** ~~**minor**~~ — закрыто записью в `06-execution-log.md`.

---

## MANDATORY FIX INSTRUCTIONS

### Critical

- **Нет.** Условия phase-01 (additive DDL, MP4 путь, согласование полей с дорожкой HLS) выполнены.

### Major

- **Нет.** Нет обнаруженных нарушений изоляции слоёв или изменения контракта `GET /api/media/[id]` для выдачи объекта.

### Minor

1. **Словарь статусов vs `02-target-architecture.md`**  
   ~~**Действие:** перед реализацией записи статусов в phase-02 выбрать канон…~~  
   **Статус:** **CLOSED** (2026-05-03) — канон = CHECK БД; `02-target-architecture.md` обновлён.

2. **Порядок деплоя**  
   ~~**Действие:** в runbook…~~  
   **Статус:** **CLOSED** (2026-05-03) — `deploy/HOST_DEPLOY_README.md`.

3. **Доказательство тестов перед merge**  
   ~~**Действие:** перед merge выполнить…~~  
   **Статус:** **CLOSED** (2026-05-03) — см. `06-execution-log.md`.

---

## Закрытие аудита

| Пункт запроса | Статус |
|---------------|--------|
| 1 Additive / откат кода | OK (с ops-оговоркой порядка migrate vs deploy) |
| 2 MP4 path | OK |
| 3 Согласование с 02/03 | OK, документ 02 выровнен с миграцией 0018 (FIX 2026-05-03) |
| 4 Тесты выполнены | OK, повторный прогон зафиксирован в execution-log (FIX 2026-05-03) |

**Gate phase-02:** открыт: словарь `video_processing_status` согласован с БД и `02-target-architecture.md` (см. **FIX 2026-05-03**); порядок migrate задокументирован в `deploy/HOST_DEPLOY_README.md`.

---

## FIX 2026-05-03 (закрытие MANDATORY FIX INSTRUCTIONS)

**Critical / Major:** отсутствовали — без изменений.

**Minor — статус:**

1. **Словарь статусов** — **исправлено:** `02-target-architecture.md` §5 и диаграмма в §2 приведены к канону БД (`none | pending | processing | ready | failed`); `ready` явно трактуется как готовность HLS (бывший эскиз `hls_ready`).
2. **Порядок деплоя** — **исправлено:** абзац в `deploy/HOST_DEPLOY_README.md` (после «Pre/post migrate checklist») про Drizzle `migrate` до/вместе с билдом, расширяющим `SELECT` по `media_files`.
3. **Доказательство тестов** — **выполнено:** повторный прогон `pnpm --dir apps/webapp lint`, `typecheck`, `test` зафиксирован в `06-execution-log.md`.

**MP4 path (регрессия):** повторно проверено: `GET /api/media/[id]` использует только `getMediaS3KeyForRedirect` → `SELECT s3_key` без HLS-колонок; изменений коду не требовалось.
