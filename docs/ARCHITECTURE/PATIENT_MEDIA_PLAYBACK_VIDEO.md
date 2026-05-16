# Пациентское видео: единый плеер (HLS / progressive)

## Компонент

- **`PatientMediaPlaybackVideo`** — `apps/webapp/src/shared/ui/media/PatientMediaPlaybackVideo.tsx`.
- Совместимое имя на странице контента: **`PatientContentAdaptiveVideo`** реэкспортирует тот же компонент из `app/app/patient/content/[slug]/PatientContentAdaptiveVideo.tsx`.

Все новые сценарии воспроизведения **файлового** видео в кабинете пациента должны подключать **`PatientMediaPlaybackVideo`**, а не «голый» `<video>` с произвольным `src` / `<source>`.

## Источник и fallback (без выбора пользователем)

1. Канонический контракт — **`GET /api/media/[id]/playback`** (включается флагом `video_playback_api_enabled` в `system_settings`, переключатель — админка `/app/settings` → «Параметры приложения» → блок «Воспроизведение видео»; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` и описание API в `apps/webapp/src/app/api/api.md`).
2. Сервер и настройки доставки решают, что отдавать в первую очередь (**HLS** или **progressive MP4**). Клиент **не** предлагает переключатель формата и **не** может «запросить не-HLS» отдельно от API.
3. Внутри плеера допускается **автоматический** переход на progressive MP4 при недоступности HLS в браузере (например, нет `hls.js`) или после **фатальной** ошибки HLS / истечения presigned **постера или MP4** — это защитный fallback, не пользовательский выбор.

## Поток HLS

Master и сегменты запрашиваются с **того же origin**, что и webapp: **`GET /api/media/{id}/hls/...`** (сессионная авторизация). Presigned URL используются для **постера** (если есть) и для **progressive MP4** через **`GET /api/media/{id}`** (редирект). Детали HTTP (коды, rewrite плейлистов, Range) — в [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) (маршрут **`GET /api/media/[id]/hls/[[...path]]`**).

## Пропсы

| Проп | Назначение |
|------|------------|
| `mediaId` | UUID файла в медиатеке. |
| `mp4Url` | Запасной progressive URL, обычно `/api/media/{id}`, если в JSON ещё нет `mp4.url`. |
| `title` | `title` элемента `<video>`. |
| `initialPlayback` | JSON с сервера (RSC), если уже резолвнут; **`null`** — компонент сам выполнит `fetch` на `/playback` после монтирования. |
| `shellClassName` | Опционально: оболочка (фон, скругление), по умолчанию стиль «карточка контента». |

## Вспомогательные модули

- **`parseApiMediaIdFromPlayableUrl`**, **`parseApiMediaIdFromHref`**, **`parseApiMediaIdFromMarkdownHref`** — `apps/webapp/src/shared/lib/parseApiMediaIdFromPlayableUrl.ts` (извлечение UUID из пути `/api/media/{uuid}`, в т.ч. для ссылок в Markdown и поля видео страницы контента).
- **`initialPlaybackSourceKind`** — `apps/webapp/src/shared/ui/media/patientPlaybackSourceKind.ts` (ветвление HLS vs MP4 по телу JSON).

## Где используется

- Страница контента пациента (`PatientContentAdaptiveVideo` — реэкспорт) — блок «Видео» страницы (отдельное поле каталога): файл из медиатеки или iframe **YouTube / RuTube** по URL поля видео ([`hostingEmbedUrls.ts`](../../apps/webapp/src/shared/lib/hostingEmbedUrls.ts)).
- **Тело статьи (`body_md`):** при отображении Markdown компонент [`MarkdownEmbeddedLink`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx) подставляет **`PatientMediaPlaybackVideo`** для ссылок на **`/api/media/{uuid}`** с MIME `video/*` после успешного playback JSON (те же правила сессии и флага `video_playback_api_enabled`, что у прямого запроса к API).
- Модалка пункта этапа программы лечения (`PatientProgramStageItemModal` / `ModalMediaBlock`).
- **Быстрый превью видео** в медиа-пикере (`MediaPickerQuickPreviewDialog`): тот же компонент, чтобы врач/админ и будущий пациентский сценарий с пикером не расходились с кабинетом пациента.

## Авторизация и права на байты (не плеер)

Модель доступа к `GET /api/media/*` и playback JSON (**сессия + читаемая строка в БД**, без привязки к пациенту/программе/контенту) описана отдельно: [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

## Вне области компонента

- Встраивание **YouTube / RuTube** через `<iframe>` на странице контента: отдельная вёрстка **блока «Видео»** страницы (поле видео каталога), не сам React-плеер файлов.
- В том же **теле Markdown** (`body_md`) ссылки на YouTube/RuTube также превращаются в iframe отдельным узлом разметки ([`MarkdownEmbeddedLink`](../../apps/webapp/src/shared/ui/markdown/MarkdownEmbeddedLink.tsx)); это по-прежнему не потоковый файл из медиатеки.
- **Миниатюры и строки списков** в кабинете пациента по-прежнему только **статичное изображение** (`PatientCatalogMediaStaticThumb` и правила patient UI) — без `<video>` в превью строки.
