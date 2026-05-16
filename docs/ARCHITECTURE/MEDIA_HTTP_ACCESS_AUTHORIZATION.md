# HTTP-доступ к файлам медиатеки: сессия, превью и отсутствие per-patient ACL

**Статус:** зафиксированный аудит кода (2026-05-06). Описывает текущее поведение webapp, без предписания целевой модели прав.

## Маршруты, которые отдают байты или presigned URL

| Маршрут | Минимальная проверка | Дополнительно |
|--------|----------------------|---------------|
| `GET /api/media/[id]` | Любая валидная сессия (`getCurrentSession`) | Строка `media_files` должна быть пригодна к чтению и иметь S3-ключ (`getMediaS3KeyForRedirect` и связанные правила статуса). |
| `GET /api/media/[id]/playback` | `assertMediaPlaybackAccess` — по сути **только непустая сессия** | Флаг `video_playback_api_enabled`; `resolveMediaPlaybackPayload` загружает строку и строит дескриптор (HLS / MP4 и т.д.). |
| `GET /api/media/[id]/hls/[[...path]]` | Та же сессия + тот же флаг `video_playback_api_enabled` | Потоковая отдача master/variant/сегментов из private bucket через webapp; `getMediaRowForPlayback` + `isTrustedHlsArtifactS3Key`. Сегменты с **`Range`** (206). Ошибки ответов прокси — в `media_hls_proxy_error_events` (не на каждый успешный байт). Без сессии — **401** + structured **`warn`** `hls_proxy_error` (`reasonCode: session_unauthorized`); без включённого playback API — **503** — эти два случая в таблицу телеметрии **не** пишутся (политика объёма). |
| `GET /api/media/[id]/preview/[size]` | Сессия | Превью по ключу (`getMediaPreviewS3KeyForRedirect`); при отсутствии превью — редирект на `GET /api/media/[id]`. |
| `POST /api/media/presign` | Роль с доступом врача/кабинета врача (`canAccessDoctor`) | Создание pending-записи для загрузки, не потоковое чтение. |

`/api/media/*` **не** входит в `patientRouteApiPolicy` / `PATIENT_BUSINESS_API_PREFIXES`: это общие маршруты Next, не поверхность `/api/patient/*`.

## Что не проверяется на уровне этих handlers

- Нет сопоставления `media_files.id` с пациентом, инстансом программы лечения, slug контента или назначением.
- Любой **аутентифицированный** пользователь с известным UUID может запросить те же endpoints, если строка в БД в «читаемом» состоянии: для MP4/poster — объект доступен по выданному presigned URL; для HLS master/сегментов — по **сессии webapp** и прокси **`/api/media/{id}/hls/...`** (без наследования presign query в относительных URI плейлистов).

Канонический комментарий в коде (точка расширения без размазывания проверок по роутам):

- `apps/webapp/src/modules/media/assertMediaPlaybackAccess.ts` — явно указано: та же планка, что у `GET /api/media/[id]`; «любая сессия»; зарезервировано для будущих scope (patient/doctor/content).

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

- `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md` — единый плеер и контракт playback JSON (включая использование в Markdown теле страниц).
- `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` — какие пункты этапа видны пациенту в UI.
- TTL presign и конфиг: `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`, слой `video_presign_ttl_seconds` / `getVideoPresignTtlSeconds` (см. код webapp).

## Post-prod

Отложенная проработка прав на видео/медиа — `docs/TODO.md` (раздел про авторизацию и права на видео).
