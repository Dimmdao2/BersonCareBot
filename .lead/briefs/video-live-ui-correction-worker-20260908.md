# Worker brief — #1100 doctor live player, invitation lifecycle and diagnostics correction

## Канон и authority

Сначала прочитай `AGENTS.md`: маршрут, §1, §5 целиком (особенно «Один общий проход»), §7, §9–§11,
§16–§17 и §24. Затем прочитай `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, прежде всего VM-06,
VM-10..VM-12, ACC-07..ACC-08, NOTE-08 и UI-08..UI-10, и capability/test artifact аудитора.

Источник оракула — `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: «Resume никогда не вызывает `rotateInvite`».

Ты работаешь после независимого auditor-live. Аудиторские acceptance-тесты являются неизменяемым handoff:
production-код обязан сделать их зелёными. Тестовые файлы не добавлять, не удалять, не переписывать и не ослаблять.

## Результат этапа

Цельно исправь существующий video-meeting путь без второго lifecycle/provider/media/UI:

1. `createOrResume` выпускает capability и ставит notification только при фактическом create. Resume не ротирует,
   не уведомляет, возвращает `guestUrl: null`, но выдаёт свежий specialist join-material. Явный `rotate_invite` —
   единственный путь замены ссылки; он возвращает новую ссылку и безопасный notification-result.
2. Передай invite ID в существующий notification adapter. Durable queue key строится по invite ID + channel, не
   meeting ID. `queued`/`partially_queued` возможны только если реально добавлена хотя бы одна строка; полный dedup —
   `skipped`, полный отказ — `unavailable`. Doctor routes сериализуют status и виды каналов, но не recipient/internal
   error/raw secret/JWT.
3. Doctor live при открытии делает один prepare create-or-resume и показывает ссылку/реальный статус приглашения,
   но не монтирует Jitsi и не запрашивает media. Большая doctor-only Play-кнопка поверх video-stage повторно вызывает
   тот же route для свежего join-material и лишь затем монтирует один adapter. Double click не создаёт второй запрос/
   iframe. Prepare/start failures дают рабочий retry; resume без raw URL показывает явное действие выпуска новой
   ссылки, а не disabled «Скопировать».
4. `external_api.js` error немедленно показывает отказ и «Повторить». Retry удаляет предыдущий loader script и
   создаёт новый, если глобального constructor нет. Arbitrary hard-failure timeout удалить: медленная загрузка не
   объявляется ошибкой по придуманному сроку. Ошибки create/join также не оставляют вечное «Подключение…».
5. Live page переиспользует `PatientEncounterPageShell`/`DoctorAppShell`, `PatientCardRouteTabs` и переданный
   `workspaceModules`, без второго набора вкладок. Notes/encounter остаются mounted стабильно и не перемонтируют call.
6. По capability census пинованной `stable-11146-2` настрой штатный нижний Jitsi toolbar. Базовый allow/deny набор
   живёт в `deploy/jitsi/config/web/*`; iframe overwrite может только сузить его по browser capability. Никакого
   product toolbar, iframe DOM access или второго `getUserMedia`. Owner-набор: mic, camera, hangup, desktop screen
   share, прямой mobile camera flip, fullscreen, device selection, self-view, layout/main participant, quality,
   virtual background — только где реально поддержано; недоступное скрыть/disabled. Убрать subject/брендинг, пустую
   вторую плитку и двойной self-view. VM-11 функции закрыть также для доступных hotkey/context-menu входов.
7. Добавь provider-neutral диагностическое действие в СУЩЕСТВУЮЩИЙ doctor meeting lifecycle route/service. Оно
   принимает только закрытые `join|error|end` + duration/`p2p|relay`/error-class поля, проверяет meeting ownership и
   пишет структурированный server log через существующий app-layer logger/logServerRuntimeError. Никакой новой БД,
   миграции, retention, product-analytics event, admin UI или guest ingest; payload не принимает клинический текст,
   raw secret/JWT/TURN credential. Jitsi adapter переводит штатные события в этот нейтральный словарь.

Перед новой функцией/обёрткой/гейтом ответь кодом на §5: можно ли параметризовать существующие
`createOrResume`, `rotateInvite`, lifecycle PATCH, `VideoMeetingStage` и `JitsiMeetingRenderer`. Отдельный join endpoint,
второй diagnostic route или альтернативный notifier запрещены.

## Разрешённый scope

- `apps/webapp/src/modules/video-meetings/**` кроме тестов;
- `apps/webapp/src/modules/patient-notifications/videoMeetingInvitationNotification.ts`;
- существующий DI/app-layer logging adapter только если он нужен для внедрения provider-neutral diagnostic port;
- существующие doctor video-meeting routes кроме тестов;
- `apps/webapp/src/app/app/doctor/patients/[userId]/live/**` кроме тестов;
- `apps/webapp/src/shared/ui/video/**` кроме тестов;
- `deploy/jitsi/config/web/*`.

Если capability census доказывает, что конкретная owner-функция недоступна либо требует remount, не имитируй её:
назови точный owner question в отчёте, остальные пункты доведи. Не трогай guest/patient live behavior, другие страницы,
schema/migrations, taskdb, план, аудит-артефакт, host/TEST/PROD runtime. PROD полностью вне scope.

## Проверки и сдача

Запусти переданные auditor tests и релевантный typecheck/lint через `/home/dev/brain/host-orch/run-tests.sh`, дождись
их завершения. `git diff --check` обязателен. Worker тесты не пишет. Закоммить только разрешённые production/config
пути явным staging (`git add -A` запрещён), назови SHA, команды и результат. Не заканчивай ход ожиданием процесса.
