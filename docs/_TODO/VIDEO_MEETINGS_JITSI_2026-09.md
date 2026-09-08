# Видеовстречи 1:1: Jitsi MVP, дневные заметки и заменяемый media-provider

Дата решения владельца: **2026-09-08**.
Taskdb: **#1100**.
Статус: **приложение и TEST deploy готовы на `ecf9dcbb2037`; Jitsi/coturn runtime ожидает два внешних DNS A-record
и доверенный TLS, поэтому медиасоединение и runtime-пункты VM-01..06 пока не приняты**.
Интеграционная ветка лида: `feat/doctor-ui-rebuild`; исходная база исполнения:
`b0eb1e45a56deee9f6cb6b0e9948e831f429b5c6`.
PROD вне scope. Разрешены реализация, независимая приёмка и выкладка на именованный TEST.

Owner-correction 08.09.2026 для будущего PROD: каноническая пара видеобэкенда —
`meet.therapysto.ru` + `turn.therapysto.ru`; специалист остаётся внутри кабинета Therapysto, а публичная клиентская
страница `https://<clinic-slug>.therapygo.ru/live#<opaque-secret>` встраивает тот же видеохост. Дублировать
`meet/turn` в зоне `therapygo.ru` не требуется. Это фиксирует целевое именование, но не расширяет текущий TEST-only
deploy scope на PROD.

## 1. Результат для человека

Специалист из карточки клиента, страницы «Сегодня» или модалки начала приёма начинает онлайн-встречу. Клиент
переходит по секретной ссылке без обязательного аккаунта; авторизованный клиент получает тот же звонок внутри
кабинета с разрешёнными ему данными. Встреча рассчитана строго на специалиста и одного клиента. Приоритет — прямой
WebRTC P2P; если прямое соединение невозможно, медиатрафик проходит только через наш coturn/Jitsi в РФ.

На экране специалиста видео не мешает вести карту: справа переключаются «Заметка» и существующий протокол приёма.
Заметки — единая история по календарным датам, а не отдельные сохранения и не записи на каждый звонок. Всё введённое
автоматически сохраняется в заметку текущего дня и остаётся тем же текстом после закрытия панели, нового открытия,
начала и окончания звонка.

## 2. Owner requirements — неизменяемый acceptance scope

### Встреча и трафик

- [ ] **VM-01.** Первый провайдер — полностью self-hosted Jitsi Meet; JaaS, `meet.jit.si`, 8x8 и другие внешние
  сервисы не используются в runtime.
- [ ] **VM-02.** Комната допускает ровно две роли и не более двух одновременно подключённых участников: один
  специалист и один клиент. Ограничение принудительно действует на сервере Prosody/MUC, поэтому повторный вход тем
  же subject со второй вкладки или устройства не создаёт третьего места.
- [ ] **VM-03.** Для двух участников Jitsi сначала устанавливает прямое P2P-соединение; при невозможности direct ICE
  использует только собственный coturn, а JVB остаётся собственным fallback-путём.
- [ ] **VM-04.** Из Jitsi, JVB и клиента удалены внешние STUN/TURN, telemetry, callstats, аватары и иные third-party
  runtime-запросы; ICE endpoints принадлежат нашему контуру в РФ.
- [ ] **VM-05.** Записи и транскрибации нет: Jibri, Jigasi и соответствующие UI/маршруты не поднимаются.
- [ ] **VM-06.** Интерфейс звонка не содержит брендинг Jitsi и конференционные функции; остаются видео, звук,
  mute/unmute камеры и микрофона и завершение звонка.
- [ ] **VM-07.** Приложение работает через provider-neutral контракт. Страницы, права, приглашения, тарифы и заметки
  не знают о Jitsi room/JWT API; Jitsi — сменный adapter/renderer.
- [ ] **VM-08.** Следующий целевой provider после MVP — собственный тонкий клиент на PeerJS либо native
  `RTCPeerConnection`, собственный signalling и тот же coturn. LiveKit не является целевым переходом для этого
  сценария, потому что SFU постоянно несёт медиатрафик двух участников.

### Доступ, ссылка и уведомления

- [ ] **ACC-01.** Специалист создаёт или возобновляет встречу только внутри активной организации и только с клиентом,
  которого он вправе открыть в текущем workspace; tenant/role checks выполняются сервером.
- [ ] **ACC-02.** Гостевая ссылка имеет вид `https://<clinic-slug>.therapygo.ru/live#<opaque-secret>`: секрет
  высокоэнтропийный, не попадает в path/query/access log/referrer, в БД хранится только hash, имеет expiry,
  отзыв и ротацию.
- [ ] **ACC-03.** Обмен секрета на короткоживущий join capability выполняется сервером; capability даёт только место
  клиента в конкретной встрече и не открывает карточку, дневник, программу или API пациента.
- [ ] **ACC-04.** Авторизованный пациент видит личные данные справа только после обычной patient-auth проверки и
  серверного совпадения пользователя со встречей; знание гостевой ссылки это право не заменяет.
- [ ] **ACC-05.** При создании приглашения приложение формирует одно product-notification событие; каналы не
  зашиваются в сценарий, а выбираются общим правилом `доступное ∩ разрешённое получателем`. Содержание — факт
  приглашения и ссылка без клинического текста. На экране встречи специалист может скопировать ссылку.
- [ ] **ACC-06.** Истёкшая, отозванная, подменённая, чужая tenant-ссылка и попытка занять третье место получают отказ
  без раскрытия существования клиента или комнаты.

### Дневные заметки

- [ ] **NOTE-01.** В истории клиента одна логическая заметка на сочетание `organization + client + author + local
  calendar date`; звонок, повторное открытие панели и ручные UI-действия новую запись не создают.
- [ ] **NOTE-02.** Текущая дата определяется по сохранённому IANA-поясу устройства специалиста с fallback на
  `system_settings.app_display_timezone`; дата хранится явно, а не вычисляется заново из `created_at` при каждом
  чтении. Открытый редактор не переключается посреди ввода при наступлении полуночи; новая дата применяется при
  следующем открытии редактора.
- [ ] **NOTE-03.** Вся история видна в обратном порядке дат и разделена датой без времени создания/сохранения.
- [ ] **NOTE-04.** Сегодняшняя заметка открыта первой и редактируема по умолчанию. Кнопки «Добавить»/«Сохранить» нет:
  каждое изменение автоматически и надёжно сохраняется.
- [ ] **NOTE-05.** Прошлые даты по умолчанию свернуты; свернутая заметка показывает максимум три визуальные строки и
  многоточие при переполнении.
- [ ] **NOTE-06.** Прошлую заметку можно развернуть, кликнуть в отдельный borderless textarea и отредактировать; её
  дата при редактировании не меняется.
- [ ] **NOTE-07.** Автосохранение сериализовано отдельно для каждой даты, не допускает победы запоздавшего старого
  ответа, сохраняет локальный текст при сетевой ошибке и повторяет запись без reload родителя.
- [ ] **NOTE-08.** Состояние редакторов стабильно: autosave, сворачивание соседней заметки и переключение вкладок не
  перемонтируют Jitsi/video и не отнимают фокус у активного textarea.
- [ ] **NOTE-09.** Существующие строки одного автора и клиента за один московский календарный день объединяются без
  потери текста в хронологическом порядке; earliest `created_at` и latest `updated_at` сохраняются как provenance.

### Экран встречи и разрешённые изменения UI

- [ ] **UI-01.** Создан отдельный экран специалиста: видео слева, справа вкладки «Заметка» и «Приём»; заметка
  переиспользует дневную историю, «Приём» — существующий канонический протокол и его write-path, без второго формата.
- [ ] **UI-02.** Публичная guest-страница показывает только звонок. Авторизованная страница пациента может справа
  переключать доступные ему дневник симптомов, выполнения и назначенную программу через существующие read-paths.
- [ ] **UI-03.** На странице «Приём» клиента рядом с «Начать приём» добавлена квадратная синяя кнопка видеозвонка.
- [ ] **UI-04.** На странице «Сегодня» в блоке «Следующая запись» справа рядом с «Начать приём» добавлена такая же
  квадратная синяя кнопка видеозвонка.
- [ ] **UI-05.** В модалке начала приёма нижняя зона содержит два действия: «Очный приём» и «Онлайн-приём»; прежняя
  кнопка отмены в этой позиции не остаётся.
- [ ] **UI-06.** Тип существующей записи («онлайн» или филиал) пока не ограничивает выбор способа начала приёма.
- [ ] **UI-07.** Кроме перечисленных кнопок, новых live-страниц и контейнеров заметки/приёма/разрешённых пациентских
  вкладок другие страницы и элементы интерфейса не меняются.

### Включение и тариф

- [ ] **GATE-01.** Видеовстречи — отдельный модуль `video_meetings` в существующей настройке состава кабинета
  специалиста (`doctor_workspace_composition`). Встроенная локация/филиал «Онлайн» не влияет ни на видимость
  элементов видеозвонка, ни на create/join. Эффективный доступ равен пересечению тарифной доступности и этой
  настройки: скрытие кнопок дополняется server-side отказом всех create/join путей. Tariff-часть проходит только
  через существующий `requireEntitlementForRead/Mutation`; отдельный tariff-check внутри `video-meetings` service
  запрещён.
- [ ] **GATE-02.** Возможность `video_meetings` добавлена в канонический `MECHANIC_REGISTRY` и в
  `app-layer/entitlements/protectedActionRegistry.ts` для всех защищённых create/join действий; это существующая
  настраиваемая entitlement-механика, а не отдельный feature-flag или hardcode в UI.
- [ ] **GATE-03.** Entitlement включён в тариф разработчика владельца тем же каноническим seed/reconcile/admin
  write-path, которым управляются остальные возможности; миграция не выдаёт тарифные права.
- [ ] **GATE-04.** Если Jitsi/system settings отсутствуют либо provider unhealthy, create/join fail closed с понятной
  причиной специалисту; гостю не раскрываются внутренние детали.

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
  проецируют один effective `video_meetings` workspace module; состояние филиала «Онлайн» не читают.
- **Поток E — notification integration:** новое typed событие приглашения через единый pipeline, ссылка без
  клинического содержания, дедупликация одной отправки при создании.
- **Поток F — integration mechanic:** устранение только фактических стыков типов/routes/config после D/E, без
  расширения UI и без тестов.

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
   rollback и точным firewall diff; PROD-хосты не затрагивать.
6. Живая проверка владельцевыми TEST-аккаунтами клиники «Дмитрий Берсон», специалиста и пациента:
   entitlement/workspace-module on/off, независимость от состояния филиала «Онлайн», создание встречи из трёх entry
   points, guest fragment link, authenticated patient page, notes continuity, past-note edit, encounter tab,
   notification intent.
7. По ACC-02 код отдельно доказывает fragment-link, branded-origin builder и `/live` surface-rule; живая проверка до
   появления отдельного patient-origin выполняется на разрешённом однохостовом `https://test.bersoncare.ru/live`.
8. Два browser contexts с synthetic media подтверждают successful call; третий независимый context доказывает
   серверный отказ Prosody/MUC. ICE stats отдельно подтверждают direct P2P и принудительный TURN fallback; если среда
   не позволяет дать реальную камеру, это не мешает synthetic media proof и честно указывается в evidence.
9. Network capture/DNS allowlist подтверждает отсутствие иностранных runtime endpoints. Jitsi/JVB/coturn health и
   restart/rollback проверяются без записи или транскрибации.

## 7. Внешние gates и границы релиза

### Фактическое состояние на 2026-09-08

- Core, дневные заметки, уведомление, workspace/tariff gate, UI и self-hosted Jitsi package приземлены в
  `feat/doctor-ui-rebuild`; итоговый runtime config fix — `ecf9dcbb2037`. Независимая Wave 2 приёмка и её
  исправления записаны в `docs/audit/video-meetings-full-surface-2026-09-08.md`.
- `bash deploy/host/migrate-dev.sh --preflight` и `bash deploy/host/migrate-dev.sh --execute` прошли на именованной
  DEV после миграции `20260908T074414_expose_jitsi_provider_settings_to_runtime.sql`; миграция меняет только
  существующую SECURITY DEFINER-функцию `app.read_webapp_preauth_provider_setting(text)`, её объявленных SELECT-
  колонок и EXECUTE-роли достаточно, новых grants/policies нет.
- TEST deploy прошёл: transcript
  `/var/log/bersoncarebot/deploy-test/deploy-test.20260908T075443Z.oldeuu.log`, `head=ecf9dcbb2037`, post-runtime
  tenant gate `status=okay coverage=complete`. Живой POST врача дошёл через auth, entitlement и workspace gate до
  ожидаемого `503 provider_unhealthy`, то есть DB-настройки Jitsi читаются и единственный текущий отказ — ещё не
  запущенный endpoint.
- `deploy/jitsi/bin/install.sh --check` не меняет хост и сейчас называет ровно три отсутствующих prerequisite:
  DNS A для `meet.test.bersoncare.ru`, DNS A для `turn.test.bersoncare.ru` и доверенный сертификат coturn в
  `/etc/coturn/tls/{fullchain,privkey}.pem`. Контейнеры `bcb-jitsi-test` не запускались.
- После появления DNS лид может без участия владельца выпустить TLS, применить nginx/Jitsi/coturn на разрешённом
  TEST-хосте и выполнить `RUNBOOK.md`. До этого остаются открыты VM-01..06, runtime-часть ACC-06, live visual
  acceptance и пункты §6.8–§6.9; кодовые/DB/UI проверки не объявляются доказательством реального звонка.

- TEST с синтетическими данными и владельцевыми тестовыми аккаунтами разрешён этим планом.
- Реальный production rollout не входит в поручение и остаётся заблокирован соответствующими open gates
  `OWNER_AND_LEGAL_GATES.md`: как минимум `G-02`, `G-04A`, `G-04B`, `G-05A`, `G-06`, `G-11`, `G-12`.
- Покупка/создание нового Selectel video-node, публичный DNS и сертификаты требуют доступного TEST target; если
  существующего target нет, код/deploy package/локальная проверка продолжаются, а внешний blocker фиксируется точной
  недостающей сущностью и командой/probe, которой это доказано.
- Для буквального `https://<clinic-slug>.therapygo.ru/live#<secret>` на TEST отдельно отсутствуют wildcard DNS и
  сертификат patient-origin, направленные на разрешённый `151.x` TEST-контур. Это не разрешает обращаться к
  `*.therapygo.ru`, который сейчас ведёт на PROD `135.106.187.95`; до появления TEST-origin runtime evidence идёт на
  однохостовом TEST URL. Probe: `getent ahostsv4 <test-patient-host>` + проверка TLS SAN и
  `curl --resolve <test-patient-host>:443:151.241.228.122 -I https://<test-patient-host>/live`.

## 8. Definition of done

План считается выполненным только когда каждый owner checkbox закрыт подходящим evidence в той же строке, итоговый
SHA находится в `feat/doctor-ui-rebuild`, ветка pushed, TEST обновлён, применимые живые проверки выполнены, а
непроверяемая часть звонка названа явно. Отчёт worker или общий audit PASS сам по себе пункт не закрывает.
