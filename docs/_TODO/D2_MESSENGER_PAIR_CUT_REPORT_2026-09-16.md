# Д2 — удаление мёртвой пары `messenger/start` + `messenger/poll`

Дата: 16.09.2026

Ветка: `wt/d2-messenger-pair-cut`

Authority: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, этап Д2.

## Итог

Д2 уже находился в базе выданной ветки: merge-коммит `e1b42a678` является предком текущего SHA. В текущем дереве
нет route-файлов, runtime-вызовов, DI-порта, реализаций repository, token helper и отдельного rate-limit helper
удалённой пары. Заглушки вместо удалённых дверей не оставлены.

Живой путь `phone/messenger-bind/{start,status,finish}` не менялся и подтверждён существующими webapp и integrator
наборами. Новых тестов не создавалось; автоматические UI-тесты не запускались.

## Классификация доказательств

- отсутствие вызывающих и следов — факт о дереве: перепись маршрутов и отдельный точный поиск;
- сохранность живой привязки — повторяемое поведение: существующие route/unit/audit-наборы;
- отсутствие сломанных импортов и маршрутов — `tsc --noEmit` и production build.

## До правок: два независимых доказательства отсутствия вызывающих

### 1. Перепись открытых маршрутов

Команда:

```bash
node tools/census-open-routes.mjs
```

Результат: `route-файлов всего: 479`, `экспортированных HTTP-обработчиков всего: 596`,
`нераспознанных route-файлов/методов: 0`; адресов `auth/messenger/start` и `auth/messenger/poll` в переписи нет.

### 2. Точный поиск по всему checkout

Команда:

```bash
rg -n --hidden --no-ignore-vcs --glob '!.git/**' -F \
  -e 'messenger/start' -e 'messenger/poll' .
```

Результат: runtime-вызовов нет. Совпадения находятся только в owner-plan/audit/report/history документах; в
`apps/integrator`, `packages`, `deploy`, `tools`, `.github` и production-коде webapp вызывающих нет. Build-артефакты
вызывающими не считаются.

Отдельный exact-поиск по production consumer-зонам:

```bash
rg -n --hidden -F -e 'messenger/start' -e 'messenger/poll' \
  apps/integrator packages deploy tools .github apps/webapp/src docs
```

Результат: только документы с историей/authority; runtime consumer отсутствует.

## Проверка внешних потребителей

Проверены отдельные поверхности ботов, публичного booking-widget, ops/deploy и текущего DEV reverse proxy/log:

```bash
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' \
  apps/integrator packages deploy tools .github apps/webapp/src/app/book \
  apps/webapp/src/shared/publicBook docs/OPERATIONS \
  --glob '!**/.next/**' --glob '!**/node_modules/**'
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' /etc/nginx
rg -n -F -e '/api/auth/messenger/start' -e '/api/auth/messenger/poll' \
  /home/dev/dev-projects/BersonCareBot/apps/webapp/.next/dev-server-turbo.log
```

Результат каждой команды: `0 matches`. Признака внешнего consumer, требующего остановить удаление, не найдено.
PROD и TEST не читались и не трогались.

## Что удалено

Фактическое удаление уже вошло в базу ветки merge-коммитом `e1b42a678` (candidate `88034b365`):

- `apps/webapp/src/app/api/auth/messenger/{start,poll}/route.ts`;
- `apps/webapp/src/modules/auth/loginTokensPort.ts`;
- `apps/webapp/src/infra/repos/{pgLoginTokens,inMemoryLoginTokens}.ts`;
- `apps/webapp/src/modules/auth/{messengerLoginToken,messengerStartRateLimit}.ts`;
- DI-поле/сборка зависимости и отдельный limiter в `buildAppDeps.ts` / `authRateLimits.ts`;
- активные упоминания пары в `apps/webapp/src/modules/auth/auth.md`.

Проверка текущего дерева:

```bash
find apps/webapp/src/app/api/auth/messenger -type f 2>/dev/null | wc -l
```

Результат: `0`.

В `deploy/postgres/privileges/declaration.ts` идентификаторов маршрутов `messenger/start` и `messenger/poll` нет.
Существующая DB-сущность `public.login_tokens` не является HTTP-route declaration и не удалялась: она всё ещё
участвует в cleanup при platform-user merge. Удаление таблицы, функций и её DB-прав потребовало бы отдельного
destructive schema-решения и миграции.

## Сохранность живого пути

Webapp-команда, только через host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run \
src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts \
src/modules/auth/phoneStartFallback.route.test.ts \
src/modules/auth/independentAuthMethodToggle.route.test.ts \
src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts \
src/infra/repos/pgUserByPhone.createOrBind.messengerChannel.unit.test.ts \
src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts \
src/modules/auth/roleLogin.unit.test.ts \
src/modules/auth/sessionColdComposition.unit.test.ts"
```

Результат: `8 passed` test files, `62 passed` tests, rc=0.

Integrator-команда, только через host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run \
src/infra/db/messengerPhonePublicBind0380.unit.test.ts \
src/infra/db/writePort.identityRootReachability.audit.test.ts \
src/integrations/telegram/telegramContactProviderProof.unit.test.ts \
src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts \
src/kernel/domain/executor/executeActionBookingMiniAppRemoval.unit.test.ts \
src/kernel/domain/executor/executeActionDiaryReminderMiniAppRemoval.unit.test.ts \
src/kernel/domain/executor/executeActionHomeMiniAppRemoval.unit.test.ts"
```

Результат: `7 passed` test files, `26 passed` tests, rc=0.

Тесты не ослаблялись и не изменялись.

## Компилятор и сборка

```bash
pnpm --dir apps/webapp exec tsc --noEmit
```

Результат: rc=0, без вывода.

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"
```

Результат: rc=0; Next production build сгенерировал `430/430` static pages. В route manifest нет
`/api/auth/messenger/start` и `/api/auth/messenger/poll`; присутствуют
`/api/auth/phone/messenger-bind/{start,status,finish}`.

Полный CI не запускался по прямому запрету brief.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Текущий Д2 не заблокирован. Отдельный вопрос вне его scope: удалять ли когда-нибудь dormant
`public.login_tokens`, связанные DB-функции и права после отдельного разбора platform-user merge и retention?
Без отдельного destructive schema-решения это не делалось.

## НЕ СДЕЛАНО

- Галочка Д2 в `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md` не поставлена — её ставит ведущий после независимого
  аудита.
- PROD и TEST не затрагивались.
- DEV-миграции не применялись и migration preflight не запускался: миграционных изменений в работе нет.
- Второй Next-сервер не поднимался; автоматические UI-тесты и полный CI не запускались.
- Таблица `public.login_tokens`, связанные DB-функции/права и merge cleanup не удалялись как отдельный schema/data
  scope без решения владельца.
