# D25: доставить OTP и инициализировать claim-route

## Источник оракула
Источник: `docs/OWNER_DECISIONS.md`.
«Только после этого бот доставляет код, который человек вводит обратно в приложении.»

Authority:

- `AGENTS.md`, особенно §5, §10a, §10b, §24.5–24.7.
- `docs/OWNER_DECISIONS.md`, решение владельца от 23.08.2026 «Роль бота после появления приложения»: бот подтверждает телефон средствами мессенджера, затем доставляет код, который человек вводит в приложении; бот не создаёт пользователя.
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D25.
- Независимый аудит `bd2d98bfe` и отчёт `docs/_TODO/runs/integrator-cleanup/D25_TOKEN_BOUND_CONTACT_REAUDIT_2026-08-23.md`.

Работай в существующей ветке `wt/d25-token-bound-bot-20260823`, поверх `bd2d98bfe`. Это handoff падающих acceptance-тестов и одного разового wiring-finding; нового blind-аудита этой же поверхности не будет. В конце всё закоммить, дерево оставь чистым, не пушь и не приземляй.

## Scope

Исправь только два подтверждённых блокера аудита:

1. В успешной ветке существующего действия `webapp.phoneMessengerBind.complete` передай возвращённый webapp `otpCode` в уже существующую подстановку шаблона как `code`, чтобы сообщения Telegram и MAX действительно содержали код и для входа, и для первой регистрации. Расширяй существующую точку/параметр, не создавай новую функцию или параллельный путь.
2. В `apps/webapp/src/app/api/integrator/phone-messenger-bind/claim/route.ts` инициализируй уже существующие app dependencies тем же способом, что sibling `complete` route, чтобы первый запрос свежего процесса не зависел от порядка загрузки модулей.

Разрешённые продуктовые файлы:

- `apps/integrator/src/kernel/domain/executor/executeAction.ts` и только если строго необходимо уже существующий helper, который он вызывает;
- `apps/webapp/src/app/api/integrator/phone-messenger-bind/claim/route.ts`.

Acceptance-файл аудитора `apps/integrator/src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts` не переписывай и не ослабляй. Ранее коммитнутые kill-set тесты не меняй. Дополнительный тест не создавай, если текущий acceptance и существующий sibling pattern уже доказывают исправление.

## Не входит

- replay/повторная выдача OTP после перехода попытки в `otp_ready`;
- speculative concurrent `unique_violation` двух claim;
- декларационные рекомендации по column surface;
- миграции, права, схема, content/scripts, generic contact flow, account/contact creation, branding/Therapysto, broadcasts/relay;
- правка owner-документов, WORK_ORDER или формулировок аудита.

## Проверки

- Сначала воспроизведи красный `phoneMessengerBindCodeDelivery.audit.test.ts`, затем после fix добей тот же файл до зелёного без изменения oracle.
- Запусти ближайшие существующие executor/phone-messenger-bind тесты, затронутые двумя строками поведения; не полный CI.
- Запусти typecheck обоих затронутых приложений и scoped lint изменённых product-файлов.
- Для claim-route покажи точным diff/сопоставлением с sibling complete route, что `buildAppDeps()` вызывается в handler до доменной операции. Не пиши тест текста исходника или импорта.
- `git diff --check` и чистое дерево после коммита.

## Handoff

Отчёт положи в `docs/_TODO/runs/integrator-cleanup/D25_CODE_DELIVERY_AND_CLAIM_DI_FIX_2026-08-23.md`. Укажи product SHA, точные команды и результаты, отдельно: acceptance red-before/green-after, изменённые product-файлы, отсутствие изменений в Therapysto/branding и остающиеся наблюдения как out of scope. Коммитить только явные пути, без `git add -A`.
