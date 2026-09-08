# Тест или взгляд — #1100 live UI owner-correction acceptance

Сначала классифицируй каждый acceptance пункт: устойчивое поведение проверяй тестом; внешний вид/раскладку/текст/
число кнопок — одноразовой source/visual inspection, не цементируй CSS или copy тестами.

## Канон и authority

Прочитай `AGENTS.md`: маршрут, §10/§10a/§10b, §11, §16–§17 и §24. Authority —
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, дословно VM-06, VM-10..VM-12, ACC-07..ACC-08 и UI-08..UI-10. Не
заменяй требования пересказом и не добавляй app-wide floating call/PiP либо второй media/provider lifecycle.

Проверяемые owner-строки:

- VM-10: «Ошибка загрузки Jitsi bundle сразу переводит stage из «Подключение…» в понятное состояние отказа с
  действием «Повторить»; повторное открытие удаляет/заменяет сломанный script и действительно повторяет загрузку.»
- UI-08: открытие может один раз prepare-ить meeting/invite/notification, но не монтирует Jitsi и не запрашивает
  media; Play повторно использует тот же create-or-resume route для свежего join-material и монтирует один adapter.
- UI-09: «Doctor live-страница переиспользует канонические desktop/mobile вкладки карточки пациента».
- UI-10: «Панель управления находится у нижнего края video-stage на мобильном и desktop.»
- VM-06 требует нижнюю панель с микрофоном, камерой, завершением и отдельным прямым переключением
  фронтальной/задней камеры на мобильном; техническое имя комнаты и конференционные функции отсутствуют.
- ACC-07/08: invite выпускается/уведомляется на create; resume не ротирует и возвращает `guestUrl=null`; только
  явный `rotate_invite` заменяет ссылку. Notification idempotency — invite-scoped, а queued означает реальную вставку.

## Цельный аудит

До чтения существующих тестов составь kill-set. Затем проверь production-код и текущие тесты. Минимальные классы:

1. Простой render/open doctor live client делает не более одного prepare POST, но не создаёт iframe/media. После
   Play делает один повторный POST за свежим join-material и монтирует ровно один adapter; быстрый double click не
   создаёт второй iframe/session. Ошибка prepare или start даёт retryable состояние без фонового retry-loop.
2. `external_api.js` error немедленно снимает вечное «Подключение…», показывает отказ и рабочее «Повторить»;
   повторная попытка создаёт новый script, а remount после старого failed/stale script не ждёт уже прошедшего события.
   Медленная загрузка без `error` не должна ошибочно считаться отказом произвольным hard deadline.
3. Play после искусственной паузы дольше 10 минут использует второй route-result, а не протухший prepare JWT.
4. `createOrResume`: create выпускает один invite и одно уведомление; resume не вызывает rotate/notify и возвращает
   `guestUrl=null`. Явная ротация получает новый invite-scoped idempotency key. Полный dedup не называется queued;
   doctor route возвращает безопасный notification result без адреса/internal error.
5. Autosave/re-render соседней панели по-прежнему не dispose/recreate существующую конференцию (NOTE-08).
6. Диагностический ingest доступен только аутентифицированному специалисту встречи, принимает закрытый
   provider-neutral словарь и не пропускает clinical text/secret/JWT/credential; новую БД/product analytics не тестируй.
7. Взглядом на код/конфиг зафиксируй текущий результат для вкладок patient card, реальной высоты iframe/нижней панели,
   единственного self-view, скрытого subject и прямой mobile camera-flip. Не пиши тесты на классы, позиции, тексты или
   количество toolbar buttons.
8. Проверь, что предполагаемая реализация может параметризовать существующие `DoctorLiveMeetingClient`,
   `JitsiMeetingRenderer`, `VideoMeetingStage`, `PatientCardRouteTabs` и текущий patient subpage shell/pattern, без
   второй навигации или утечки Jitsi API за provider adapter.

До чтения toolbar-тестов выполни одноразовый capability census именно пинованного TEST bundle
`https://meet.test.bersoncare.ru/external_api.js` (если публичный vhost ограничен, допустим read-only localhost
`--resolve`; секреты не нужны и не печатаются): команды, события и config keys для owner-набора; отдельно браузерные
ограничения iOS/mobile. Сохрани фактический перечень и команду измерения в том же audit artifact. Если bundle
недоступен после доказанных localhost/network попыток — это named blocker для player subset, не повод угадывать.

Недостающие устойчивые acceptance-тесты добавь/исправь один раз. Для каждого зелёного класса докажи fault injection;
если текущий production ожидаемо красный, оставь падающий тест как handoff и не исправляй production. Старый тест,
который закрепляет отменённое owner-решение «ровно три кнопки», не сохраняй как ложный оракул.

## Разрешённые изменения

Можно менять только применимые `*.test.ts(x)` в video/doctor-live UI, video-meetings service/routes/notification и
создать один audit artifact в `docs/audit/`. Production code/config, план, taskdb, сервер и deploy не менять.
Временные production fault-injection правки полностью
откатить. Закоммить только тесты/artifact явным staging, `git add -A` запрещён. В отчёте: PASS или FAIL/MUST FIX,
commit SHA, kill-set с поймано/непоймано, команды тестов через `/home/dev/brain/host-orch/run-tests.sh`, и source/
visual findings. Не заканчивай ход ожиданием фонового процесса.
