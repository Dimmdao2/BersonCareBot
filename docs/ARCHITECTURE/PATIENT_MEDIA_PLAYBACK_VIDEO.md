# Пациентское видео: единый плеер (HLS / progressive)

## Компонент

- **`PatientMediaPlaybackVideo`** — `apps/webapp/src/shared/ui/media/PatientMediaPlaybackVideo.tsx`.
- Совместимое имя на странице контента: **`PatientContentAdaptiveVideo`** реэкспортирует тот же компонент из `app/app/patient/content/[slug]/PatientContentAdaptiveVideo.tsx`.

Все новые сценарии воспроизведения **файлового** видео в кабинете пациента должны подключать **`PatientMediaPlaybackVideo`**, а не «голый» `<video>` с произвольным `src` / `<source>`.

## Источник и fallback (без выбора пользователем)

1. Канонический контракт — **`GET /api/media/[id]/playback`** (включается флагом `video_playback_api_enabled` в `system_settings`, переключатель — админка `/app/settings` → «Параметры приложения» → блок «Воспроизведение видео»; см. `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` и описание API в `apps/webapp/src/app/api/api.md`).
2. Сервер и настройки доставки решают, что отдавать в первую очередь (**HLS** или **progressive MP4**). Клиент **не** предлагает переключатель формата и **не** может «запросить не-HLS» отдельно от API.
3. Внутри плеера допускается **автоматический** переход на progressive MP4 при недоступности HLS в браузере (например, нет `hls.js`) или после **фатальной** ошибки HLS / истечения presigned — это защитный fallback, не пользовательский выбор.

## Пропсы

| Проп | Назначение |
|------|------------|
| `mediaId` | UUID файла в медиатеке. |
| `mp4Url` | Запасной progressive URL, обычно `/api/media/{id}`, если в JSON ещё нет `mp4.url`. |
| `title` | `title` элемента `<video>`. |
| `initialPlayback` | JSON с сервера (RSC), если уже резолвнут; **`null`** — компонент сам выполнит `fetch` на `/playback` после монтирования. |
| `shellClassName` | Опционально: оболочка (фон, скругление), по умолчанию стиль «карточка контента». |

## Вспомогательные модули

- **`parseApiMediaIdFromPlayableUrl`** — `apps/webapp/src/shared/lib/parseApiMediaIdFromPlayableUrl.ts` (путь вида `/api/media/{uuid}`).
- **`initialPlaybackSourceKind`** — `apps/webapp/src/shared/ui/media/patientPlaybackSourceKind.ts` (ветвление HLS vs MP4 по телу JSON).

## Где используется

- Страница контента пациента (`PatientContentAdaptiveVideo` — реэкспорт).
- Модалка пункта этапа программы лечения (`PatientProgramStageItemModal` / `ModalMediaBlock`).
- **Быстрый превью видео** в медиа-пикере (`MediaPickerQuickPreviewDialog`): тот же компонент, чтобы врач/админ и будущий пациентский сценарий с пикером не расходились с кабинетом пациента.

## Авторизация и права на байты (не плеер)

Модель доступа к `GET /api/media/*` и playback JSON (**сессия + читаемая строка в БД**, без привязки к пациенту/программе/контенту) описана отдельно: [`MEDIA_HTTP_ACCESS_AUTHORIZATION.md`](MEDIA_HTTP_ACCESS_AUTHORIZATION.md).

## Вне области компонента

- Встраивание **YouTube** и других внешних iframe на страницах контента — отдельная разметка, не этот плеер.
- **Миниатюры и строки списков** в кабинете пациента по-прежнему только **статичное изображение** (`PatientCatalogMediaStaticThumb` и правила patient UI) — без `<video>` в превью строки.
