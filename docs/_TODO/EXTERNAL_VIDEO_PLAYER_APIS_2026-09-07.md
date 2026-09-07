# Внешние видеоплееры: YouTube, Vimeo, VK Video и RUTUBE

Дата проверки: **2026-09-07**.

Документ отвечает на два вопроса:

1. Можно ли убрать стандартные элементы управления внешнего плеера и заменить их единым интерфейсом BersonCareBot.
2. Можно ли продавать доступ к CMS-материалу с таким видео и что реально происходит с защитой ссылки после окончания подписки.

## Решение владельца от 2026-09-07

**Внешние видео YouTube, Vimeo, RUTUBE и VK Video не используются внутри платных продуктов.** В платную подписку, платный курс и другой оплачиваемый доступ можно включать только видео, загруженное клиникой в BersonCareBot и отдаваемое с нашего хоста. Это продуктовое решение действует независимо от того, разрешит ли конкретная внешняя платформа платное встраивание в будущем.

Контракт платного продукта: сервер разрешает сохранение и публикацию только тогда, когда все его видео загружены в BersonCareBot и отдаются как собственный HLS. Наличие YouTube, Vimeo, RUTUBE или VK Video отклоняется сервером. Скрытие поля или предупреждение только в интерфейсе этот контракт не выполняет.

## Краткий вывод

Автораспознавание источника и отдельное поведение плеера нужны. Но одинаковый полностью кастомный плеер для всех четырёх источников сейчас невозможен:

| Источник        | Скрыть штатные контролы официально            | Базовые свои контролы          | Полноценный свой UI                                                                                    | Использование внутри платных продуктов                 |
| --------------- | --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Собственный HLS | Да                                            | Да                             | Да                                                                                                     | Да, с серверной проверкой доступа                      |
| YouTube         | Да, `controls=0`                              | Play/pause/seek/volume         | Неполный: нет документированных команд fullscreen/PiP, выбора качества и полного управления субтитрами | Нет, решение владельца; также ограничено policy        |
| Vimeo           | Да, `controls=0`, на подходящем платном плане | Да                             | Почти полный через Player SDK; часть возможностей зависит от плана и устройства                        | Нет, решение владельца; также ограничено условиями API |
| RUTUBE          | Да, `player:hideControls`                     | Play/pause/seek/volume/quality | Неполный: нет документированных команд fullscreen/PiP/субтитров                                        | Нет, решение владельца                                 |
| VK Video        | Надёжного публичного параметра/API не найдено | Play/pause/seek/volume         | Нет: публичный JS API не скрывает UI и не даёт команды fullscreen/PiP/captions/quality selection       | Нет, решение владельца                                 |

Практический MVP:

- собственный HLS — единый кастомный плеер и строгая проверка подписки;
- VK Video — штатный iframe с его контролами;
- RUTUBE — собственные базовые контролы через официальный `postMessage` API;
- YouTube, Vimeo, RUTUBE и VK Video разрешены только в бесплатных материалах;
- внешняя ссылка всегда остаётся доступной браузеру. Спрятать её с экрана можно, сделать секретной от пользователя нельзя.

## Что уже есть в BersonCareBot

В репозитории уже есть парсер внешних ссылок в `apps/webapp/src/shared/lib/hostingEmbedUrls.ts`. Он распознаёт:

- `youtube`;
- `vimeo`;
- `rutube`;
- `vk`.

Парсер уже сохраняет важные bearer-параметры ссылок:

- RUTUBE — `p`;
- VK Video — `hash`;
- Vimeo — hash unlisted-видео;
- YouTube — идентификатор видео и embed через `youtube-nocookie.com`.

До этой работы компоненты внешнего видео выводили обычный iframe со штатным интерфейсом провайдера. В текущем изменении YouTube переведён на `controls=0` и собственные базовые controls через официальный IFrame Player API, RUTUBE — на `player:hideControls` и собственные controls через официальный `postMessage` API. VK Video и Vimeo пока используют штатный интерфейс.

Распознавание должно принадлежать **конкретному видеоисточнику**, а не упражнению, CMS-странице или разделу. При замене URL необходимо заново вычислить provider, video reference и access key/hash и сбросить состояние старого плеера.

## Общая граница защиты внешнего видео

Внешний iframe не даёт строгой защиты, эквивалентной собственному HLS.

Можно:

- не показывать исходную ссылку обычному пользователю в интерфейсе;
- убрать штатную кнопку «поделиться», если провайдер официально разрешает скрытие контролов;
- проверять подписку до вывода iframe;
- ограничить встраивание доменами у Vimeo;
- после отмены подписки перестать отдавать iframe на страницах BersonCareBot.

Нельзя:

- скрыть iframe URL, video ID или access key/hash от DevTools и сетевого журнала браузера;
- отозвать уже скопированную ссылку силами BersonCareBot;
- помешать записи экрана;
- обеспечить персональную проверку подписки пациента на стороне YouTube/Vimeo/VK/RUTUBE;
- считать `unlisted`, `private by link`, `p`, `hash` полноценным entitlement: это переносимый секрет ссылки.

Следовательно, после окончания подписки BersonCareBot закрывает свою страницу, но ранее извлечённая внешняя ссылка может продолжить работать. Для её отзыва владелец видео должен удалить видео, поменять приватность либо, если платформа позволяет, ротировать access key.

URL с `p`, `hash` и Vimeo unlisted hash нельзя писать целиком в логи, аналитику и сообщения об ошибках. Их следует считать чувствительными bearer-ссылками, хотя настоящим DRM или пациентским токеном они не являются.

## YouTube

### Приватность и embed

**Официально:**

- Unlisted-видео не показывается в поиске и ленте, но любой получивший ссылку может смотреть и пересылать её; аккаунт Google не требуется.
- Private-видео доступно только приглашённым аккаунтам после входа и не подходит для обычного клиентского embed-сценария.
- Embed имеет формат `https://www.youtube.com/embed/VIDEO_ID`.
- Для privacy-enhanced mode применяется `https://www.youtube-nocookie.com/embed/VIDEO_ID`.
- `controls=0` скрывает штатные контролы, `enablejsapi=1` включает управление через IFrame Player API.

Источники: [настройки приватности YouTube](https://support.google.com/youtube/answer/157177), [встраивание и privacy-enhanced mode](https://support.google.com/youtube/answer/171780), [параметры плеера](https://developers.google.com/youtube/player_parameters).

### Что даёт официальный IFrame Player API

Поддерживаются:

- `playVideo`, `pauseVideo`, `stopVideo`;
- `seekTo`;
- mute/unmute, get/set volume;
- current time и duration;
- состояния unstarted/ended/playing/paused/buffering/cued;
- события ready, state change, playback quality change, playback rate change, error, API change, autoplay blocked.

Ограничения:

- в актуальной документации нет команды выбора качества и списка доступных качеств; качество можно только наблюдать по событию;
- API субтитров неполный: есть параметры начального показа и ограниченное управление captions-модулем, но нет стабильного полного API для собственного селектора дорожек;
- нет документированных команд YouTube API для fullscreen и Picture-in-Picture;
- fullscreen можно пытаться включать браузерным Fullscreen API вокруг iframe по пользовательскому жесту, но это отдельная браузерная возможность и её надо проверять на iOS/Android;
- PiP кросс-доменного iframe из родительской страницы надёжно не управляется;
- `getDuration()` до загрузки метаданных возвращает `0`.

Источник: [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).

### Контролы, брендинг и ссылки

Технически `controls=0` позволяет убрать нижнюю панель и разместить play/pause/seek/volume BersonCareBot рядом с iframe. Однако это не означает право полностью превратить YouTube в безымянный видеохостинг:

- устаревшие `modestbranding`, `showinfo`, `autohide` не дают надёжного удаления брендинга;
- YouTube может показывать название, логотип, ошибки и переход «Watch on YouTube»;
- правила запрещают закрывать или изменять обязательные элементы, ссылки и стандартные функции плеера;
- кастомные контролы безопаснее размещать **вне iframe**, не перекрывая его слоем;
- iframe src и video ID видны в DOM/Network, а API само предоставляет `getVideoUrl()`.

Источники: [обязательная функциональность](https://developers.google.com/youtube/terms/required-minimum-functionality), [Developer Policies](https://developers.google.com/youtube/terms/developer-policies), [руководство по политикам](https://developers.google.com/youtube/terms/developer-policies-guide), [брендинг](https://developers.google.com/youtube/terms/branding-guidelines).

### Критическое ограничение для платной подписки

**Официальная Developer Policy прямо запрещает API-клиенту брать с пользователя плату за просмотр контента во встроенном YouTube-плеере.** Поэтому размещать YouTube-видео внутри платного CMS-материала нельзя считать допустимым компромиссом только потому, что ссылка скрыта с экрана.

Также политика запрещает скачивать, импортировать, кэшировать или хранить аудиовизуальный контент YouTube без письменного разрешения. Значит, автоматическое скачивание YouTube-видео на собственный хост не является допустимым обходом.

Долговременное хранение истории/позиции просмотра, полученной именно из YouTube API, требует отдельной проверки политики хранения API Data и derived metrics. Для MVP безопаснее не обещать облачную историю YouTube до юридического решения.

Источник: [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

### План интеграции YouTube

MVP для бесплатного контента:

1. Использовать `youtube-nocookie.com/embed/VIDEO_ID?enablejsapi=1&controls=0` с корректным `origin` и Referer.
2. Инициализировать официальный IFrame Player API.
3. Дать свои play/pause, timeline/seek, mute/volume.
4. Fullscreen — браузерный API с обязательным fallback; PiP, свой quality selector и полноценный captions selector не показывать.
5. Не перекрывать iframe; оставить место для обязательного интерфейса/состояний YouTube.
6. Для платного продукта всегда отклонять внешний источник согласно решению владельца.

Позже:

- live-проверка Safari iOS, Chrome Android, fullscreen и autoplay;
- юридическое решение по истории просмотра.

## Vimeo

### Приватность и защита доменом

**Официально:**

- Unlisted-видео имеет уникальный URL с privacy hash; любой обладатель ссылки может её переслать.
- `Embed only` позволяет воспроизводить видео во внешнем embed, не открывая обычную страницу просмотра на Vimeo.
- `Specific domains` ограничивает встраивание списком доменов (до 50); функция зависит от платного плана.
- Для unlisted embed и oEmbed необходим полный URL с параметром `h`; без hash запрос возвращает 404.
- Проверка домена зависит от Referer. Слишком строгая `Referrer-Policy` может приводить к 403.

Это самая полезная техническая защита среди исследованных внешних платформ: извлечённый iframe URL обычно нельзя просто вставить на произвольный чужой сайт. Но его всё равно можно воспроизводить через разрешённую страницу BersonCareBot, передавать вместе с доступом к аккаунту или записывать с экрана; пациентской подписки Vimeo не проверяет.

Источники: [privacy settings](https://help.vimeo.com/hc/en-us/articles/12426199699985-About-video-privacy-settings), [domain-level privacy](https://help.vimeo.com/hc/en-us/articles/30030693052305-How-do-I-set-up-domain-level-privacy), [private oEmbed](https://help.vimeo.com/hc/en-us/articles/12427906892689-Use-oEmbed-with-private-videos), [ошибки Referer](https://help.vimeo.com/hc/en-us/articles/35817429341457-Troubleshooting-video-playback-errors-due-to-referrer-policy-conflicts).

### Скрытие контролов и Player SDK

Официальный `controls=0` включает chromeless-режим на поддерживаемом платном плане. Через `@vimeo/player` доступны:

- play/pause;
- get/set current time, duration;
- volume, mute;
- playback rate;
- request/exit fullscreen;
- request/exit Picture-in-Picture;
- список текстовых дорожек, enable/disable track, cue events для собственного показа субтитров;
- get/set quality и список качеств; ручной выбор зависит от плана;
- loaded, play, pause, ended, timeupdate, progress, seeking/seeked, volume, playback-rate, buffering, error, fullscreen, quality, PiP и другие события.

Ограничения устройства:

- iOS и некоторые мобильные браузеры требуют исходного пользовательского жеста для старта;
- программная громкость на мобильных часто контролируется системой, а не iframe;
- availability fullscreen/PiP надо определять в runtime и иметь fallback.

Источники: [chromeless embed](https://help.vimeo.com/hc/en-us/articles/12426285089681-About-embedding-background-and-Chromeless-videos), [player parameters](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters), [Player SDK overview](https://help.vimeo.com/hc/en-us/articles/12427952387601-Overview-Player-SDK), [официальный player.js](https://github.com/vimeo/player.js/).

### Критическое ограничение для платной подписки

**Vimeo Developer Addendum от 2026-03-09 запрещает брать с конечных пользователей плату за приложение без прямого письменного разрешения Vimeo.** Там же запрещено неразрешённо изменять, скрывать или мешать логотипу, контролам и sharing-функциям плеера.

Vimeo OTT является отдельным коммерческим продуктом; его обычный сценарий предполагает просмотр платного контента на OTT-сайте, а во внешнем сайте — промо/трейлеры. Наличие Vimeo OTT само по себе не превращает стандартный Vimeo iframe в разрешённый платный embed внутри BersonCareBot.

Источники: [Vimeo Developer Addendum](https://vimeo.com/legal/service-terms/api), [embedding Vimeo OTT](https://help.vimeo.com/hc/en-us/articles/12427027508881-How-embedding-works-on-Vimeo-OTT), [продвижение OTT-контента](https://help.vimeo.com/hc/en-us/articles/12427239094417-Promote-your-Vimeo-OTT-content-on-an-external-site).

### План интеграции Vimeo

MVP для бесплатного контента:

1. Требовать Vimeo-план, поддерживающий нужную приватность и кастомизацию.
2. Рекомендовать `Embed only` + `Specific domains` + unlisted hash.
3. Использовать `controls=0`, `dnt=1` и официальный `@vimeo/player`.
4. Реализовать полный доступный набор контролов, но показывать quality/PiP/fullscreen/captions только по runtime capability.
5. Не устанавливать Referrer-Policy, ломающую domain privacy.
6. Для платного продукта всегда отклонять внешний источник согласно решению владельца.

Позже:

- проверить текущие названия планов и доступность ручного quality selection перед запуском;
- провести мобильные тесты.

## RUTUBE

### Видео «только по ссылке» и embed

**Официально:**

- публичный embed: `https://rutube.ru/play/embed/{VIDEO_ID}`;
- видео «Только по ссылке»: `https://rutube.ru/play/embed/{VIDEO_ID}/?p={ACCESS_KEY}`;
- без `p` закрытое видео не воспроизводится;
- iframe поддерживает `allowFullScreen`, autoplay и адаптивную вёрстку;
- `p` остаётся видимым в iframe src и Network и может быть скопирован.

Источник: [официальная документация RUTUBE по встраиванию и JS API](https://rutube.ru/info/embed/).

### Официальный postMessage API

После `player:ready` поддерживаются команды:

- play, pause, stop;
- setCurrentTime и relative seek;
- mute/unmute/setVolume;
- changeQuality после получения quality list;
- change video;
- `player:hideControls` и `player:showControls`.

Доступны события:

- ready/init/play options loaded;
- playing/paused/stopped;
- duration/current time/buffering/volume;
- fullscreen change;
- quality и quality list;
- error/start/complete;
- рекламные состояния.

В официальной документации не найдены команды:

- запросить fullscreen — есть только событие изменения;
- включить PiP;
- получить или переключить субтитры.

Поэтому после `hideControls` BersonCareBot сможет дать play/pause/seek/volume/quality, но не гарантирует полный эквивалент штатного интерфейса. Fullscreen можно дать браузерным Fullscreen API с fallback; PiP и captions — только если они останутся доступны штатным путём.

При postMessage необходимо проверять одновременно:

- `event.origin === "https://rutube.ru"`;
- `event.source === iframe.contentWindow`.

Отправлять сообщения следует только на точный origin, не на `*`. Рекламные состояния необходимо учитывать отдельно, чтобы не записывать позицию рекламы как позицию основного видео.

Источник: [RUTUBE embed/JS API](https://rutube.ru/info/embed/).

### Правовой статус платного встраивания

RUTUBE публично описывает бесплатное встраивание разрешённого контента и собственные механизмы монетизации/платного доступа партнёров. Но в просмотренных официальных документах не найдено однозначного разрешения стороннему SaaS брать плату за CMS-страницу со стандартным RUTUBE embed и не найден такой же явный запрет, как у YouTube/Vimeo.

Проверялись:

- [встраивание и API](https://rutube.ru/info/embed/);
- [условия использования платформы](https://rutube.ru/info/platforma/);
- [лицензия плеера](https://rutube.ru/info/eula/);
- [соглашение о донатах/подписках](https://rutube.ru/info/donate_agreement/);
- материалы партнёрского рекламного плеера.

Юридический вывод исследования: условия платного встраивания публично не подтверждены. Продуктовый вывод уже строже: RUTUBE в платных продуктах не используется независимо от возможного будущего подтверждения.

### План интеграции RUTUBE

MVP для бесплатного контента:

1. Сохранять video ID и `p` как атрибуты видеоисточника.
2. Создавать iframe штатного embed и ждать `player:ready`.
3. После `player:ready` вызвать `player:hideControls` и дать play/pause/seek/volume; quality добавить отдельным этапом.
4. Fullscreen — браузерный API с fallback; captions/PiP не обещать.
5. Проверять origin/source всех событий и корректно обрабатывать рекламу.
6. Платный продукт с внешним видео не разрешать согласно решению владельца.

Позже:

- live-тест iOS/Android и рекламных вставок;
- проверка доступности captions/PiP при появлении официального API.

## VK Video

### Embed и access key

Официальная схема VK API подтверждает наличие `access_key` для ссылки доступа и HTML плеера в oEmbed-ответе. Практический embed имеет вид:

`https://vkvideo.ru/video_ext.php?oid={OWNER_ID}&id={VIDEO_ID}&hash={ACCESS_KEY}`

`hash` является bearer-параметром: он виден в DOM/Network и после копирования не связан с подпиской пациента.

Источники: [официальная схема video responses](https://github.com/VKCOM/vk-api-schema/blob/master/video/responses.json), [официальная схема video objects](https://github.com/VKCOM/vk-api-schema/blob/master/video/objects.json).

Точные текущие настройки приватности «только по ссылке» в пользовательском интерфейсе VK Video по доступной официальной документации подтвердить не удалось. Наличие `access_key` подтверждает доступ по ключу, но не гарантирует одинаковое поведение всех типов видео и аккаунтов без live-проверки.

### Официальный JS API, подтверждённый текущим скриптом VK

Проверен официальный скрипт `https://vk.com/js/api/videoplayer.js`. Он требует `js_api` в iframe URL и предоставляет:

- play/pause;
- seek и seek live;
- set/get volume, mute/unmute;
- get quality, current time, duration, state и error code;
- подписку на ready/init, time update, volume/quality, started/resumed/paused/seeked/ended/error;
- события рекламы, fullscreen enter/exit и рекомендаций.

В публичной обёртке не найдены:

- команда постоянного скрытия штатных контролов;
- выбор качества — доступно только чтение текущего;
- команда fullscreen;
- PiP;
- API субтитров.

Следовательно, VK Video сейчас нельзя включать в общий chromeless-интерфейс без зависимости от недокументированного поведения. Для production MVP нужен штатный iframe VK с его контролами. JS API можно использовать отдельно для событий просмотра и истории.

Официальная страница документации `https://dev.vk.com/ru/widgets/video` была недоступна инструментам исследования. Отсутствие hide-controls проверялось по:

- текущему официальному `https://vk.com/js/api/videoplayer.js`;
- официальным схемам `video/responses.json`, `video/objects.json` и video methods;
- запросам `"VK Video" "Player API" iframe JavaScript`, `"VK Видео" "API плеера" iframe postMessage`, `"video_ext.php" postMessage play pause seek`, `"video_ext.php" "js_api=1" VK`.

### Неофициальные и экспериментальные сведения

**Не использовать как контракт production:**

- [ответ на Habr Q&A](https://qna.habr.com/q/1302430) подтверждает распространённую инициализацию `VK.VideoPlayer(iframe)` с `js_api=1`, но это вторичный источник;
- в текущем minified-коде embed обнаружен недокументированный `suppress_controls=1`. Наблюдаемое внутреннее поведение не доказывает постоянного скрытия панели, параметр отсутствует в публичной обёртке и может измениться без уведомления;
- внутренние функции hide/show controls существуют в коде самого плеера, но наружу официальным JS wrapper не экспортированы.

### Правовой статус платного встраивания

В доступных официальных схемах/API и публичных условиях не найдено однозначного разрешения или запрета на платный доступ третьей стороны к стандартному VK Video iframe. Проверялись официальные API-схемы, текущий JS API и страница [условий VK Video](https://vkvideo.ru/legal/terms).

Юридический вывод исследования: платный сценарий публично не подтверждён. Продуктовый вывод уже строже: VK Video в платных продуктах не используется.

### План интеграции VK Video

MVP для бесплатного контента:

1. Сохранять owner ID, video ID и `hash` на уровне видеоисточника.
2. Включать `js_api=1` и инициализировать официальный `VK.VideoPlayer`.
3. Оставить штатные контролы; не применять `suppress_controls`.
4. Нормализовать ready/play/pause/seek/time/duration/end/error/ad/fullscreen events для общей истории.
5. Fullscreen/PiP/captions/quality оставить штатному плееру.
6. Платный продукт с внешним видео не разрешать согласно решению владельца.

Позже:

- live-проверка актуального embed на vkvideo.ru, VK login и приватных видео;
- официальный запрос по hide-controls;
- пересмотр, если VK опубликует стабильный chromeless API.

## Предлагаемый общий адаптер

Одна React-обёртка выбирает провайдерный адаптер по сохранённому типу видео. Она не должна притворяться, что все провайдеры имеют одинаковые возможности.

```ts
type ExternalVideoProvider = 'youtube' | 'vimeo' | 'rutube' | 'vk';

type PlayerCapabilities = {
  hideNativeControls: boolean;
  seek: boolean;
  volume: 'api' | 'system-only' | 'none';
  fullscreen: 'provider-api' | 'browser-api' | 'native-only' | 'none';
  pictureInPicture: 'provider-api' | 'native-only' | 'none';
  captions: 'api' | 'initial-only' | 'native-only' | 'none';
  quality: 'settable' | 'observable' | 'native-only' | 'none';
  progressEvents: boolean;
};

type NormalizedPlayerEvent =
  | { type: 'ready' }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'ended' }
  | { type: 'timeupdate'; currentTime: number; duration: number | null }
  | { type: 'volumechange'; volume: number; muted: boolean }
  | { type: 'fullscreenchange'; fullscreen: boolean }
  | { type: 'qualitychange'; quality: string }
  | { type: 'adstart' }
  | { type: 'adend' }
  | { type: 'error'; code?: string; message?: string };

interface ExternalVideoPlayerAdapter {
  readonly capabilities: PlayerCapabilities;
  mount(): Promise<void>;
  destroy(): void;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  subscribe(listener: (event: NormalizedPlayerEvent) => void): () => void;
}
```

Провайдерские методы, которых нет у конкретного источника, не следует эмулировать фиктивно. UI строится по `capabilities`: неподдерживаемая кнопка отсутствует либо остаётся внутри штатного плеера.

### Сохранение источника

Нормализованная запись видео должна содержать как минимум:

```ts
type ExternalVideoSource = {
  provider: ExternalVideoProvider;
  canonicalUrl: string;
  videoRef: string;
  accessKey: string | null;
};
```

Это логическая форма, не требование немедленно создавать отдельную таблицу. Сначала следует расширить уже существующую модель, если она способна нести эти данные.

Правила:

1. При каждом изменении URL снова запускать parser и атомарно заменять все вычисленные поля.
2. Не сохранять provider вручную независимо от URL.
3. Не наследовать provider от CMS-страницы, упражнения или раздела.
4. Изменение videoRef/accessKey создаёт новый playback identity: позиция предыдущего видео не переносится.
5. Клиент может перепроверять provider для защиты от старых данных, но серверная нормализация при записи является источником истины.
6. Полные bearer URL не попадут в телеметрию и диагностические логи.

### UI и доступность

Если используются свои контролы, BersonCareBot отвечает за:

- доступные названия кнопок;
- keyboard focus и управление клавиатурой;
- видимый focus state;
- ползунок времени с корректными ARIA-значениями;
- состояние play/pause/mute;
- fallback при недоступности SDK;
- сообщение об ошибке и возможность открыть допустимый штатный плеер;
- корректный touch target на мобильных.

Скрывать штатные контролы до готовности доступной замены нельзя. Ленивая загрузка iframe при попадании в viewport остаётся действующим решением репозитория.

## Этапы реализации

### MVP

1. Сохранение provider/videoRef/accessKey на уровне видео и повторное распознавание при каждой замене URL.
2. Единый `ExternalVideoPlayer` с четырьмя адаптерами и capability matrix.
3. Собственный HLS — существующий общий пациентский плеер.
4. VK — штатные контролы + события JS API.
5. RUTUBE — собственные базовые контролы через официальный `postMessage` API; отдельно провести mobile/ad проверку.
6. YouTube/Vimeo/RUTUBE/VK — только для бесплатных материалов; сервер всегда блокирует их в платном продукте.
7. Серверная проверка подписки до выдачи платной CMS-страницы и до выдачи собственного HLS.

### Следующие этапы

- chromeless Vimeo после подтверждения прав и тарифа;
- browser fullscreen fallback и матрица iOS/Android;
- нормализованная история просмотра с правилами throttling и provider-specific legal constraints;
- captions/quality только там, где официальный API и тариф это гарантируют;
- административная диагностика: provider, capability, privacy/access key present, domain restriction configured;
- повторная проверка официальных API перед релизом: внешние недокументированные параметры контрактом не считать.

## Решения, которые нельзя подменять технической реализацией

1. `controls=0` скрывает часть интерфейса, но не делает ссылку защищённой.
2. Проверка подписки BersonCareBot защищает собственную страницу, а не внешний URL.
3. Возможность API не означает договорного права продавать embed.
4. Ни один адаптер не должен скачивать видео с YouTube/Vimeo/VK/RUTUBE на собственный сервер без отдельного подтверждённого права.
5. В платных продуктах внешние ссылки запрещены. Видео должно быть загружено клиникой в BersonCareBot, транскодировано в собственный HLS и защищено серверной проверкой доступа.
