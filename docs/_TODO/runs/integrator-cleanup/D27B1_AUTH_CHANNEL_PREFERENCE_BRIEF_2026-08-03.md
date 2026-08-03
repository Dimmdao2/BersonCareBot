# D27-B1 — явный канал получения кода

## Результат для человека

Авторизованный человек видит в профиле выпадающий список реально доступных каналов входа, сохраняет явный
выбор, и следующий вход по телефону отправляет код именно туда. Публичный маршрут не раскрывает выбор,
привязки или существование аккаунта.

## Authority и граница

- `AGENTS.md` §5, §10a–§10b, §15, §21–§22, §24.
- `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §3.1, §3.2, §3.6.
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D27.

Это частичный B1. Не выдумывать provenance «первый бот, подтвердивший номер», не добавлять несколько email и
не начинать D25/D15a. Для `null`/stale preference сохраняется нынешний безопасный automatic fallback.

## Сделать

1. Вернуть существующую настройку `AuthOtpChannelPreference` в профиль как канонический `Select`, без второго
   хранилища/порта. Варианты: пересечение configured+enabled системной политики и реально deliverable каналов
   текущего account; SMS доступен только при trusted phone.
2. Server action повторно fail-closed проверяет effective policy, binding/verified target и ownership по session;
   UI-список не является security boundary.
3. `/api/auth/phone/start` читает только server-side explicit preference и применяет его лишь когда канал всё ещё
   effective и deliverable этому canonical user. Stale/disabled/unlinked preference не доставляется и уходит в
   текущий safe automatic fallback.
4. Не возвращать наружу preference/binding/identity: публичные status/body schema, `deliveryChannel: automatic`
   и timing class одинаковы для known/unknown и всех preference states. Не ослаблять cooldown/attempt limits.
5. Обновить строку D27 тем же коммитом как `CURRENT PARTIAL D27-B1`; checkbox остаётся открыт.

## Поведенческий gate

- UI показывает persisted explicit value и только configured+enabled + linked/verified targets.
- Прямой action отвергает foreign user, unlinked, disabled/unconfigured и SMS с untrusted phone.
- Explicit telegram/max/email/sms выбирает только target того же canonical user; stale preference не вызывает
  доставку в старый target и безопасно деградирует.
- Known/unknown и все preference/binding комбинации имеют одинаковый публичный ответ и не возвращают выбор.
- Resend повторяет server-selected policy, клиент не передаёт identity facts; provider failure остаётся neutral.
- Fault injections обязаны красить тесты: вернуть preference наружу; пропустить global policy; считать любой
  непустой phone trusted; взять чужой binding; удалить preference lookup.

Запустить узкие unit/route/UI tests, затронутые suites, webapp typecheck и lint. Не трогать DB/env/deploy/DEV/TEST/
PROD; новой миграции в B1 нет.
