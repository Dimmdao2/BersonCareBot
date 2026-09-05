# Пациентское видео: единый плеер (HLS / progressive)

## Компонент

- **`PatientMediaPlaybackVideo`** — `apps/webapp/src/shared/ui/media/PatientMediaPlaybackVideo.tsx`.
- Совместимое имя на странице контента: **`PatientContentAdaptiveVideo`** реэкспортирует тот же компонент из `app/app/patient/content/[slug]/PatientContentAdaptiveVideo.tsx`.

Все новые сценарии воспроизведения **файлового** видео в кабинете пациента должны подключать **`PatientMediaPlaybackVideo`**, а не «голый» `<video>` с произвольным `src` / `<source>`.

## Источник: решает медиа, не настройка

1. Канонический контракт — **`GET /api/media/[id]/playback`** (включается флагом `video_playback_api_enabled` в `system_settings`, переключатель — `/app/doctor/admin/app-settings` → блок «Воспроизведение видео»; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` и описание API в `apps/webapp/src/app/api/api.md`).
2. Маршрут выводится из самой строки медиа, а не из настройки:
   - не видео → `delivery: 'file'`, `progressive` = `/api/media/{id}`;
   - видео с **готовым** HLS (`video_processing_status = 'ready'` и доверенный master) → `delivery: 'hls'`, **`progressive: null`**;
   - видео **без** готового HLS → `delivery: 'mp4'`, `progressive` = `/api/media/{id}`.
3. **MP4-fallback после готового HLS нет и быть не может:** транскод удаляет исходный объект `media_files.s3_key` сразу после успешной сборки HLS, поэтому «запасной» MP4 указывал бы на удалённый объект. При фатальной ошибке HLS плеер делает **одно** обновление playback JSON (на случай истёкшего presigned) и, если это не помогло, показывает штатную ошибку с кнопкой «Повторить».
4. Переключателей стратегии выдачи (`mp4` / `hls` / `auto`) не существует: ни глобальной настройки, ни per-file override, ни `?prefer=` для админа.

## Поток HLS

Master и сегменты запрашиваются с **того же origin**, что и webapp: **`GET /api/media/{id}/hls/...`** (сессионная авторизация). Presigned URL используются для **постера** (если есть) и для **progressive MP4** через **`GET /api/media/{id}`** (редирект). Детали HTTP (коды, rewrite плейлистов, Range) — в [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) (маршрут **`GET /api/media/[id]/hls/[[...path]]`**).

## Разрешение внутри HLS (не формат доставки)

- **Формат** задаёт только playback JSON — отдельного переключателя «HLS / MP4» у пользователя нет.
- Если в JSON есть **`hls.qualities`** и в нём **не меньше двух** вариантов, в браузерах на **`hls.js`** показываются компактный селектор (**«Авто»** или фиксированное разрешение из списка) и строка **«Сейчас: …»**, обновляемая по событиям уровня качества.
- Если браузер не умеет **ни** нативный HLS, **ни** `hls.js` (MSE), видео с готовым HLS воспроизвести нечем: плеер показывает штатную ошибку и пишет событие `hls_js_unsupported` в телеметрию. Подменить его прогрессивным MP4 нельзя — исходного объекта уже нет.
- В **нативном HLS** (например Safari / iOS, без `hls.js`) нет стабильного API для текущего варианта и ручного выбора как в `hls.js`; селектор разрешения не показывается.
- При воспроизведении **progressive** (`delivery` `mp4` / `file`) блок выбора разрешения **не** показывается.

## Обновление playback JSON и жизненный цикл `hls.js`

Фоновое обновление ответа **`GET /api/media/[id]/playback`** (например продление presigned постера) **не пересоздаёт** экземпляр **`hls.js`**, пока не меняются **`hls.masterUrl`**, **`progressive.url`** и **`posterUrl`** — см. зависимости эффекта источника в [`PatientMediaPlaybackVideo.tsx`](../../apps/webapp/src/shared/ui/media/PatientMediaPlaybackVideo.tsx).

## Пропсы

| Проп              | Назначение                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mediaId`         | UUID файла в медиатеке.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `title`           | `title` элемента `<video>`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `initialPlayback` | JSON с сервера (RSC), если уже резолвнут; **`null`** — компонент сам выполнит `fetch` на `/playback` после монтирования.                                                                                                                                                                                                                                                                                                                                          |
| `shellClassName`  | Опционально: оболочка (фон, скругление), по умолчанию стиль «карточка контента».                                                                                                                                                                                                                                                                                                                                                                                  |
| `onFirstPlaying`  | Один раз при первом событии `playing` на `<video>` (каталожный файл). Для разминки дня: [`PatientDailyWarmupVideoEngagement`](../../apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupVideoEngagement.tsx) → `POST /api/patient/daily-warmup/video-viewed` (см. [`patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md) §Daily warmup rotation). Hosted iframe — отдельный pointer handler в том же engagement-компоненте. |

## Вспомогательные модули

- **`parseApiMediaIdFromPlayableUrl`**, **`parseApiMediaIdFromHref`**, **`parseApiMediaIdFromMarkdownHref`** — `apps/webapp/src/shared/lib/parseApiMediaIdFromPlayableUrl.ts` (извлечение UUID из пути `/api/media/{uuid}`, в т.ч. для ссылок в Markdown и поля видео страницы контента).
- **`initialPlaybackSourceKind`** — `apps/webapp/src/shared/ui/media/patientPlaybackSourceKind.ts` (ветвление HLS vs MP4 по телу JSON).
- **`patientHlsQuality`** — `apps/webapp/src/shared/ui/media/patientHlsQuality.ts` (сопоставление строк `hls.qualities` с уровнями `hls.js` и подпись текущего варианта).

## Где используется

- Страница контента пациента (`PatientContentAdaptiveVideo` — реэкспорт) — блок «Видео» страницы (отдельное поле каталога): файл из медиатеки или iframe **YouTube / RuTube** по URL поля видео ([`hostingEmbedUrls.ts`](../../apps/webapp/src/shared/lib/hostingEmbedUrls.ts)).
- **Тело статьи (`body_md`):** при отображении Markdown компонент [`MarkdownEmbeddedLink`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx) подставляет **`PatientMediaPlaybackVideo`** для ссылок на **`/api/media/{uuid}`** с MIME `video/*` после успешного playback JSON (те же правила сессии и флага `video_playback_api_enabled`, что у прямого запроса к API).
- Модалка пункта этапа программы лечения (`PatientProgramStageItemModal` / `ModalMediaBlock`).
- **Обсуждение по пункту программы** (`ProgramItemDiscussionDialog`, `ProgramItemDiscussionMessageBody`): submission-видео — progressive-only playback JSON; в списке bubble — static thumb ([`PatientCatalogMediaStaticThumb`](../../apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx)), воспроизведение в player view.
- **Журнал врача:** превью `patient_media` — [`DoctorProgramActionLogMediaPreview`](../../apps/webapp/src/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramActionLogMediaPreview.tsx).
- **Быстрый превью видео** в медиа-пикере (`MediaPickerQuickPreviewDialog`): тот же компонент, чтобы врач/админ и будущий пациентский сценарий с пикером не расходились с кабинетом пациента.

### Submission media (`usage_purpose=program_item_submission`)

- Транскод submission-видео (`done_program`) пишет прогрессивный MP4 в `s3_key` и оставляет `hls_master_playlist_s3_key = NULL`, поэтому резолвер отдаёт `delivery: 'mp4'` **по готовности медиа**, без отдельного per-file переключателя.
- ACL: uploader + doctor/admin — см. [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

## Авторизация и права на байты (не плеер)

Модель доступа к `GET /api/media/*` и playback JSON описана отдельно: [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md) (CMS — сессия; **`program_item_submission`** — uploader + doctor/admin).

## Вне области компонента

- Встраивание **YouTube / RuTube** через `<iframe>` на странице контента: отдельная вёрстка **блока «Видео»** страницы (поле видео каталога), не сам React-плеер файлов.
- В том же **теле Markdown** (`body_md`) ссылки на YouTube/RuTube также превращаются в iframe отдельным узлом разметки ([`MarkdownEmbeddedLink`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx)); это по-прежнему не потоковый файл из медиатеки.
- **Миниатюры и строки списков** в кабинете пациента по-прежнему только **статичное изображение** (`PatientCatalogMediaStaticThumb` и правила patient UI) — без `<video>` в превью строки.
