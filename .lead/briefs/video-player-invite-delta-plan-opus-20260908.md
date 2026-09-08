# Тест или взгляд — high Opus audit новой owner-дельты плеера и приглашения

Это предреализационный аудит плана. Тесты, production-код, plan, taskdb и сервер не менять.

## Канон и authority

Сначала прочитай `AGENTS.md`: маршрут, «Как решать, что делать», §5, §10a/§10b, §12, §16–§17 и §24.
Authority — `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, прежде всего последние owner-correction абзацы перед §2 и
открытые VM-06, VM-10..VM-12, ACC-07..ACC-08, UI-08..UI-10. Сверь с фактическим кодом и уже существующими ports/
routes/config; не считай narrative доказательством.

## Новое решение владельца

1. До фактического звонка doctor live показывает поверх video-stage большую Play-кнопку. Страница уже может
   подготовить встречу, ссылку и приглашение; Jitsi iframe и media включаются только Play.
2. Рабочие функции: mic, camera, прямой mobile front/back switch, desktop screen share, fullscreen, device settings,
   hide/show self, layout/main participant selection, video quality, virtual background. Главные действия внизу,
   secondary в компактном меню.
3. Не нужны: chat, participants pane, Jitsi invite, raise hand, subtitles, user stats, recording, livestream,
   whiteboard/shared doc, shared-video watch, отдельный computer-audio share.
4. Connection diagnostics нужны системе для operational analytics, но не пользователям, без клинических данных и
   без внешней Jitsi/8x8 telemetry.
5. Приглашение должно объяснять специалисту, как клиент узнаёт о звонке: существующий pipeline выбирает разрешённые
   доступные web push/email/Telegram/MAX; UI не должен ложно говорить «отправлено», если очередь пуста.

## Что проверить одним проходом

- Не противоречит ли новая дельта более ранним plan-строкам и не оставляет ли двоякого смысла create/prepare/join.
- Как минимально и архитектурно корректно разделить preparation/invite от Jitsi/media start, расширяя существующую
  точку, а не создавая второй lifecycle/provider path.
- Фактическую семантику `createOrResume`: сейчас она `rotateInvite` при каждом resume, notification только при
  `result.created`, а HTTP route не возвращает notification. Проверь достижимый refresh/reopen сценарий, старую
  superseded ссылку, dedup и риск спама. ACC-07/ACC-08 должны задавать однозначный минимальный контракт.
- Реализуемость разрешённого набора на pinned self-hosted Jitsi/browser: что безопасно включить штатным toolbar/
  config, что требует External IFrame API, и не обещает ли план невозможное (особенно hide/show self, active
  participant, fullscreen/iOS, screen share/audio separation, background). Недоступные browser-функции должны
  скрываться/disabled без мёртвых действий.
- Должна ли product-owned нижняя панель быть provider-neutral command contract внутри существующего
  `VideoMeetingStage`/adapter или встроенный Jitsi toolbar достаточно точно выполняет owner layout. Не разрешай
  кросс-origin iframe DOM hacks и второй media/getUserMedia path.
- VM-12: есть ли существующая product/operational analytics дверь, которую можно расширить. Если нет, не разрешай
  скрыто раздувать UI-worker миграциями/новой telemetry-платформой; укажи точную минимальную границу текущего этапа.
- Правильный audit/test split: устойчивые prepare/notify/resume/play/retry свойства тестируются аудитором, внешний
  состав/раскладка/поддержка браузера принимаются live владельцем. Воркер тесты не пишет.

## Вердикт

Верни `PASS` либо `MUST FIX`. Каждый finding: достижимый сценарий, impact, нарушенный owner/repo контракт и точная
правка плана до worker-start. Recommendations вне authority не являются findings. Не редактируй файлы и не завершай
ход ожиданием фоновой команды.
