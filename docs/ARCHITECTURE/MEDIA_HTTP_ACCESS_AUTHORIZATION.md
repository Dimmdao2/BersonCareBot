# HTTP-доступ к файлам медиатеки: сессия, organization scope и submission ACL

**Статус:** зафиксированный аудит кода (2026-05-06, доп. 2026-05-30 — submission ACL; 2026-07-19 —
organization isolation). Описывает текущее поведение webapp.

## Маршруты, которые отдают байты или presigned URL

| Маршрут                               | Минимальная проверка                                                                                             | Дополнительно                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/media/[id]`                 | Валидная doctor workspace либо активная patient organization + `assertMediaPlaybackAccess` с `getMediaAccessRow` | Любое медиа сначала ограничено точным совпадением `media_files.organization_id`; для `usage_purpose=program_item_submission` затем действует дополнительный uploader/doctor/admin ACL внутри той же организации ([`programSubmissionPlaybackAccess.ts`](../../apps/webapp/src/modules/media/programSubmissionPlaybackAccess.ts)).                                                                                                                                          |
| `GET /api/media/[id]/playback`        | `assertMediaPlaybackAccess` + access row                                                                         | Флаг `video_playback_api_enabled`; для submission — progressive MP4 only (без HLS). Stats skip для submission.                                                                                                                                                                                                                                                                                                                                                             |
| `GET /api/media/[id]/hls/[[...path]]` | Сессия + `assertMediaPlaybackAccess` + access row + `video_playback_api_enabled`                                 | Потоковая отдача master/variant/сегментов из private bucket через webapp; `getMediaRowForPlayback` + `isTrustedHlsArtifactS3Key`. Сегменты с **`Range`** (206). Ошибки ответов прокси — в `media_hls_proxy_error_events` (не на каждый успешный байт). Без сессии — **401** + structured **`warn`** `hls_proxy_error` (`reasonCode: session_unauthorized`); без включённого playback API — **503** — эти два случая в таблицу телеметрии **не** пишутся (политика объёма). |
| `GET /api/media/[id]/preview/[size]`  | Валидная doctor workspace либо активная patient organization                                                     | Превью использует тот же organization/submission access row; при отсутствии превью — редирект на `GET /api/media/[id]`.                                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/media/presign`             | Валидная doctor workspace                                                                                        | Создание pending-записи сразу штампует `organization_id`; это не потоковое чтение.                                                                                                                                                                                                                                                                                                                                                                                         |

`/api/media/*` **не** входит в `patientRouteApiPolicy` / `PATIENT_BUSINESS_API_PREFIXES`: это общие маршруты Next, не поверхность `/api/patient/*`.

## Organization ownership CMS / каталога

- Для **всех** строк, включая `program_item_submission`, list/search/count/folders/picker/direct metadata/preview/
  playback ограничены точным текущим `organization_id`, полученным из doctor workspace либо активной patient
  organization. Тип файла не может обходить organization predicate.
- Знание UUID файла другой организации не даёт доступ: route возвращает `404` до выдачи bytes или presigned URL.
- Это organization ACL, а не отдельная per-patient модель внутри одной организации. Более узкая привязка к
  конкретному пациенту/инстансу остаётся только у специальных типов файлов, включая `program_item_submission`.

## Исключение: `program_item_submission` (контрольные фото/видео пациента)

- Колонка `media_files.usage_purpose = 'program_item_submission'`.
- Patient upload: scoped API `/api/patient/media/program-submission/*` (не `/api/media/upload`).
- Patient presign сразу штампует текущий `organization_id`; legacy-строки уже backfilled миграцией `0152`.
- Playback / redirect / HLS proxy: репозиторий сначала требует ту же организацию, затем
  [`canAccessProgramSubmissionMedia`](../../apps/webapp/src/modules/media/programSubmissionPlaybackAccess.ts)
  разрешает **uploader** (patient) либо **doctor/admin** этой организации; другая организация не получает строку,
  чужой patient session внутри организации → **401**.
- Transcode: 480p progressive MP4, poster.jpg, без HLS; исходник удаляется после успеха.
- Не учитывается в `recordPlaybackResolutionStat` / material-ratings.
- Инициатива: [`docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md`](../archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md).

Канонический комментарий в коде:

- `apps/webapp/src/modules/media/assertMediaPlaybackAccess.ts` — session + optional access row; submission ACL через `canAccessProgramSubmissionMedia`.

## HLS: почему master нельзя отдавать одним presigned URL

Плейлист master содержит **относительные** URI вариантов (например `720p/index.m3u8`). Браузер разрешает их относительно URL master; query-параметры presigned **не** наследуются дочерними относительными путями, поэтому цепочка уходит на прямой MinIO без подписи → **403**. Same-origin **`/api/media/{id}/hls/master.m3u8`** удерживает всю цепочку за авторизованным webapp.

## Где для пациента действует другой слой (скрытие ссылки, не байты)

Эти места решают, **показывать ли** страницу или элемент с `mediaUrl`, но **не** подменяют проверку при прямом обращении к `/api/media/...`:

- **Контент по slug** (`/app/patient/content/[slug]`): `requiresAuth` → `resolvePatientCanViewAuthOnlyContent`; при необходимости `patientRscPersonalDataGate`; RSC может заранее вызвать `resolveMediaPlaybackPayload` только при наличии сессии — это удобство и согласованность с playback API, а не ACL на UUID.
- **Markdown тела страницы (`body_md`):** на клиенте для ссылок на `/api/media/{uuid}` выполняется тот же **`GET /api/media/{id}/playback`** с cookie-сессией; без сессии или при ошибке пользователь видит обычную ссылку, а не встроенный плеер ([`MarkdownEmbeddedLink.tsx`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx)).
- **Программа лечения (пациент):** загрузка данных через `getInstanceForPatient(userId, instanceId)` — пациент не получает чужой инстанс в UI; видимость пунктов этапа — `stage-semantics` и `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`. Плеер в модалке (`PatientProgramStageItemModal`) использует тот же `/api/media/...`, если UUID утечёл вне этого контекста.

## Исключение по смыслу «владение файлом» (не поток каталога)

- `POST /api/patient/online-intake/lfk` валидирует `attachmentFileIds` как файлы, принадлежащие пациенту (`ATTACHMENT_FILE_FORBIDDEN` и т.д.) — это **вложения к заявке**, не общая модель авторизации видео из CMS или программы.

## Связанные документы

- `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md` — единый плеер и контракт playback JSON (включая Markdown-тело страниц; формат доставки vs выбор разрешения при `hls.js`).
- `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` — какие пункты этапа видны пациенту в UI.
- TTL presign и конфиг: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`, слой `video_presign_ttl_seconds` / `getVideoPresignTtlSeconds` (см. код webapp).

## Post-prod

Отложенная проработка прав на видео/медиа — `docs/TODO.md` (раздел про авторизацию и права на видео).
