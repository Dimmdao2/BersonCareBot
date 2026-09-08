# Видеовстречи 1:1: Jitsi MVP, дневные заметки и заменяемый media-provider

Дата решения владельца: **2026-09-08**.
Taskdb: **#1100**.
Статус: **основной контур выполнен и проверен на DEV/TEST; выполняется owner-correction live-интерфейса и
восстановления после отказа загрузки. Интеграционная ветка и TEST содержат базовый код
`5f97267db79d4404dc75c699f9d4863780fbddbd`; app deploy, Jitsi/coturn health, обычный direct-P2P звонок,
принудительный TURN fallback и серверный отказ третьему участнику прошли. Итоговое evidence базового контура:
`docs/audit/video-meetings-test-acceptance-2026-09-08.md`**.
Интеграционная ветка лида: `feat/doctor-ui-rebuild`; исходная база исполнения:
`b0eb1e45a56deee9f6cb6b0e9948e831f429b5c6`.
PROD вне scope. Разрешены реализация, независимая приёмка и выкладка на именованный TEST.

Owner-correction 08.09.2026 для будущего PROD: каноническая пара видеобэкенда —
`meet.therapysto.ru` + `turn.therapysto.ru`; специалист остаётся внутри кабинета Therapysto, а публичная клиентская
страница `https://<clinic-slug>.therapygo.ru/live#<opaque-secret>` встраивает тот же видеохост. Дублировать
`meet/turn` в зоне `therapygo.ru` не требуется. Это фиксирует целевое именование, но не расширяет текущий TEST-only
deploy scope на PROD. На новом PROD с Docker blue/green переключаются только app-контейнеры; Jitsi/coturn живут
отдельным singleton-контуром со своим lifecycle, поэтому смена app-color не занимает повторно медиапорты и не
перезапускает текущие звонки.

Owner-correction 08.09.2026 по записям: у записи есть явный формат `очно` / `онлайн`. Онлайн-филиал только
подставляет `онлайн` по умолчанию при создании записи, физический филиал — `очно`; специалист может изменить формат.
Формат записи управляет основным действием этой записи на странице «Сегодня», но не является доступом к модулю:
видеосвязь по-прежнему разрешается только тарифом и настройкой состава кабинета, а внеплановый звонок остаётся
доступен из карточки пациента без записи. Пациентский online booking также сохраняется как `онлайн`, хотя его
каноническая запись не несёт `branch_id`; в модалке немедленного старта выбор «Онлайн-приём»/«Очный приём» сохраняет
тот же формат, а не расходится с ним.

## 1. Результат для человека

Специалист из карточки клиента, страницы «Сегодня» или модалки начала приёма начинает онлайн-встречу. Клиент
переходит по секретной ссылке без обязательного аккаунта; авторизованный клиент получает тот же звонок внутри
кабинета с разрешёнными ему данными. Встреча рассчитана строго на специалиста и одного клиента. Приоритет — прямой
WebRTC P2P; если прямое соединение невозможно, медиатрафик проходит только через наш coturn/Jitsi в РФ.

На экране специалиста видео не мешает вести карту: справа переключаются «Заметка» и существующий протокол приёма.
Заметки — единая история по календарным датам, а не отдельные сохранения и не записи на каждый звонок. Всё введённое
автоматически сохраняется в заметку текущего дня и остаётся тем же текстом после закрытия панели, нового открытия,
начала и окончания звонка.

Owner-reported regression 08.09.2026, 20:26: iPhone через действующий `awg1` открыл live-экран, но Jitsi остался на
«Подключение…», а переходы через оболочку выглядели зависшими. Runtime evidence: webapp create вернул 200, nginx
отклонил `meet.test.bersoncare.ru/external_api.js` от фактического адреса `172.31.9.2`, а Jitsi/Prosody не получили
соединение.

Owner-correction 08.09.2026 по live-интерфейсу: открытие страницы не подключает специалиста к Jitsi и не включает
media само — специалист явно нажимает «Начать звонок». Панель управления находится внизу видео; на мобильном переключение фронтальной и
задней камеры является отдельным действием прямо во время звонка, а не спрятано в настройках устройств. До прихода
второго участника локальный поток не дублируется одновременно большим и малым окном, техническое имя комнаты не
показывается. На странице специалиста сохраняются канонические вкладки карточки пациента.

Owner-correction 08.09.2026 по возможностям плеера: рабочий набор включает микрофон, камеру, отдельную мобильную
смену фронтальной/задней камеры, desktop screen share, fullscreen, выбор устройств, скрытие/показ self-view, смену
раскладки/главного участника, выбор качества видео и виртуальный фон. Главные действия находятся внизу, остальные —
в компактном меню. Не включаются Jitsi chat, список участников, Jitsi invite, raise hand, subtitles, user-facing
connection stats, recording, livestream, whiteboard/Etherpad, shared video и отдельная передача computer audio.
Техническое качество звонка нужно продукту для диагностики/аналитики, но не показывается участникам и не может
включать клинические данные или внешнюю Jitsi/8x8 telemetry.

Owner-correction 08.09.2026 по старту/приглашению: вход в doctor live по уже нажатому действию видеозвонка может
подготовить app-session, гостевую ссылку и одно уведомление через существующий notification pipeline, но не монтирует
Jitsi и не запрашивает media. Поверх video-stage остаётся большая кнопка Play; только она начинает фактическое
подключение специалиста. Экран достоверно сообщает, было ли приглашение поставлено хотя бы в один доступный канал;
если каналов нет, предлагает скопировать ссылку вручную и не утверждает, что уведомление отправлено.

App-wide плавающее видео и системный iOS Picture-in-Picture пока остаются исследованными возможностями, но не
owner-authority на реализацию этой коррекции.
Канонические вкладки на live-странице остаются обычной навигацией: переход на другую подстраницу завершает текущий
page-scoped Jitsi instance. Сохранение звонка между маршрутами требует отдельно разрешённого app-wide floating-call
контейнера и в эту коррекцию не входит; блокировать вкладки во время звонка также не требуется.

## 2. Owner requirements — неизменяемый acceptance scope

### Встреча и трафик

- [ ] **VM-09.** Каноническая подсеть owner VPN `awg1` — `172.31.9.0/24`. Её используют все штатные источники,
      способные переписать доступ: `deploy/host/apply-test-nginx-webapp.sh` (оба allow-блока),
      `deploy/host/apply-test-vpn-dns.sh` (gateway, listen/address, DNAT и fatal-проверка), Jitsi nginx template и
      network policy, а также раздел «Доступы / VPN» в `SERVER CONVENTIONS.md`. Устаревшая `10.9.1.*` в этих активных
      источниках не остаётся; dry-run обоих apply-скриптов показывает новый адрес и не показывает старый.
- [ ] **VM-10.** Ошибка загрузки Jitsi bundle сразу переводит stage из «Подключение…» в понятное состояние отказа с
      действием «Повторить». Ни ошибка bundle, ни отказ create/join не оставляют stage в «Подключение…»; обе ветки
      дают retryable отказ. Перед каждой bundle-попыткой ранее добавленный loader-script удаляется и создаётся заново,
      если глобального конструктора ещё нет, поэтому retry/remount не ждёт события уже отработавшего `<script>`.
      Произвольный общий deadline не объявляет рабочую медленную загрузку ошибкой: таймер, если используется, только
      показывает нефатальное сообщение о долгой загрузке и доступный retry. Навигация оболочки остаётся доступной.

- [x] **VM-01.** Первый провайдер — полностью self-hosted Jitsi Meet; JaaS, `meet.jit.si`, 8x8 и другие внешние
      сервисы не используются в runtime. Доказательство: итоговый TEST health и browser host census в
      `docs/audit/video-meetings-test-acceptance-2026-09-08.md`.
- [x] **VM-02.** Комната допускает ровно две роли и не более двух одновременно подключённых участников: один
      специалист и один клиент. Ограничение принудительно действует на сервере Prosody/MUC, поэтому повторный вход тем
      же subject со второй вкладки или устройства не создаёт третьего места. Доказательство: live third-context
      `service-unavailable` и `muc_max_occupants = 2` в итоговом TEST evidence.
- [x] **VM-03.** Для двух участников Jitsi сначала устанавливает прямое P2P-соединение; при невозможности direct ICE
      использует только собственный coturn, а JVB остаётся собственным fallback-путём. Доказательство: обычный браузерный
      прогон выбрал direct P2P, принудительный прогон — relay собственного coturn; JVB health=200.
- [x] **VM-04.** Из Jitsi, JVB и клиента удалены внешние STUN/TURN, telemetry, callstats, аватары и иные third-party
      runtime-запросы; ICE endpoints принадлежат нашему контуру в РФ. Доказательство: runtime config scan и browser host
      census в итоговом TEST evidence.
- [x] **VM-05.** Записи и транскрибации нет: Jibri, Jigasi и соответствующие UI/маршруты не поднимаются.
      Доказательство: состав из пяти runtime-контейнеров и package audit `a710e68c2`.
- [ ] **VM-06.** Интерфейс звонка не содержит брендинг Jitsi и техническое имя комнаты. Главная нижняя панель даёт
      mute/unmute микрофона и камеры, завершение, desktop screen share и на мобильном отдельную прямую смену
      фронтальной/задней камеры; компактное меню даёт fullscreen, поддерживаемый браузером выбор устройств,
      hide/show self-view, раскладку/главного участника, качество видео и виртуальный фон. Недоступная браузеру
      функция скрывается или понятно disabled, а не ведёт в мёртвое действие. На этом этапе командная поверхность —
      штатный нижний toolbar Jitsi: базовый allow/deny-набор задаётся единожды в `deploy/jitsi/config/web/*`, а
      iframe `configOverwrite` только сужает его под возможности конкретного browser/device. Product-owned toolbar,
      доступ к DOM iframe и второй `getUserMedia` не создаются. До реализации фактические commands/events/config-
      ключи пинованной `stable-11146-2` фиксируются capability census в `docs/audit/`; отсутствующая либо требующая
      remount функция не имитируется и выносится как owner question.
- [ ] **VM-11.** Jitsi chat, participants pane, Jitsi invite, raise hand, subtitles, stats UI, recording,
      livestream, whiteboard/Etherpad, shared video и отдельный share-computer-audio не показываются и не включаются
      ни из toolbar/overflow, ни через доступные в пинованной сборке hotkeys/context-menu входы.
- [ ] **VM-12.** Provider-neutral техническая диагностика фиксирует только необходимые operational events звонка
      (как минимум join/error, длительность и P2P/fallback status), доступна системе, а не участникам, не содержит
      клинических данных/raw secret/JWT/TURN credential и не отправляется в Jitsi/8x8/другие внешние telemetry.
      Текущий этап пишет структурированные server logs через существующий `logger`/`logServerRuntimeError` с закрытым
      набором полей: meeting/organization ID, роль, `join|error|end`, длительность, `p2p|relay` и класс ошибки.
      Browser-факты принимает одно аутентифицированное doctor-only действие существующего маршрута встречи; новая
      таблица, миграция, retention job, admin UI и расширение `PRODUCT_ANALYTICS_EVENT_TYPES` запрещены. Guest ingest
      и постоянное хранилище аналитики требуют отдельного owner-решения.
- [x] **VM-07.** Приложение работает через provider-neutral контракт. Страницы, права, приглашения, тарифы и заметки
      не знают о Jitsi room/JWT API; Jitsi — сменный adapter/renderer. Доказательство: core `e0bac698b`, UI
      `8ca8cc17b` + audit fix `623ce4fc4`, full CI `71ea8a3ca`.
- [x] **VM-08.** Следующий целевой provider после MVP — собственный тонкий клиент на PeerJS либо native
      `RTCPeerConnection`, собственный signalling и тот же coturn. LiveKit не является целевым переходом для этого
      сценария, потому что SFU постоянно несёт медиатрафик двух участников. Доказательство: сменный provider port из
      `e0bac698b`; решение закреплено в этом каноническом плане.

### Доступ, ссылка и уведомления

- [x] **ACC-01.** Специалист создаёт или возобновляет встречу только внутри активной организации и только с клиентом,
      которого он вправе открыть в текущем workspace; tenant/role checks выполняются сервером. Доказательство: core
      acceptance `1a0f66cc2` + fixes `6810dde0b`, full CI `71ea8a3ca`.
- [x] **ACC-02.** Гостевая ссылка имеет вид `https://<clinic-slug>.therapygo.ru/live#<opaque-secret>`: секрет
      высокоэнтропийный, не попадает в path/query/access log/referrer, в БД хранится только hash, имеет expiry,
      отзыв и ротацию. Доказательство: fragment fault-injection audit и live fragment cleanup в итоговом TEST evidence;
      до отдельного TEST patient-origin используется разрешённый однохостовый `/live#secret` fallback.
- [x] **ACC-03.** Обмен секрета на короткоживущий join capability выполняется сервером; capability даёт только место
      клиента в конкретной встрече и не открывает карточку, дневник, программу или API пациента. Доказательство: guest
      route audit/fix `0a0d51b57` + `fbd4dab8d`, full CI и live exchange=200.
- [x] **ACC-04.** Авторизованный пациент видит личные данные справа только после обычной patient-auth проверки и
      серверного совпадения пользователя со встречей; знание гостевой ссылки это право не заменяет. Доказательство:
      full-surface audit/fix `623ce4fc4`, full CI `71ea8a3ca`.
- [x] **ACC-05.** При создании приглашения приложение формирует одно product-notification событие; каналы не
      зашиваются в сценарий, а выбираются общим правилом `доступное ∩ разрешённое получателем`. Содержание — факт
      приглашения и ссылка без клинического текста. На экране встречи специалист может скопировать ссылку.
      Доказательство: notification `b0c1085d6` + auditor acceptance `b60563a6a`, full CI.
- [ ] **ACC-07.** Подготовка новой doctor live-встречи ставит приглашение ровно один раз в существующий pipeline;
      выбираются доступные и разрешённые клиентом web push/email/Telegram/MAX. Doctor UI получает безопасный итог
      `queued/partially queued/skipped/unavailable`: показывает факт постановки хотя бы в один канал либо честно
      предлагает ручное копирование, но не раскрывает адреса получателей и внутренние ошибки. Idempotency привязан к
      конкретному invite ID, а не meeting ID: новая явная ротация физически может поставить новое приглашение.
      `queued`/`partially queued` означает, что реально вставлена хотя бы одна строка очереди; полный dedup даёт
      `skipped`. Doctor HTTP route сериализует только безопасный статус и виды каналов без адресов.
- [ ] **ACC-08.** Invite выпускается ровно один раз при создании встречи. Resume никогда не вызывает `rotateInvite`,
      не инвалидирует доставленную ссылку и не отправляет повторное уведомление. Так как raw secret не хранится, на
      resume `guestUrl = null`, а UI вместо мёртвого копирования предлагает явное «Выпустить новую ссылку» через
      существующий `rotate_invite`; только это пользовательское действие заменяет capability и проходит тот же
      notification/feedback contract ACC-07.
- [x] **ACC-06.** Истёкшая, отозванная, подменённая, чужая tenant-ссылка и попытка занять третье место получают отказ
      без раскрытия существования клиента или комнаты. Доказательство: core route tests/full-surface audit и live
      server-side refusal третьего context в итоговом TEST evidence.

### Дневные заметки

- [x] **NOTE-01.** В истории клиента одна логическая заметка на сочетание `organization + client + author + local
calendar date`; звонок, повторное открытие панели и ручные UI-действия новую запись не создают. Доказательство:
      migration/service `f08e36b07`, DEV preflight+execute и full CI `71ea8a3ca`.
- [x] **NOTE-02.** Текущая дата определяется по сохранённому IANA-поясу устройства специалиста с fallback на
      `system_settings.app_display_timezone`; дата хранится явно, а не вычисляется заново из `created_at` при каждом
      чтении. Открытый редактор не переключается посреди ввода при наступлении полуночи; новая дата применяется при
      следующем открытии редактора. Доказательство: timezone/date service `f08e36b07`, full CI `71ea8a3ca`.
- [x] **NOTE-03.** Вся история видна в обратном порядке дат и разделена датой без времени создания/сохранения.
      Доказательство: shared notes UI `f08e36b07`, full CI `71ea8a3ca`.
- [x] **NOTE-04.** Сегодняшняя заметка открыта первой и редактируема по умолчанию. Кнопки «Добавить»/«Сохранить» нет:
      каждое изменение автоматически и надёжно сохраняется. Доказательство: autosave UI/service `f08e36b07`, full CI.
- [x] **NOTE-05.** Прошлые даты по умолчанию свернуты; свернутая заметка показывает максимум три визуальные строки и
      многоточие при переполнении. Доказательство: shared notes UI `f08e36b07`, full CI `71ea8a3ca`.
- [x] **NOTE-06.** Прошлую заметку можно развернуть, кликнуть в отдельный borderless textarea и отредактировать; её
      дата при редактировании не меняется. Доказательство: dated update path/UI `f08e36b07`, full CI `71ea8a3ca`.
- [x] **NOTE-07.** Автосохранение сериализовано отдельно для каждой даты, не допускает победы запоздавшего старого
      ответа, сохраняет локальный текст при сетевой ошибке и повторяет запись без reload родителя. Доказательство:
      per-date queue/revision tests из `f08e36b07`, full CI `71ea8a3ca`.
- [x] **NOTE-08.** Состояние редакторов стабильно: autosave, сворачивание соседней заметки и переключение вкладок не
      перемонтируют Jitsi/video и не отнимают фокус у активного textarea. Доказательство: remount fault injection в
      `docs/audit/video-meetings-full-surface-2026-09-08.md`, fix `623ce4fc4`, full CI.
- [x] **NOTE-09.** Существующие строки одного автора и клиента за один московский календарный день объединяются без
      потери текста в хронологическом порядке; earliest `created_at` и latest `updated_at` сохраняются как provenance.
      Доказательство: migration/backfill `f08e36b07`, DEV preflight+execute и full CI `71ea8a3ca`.

### Экран встречи и разрешённые изменения UI

- [ ] **UI-08.** Открытие doctor live-страницы может один раз подготовить app-session/ссылку/уведомление, но не
      монтирует Jitsi iframe и не запрашивает камеру/микрофон. Только на doctor live-странице поверх video-stage до
      подключения показывается большая кнопка Play «Начать звонок»; общий `VideoMeetingStage` и guest/patient live-
      страницы этой кнопки не получают и продолжают присоединяться по ссылке автоматически. `prepare` означает только
      create-or-resume + invite/notification; при Play тот же doctor create-or-resume route вызывается повторно и
      выдаёт свежий join-material на момент старта, после чего монтируется единственный adapter. Отдельный specialist
      join endpoint/lifecycle/provider path не создаётся. Повторные быстрые нажатия не создают несколько Jitsi
      instances или app-sessions; Play после паузы дольше прежнего TTL join-material продолжает работать.
- [ ] **UI-09.** Doctor live-страница переиспользует канонические desktop/mobile вкладки карточки пациента; вкладки
      видны и маршрутизируют так же, как на существующих подстраницах пациента, без второго набора навигации.
- [ ] **UI-10.** Панель управления находится у нижнего края video-stage на мобильном и desktop. Пока специалист в
      комнате один, его локальное видео показывается ровно один раз, без второго self-thumbnail и без пустой второй
      плитки; приход клиента переводит stage в обычную 1:1-композицию.

- [x] **UI-01.** Создан отдельный экран специалиста: видео слева, справа вкладки «Заметка» и «Приём»; заметка
      переиспользует дневную историю, «Приём» — существующий канонический протокол и его write-path, без второго формата.
      Доказательство: UI `8ca8cc17b` + blind-audit fix `623ce4fc4`, full CI и live TEST call.
- [x] **UI-02.** Публичная guest-страница показывает только звонок. Авторизованная страница пациента может справа
      переключать доступные ему дневник симптомов, выполнения и назначенную программу через существующие read-paths.
      Доказательство: full-surface audit finding/fix `623ce4fc4`, full CI `71ea8a3ca`.
- [x] **UI-03.** На странице «Приём» клиента рядом с «Начать приём» добавлена квадратная синяя кнопка видеозвонка.
      Доказательство: scope inspection в full-surface audit, fix `623ce4fc4`, full CI.
- [x] **UI-04.** На странице «Сегодня» в блоке «Следующая запись» онлайн-запись показывает одним основным действием
      «Начать созвон» вместо «Начать приём» только при эффективном доступе к `video_meetings` и привязанном аккаунте
      пациента; иначе она безопасно показывает обычное «Начать приём». Очная запись показывает «Начать приём» без
      отдельной камеры. Этот UI fallback не меняет сохранённый формат. Доказательство: appointment-format
      `d696934ec` + audit fix `a5ac470fe`, full CI.
- [x] **UI-05.** В модалке начала приёма нижняя зона содержит два действия: «Очный приём» и «Онлайн-приём»; прежняя
      кнопка отмены в этой позиции не остаётся. Это сохраняет внеплановый выбор из карточки пациента без обязательной
      записи. Доказательство: full-surface audit + modal fixes `623ce4fc4`, full CI.
- [x] **UI-06.** У канонической записи хранится формат `очно` / `онлайн`; он выбирается в существующей форме деталей
      записи. Онлайн-филиал или online patient-booking path задаёт `онлайн` по умолчанию, физический филиал — `очно`,
      но пользователь может изменить значение. В модалке немедленного старта выбранное действие сохраняет совпадающий
      формат. Филиал не включает и не выключает модуль видеосвязи и не запрещает внеплановый звонок. Доказательство:
      `d696934ec` + audit acceptance/fixes `7f35646ac`/`a5ac470fe`, full CI.
- [x] **UI-07.** Кроме перечисленных кнопок, новых live-страниц и контейнеров заметки/приёма/разрешённых пациентских
      вкладок другие страницы и элементы интерфейса не меняются. Доказательство: changed-file scope census в
      `docs/audit/video-meetings-full-surface-2026-09-08.md` и appointment-format audit.

### Включение и тариф

- [x] **GATE-01.** Видеовстречи — отдельный модуль `video_meetings` в существующей настройке состава кабинета
      специалиста (`doctor_workspace_composition`). Встроенная локация/филиал «Онлайн» не влияет ни на видимость
      элементов видеозвонка, ни на create/join. Эффективный доступ равен пересечению тарифной доступности и этой
      настройки: скрытие кнопок дополняется server-side отказом всех create/join путей. Tariff-часть проходит только
      через существующий `requireEntitlementForRead/Mutation`; отдельный tariff-check внутри `video-meetings` service
      запрещён. Доказательство: workspace correction `2a8320dd5`, guest boundary fix `fbd4dab8d`, full CI.
- [x] **GATE-02.** Возможность `video_meetings` добавлена в канонический `MECHANIC_REGISTRY` и в
      `app-layer/entitlements/protectedActionRegistry.ts` для всех защищённых create/join действий; это существующая
      настраиваемая entitlement-механика, а не отдельный feature-flag или hardcode в UI. Доказательство: core
      `e0bac698b` + audit fixes `6810dde0b`, registry/privilege checks в full CI.
- [x] **GATE-03.** Entitlement включён в тариф разработчика владельца тем же каноническим seed/reconcile/admin
      write-path, которым управляются остальные возможности; миграция не выдаёт тарифные права. Доказательство:
      developer-tariff reconcile из core `e0bac698b`, migration privilege review и full CI.
- [x] **GATE-04.** Если Jitsi/system settings отсутствуют либо provider unhealthy, create/join fail closed с понятной
      причиной специалисту; гостю не раскрываются внутренние детали. Доказательство: core route acceptance/audit,
      guest refusal contract и TEST provider-health/live join PASS.

## 3. Архитектурные границы

```text
doctor/patient/guest UI
        |
        v
video-meetings application service
  - tenant + relationship + effective workspace-module gates
  - session/invite lifecycle
  - role-scoped join capability
        |
        +--> VideoMeetingProvider port ----> infra/jitsi adapter (MVP)
        |                                  -> peerjs/native adapter (later)
        +--> VideoMeetingStore port ------> Drizzle repository
        +--> existing notification intent pipeline

daily-notes UI --> existing doctor-notes service/port --> extended Drizzle repository
encounter tab  --> existing canonical encounter form/service/write-path
```

- Новые ports/types принадлежат `src/modules`, infra только реализует их; routes остаются thin и получают зависимости
  через `buildAppDeps()`.
- App-facing URL/issuer/public settings Jitsi читаются из `system_settings`. Подписывающий секрет Jitsi JWT также
  является `restricted`/`secret_envelope` ключом `system_settings`, объявленным в `registry.ts`, и изменяется только
  через `createSystemSettingsService().updateSetting`; новые env-ключи для него запрещены. В TEST deploy secret store
  живут только host-side конфиги Prosody/JVB/coturn. Секрет JWT не возвращается браузеру; статические TURN credentials
  браузеру запрещены.
- Минимальные данные сессии: organization, client, specialist, optional appointment, opaque provider room ref,
  lifecycle status, expiry/revocation timestamps. Provider JWT и room name не становятся публичным app API.
- Invite — отдельная ротируемая capability с hash секрета. Raw secret существует только при выпуске/ротации и в
  fragment URL у отправителя/получателя.
- `doctor_notes` расширяется явной `note_date` и optimistic revision. Уникальность дневной записи обеспечивается БД
  с корректной семантикой nullable legacy `organization_id` (`NULLS NOT DISTINCT` либо доказанный backfill до
  `NOT NULL`), а create/update сводятся в один idempotent upsert service. Новая таблица/колонки сначала объявляются
  в `deploy/postgres/privileges/declaration.ts`; миграция прав не выдаёт.
- `video_meetings` расширяет существующий закрытый `WORKSPACE_MODULE_KEYS`; у модуля нет зависимости от
  `encounters`, `client_portal` или филиала «Онлайн», потому что гостевая 1:1-ссылка работает и без них. Канонический
  effective-resolver пересекает настройку с существующим entitlement pass; параллельные флаги и обходные чтения не
  создаются. Availability модуля обязана вычисляться из механики `video_meetings` и в
  `app-layer/guards/workspaceModuleAccess.ts`, и в литерале `availableModules` страницы настроек; константа `true`
  запрещена. Тем же коммитом расширяется канонический закрытый список C3M.4 в
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` со ссылкой на owner-решение 08.09.

## 4. Jitsi/coturn runtime contract

- Отдельные TEST DNS names для meeting web/signalling и TURN; сертификаты доверенные браузерами.
- P2P включён для двух участников. Собственный STUN/TURN — единственный ICE list; JVB имеет фиксированный
  advertised public address и не обращается к внешним STUN.
- TURN использует time-limited credentials (Jitsi XEP-0215/coturn shared-secret mechanism), UDP и TLS fallback для
  ограниченных сетей. Диапазон relay/media ports минимален и явно отражён в nftables/Selectel SG.
- Secure domain/JWT: произвольный пользователь не может создать комнату или подобрать room URL. Token ограничен
  room, role, subject и временем.
- Prosody/MUC принудительно ограничивает комнату двумя occupants независимо от JWT subject. Проверка третьего
  подключения выполняется на серверной стороне Jitsi/Prosody, а не только app-capability слоем.
- Third-party requests disabled; Gravatar, Giphy, Etherpad, analytics/callstats, YouTube/live streaming, dial-in,
  calendar and invite integrations отсутствуют.
- Сбор логов не содержит raw invite secret, Jitsi JWT, TURN credential, имени пациента, текста заметки или
  клинических данных.
- Абсолютная географическая трасса прямого P2P-пакета не обещается: маршрут определяют сети участников. Гарантия
  продукта — отсутствие наших иностранных endpoints/провайдеров; TURN/JVB fallback размещён в РФ. Если позже будет
  нужна гарантированная relay-only география, это отдельное owner-решение с отказом от P2P и ростом нагрузки.

## 5. Исполнение независимыми потоками

Каждый stateful исполнитель запускается через `tools/orch-launch.sh` в отдельном `wt/<workstream>` от принятого SHA.
Воркеры не создают, не ослабляют и не переписывают поведенческие acceptance-тесты. Исполнитель core-correction
механически обновляет существующие фикстуры, которые перестают компилироваться после удаления `onlineGate`; это не
является новым покрытием. Лид принимает только committed SHA и приземляет по одному после diff/evidence.

### Волна 0 — plan gate

1. Лид фиксирует этот план и исправляет package canon: Jitsi MVP → PeerJS/native WebRTC, не LiveKit.
2. Отдельный `claude-opus-5`, effort `high`, проверил полноту owner scope, архитектурные границы, порядок зависимостей,
   достижимость TEST и лишнюю работу: run
   `/home/dev/brain/runs/agent-port/bcb-video-meetings-plan-opus-audit-20260908.json`, verdict `MUST FIX`.
3. Лид внёс все шесть доказанных corrections одним проходом: права UPDATE заметок, entitlement registry/chokepoint,
   TEST guest-origin и `/live` route, Prosody occupancy limit, `system_settings` JWT secret, candidate migration
   preflight и последовательная regeneration privilege-артефактов. Повторный audit той же документации не требуется
   по §24.6; accepted plan фиксируется коммитом до запуска реализации.
4. После owner-correction 08.09 лид заменил ошибочную зависимость от филиала «Онлайн» в документации на существующую
   настройку состава кабинета. Delta проверил отдельный `claude-opus-5`, effort `high`, run
   `/home/dev/brain/runs/agent-port/video-gate-delta-opus-audit-20260908.json`; verdict `MUST FIX`: landed core ещё
   сохраняет Online-gate, workspace registry/settings availability не расширены, C3M.4 не обновлён. Исправления
   назначены отдельному потоку A2 до интеграции UI.
5. Owner-delta формата записи проверил отдельный `claude-opus-5`, effort `high`, run
   `/home/dev/brain/runs/agent-port/video-appointment-format-plan-opus-20260908.json`; verdict `MUST FIX`. До worker-
   запуска лид внёс пять corrections: online patient flow без `branch_id`, одна format-aware дверь обновления без
   ложных reschedule-effects, privilege/SECURITY DEFINER declaration, безопасный CTA fallback и единый canonical
   source для `patient_bookings.booking_type`. Owner-вопрос аудита закрыт прямым смыслом UI-05/UI-06: действие
   немедленного старта сохраняет выбранный формат.
6. Owner-correction live-интерфейса/loader/VPN перед новым worker-start проверил отдельный `claude-opus-5`, effort
   `high`, run `/home/dev/brain/runs/agent-port/video-live-owner-delta-plan-opus-20260908.json`; verdict `MUST FIX`.
   Лид внёс пять corrections одним проходом: полный список awg1 reconciler-источников, общий retryable отказ для
   bundle и create/join, doctor-only границу кнопки старта, удаление отменённого точного toolbar-теста перед worker и
   явный live-only маршрут доказательства визуальных пунктов. App-wide floating/PiP остаётся вне authority; вкладки
   выполняют обычный page transition. Повторный plan-audit той же дельты не запускается по §24.6.
7. Уточнённую owner-дельту Play/invite/player capability до worker-start проверил отдельный `claude-opus-5`, effort
   `high`, run `/home/dev/brain/runs/agent-port/video-player-invite-delta-plan-opus-20260908.json`; verdict
   `MUST FIX`. Лид устранил семь разрывов: invite только на create и явная ротация, invite-scoped idempotency и
   честный route-result, свежий join-material на Play, единый Jitsi config layer и обязательный restart, capability
   census пинованной сборки, штатный Jitsi toolbar вместо второго media/UI пути и server-log-only граница
   диагностики без новой БД. Повторный plan-audit этой дельты не запускается по §24.6.

### Волна 1 — три параллельных независимых кандидата

- **Поток A — video core + tariff/gates:** schema, Drizzle ports/adapters/services, session/invite API, capability,
  existing entitlement extension, developer tariff enablement, workspace-module server gate, system settings registry. Обязан
  расширить `MECHANIC_REGISTRY`, `protectedActionRegistry.ts` и использовать только
  `requireEntitlementForRead/Mutation`; собственный tariff-check в новом service не создаётся. Новая relation сначала
  описывается в `deploy/postgres/privileges/declaration.ts`, затем генерируются canonical privilege-артефакты.
- **Поток B — дневные заметки:** migration/backfill, one-day upsert/update contract, optimistic autosave API и
  переиспользуемая история/редактор в текущем клиентском overview. Расширяет существующий
  `doctor-calendar-timezone` resolver вместо второй timezone-цепочки. В
  `deploy/postgres/privileges/declaration.ts` добавляет `app_staff` UPDATE как минимум для `text`, `updated_at`,
  `note_date` и revision-колонки, после чего генерирует canonical privilege-артефакты; сама миграция grants не
  содержит. Не касается live pages.
- **Поток C — Jitsi/coturn TEST package:** version-pinned self-hosted deployment/config/runbook, no-third-party
  network policy, JWT/Prosody/JVB/coturn contract, принудительный Prosody/MUC max-occupants=2 и безопасный TEST
  apply/rollback path. PROD не трогает.
- **Поток A2 — owner-correction landed video core:** удалить `VideoMeetingOnlineGate`,
  `online_location_inactive`, DI-чтение `findBuiltInOnlineLocation` и HTTP-маппинг этой причины; добавить
  `video_meetings: []` в закрытые `WORKSPACE_MODULE_KEYS`/`WORKSPACE_MODULE_DEPENDENCIES`; закрыть существующими
  workspace-module helpers все четыре двери doctor create/lifecycle, guest exchange и patient join. Оба места
  availability получают тарифную механику `video_meetings`, а не `true`. Тем же коммитом обновить C3M.1/C3M.4 и
  только механически удалить устаревший `onlineGate` из существующих test fixtures. Новый feature gate, второй
  resolver и новые тесты не создавать.

### Волна 2 — после landing контрактов волны 1

- **Поток D — meeting UI:** provider-neutral stage + Jitsi renderer, doctor/guest/auth-patient live pages, разрешённые
  entry buttons и переиспользование note/encounter/patient panes. Добавляет явное правило `/live` в
  `SURFACE_ROUTE_RULES`, строит branded guest URL через канонический surface/origin builder и обеспечивает обе
  достижимые ветки модалки, включая `mode === 'create'`, без параллельного футера. Все entry points и live-двери
  проецируют один effective `video_meetings` workspace module; состояние филиала «Онлайн» не читают. Перед
  owner-correction этого потока auditor-live заменяет отменённый точный assert
  `TOOLBAR_BUTTONS === ['microphone','camera','hangup']`: точное число/список кнопок больше не является контрактом и
  не заменяется новым списком; устойчивые create/retry/remount свойства проверяются поведением, внешний состав и
  расположение панели — live/visual.
- **Поток D2 — owner-correction player/invite:** после capability census параметризует существующие
  `DoctorLiveMeetingClient`, `VideoMeetingStage`, `JitsiMeetingRenderer`, doctor create-or-resume/lifecycle route и
  invitation pipeline. Prepare не монтирует media; Play через ту же дверь получает свежий join-material. Resume не
  ротирует invite, явная ротация остаётся единственной заменой ссылки; route/UI показывают фактический безопасный
  notification result. Диагностика использует существующий doctor route и server logger, без второго lifecycle,
  новой таблицы или product toolbar. Ведёт также `deploy/jitsi/config/web/*`: это единственный базовый allow/deny-
  слой плеера, а browser adapter может только сузить его.
- **Поток C2 — owner VPN reconciler:** приводит все штатные TEST apply/reconcile/template/docs источники `awg1` к
  `172.31.9.0/24` и `172.31.9.1`; PROD/`awg0`, live host и webapp production code не меняет.
- **Поток E — notification integration:** новое typed событие приглашения через единый pipeline, ссылка без
  клинического содержания, дедупликация одной отправки при создании.
- **Поток F — integration mechanic:** устранение только фактических стыков типов/routes/config после D/E, без
  расширения UI и без тестов.
- **Поток G — формат записи и основной CTA:** расширить существующую каноническую запись полем формата
  `in_person` / `online`, провести его через существующие create/read-paths и форму деталей записи. Server-side
  default — `online`, если выбран встроенный Онлайн-филиал **или** запрос пришёл из online patient-booking path,
  который штатно хранит `branch_id = NULL`; иначе `in_person`. Backfill использует тот же союз: Онлайн-филиал или
  связанная `patient_bookings.booking_type = 'online'`, затем поле становится `NOT NULL DEFAULT 'in_person'`;
  data-only часть маркируется `BCB-MIGRATION-BACKFILL`. Клиент получает явный per-branch online-флаг, вычисленный
  сервером через существующий `isBuiltInOnlineLocation`, и не угадывает его по label.

  Редактирование идёт через единственную существующую дверь `manual-reschedule`, расширенную формат-параметром, без
  второго endpoint. `rescheduleCount`, `be_appointment_reschedules`, `status = 'rescheduled'`, уведомление
  `booking.rescheduled`, отмена reminders и payment carry-over выполняются только при реальном изменении времени;
  смена одного формата не уведомляет пациента и не создаёт артефактов переноса. В create-модалке нажатие
  «Онлайн-приём»/«Очный приём» сохраняет соответствующий формат как явный override.

  Новая колонка сначала описывается в `deploy/postgres/privileges/declaration.ts`: `app_staff` INSERT/UPDATE,
  пять whole-row SECURITY DEFINER relation surfaces и patient-booking insert seam; canonical privilege-артефакты
  регенерируются и проверяются. Миграция grants не содержит и проходит owner-aware rollback-only preflight из
  exact candidate. Индекс не нужен: формат не участвует в `WHERE`/`JOIN`/`ORDER BY`. Legacy-проекция
  `patient_bookings.booking_type` выводится из canonical appointment format в существующем
  `ensureStaffBookingProjection`, а не хранит hardcoded `in_person` как второй источник истины.

  `DoctorTodayNextAppointment` параметризуется этим полем: онлайн-запись запускает видеовстречу одним основным
  действием только при effective `video_meetings` и связанном patient account; иначе показывает обычное «Начать
  приём». Очная запись показывает обычный приём без отдельной камеры. Быстрая камера в карточке пациента и server-
  side доступ к видео остаются независимы от формата и филиала. Перед worker-запуском эту owner-delta проверил
  `claude-opus-5`, effort `high`; исправленная дельта — authority реализации без повторного plan-audit (§24.6).

### Волна 3 — независимая приёмка

Первый auditor-live до чтения тестов составляет kill-set по ID этого плана. Только аудитор добавляет недостающие
поведенческие acceptance-тесты и доказывает их fault injection; внешний вид, тексты, число кнопок, классы и строки
исходника не цементируются тестами — это одноразовая live/visual приёмка.

Обязательные классы поломок:

- tenant/relationship/role/tariff/workspace-module bypass и ошибочная зависимость от филиала «Онлайн»;
- повторное создание комнаты или дневной заметки при retry/race;
- утечка raw guest secret/JWT/TURN credential;
- guest access к private patient/doctor data;
- expired/revoked link и третье место;
- lost update/out-of-order autosave и редактирование прошлой даты;
- external ICE/telemetry request и невозможность TURN/JVB fallback;
- remount video/focus loss при autosave и переключении правой панели.
- автозапуск Jitsi/media при простом открытии live-страницы и duplicate Jitsi instance при двойном нажатии Play;
- протухший join-material при Play после паузы дольше срока ранее подготовленного JWT;
- зависание после `external_api.js` error/remount, неработающий retry и блокировка shell navigation;
- повторное уведомление/инвалидация уже отправленной ссылки при refresh/resume и ложное UI-сообщение об отправке,
  когда ни один канал не поставлен в очередь;
- утечка клинических данных/секретов или внешний telemetry endpoint в технической диагностике звонка;
- `[live-only]` отсутствие канонических вкладок карточки пациента на doctor live-странице;
- `[live-only]` дублирование локального self-view до прихода клиента, техническое имя комнаты, верхняя панель
  управления, отсутствие прямой мобильной смены камеры или разрешённой secondary-функции, а также появление любой
  из запрещённых VM-11 функций;
- потеря/неверный default формата записи, смена формата без сохранения и расхождение CTA «Сегодня» с сохранённым
  форматом; ошибочная привязка самого доступа к видео к филиалу или формату записи;
- online patient booking без `branch_id`, ложные reschedule-status/count/history/notification/reminder/payment
  side effects при format-only edit, отсутствие column privileges/definer surface, мёртвый CTA без effective module
  или patient account и расхождение canonical format с `patient_bookings.booking_type`.

После исправлений новый слепой круг не запускается: исполнитель доводит тот же kill-set до green, лид проверяет diff
и evidence. Новый audit нужен только для новой поверхности или оставшихся нетестовых findings.

## 6. Проверки и TEST rollout

1. Для каждого migration-кандидата до аудита и landing: targeted checks; owner-aware rollback-only preflight из
   точного candidate checkout на именованной DEV командой
   `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root <canonical-dev-env-root>`; затем письменный разбор
   прав по четырём пунктам §1 (runtime role, точные relation/columns/functions, write-path и RLS), включая
   `doctor_notes` UPDATE на `text`, `updated_at`, `note_date` и revision.
2. После landing **каждой** из параллельно разработанных migration-веток лид объединяет актуальную
   `deploy/postgres/privileges/declaration.ts`, заново генерирует общие privilege-артефакты и выполняет
   `node deploy/postgres/privileges/generate-cli.mjs --check` до landing следующего кандидата.
3. Интеграционный full CI только один раз на итоговом SHA командой
   `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` из-за новых migration + routes + package/deploy surfaces.
4. TEST migration только на именованной `bersoncarebot_test`; disposable DB и historical replay запрещены.
5. Развернуть приложение штатным TEST deploy. Jitsi/coturn применить отдельным documented TEST script с health,
   rollback и точным firewall diff; после изменения `deploy/jitsi/config/web/*` обязательно выполнить штатный
   `deploy/jitsi/bin/restart.sh`, затем health/rollback-проверку. PROD-хосты не затрагивать.
6. Живая проверка владельцевыми TEST-аккаунтами клиники «Дмитрий Берсон», специалиста и пациента:
   entitlement/workspace-module on/off, независимость от состояния филиала «Онлайн», создание встречи из трёх entry
   points, guest fragment link, authenticated patient page, notes continuity, past-note edit, encounter tab,
   notification intent; online-default из Онлайн-филиала и patient online flow, ручной override без признаков
   переноса, совпадение пациентского label и canonical format, CTA fallback при module off/нет patient account.
7. По ACC-02 код отдельно доказывает fragment-link, branded-origin builder и `/live` surface-rule; живая проверка до
   появления отдельного patient-origin выполняется на разрешённом однохостовом `https://test.bersoncare.ru/live`.
8. Два browser contexts с synthetic media подтверждают successful call; третий независимый context доказывает
   серверный отказ Prosody/MUC. ICE stats отдельно подтверждают direct P2P и принудительный TURN fallback; если среда
   не позволяет дать реальную камеру, это не мешает synthetic media proof и честно указывается в evidence.
9. Network capture/DNS allowlist подтверждает отсутствие иностранных runtime endpoints. Jitsi/JVB/coturn health и
   restart/rollback проверяются без записи или транскрибации.
10. После автоматической DEV-проверки и TEST deploy владелец выполняет финальную пользовательскую приёмку на iPhone
    через `awg1` и на desktop: открытие doctor live подготавливает ссылку/статус приглашения, но не запрашивает
    камеру/микрофон; большая Play-кнопка начинает фактическое подключение; панель находится у нижнего края; мобильная
    кнопка прямо в звонке переключает фронтальную/заднюю камеры; разрешённые VM-06 функции доступны только там, где
    поддерживаются браузером, запрещённых VM-11 функций нет; до прихода клиента локальное изображение ровно одно;
    технического имени комнаты/брендинга нет; канонические вкладки ведут туда же, что на подстранице приёма. До этой
    owner-проверки лид самостоятельно выполняет source/automated/virtual DEV acceptance, TEST server logs/health и
    forced `external_api.js` error/retry; вкладки не обещают сохранение звонка между маршрутами.

## 7. Внешние gates и границы релиза

### Фактическое состояние на 2026-09-08

- Core, дневные заметки, уведомление, workspace/tariff gate, UI, формат записи и self-hosted Jitsi/coturn package
  приземлены в `feat/doctor-ui-rebuild`. Итоговый код TEST —
  `5f97267db79d4404dc75c699f9d4863780fbddbd`. Независимая Wave 2 приёмка и её исправления записаны в
  `docs/audit/video-meetings-full-surface-2026-09-08.md`; итоговая runtime-приёмка — в
  `docs/audit/video-meetings-test-acceptance-2026-09-08.md`.
- `bash deploy/host/migrate-dev.sh --preflight` и `bash deploy/host/migrate-dev.sh --execute` прошли на именованной
  DEV после миграции `20260908T074414_expose_jitsi_provider_settings_to_runtime.sql`; миграция меняет только
  существующую SECURITY DEFINER-функцию `app.read_webapp_preauth_provider_setting(text)`, её объявленных SELECT-
  колонок и EXECUTE-роли достаточно, новых grants/policies нет.
- Финальный TEST deploy прошёл: transcript
  `/var/log/bersoncarebot/deploy-test/deploy-test.20260908T161323Z.4IUZQk.log`, `head=5f97267db79d`, post-runtime
  tenant gate `status=okay coverage=complete`.
- DNS A для `meet.test.bersoncare.ru` и `turn.test.bersoncare.ru` указывают на `151.241.228.122`; единый Let's
  Encrypt lineage покрывает оба SAN и действителен до 07.12.2026. Exact candidate `86f08711a` применён на TEST:
  persisted gate `/tmp/jitsi-gate-86f08711a.status` дал `first=0 restart=0 second=0`; оба health-прохода проверили
  web/JVB/Prosody/MUC, ephemeral TURN allocation по UDP/TLS, browser-visible собственный STUN и отсутствие известных
  внешних endpoints. Nginx apply + direct loopback SNI HTTPS дали 200; evidence —
  `docs/audit/jitsi-live-infra-2026-09-08.md`, integrated merge `800f58f21`.
- После отдельного live-check certbot hook научен пропускать чужие `RENEWED_LINEAGE` (`2f90d28bd`). Глобальная
  Prosody `external_services` correction (`f5f4c7ed1`) устранила потерю TURN metadata после restart; финальный health
  проверяет оба Prosody-контекста и реальные TURN allocations по UDP/TLS. Два browser contexts подтвердили direct
  P2P и forced TURN relay, третий получил серверный отказ; host census не обнаружил внешнего runtime-трафика.
- Owner-authorized TEST domain cutover 08.09 добавил канонические `meet.test.therapysto.ru` и
  `turn.test.therapysto.ru` в тот же lineage; старые BersonCare и временные TherapyGo video names оставлены SAN-
  алиасами. DNS всех шести имён указывает на `151.241.228.122`. Raw Jitsi/coturn ports ограничены additive-
  таблицей `inet bcb_jitsi_test`; повторный полный health после применения policy — PASS.

- TEST с синтетическими данными и владельцевыми тестовыми аккаунтами разрешён этим планом.
- Реальный production rollout не входит в поручение и остаётся заблокирован соответствующими open gates
  `OWNER_AND_LEGAL_GATES.md`: как минимум `G-02`, `G-04A`, `G-04B`, `G-05A`, `G-06`, `G-11`, `G-12`.
- Покупка/создание нового Selectel video-node, публичный DNS и сертификаты требуют доступного TEST target; если
  существующего target нет, код/deploy package/локальная проверка продолжаются, а внешний blocker фиксируется точной
  недостающей сущностью и командой/probe, которой это доказано.
- На TEST wildcard DNS `*.test.therapygo.ru` уже направлен на `151.x`, но произвольный tenant HTTPS остаётся
  заблокирован wildcard-сертификатом DNS-01. Exact certificate покрывает базовый patient host и один технический
  smoke-host, но не заменяет wildcard TLS. Production `*.therapygo.ru` этот переход не затрагивает.

## 8. Definition of done

План считается выполненным только когда каждый owner checkbox закрыт подходящим evidence в той же строке, итоговый
SHA находится в `feat/doctor-ui-rebuild`, ветка pushed, TEST обновлён, применимые живые проверки выполнены, а
непроверяемая часть звонка названа явно. Отчёт worker или общий audit PASS сам по себе пункт не закрывает.
