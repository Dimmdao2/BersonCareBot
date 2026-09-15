# Независимый адверсарный аудит Д4 — дубли дверей

**Дата:** 2026-09-16

**Целевой SHA:** `693358c93a7a73cdfed40df40327fcfd403228a7` поверх `6658c1384`, `036be6453`

**Вердикт:** **FAIL**

**MUST FIX:** 1 (активные документы; продуктовый код проверенных дверей прошёл)

## MUST FIX 1 — удалённые HTTP-адреса остались активным контрактом/работой в документах

Два route-файла действительно удалены, runtime-потребителей и тестовых ссылок нет. Но полное удаление из
документов не выполнено:

- `docs/TODO.md:142` всё ещё ставит работу над `GET /api/auth/oauth/providers`, как будто маршрут существует;
- `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md:68-71` называет оба удалённых адреса частью действующего
  login resolver; шапка файла прямо говорит, что это исполнительный трекер, а не архив;
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:47-50` по-прежнему считает Q1 нерешённым вопросом, а дословного решения
  владельца 16.09 в файле нет (`rg -n -F 'Q1 ЗАКРЫТ ВЛАДЕЛЬЦЕМ' ...` — пусто).

Достижимое последствие: следующий исполнитель получает одновременно удалённый код и активное указание поддерживать
либо дорабатывать эти адреса; именно такое расхождение уже вызвало возврат маршрутов в `6658c1384`.

**Нарушенный authority:**

- бриф Д4, дословно: «два HTTP-адреса — `/api/auth/login/alternatives-config`» и
  «`oauth/providers` — удаляй, лишние дыры». Оба маршрута удаляются совсем; пункт проверки требует, чтобы ни один
  документ не ссылался на снятые адреса;
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:30-34`: Д4 сводит дубли и обязан назвать оставшуюся дверь;
- `AGENTS.md` §0: несовместимая активная формулировка удаляется в том же изменении; §1 «Чек-листы и коммиты»:
  решение владельца записывается в документ немедленно, отсутствие в git означает «не записали».

**Критерий исправления:** записать owner-решение Q1 в активный план, убрать Q1 из списка нерешённых вопросов и
заменить ссылки в двух активных tracker/backlog-документах на единственный `buildPrefetchedPublicAuthConfig`.
Исторические audit/archive/evidence-файлы не переписывать.

## Классификация и результат проверки

| Пункт | Метод | Результат |
| --- | --- | --- |
| Два имени Telegram-ботов | **ПРОГОН**: публичный snapshot + HTTP-door Widget | PASS. При `telegram_login_bot_username=code_delivery_bot` snapshot отдаёт `telegramBotUsername:null`; отдельный `/api/auth/telegram-login/config` при `telegram_login_widget_bot_username=@widget_login_bot` отдаёт `widget_login_bot`. Инъекция с именем widget-бота в alternatives краснит тест. |
| Полнота удаления и поля снимка | **ВЗГЛЯД** для файлов/ссылок; **ПРОГОН** для конечного снимка и компилятора | Файлы обоих маршрутов отсутствуют; runtime и tests пусты; `vkWebLoginUrl` и `smsFallbackEnabled` сохранены и обе потери краснят acceptance-тест. Документальная часть — FAIL по MUST FIX 1. |
| Один расчёт public auth config | **ПРОГОН** | Из трёх D2-проекций остался только `buildPrefetchedPublicAuthConfig`; удалённые HTTP-door больше не имеют ответа. Инъекция локального `vk:true` вместо общего `isOAuthProviderEnabled` краснит два теста. Widget config не слит с этим источником по прямому owner-решению. |
| Явная дверь против Host | **ПРОГОН** | При Host=`staff` вызов snapshot с дверью `patient` возвращает пациентские флаги. Удаление аргумента `surface` у OAuth краснит acceptance-тест: Google/Yandex/Apple становятся `false`. |
| Logout | **ПРОГОН** POST; **ВЗГЛЯД** GET и потребителей | Одноразовый route-test: `1 passed`, `clearSession` вызван, redirect `307` на `/app`. Runtime-потребитель один — `LogoutForm`, метод `post`; в integrator/notification/messaging/packages ссылок нет. Экспорт GET отсутствует. |
| Password setup | **ПРОГОН** route; **ВЗГЛЯД** снятого consumer URL | `setup-access/route.ts` отсутствует; runtime-ссылка на URL пуста; `requestPasswordRecoveryChallenge` вызывается только из `forgot`, а `password_setup` создаётся внутри общего прохода. Route-набор: `6 passed`. |
| Legacy Yandex callback | **ВЗГЛЯД** — кабинет провайдера недоступен без запрещённого TEST/PROD-действия | Оба файла сохранены и вызывают `handleYandexOAuthCallbackGet`; `auth.md:85-86` называет `/callback/yandex` каноническим, `/callback` — legacy compatibility. Ничего не удалено. До проверки кабинета Яндекса alias законно остаётся; кабинет не проверялся. |
| Пациентский и сотрудничий вход | **ПРОГОН** нижних публичных границ; live UI до landing запрещён §1a | Финальный targeted-набор включает patient email OTP, phone fallback/OTP door и staff password auth: `13 files, 173 tests passed`. Второй Next-сервер не запускался. |

## Поиски отсутствующих потребителей

Сначала выполнен `code-search`:

```text
node /home/dev/brain/tools/code-search.mjs "buildPrefetchedPublicAuthConfig telegramBotUsername vkWebLoginUrl smsFallbackEnabled explicit surface" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "logout GET POST clearSession consumers" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "password setup challenge forgot setup-access shared path" --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs "Yandex OAuth callback legacy alias route" --repo bcb -k 12
```

Индекс имел timestamp `2026-09-15T22:45:03.675Z` и показывал удалённые route-файлы из предка, поэтому каждый
кандидат перепроверен по живому дереву точными командами:

```text
for p in '/api/auth/login/alternatives-config' '/api/auth/oauth/providers'; do
  rg -n -F "$p" apps packages --glob '!**/.next/**'
done
# runtime: пусто

for p in '/api/auth/login/alternatives-config' '/api/auth/oauth/providers'; do
  rg -n -F "$p" apps packages --glob '*.test.ts' --glob '*.test.tsx' --glob '*.spec.ts'
done
# tests: пусто

rg -n -F '/api/auth/logout' apps/integrator apps/webapp/src/modules/notification \
  apps/webapp/src/modules/messaging packages
# пусто

rg -n -F '/api/auth/logout' apps/webapp/src --glob '!**/*.test.*' --glob '!**/.next/**'
# LogoutForm.tsx:33 — form method="post"; auth.md/profile.md — POST

rg -n -F '/api/auth/email-password/setup-access' apps packages --glob '!**/.next/**'
# пусто
```

Back-reference-поиск по активным docs нашёл MUST FIX 1. Ссылки в
`AUTH_DOORS_AUDIT_2026-09-15.md`, старых audit/evidence и `docs/archive/**` сохранены как историческое
доказательство и не считаются живым consumer/contract.

## Инъекции

Все семь инъекций вносились в production-код по одной и сняты до финального прогона.

| № | Инъекция | Сигнал |
| --- | --- | --- |
| 1 | `telegram_login_widget_bot_username` подставлен в alternatives `telegramBotUsername` | `publicAuthDoorProjection.route.test.ts`: **1 failed / 1 passed**, diff `null → @widget_login_bot`. |
| 2 | RSC-проекция считает `vk:true` своей копией вместо `isOAuthProviderEnabled` | `publicAuthDoorProjection` + `publicAuthSnapshot`: **2 failed / 2 passed**, оба видят `vk:true` вместо `false`. |
| 3 | Возвращён экспорт `GET` в logout route | **Автоматикой не поймано:** `proxy.route.test.ts` осталось `104 passed`; точный ВЗГЛЯД `rg '^export async function GET' .../logout/route.ts` нашёл инъекцию. Постоянный source-shape тест запрещён §10a. |
| 4 | `vkWebLoginUrl` заменён на `null` в snapshot | acceptance: **1 failed / 1 passed**, diff URL → `null`. |
| 5 | `smsFallbackEnabled` заменён на `false` в snapshot | acceptance: **1 failed / 1 passed**, diff `true → false`. |
| 6 | OAuth snapshot перестал передавать explicit `surface` и стал решать по Host | acceptance: **1 failed / 1 passed**, patient Google/Yandex/Apple стали `false` на Host=`staff`. |
| 7 | UI-resend снова отправлен на удалённый `/email-password/setup-access` | **Автоматикой не поймано:** нижний password route-набор остался `6 passed`; точный ВЗГЛЯД URL нашёл строку. UI-тест запрещён §10a. |

Итого: 5 инъекций пойманы поведением, 2 честно не пойманы автоматикой и ловятся обязательным итоговым взглядом.

## Финальные прогоны чистого состояния

Все команды выполнены через `/home/dev/brain/host-orch/run-tests.sh`; полный CI не запускался.

```text
pnpm --dir apps/webapp exec vitest run \
  src/modules/auth/publicAuthDoorProjection.route.test.ts \
  src/modules/auth/publicAuthSnapshot.unit.test.ts \
  src/app/api/auth/telegram-login/telegramLoginWidget.route.test.ts \
  src/app/app/AppEntryRsc.unit.test.ts \
  src/modules/auth/passwordEligibility.route.test.ts \
  src/modules/auth/oauthAppleToggle.route.test.ts \
  src/proxy.route.test.ts \
  src/modules/auth/passwordAuth.route.test.ts \
  src/app/api/auth/email-otp/confirm/route.route.test.ts \
  src/modules/auth/phoneStartFallback.route.test.ts \
  src/shared/ui/patient/auth/otpDoor.unit.test.ts \
  src/modules/auth/yandexOAuthConfig.unit.test.ts \
  src/modules/auth/yandexOAuthCallbackSurfaceRedirect.audit.unit.test.ts
# Test Files 13 passed (13); Tests 173 passed (173); rc=0

pnpm --dir apps/webapp run typecheck
# tsc --noEmit; rc=0

pnpm --dir apps/webapp exec eslint src/modules/auth/publicAuthDoorProjection.route.test.ts
# rc=0
```

Добавлен один постоянный acceptance-тест
`apps/webapp/src/modules/auth/publicAuthDoorProjection.route.test.ts`: independent oracle — дословное разделение
двух ботов владельцем и уже случившийся prod-инцидент; конечный наблюдаемый выход — публичный snapshot и HTTP JSON,
не внутренние аргументы/текст/UI.

Прод и TEST не затрагивались, миграции не запускались, второй Next-сервер не поднимался, `.env` не читался.
