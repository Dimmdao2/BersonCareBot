# Бриф-фикс: вход по телефону и опознание почты падают на живом TEST (500)

**Блокер продукта, найден замером на живом TEST 23.08.** Кода вокруг не разводить: закрыть ровно эти двери.

- **План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` (пункт D15b/6 — двери pre-session).
- **Канон — `AGENTS.md`.** Сначала карта заголовков: `grep -n "^## \|^### " AGENTS.md`; затем §1 (миграции НЕ выдают
  прав и НЕ создают ролей), §5 (один chokepoint), §6 (роли и RLS), §10a (тесты доказывают ПОВЕДЕНИЕ), §24.

**Источник оракула:** `deploy/postgres/privileges/declaration.ts` — «`capabilities['pre_session']` purpose=relation is intentionally absent»

## Что измерено (повтори сам, не верь брифу)

На живом TEST (`--resolve test.bersoncare.ru:443:127.0.0.1`, `Origin: https://test.bersoncare.ru`):

- `POST /api/auth/email-password/lookup` → **500**
- `POST /api/auth/phone/start` → **500**
- `POST /api/auth/email-password/forgot` → 200, `POST /api/auth/email-otp/start` → 200

В журнале вебаппа TEST две причины, обе одного класса:

- `Failed query: SELECT pu.id::text AS id, …` → `Missing declared webapp port capability: pre_session`
  — это `loadEmailAuthStateRows` в `apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts`: сырое реляционное
  чтение `platform_users` + `user_contacts` + `user_password_credentials` под bootstrap-принципалом.
- `Failed query: SELECT app.get_preferred_auth_channel_code($1::uuid)` → то же сообщение — корень существует
  (`declaration.ts:2155`), но у класса `pre_session` его capability не объявлена.

## Что сделать

**Форма решения уже принята в этом же файле** — смотри соседнюю дверь
`pre_session_find_session_user_by_phone` (`declaration.ts`, D15b/6): реляционной двери классу `pre_session`
не выдаётся НИКОГДА, вместо неё — именованный `SECURITY DEFINER`-корень с объявленной capability. Повтори
эту форму:

1. Для чтения состояния учётки по почте — один именованный корень, возвращающий ровно те три поля, что
   считает `loadEmailAuthStateRows` (`id`, `email_verified`, `has_password`), с той же семантикой
   `find_platform_user_ids_by_any_confirmed_email` и `merged_into_id IS NULL`. Сырое чтение из репозитория
   убрать — остаётся вызов корня.
2. Для `app.get_preferred_auth_channel_code(uuid)` — объявить capability классу `pre_session` (роль и
   контекст возьми у соседних pre-session записей), новых корней не плодить.
3. Тело корня обязано первым оператором после `BEGIN` звать `app.require_accepted_context(` — иначе
   структурный гейт генератора откажет; в `DECLARE` НЕ ставить инициализаторы (`:=`, `DEFAULT`,
   `constant`), они выполняются до гейта.
4. Права — только через `deploy/postgres/privileges/declaration.ts` и генерацию:
   `node deploy/postgres/privileges/generate-cli.mjs --all`, затем `--all --port-context-only`, затем
   `--all --check` (должно быть побайтово одинаково). **Миграция НЕ содержит `GRANT`/`REVOKE`.**
5. Применить на DEV `bash deploy/host/migrate-dev.sh --preflight`, `--execute` НЕ запускать — это делает
   ведущий.

## Доказательство (иначе работа не принимается)

- Поведенческий тест на КАЖДУЮ дверь: отказ без принятого контекста и успех с ним. Тест на форму кода
  (наличие строки в файле) не считается — `AGENTS.md` §10a.
- Fault injection: сломай тело корня → тест обязан покраснеть; верни → зелёный. Покажи оба вывода.
- `pnpm --dir apps/webapp typecheck` и `lint` — зелёные, вывод в отчёт.

## Границы

TEST и PROD не трогать, `--execute` не запускать, `push` не делать, галочки плана не ставить.
Отчёт: `docs/_TODO/runs/integrator-cleanup/PRESESSION_LOGIN_DOORS_2026-08-23.md`.
