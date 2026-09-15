# Независимый адверсарный аудит Д2 — мёртвая пара messenger login

Дата: 16.09.2026  
Candidate: `88034b365` (`wt/auth-dead-messenger`)  
Authority: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, этап Д2; находки U1 и D1 в
`docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md`.

## Вердикт: PASS

MUST FIX: нет.

Удалённые `POST /api/auth/messenger/start` и `POST /api/auth/messenger/poll` не имели найденного runtime-потребителя;
candidate удалил сами route handlers, token-port, обе реализации репозитория, DI-ветку, token helper и отдельный
rate-limit alias/limiter. Заглушек вместо удалённого поведения нет. Живой
`phone/messenger-bind/{start,status,finish}` и его integrator/mini-app путь не затронуты и прошли целевые тесты.

Классификация проверки до чтения тестов:

- смерть дверей, хвосты и данные — взгляд + compiler/lint;
- живой messenger-bind, mini-app и пациентский вход — существующие поведенческие тесты;
- blind kill-set: поломка start/status/finish, integrator complete/code-delivery, mini-app routing либо patient
  session path; скрытая ссылка на удалённый port/repository/route должна быть поймана компилятором или runner.

## 1. Независимая перепроверка смерти

Сначала выполнен lexical `code-search` (индекс датирован 15.09 и поэтому ещё показывает удалённые файлы как
кандидаты), затем результат перепроверен по текущему committed tree точными запросами:

```bash
node /home/dev/brain/tools/code-search.mjs "caller fetch api auth messenger start poll login token" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "LoginTokensPort pgLoginTokens confirmByTokenHash auth_login_tokens" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "phone messenger bind start status finish integrator bot complete" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "nginx proxy api auth messenger route" --repo bcb -k 12
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' apps packages tools deploy docs/OPERATIONS .github --glob '!**/.next/**' --glob '!**/node_modules/**'
rg -n -e 'messenger/(start|poll)' -e 'messenger\\/(start|poll)' apps packages tools deploy docs/OPERATIONS .github --glob '!**/.next/**' --glob '!**/node_modules/**'
rg -n -e 'LoginTokensPort|LoginTokenRow|MessengerMethod|LoginTokenStatus|pgLoginTokensPort|inMemoryLoginTokensPort|createLoginTokenPlain|hashLoginTokenPlain|isMessengerStartRateLimited|auth\.messenger_start' apps packages tools deploy docs/OPERATIONS .github --glob '!**/.next/**' --glob '!**/node_modules/**'
```

Три точных запроса по текущему tree завершились без совпадений. Отдельно проверены:

```bash
rg -n -i -e 'auth_login_token|loginTokens|confirmLoginToken|login_[a-z]|messenger/(start|poll)|messenger\\/(start|poll)' apps/integrator tools --glob '!**/node_modules/**'
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' deploy tools .github docs/OPERATIONS --glob '!**/node_modules/**'
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' /etc/nginx
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' /home/dev/dev-projects/BersonCareBot/apps/webapp/.next/dev-server-turbo.log
```

В `apps/integrator`, `tools`, ops-доках, repo/DEV nginx-конфигурации совпадений нет. В доступном DEV Next log
совпадений и истории вызовов этих URL нет. PROD и TEST не читались и не трогались.

Ответные строки и token prefixes проверены отдельно. Совпадения `user_not_found` и `login_` принадлежат другим
действующим дверям/настройкам; связи с удалёнными handlers или `loginTokens` у них нет. Живой бот использует
`auth_*`, `await_phoneauth:*` и `webapp.phoneMessengerBind.complete`, что подтверждено
`docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md` и текущим integrator-кодом.

## 2. Данные и DB-хвост

`public.login_tokens` остаётся в `apps/webapp/db/schema/schema.ts`. В privilege declaration остаются DB-функции
`auth_login_token_create`, `auth_login_token_read`, `auth_login_token_confirm`,
`auth_login_token_expire_past` и `auth_login_token_mark_session_issued`. Это сохранённый schema/DB-артефакт, а не
runtime consumer: `db/schema/relations.ts` сохраняет только Drizzle relation metadata, а текущий TypeScript-код
вне DB-артефактов функции не вызывает и таблицу не читает/не пишет.

Проверки:

```bash
rg -n -e 'auth_login_tokens|auth_login_token_(create|read|confirm|expire_past|mark_session_issued)' apps packages tools --glob '!apps/webapp/db/**' --glob '!**/.next/**' --glob '!**/node_modules/**'
rg -n -e 'login_tokens|auth_login_token_' apps/webapp/db/schema apps/webapp/db/drizzle-migrations deploy/postgres/privileges/declaration.ts --glob '!**/meta/**'
rg -n '\bloginTokens\b' apps packages tools --glob '!apps/webapp/db/schema/schema.ts' --glob '!apps/webapp/db/drizzle-migrations/**' --glob '!**/.next/**' --glob '!**/node_modules/**'
git diff --name-status 88034b365^ 88034b365 -- 'apps/webapp/db/**' '**/migrations/**'
```

Первый запрос не нашёл runtime-вызовов; следующие запросы локализовали только schema relation,
privilege declaration и migration-history surfaces; migration diff пуст. Исполнитель не создавал, не менял и не
применял миграции. Существующие строки становятся недостижимым legacy-state; внешний ключ к `platform_users` с
`ON DELETE CASCADE` продолжает действовать.

## 3. Хвосты и документация

```bash
git diff --name-status 88034b365^ 88034b365
git diff --check 88034b365^ 88034b365
git grep -n -I -e 'api/auth/messenger/start' -e 'api/auth/messenger/poll' -e 'messenger/start/route' -e 'messenger/poll/route' 88034b365^ -- 'apps/**/*.test.ts' 'apps/**/*.test.tsx' 'apps/**/*.spec.ts' 'apps/**/*.spec.tsx'
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' -e 'LoginTokensPort' -e 'pgLoginTokensPort' -e 'inMemoryLoginTokensPort' -e 'createLoginTokenPlain' -e 'hashLoginTokenPlain' -e 'isMessengerStartRateLimited' apps packages tools deploy docs --glob '!docs/_TODO/**' --glob '!docs/archive/**' --glob '!**/.next/**' --glob '!**/node_modules/**'
```

Broken imports, DI references, active docs references и stubs не найдены; `diff --check` зелёный. В parent candidate
активных тестов этих маршрутов уже не было: исторические `start/route.test.ts` и `poll/route.test.ts` удалены ранее
коммитом `a380533b4`, поэтому Д2 не подменял их заглушками. `auth.md` очищен ровно от двух оставшихся упоминаний
legacy start и его rate-limit.

## 4. Живой путь — тесты

Все тестовые команды выполнены только через `/home/dev/brain/host-orch/run-tests.sh`; второй Next не запускался.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneStartFallback.route.test.ts src/modules/auth/independentAuthMethodToggle.route.test.ts src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts src/infra/repos/pgUserByPhone.createOrBind.messengerChannel.unit.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts src/modules/auth/roleLogin.unit.test.ts src/modules/auth/sessionColdComposition.unit.test.ts src/modules/auth/phoneStartBrandedOtpSender.audit.test.ts"
```

Результат: 9 test files passed, 67 tests passed.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run src/infra/db/messengerPhonePublicBind0380.unit.test.ts src/infra/db/writePort.identityRootReachability.audit.test.ts src/integrations/telegram/telegramContactProviderProof.unit.test.ts src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts src/kernel/domain/executor/executeActionBookingMiniAppRemoval.unit.test.ts src/kernel/domain/executor/executeActionDiaryReminderMiniAppRemoval.unit.test.ts src/kernel/domain/executor/executeActionHomeMiniAppRemoval.unit.test.ts"
```

Результат: 7 test files passed, 26 tests passed.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app-layer/di/buildAppDeps.ts src/modules/auth/authRateLimits.ts"
```

Результат: PASS.

## 5. Fault injection

Каждая временная поломка внесена отдельно и затем полностью откатана.

1. Возвращён import `pgLoginTokensPort` из удалённого repository. Команда
   `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"` поймала
   `buildAppDeps.ts:222 TS2307 Cannot find module '@/infra/repos/pgLoginTokens'`.
2. Возвращено DI-поле `loginTokens: loginTokensPort`. Та же команда поймала
   `buildAppDeps.ts:2257 TS2304 Cannot find name 'loginTokensPort'`.
3. Восстановлен исторический `messenger/poll/route.test.ts` из состояния до `a380533b4`. Явный route-run завершился
   non-zero с `No test files found` (legacy-имя не входит в нынешний route-project), а обязательный compiler-run
   поймал четыре `TS2307`: удалённые token helper, in-memory repository, `poll/route` и `start/route`.

Непойманных инъекций: 0. После отката `git status --short` и `git diff --check` были пустыми/зелёными.

## 6. Compiler-gate: внешний blocker

Baseline-команда

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"
```

не зелёная из-за `apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts:247 TS2769`. Этот файл не изменён
candidate, что отдельно подтверждено:

```bash
git diff --exit-code 88034b365^ 88034b365 -- apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts
```

Команда завершилась с code 0. Поэтому ошибка не является finding Д2, но остаётся именованным blocker чистого
repo compiler-gate. На baseline не было ошибок по удалённым imports/DI; инъекции выше доказали, что такие возвраты
compiler действительно ловит.

## Вопрос владельцу

Удалять ли позднее dormant `public.login_tokens`, его DB-функции и privilege declaration отдельным разрешённым
schema-этапом? Д2 прямо запрещал исполнителю миграции, текущего runtime consumer нет, поэтому это не MUST FIX и не
расширялось в работу этим аудитом.
