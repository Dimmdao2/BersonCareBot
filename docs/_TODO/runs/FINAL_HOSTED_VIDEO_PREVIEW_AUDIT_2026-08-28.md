# Независимый финальный аудит hosted-video preview и program-submission video

- Дата: 2026-08-28
- Ветка: `wt/final-hosted-preview-audit-20260828`
- Аудируемый SHA и SHA на TEST: `6f924fe1d98e03545bd47051a152f59d839a4718`

Authority:

- `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, этап 5;
- `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`, раздел «Превью для видео по ссылке»;
- более позднее решение владельца из brief: upload-door отсутствует для видео короче 10 секунд и для видео без
  измеренной длительности; 10 секунд и длиннее должны сохранить полный upload/worker/poster/playback path.

## Итог

| Пункт                                                | Вердикт     | Достижимый impact                                                                                                                          |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Одна preview-door для doctor/patient              | **PASS**    | Обхода, который мог бы вернуть provider thumbnail URL в браузер, не найдено.                                                               |
| 2. Hosted cover в private storage и terminal/retry   | **PASS**    | YouTube cover сохранён и отдаётся нашим URL; недоступный provider не остаётся вечным `pending`.                                            |
| 3. Одна lifecycle state machine и scheduler contract | **PASS**    | Single-PUT, hosted cover, multipart retry и delete не расходятся по конкурирующим cleanup-дверям.                                          |
| 4. Ошибка не пишет зелёный tick и сохраняет retry    | **PASS**    | Preview/purge failure остаётся видимым и повторяемым, retry identity не теряется.                                                          |
| 5. Граница 10 секунд и poster/HLS                    | **PASS**    | `9.6` и missing duration отвергаются до upload; `10`/`12` разрешены; policy не округляет исходную длительность.                            |
| 6. TEST runtime/evidence                             | **PASS**    | Текущий SHA, четыре runtime-unit, scheduler, worker ticks и накопленные строки проверены.                                                  |
| VK live                                              | **BLOCKED** | На TEST нет внешнего `vk_video_service_token` с `video` scope; живое получение VK-cover выполнить нельзя. YouTube/local path не затронуты. |

**FAIL: нет.**

**BLOCKED: только живая VK-проверка из-за внешней конфигурации.** Код читает именно
`vk_video_service_token`; community token не подставляется. Missing/rejected token остаётся retryable, а bounded
worker после исчерпания попыток переводит строку в `failed`, поэтому блокировка не маскирует продуктовый дефект.

## До чтения тестов: «тест или взгляд» и blind kill-set

Разовое состояние, которое нельзя честно заменить unit-тестом:

- deployed SHA, host identity, active units и установленный scheduler на TEST;
- текущие job ticks и состояние накопленных `pending`/`pending_delete`/hosted-cover rows;
- наличие внешнего VK service token;
- браузерный network evidence owner-role walkthrough.

Повторяемое поведение, которое должно краснеть автоматически:

- единый mapper возвращает только `/api/media/.../preview/...`;
- permanent provider failure становится terminal, transient failure ограничен retry budget;
- purge/multipart сохраняют identity и не подтверждают непроизошедшее удаление;
- route failure не пишет success tick;
- upload-door применяет точную границу до создания upload;
- poster extraction пробует кадр `@0s`, если `@1s` не создал файл, и не принимает пустой результат.

Blind kill-set был записан до открытия существующих тестов. Все временные поломки внесены по одной, проверены и
откачены; продуктовый код после инъекций не изменён.

| Инъекция                                                                      | Проверка                                                                                               | Красный результат                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Doctor mapper возвращает hosted source URL вместо нашего preview URL          | `pnpm --dir apps/webapp exec vitest run src/shared/ui/hostedVideoSlot.ui.test.tsx`                     | `1 failed, 11 passed`: ожидался `/api/media/.../preview/sm`, получен YouTube URL. |
| Permanent hosted error перестаёт распознаваться                               | `pnpm --dir apps/webapp exec vitest run src/infra/repos/mediaPreviewWorker.unit.test.ts`               | `1 failed, 7 passed`: удалённый ролик не перешёл в terminal `skipped`.            |
| `NoSuchMultipartUpload` перестаёт завершать cleanup как идемпотентный success | `pnpm --dir apps/webapp exec vitest run src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts`         | `1 failed, 13 passed`: retry не завершил ту же identity.                          |
| Preview route принудительно пишет `success` при `errors > 0`                  | `pnpm --dir apps/webapp exec vitest run src/app/api/internal/media-preview/process/route.unit.test.ts` | `1 failed, 1 passed`: ожидался HTTP 500, получен 200.                             |
| Worker сначала округляет duration (`Math.round`) и потом применяет policy     | `pnpm --dir apps/media-worker exec vitest run src/programSubmissionVideoPolicy.test.ts`                | `1 failed`: `9.999` ошибочно стало допустимым.                                    |
| Poster helper теряет fallback `@0s`                                           | `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/extractPosterWithFallback.unit.test.ts`       | `2 failed`: fallback не вызван и terminal error остался на `@1s`.                 |
| API допускает missing duration                                                | `pnpm --dir apps/webapp exec vitest run src/modules/media/uploadDoorAcceptance.route.test.ts`          | `1 failed, 27 passed`: ожидался HTTP 400, получен 200.                            |
| API допускает `9.6` секунды                                                   | `pnpm --dir apps/webapp exec vitest run src/modules/media/uploadDoorAcceptance.route.test.ts`          | `1 failed, 27 passed`: ожидался HTTP 400, получен 200.                            |

Непойманных классов из blind kill-set: `0`; это результат перечисленных выше восьми независимых mutation-прогонов,
а не число из прежнего отчёта.

## 1. Единая production preview-door — PASS

`apps/webapp/src/infra/repos/catalogMediaLadderLookup.ts` принимает сохранённый media URL и единолично различает
наш `/api/media/{uuid}`, канонический hosted URL и отсутствие preview row. Для ready row он строит только
`mediaPreviewUrlById(id, 'sm'|'md')`; provider URL из lookup не возвращается. Той же дверью пользуются
`pgLfkExercises`, `pgTreatmentProgramInstance`, `pgRecommendations`, `pgTreatmentProgram` и
`pgTreatmentProgramItemSnapshot`, то есть doctor и patient получают одни ladder facts.

Пустой результат по обходам доказывался сначала code-search, затем точными запросами:

```bash
node /home/dev/brain/tools/code-search.mjs "hosted video preview doctor patient ladder thumbnail URL" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "catalogMediaLadderLookup callers hosted preview" --repo bcb -k 20
rg -n --glob '!**/*.test.*' "catalogMediaLadderLookup\(" apps/webapp/src
rg -n --glob '!**/*.test.*' "parseMediaFileIdFromAppUrl|parseApiMediaIdFromPlayableUrl" \
  apps/webapp/src/app apps/webapp/src/shared/ui apps/webapp/src/infra/repos
rg -n --glob '!**/*.test.*' -i "left join media_files|leftJoin\(mediaFiles" \
  apps/webapp/src/app apps/webapp/src/shared/ui apps/webapp/src/infra/repos
rg -n --glob '!**/*.test.*' -i \
  "https?://[^\"']*(youtube|youtu\.be|ytimg|vk\.com|vkvideo|vimeo)" \
  apps/webapp/src/app apps/webapp/src/shared/ui apps/webapp/src/infra/repos
```

Exact matches вне ladder оказались OAuth/placeholder либо другими media-модулями; второго hosted-thumbnail
JOIN/parser path в scoped production UI/repos нет. Обратные ссылки сверены в двух authority plans, callers и
background-job manifest/CLI.

## 2. Hosted cover storage и terminal/retry — PASS

`shared/lib/hostedVideoThumbnail.ts` получает bytes на сервере, проверяет redirects/SSRF и нормализует provider
response. `pgLfkExercises` транзакционно создаёт/переиспользует одну `media_files` row на
`organization_id + canonical URL` с `usage_purpose='hosted_video_preview'`. `mediaPreviewWorker` перекодирует её
тем же image rendition pipeline в private `s3_key`, `preview_sm_key`, `preview_md_key`; UI видит только наш media
preview endpoint.

Permanent private/deleted/unsupported error входит в `PERMANENT_ERROR_PATTERNS` и становится `skipped`.
Transient network/token/provider error идёт через общий retry; `MAX_PREVIEW_ATTEMPTS = 5`, затем `failed`. Это
проверено зелёными worker/redirect tests и красной permanent-classification инъекцией выше.

TEST read-only query на текущем SHA показал:

```text
hosted_rows=1
ready_in_our_storage=1
youtube_ready_created_at=2026-08-28 02:22:15.991609+03
```

Числа получены одним rollback-only запросом:

```sql
BEGIN READ ONLY;
SELECT count(*) AS hosted_rows,
       count(*) FILTER (
         WHERE preview_status='ready'
           AND s3_key IS NOT NULL
           AND preview_sm_key IS NOT NULL
           AND preview_md_key IS NOT NULL
           AND standard_rendition_at IS NOT NULL
       ) AS ready_in_our_storage,
       min(created_at) FILTER (
         WHERE hosted_video_source_url LIKE '%youtube%'
           AND preview_status='ready'
       ) AS youtube_ready_created_at
FROM media_files
WHERE usage_purpose='hosted_video_preview';
ROLLBACK;
```

Команда подключения: `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test
-v ON_ERROR_STOP=1`. Никаких строк для аудита не создавалось.

## 3. Один lifecycle/scheduler contract — PASS

Корневая DB-door одна:
`app.process_media_pending_delete_step(text,uuid,integer,uuid)`. Её реализация и типизированный вызов покрывают
staged single-PUT без session, hosted cover, multipart session identity/retry и normal pending-delete в одном
leased/CAS contract. Удалённая одноразовая hosted cleanup function отсутствует; отдельного hosted cron нет.

Registry proof:

```bash
rg -n "process_media_pending_delete_step|media_preview|media_purge|media_multipart|media_transcode_reconcile" \
  apps/webapp/db apps/webapp/src deploy packages apps/media-worker
node /opt/projects/bersoncarebot-test/deploy/host/background-jobs-cli.mjs --verify-installed --env test
node /opt/projects/bersoncarebot-test/deploy/host/background-jobs-cli.mjs --list --env test \
  | rg 'media_(purge|multipart|preview|transcode_reconcile)'
```

Результат: installed scheduler verified; `media_purge` и `media_preview` каждую минуту,
`media_multipart`/`media_transcode_reconcile` каждые 10 минут. Это существующие четыре назначения manifest, не
новый одноразовый cron.

Read-only backlog query:

```sql
SELECT count(*) FILTER (
         WHERE m.status='pending'
           AND m.created_at < now() - interval '1 day'
           AND NOT EXISTS (SELECT 1 FROM media_upload_sessions s WHERE s.media_id=m.id)
       ) AS stale_single_put_without_session,
       count(*) FILTER (WHERE m.status IN ('pending_delete','deleting')) AS pending_delete_rows
FROM media_files m;
```

Результат: `stale_single_put_without_session=0`, `pending_delete_rows=0`. Старых необъяснённых строк на момент
аудита нет.

## 4. Tick/retry failure contract — PASS

Preview process route и purge route возвращают non-2xx и пишут error tick при batch/DB/S3 failure; terminal
hosted skip остаётся нормальным обработанным исходом. Multipart retry сохраняет исходные media/session/upload
identity; `NoSuchMultipartUpload` считается идемпотентно завершённым remote abort, но DB completion всё равно
обязателен. Красные инъекции route success и multipart identity выше доказали, что тесты действительно держат
эти границы.

TEST operator ticks измерены запросом:

```sql
SELECT job_key,last_status,last_finished_at,meta_json
FROM operator_job_status
WHERE job_key IN (
  'media.multipart.cleanup',
  'media.pending_delete.purge',
  'media.preview.process'
)
ORDER BY job_key;
```

Результат:

```text
media.multipart.cleanup     success  2026-08-28 11:40:01.860+03  {"errors":0,"cleaned":0}
media.pending_delete.purge  success  2026-08-28 11:43:01.584+03  {"errors":0,"removed":0}
media.preview.process       success  2026-08-28 11:43:01.596+03  {"errors":0,"processed":0}
```

## 5. Duration boundary и poster/playback — PASS

Browser helper сначала читает metadata duration и не вызывает presign при missing либо `<10`. Серверный presign
повторяет gate до создания media/upload session. Тест API теперь использует требуемое точное значение `9.6`;
missing duration также даёт HTTP 400, `12` даёт upload door. Worker policy принимает `10` и `60`, отвергает
`9.999` и использует raw `sourceDurationSeconds`; округление вызывается только для значения, передаваемого в
`doneProgram` после успешной обработки.

`processProgramSubmissionTranscodeJob` и обычный `processTranscodeJob` вызывают один
`extractPosterWithFallback`. Новый behavioral test доказал `@1s -> @0s` при отсутствующем poster и fail-loud при
двух пустых результатах. Обычный HLS path продолжает тем же helper записывать poster, затем вызывает `doneHls`;
import/type contract подтверждён media-worker typecheck.

## 6. TEST runtime и browser evidence — PASS

Host identity и deployment:

```bash
hostname
ip -4 -brief address show scope global
git -C /opt/projects/bersoncarebot-test rev-parse HEAD
systemctl is-active bersoncarebot-{api,scheduler,webapp,media-worker}-test.service
systemctl show \
  bersoncarebot-api-test.service \
  bersoncarebot-scheduler-test.service \
  bersoncarebot-webapp-test.service \
  bersoncarebot-media-worker-test.service \
  --property=Id,ActiveEnterTimestamp,NRestarts --no-pager
curl --fail --silent --show-error -H 'Host: test.bersoncare.ru' \
  http://127.0.0.1:6300/api/health
```

Результат: host имеет TEST/DEV address `151.241.228.122`; deployed SHA равен аудируемому
`6f924fe1d98e03545bd47051a152f59d839a4718`; API, scheduler, webapp и media-worker — `active`; API health —
`{"ok":true,"db":"up"}`. Media-worker имел `NRestarts=1` во время выкатки, после чего журнал содержит
`2026-08-28T11:09:06+03:00 ... "media-worker started"`; после старта fatal/error не найден, минутные ticks выше
зелёные. Это наблюдение без текущего impact, не finding.

YouTube browser evidence не подменялось новым сиротским упражнением. Канонический same-day owner walkthrough в
`OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md:768-773` уже доказал штатными owner-ролями: server worker сохранил
cover, наш `/api/media/{id}/preview/sm` ответил `200`, doctor и patient получили картинку, в обоих network logs
нет `youtube`/`ytimg`/`vk` image requests, повторный patient pass не имел console/network errors; временная ступень
удалена продуктовым путём. Действующая DB row остаётся `ready_in_our_storage=1` на текущем SHA. Текущий static
проход заново не обнаружил provider URL в preview ladder; сам `catalogMediaLadderLookup` и hosted resolver между
walkthrough SHA `206be5478` и текущим SHA не менялись. Поэтому условие brief «evidence свежий либо повторён»
выполнено свежим evidence от 28.08 без создания новых данных.

Повтор browser walkthrough не выполнен: запуск `/home/dev/brain/host-orch/shot.mjs` падает до открытия браузера с
`ERR_MODULE_NOT_FOUND: playwright-core`. Это не мешает acceptance, потому что same-day evidence уже есть; из этой
ошибки не выводился ни продуктовый FAIL, ни новая работа.

VK live остаётся **BLOCKED**. Наличие настройки измерено тем же read-only/rollback-only сеансом:

```sql
SELECT count(*) AS vk_setting_rows,
       count(*) FILTER (
         WHERE jsonb_typeof(value_json->'value')='string'
           AND btrim(value_json->>'value')<>''
       ) AS vk_nonempty_rows
FROM system_settings
WHERE key='vk_video_service_token'
  AND scope='admin'
  AND organization_id IS NULL;
```

Результат: `vk_setting_rows=0`, `vk_nonempty_rows=0`. Секрет не читался и не печатался. Достижимый impact ровно
один: TEST не может выполнить live `video.get` и сохранить VK cover до выдачи владельцем внешнего service token с
`video` scope. Community token код не использует; отсутствие внешней настройки не объявлено продуктовым FAIL.

## Зелёные проверки

```bash
pnpm --dir apps/webapp exec vitest run \
  src/infra/repos/catalogMediaLadderLookup.unit.test.ts \
  src/shared/lib/hostedVideoThumbnail.unit.test.ts \
  src/shared/lib/hostedVideoThumbnailRedirect.acceptance.test.ts \
  src/infra/repos/pgLfkExercisesHostedCover.unit.test.ts \
  src/infra/repos/mediaPreviewWorker.unit.test.ts \
  src/shared/ui/hostedVideoSlot.ui.test.tsx \
  src/app/api/internal/media-preview/process/route.unit.test.ts \
  src/app/api/internal/media-pending-delete/purge/route.unit.test.ts \
  src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts \
  src/modules/media/uploadDoorAcceptance.route.test.ts
```

Результат: `10 passed` test files, `107 passed` tests.

```bash
pnpm --dir apps/media-worker exec vitest run \
  src/programSubmissionVideoPolicy.test.ts \
  src/ffmpeg/probeVideoDurationSeconds.unit.test.ts \
  src/ffmpeg/extractPosterWithFallback.unit.test.ts
```

Результат: `3 passed` test files, `4 passed` tests.

```bash
pnpm --dir apps/media-worker run typecheck
pnpm exec eslint apps/media-worker/src/ffmpeg/extractPosterWithFallback.unit.test.ts
git diff --check
```

Результат: все команды завершились с exit code `0`. Изменённый webapp route test компилировался и выполнялся
Vitest; root ESLint pattern его игнорирует, поэтому отдельный ESLint PASS для этого файла не заявляется. Полный
`pnpm run ci` не запускался по прямому запрету brief.

## Изменения аудита и границы

- Добавлен недостающий behavioral test
  `apps/media-worker/src/ffmpeg/extractPosterWithFallback.unit.test.ts`.
- В `apps/webapp/src/modules/media/uploadDoorAcceptance.route.test.ts` граничное short-video значение уточнено с
  `9.5` до дословно требуемого владельцем `9.6`.
- Product fix не делался. Все mutation-инъекции откатаны.
- TEST использовался read-only; временные данные не создавались, cleanup не требовался.
- PROD `135.106.162.170` и production domains не трогались.
