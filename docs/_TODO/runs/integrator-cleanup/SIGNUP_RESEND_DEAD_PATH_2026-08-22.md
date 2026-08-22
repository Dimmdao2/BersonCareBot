# Переотправка кода регистрации мертва по построению — разбор и правка

- Бриф: `docs/_TODO/runs/briefs/SIGNUP_RESEND_DEAD_PATH_BRIEF_2026-08-22.md`
- План владельца: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **Б2**
- Ветка: `wt/signup-resend-dead-20260822`, голова до работы `3e90f9804`
- Дата: 22.08.2026

## 1. Замер: кто зовёт `app.email_password_find_login_candidate(text)`

**Вызывающий ровно один**, и ему нужен НЕподтверждённый человек.

| Вызывающий | Нужен подтверждённый? |
| --- | --- |
| `apps/webapp/src/infra/repos/pgUserPasswordCredentials.ts:210-217` — `tryResendRegistrationChallenge`, запрос `SELECT user_id, password_hash FROM app.email_password_find_login_candidate($1) WHERE email_verified = false` | **нет**, нужен именно неподтверждённый |

Внутри базы вызывающих нет — замер по живому каталогу `bcb_webapp_dev`:

```
SELECT p.oid::regprocedure FROM pg_proc p WHERE p.prosrc LIKE '%email_password_find_login_candidate%';
→ app.email_password_find_login_candidate(text)   (только сама функция)
```

Поиск по репозиторию (`grep -rn "email_password_find_login_candidate"`) кроме этого дал только определения
(`apps/webapp/db/drizzle-migrations/20260821T040000_*.sql`,
`20260822T100000_*.sql`, `deploy/postgres/specialist-signup-public-bootstrap-rls.sql`,
`deploy/postgres/generated/prod-to-target/schema-pre.sql`), гранты
(`deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql`), декларацию/перепись
(`deploy/postgres/privileges/declaration.ts`, `function-census.ts`, `port-context-catalog.test.mjs`) и
документы. Само назначение способности в декларации — `auth.password.registration.resend-candidate`:
дверь и объявлена как дверь переотправки.

Вывод по §5: вызывающий один, поэтому тело правится под него; второго вида поиска не заводится.

## 2. Корень отказа

`app.email_password_find_login_candidate` искала человека через
`app.find_platform_user_ids_by_any_confirmed_email(p_email_norm)`, а её тело на живой базе содержит
`AND uc.confirmed_at IS NOT NULL`. У того, кому нужна переотправка, почта не подтверждена по определению —
он кода и не вводил. Функция отдавала пусто → `row` пуст → `{ok:false}` → маршрут
`apps/webapp/src/app/api/auth/specialist-signup/start/route.ts:98-104` отдавал `409 duplicate_email`.

Второй, независимый слой той же смерти: флаг `email_verified` считался как
`(matched_email.confirmed_at IS NOT NULL OR fpu.matched_primary = false)`. После цутовера
`20260821T040000_cut_over_canonical_contacts.sql` каждая строка от `fpu` уже подтверждена, поэтому это
выражение тождественно ИСТИННО, и фильтр вызывающего `WHERE email_verified = false` не пропустил бы
никого даже при непустой выборке.

До цутовера `find_platform_user_ids_by_any_confirmed_email` отвечала «основной адрес в колонке
`platform_users.email` (подтверждён или нет) ЛИБО подтверждённый вторичный», и неподтверждённый черновик
находился через колонку; `matched_primary = false` кодировал «адрес поручен OAuth-провайдером». Цутовер
увёл чтение на подтверждённые контакты, а сценарий неподтверждённого не перенёс. Это хвост
`20260821T040000`, а не самостоятельный дефект.

## 3. Что сделано

**Миграция:** `apps/webapp/db/drizzle-migrations/20260822T130000_the_registration_resend_door_finds_the_unconfirmed_draft.sql`

`CREATE OR REPLACE` тела `app.email_password_find_login_candidate(p_email_norm text)`. Сохранены дословно:
OID (проверено — `CREATE OR REPLACE`, не DROP+CREATE), владелец `app_seam_password_auth_owner` (проверено
на живой базе после применения), сигнатура, `RETURNS TABLE(user_id uuid, password_hash text, email_verified
boolean)`, `STABLE SECURITY DEFINER`, `SET search_path TO 'pg_catalog'`, `#variable_conflict use_column` и
гейт `app.require_accepted_context(...)` ПЕРВЫМ исполняемым оператором — байт в байт тем же, что рендерит
генератор в `deploy/postgres/generated/privileges.*.sql`.

Новое тело ищет человека по `public.user_contacts` напрямую, БЕЗ фильтра подтверждения, и берёт
`email_verified` из `confirmed_at` найденной строки:

```sql
FROM public.user_contacts AS matched_email
INNER JOIN public.platform_users AS pu ON pu.id = matched_email.platform_user_id
INNER JOIN public.user_password_credentials AS upc ON upc.user_id = pu.id
WHERE matched_email.contact_kind = 'email'
  AND matched_email.value_normalized = lower(btrim(p_email_norm))
  AND pu.merged_into_id IS NULL
LIMIT 1;
```

Почему это НЕ второй резолвер (§5):

- адрес уникален на всю платформу — `uq_user_contacts_email UNIQUE (value_normalized) WHERE contact_kind =
  'email'`, поэтому строка ровно одна и `LIMIT 1` детерминирован; это чтение по уникальному индексу, а не
  вторая реализация политики;
- та же дверь и раньше читала `public.user_contacts` напрямую (`LEFT JOIN ... AS matched_email` ради флага) —
  теперь этот же join выбирает и строку, а вызов делегата УХОДИТ: точек стало меньше, а не больше;
- сосед по тому же шву `app.email_password_find_reset_candidate(text)` устроен ровно так же — сам смотрит
  `public.user_contacts`, делегата не зовёт. Форма не расходится с соседями, а сходится с ними.

Дизъюнкт `fpu.matched_primary = false` не переносится сознательно: после цутовера «поручено провайдером»
записано в `confirmed_at` самой строки контакта (`source_origin = 'oauth'` приезжает с `confirmed_at`).
Перенести его как `matched_email.is_primary = false` было бы ОСЛАБЛЕНИЕМ — неподтверждённый вторичный
контакт считался бы подтверждённым.

**Декларация:** `deploy/postgres/privileges/declaration.ts`

- у `'app.email_password_find_login_candidate(text)'` снят `delegatesTo:
  ['app.find_platform_user_ids_by_any_confirmed_email(text)']` — тело делегата больше не зовёт;
- из `execute` делегата убрана роль `app_seam_password_auth_owner` (она была там только ради этой двери;
  второй потребитель делегата в базе — `app.email_auth_find_email_owner_conflict(uuid,text)` — принадлежит
  `app_seam_email_otp_owner` и остаётся).

**Разбор прав (AGENTS.md §1).** Поверхность отношений НЕ расширяется. Тело читает `public.user_contacts`
(колонки `platform_user_id`, `contact_kind`, `value_normalized`, `confirmed_at`), `public.platform_users`
(`id`, `merged_into_id`) и `public.user_password_credentials` (`user_id`, `password_hash`) — ровно то, что уже
объявлено (`CANONICAL_CONTACT_SURFACE_CORRECTIONS` + `function-census.ts`). Новых таблиц, колонок,
`FOR UPDATE`/`FOR SHARE`, записей и seam-ролей нет; сигнатура не менялась, значит `function_identity`
(`regprocedure`) тот же и reconcile после миграции ничего не переадресует. `GRANT`/`REVOKE`/`CREATE POLICY`
в миграции нет. Единственная дельта прав — сужение: один лишний `GRANT EXECUTE` на делегата уходит.

Перегенерация артефактов дала ровно две строки дельты в каждой базе:

```
-GRANT EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) TO "app_patient", "app_seam_email_otp_owner", "app_seam_password_auth_owner";
+GRANT EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) TO "app_patient", "app_seam_email_otp_owner";
```

и та же пара в `bcb_expected_functions`. Оба `--check` (`--check` и `--check --port-context-only`) — побайтно,
exit 0.

## 4. Граница безопасности

Требование §D27-A2 (`WORK_ORDER.md`) — нейтральный ответ, никакого раскрытия наличия почты — цело:

- **чужая ПОДТВЕРЖДЁННАЯ почта:** дверь строку отдаёт, но с `email_verified = true`; фильтр вызывающего
  `WHERE email_verified = false` её снимает, маршрут отвечает прежним `409 duplicate_email`. Письмо на чужой
  подтверждённый адрес не уходит ни при каком пароле (замерено — п. 6, пробы 2 и HTTP-шаг 4);
- **свой неподтверждённый черновик:** `200` и новый код, но ТОЛЬКО после `argon2.verify` против сохранённого
  хеша в `tryResendRegistrationChallenge`. Постороннему, не знающему пароль, оба случая по-прежнему выглядят
  одинаково (`409`), поэтому оракулом существования почты правка не становится (замерено — HTTP-шаг 3:
  чужой пароль → `409`, новой строки в `email_challenges` нет);
- **оракул не расширяется и в другую сторону:** различие «занято/свободно» на этом адресе и до правки было
  видно по `409` первого `start`; правка меняет ответ только для того, кто уже доказал владение паролем.

Сужения, которые тело сохраняет и которые проверены отдельно: слитый аккаунт (`merged_into_id IS NOT NULL`)
под переотправку не идёт; неподтверждённая почта БЕЗ `user_password_credentials` тоже не идёт — переотправлять
нечего.

## 5. Соседи: где ещё неподтверждённого ищут «по подтверждённой почте»

Достижимых из живых маршрутов случаев того же класса, кроме исправленного, не найдено. Разбор:

| Место | Класс | Вердикт |
| --- | --- | --- |
| `/api/auth/email-password/register`, ветка `state.kind === 'pending_registration'` (`route.ts:228-243`) | **тот же класс** — переотправка для неподтверждённого | **НЕДОСТИЖИМА.** Маршрут отбивает `403 password_not_available_for_role` ещё до тела: `isPasswordEligibleRole('client')` === `false` (решение владельца 04.08 — у пациентов пароля нет), а этот эндпойнт заводит только `role: 'client'`. Ветка мертва вторым, более ранним отказом. Не чинил — вопрос ведущему, не работа (§24.6). |
| `loadEmailAuthStateRows` (`apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:83-98`) → `resolveAuthState` | тот же класс: зовёт `app.find_platform_user_ids_by_any_confirmed_email`, поэтому `email_verified` тождественно истинно, а неподтверждённый черновик вообще не попадает в выборку и читается как `free` | **Единственный потребитель `pending_registration` — мёртвый маршрут выше.** Остальные потребители подтверждённого требуют ПО ЗАМЫСЛУ: `/forgot` и `/setup-access` и `/setup-code/complete` ветвятся только на `needs_email_setup`, и открыть его неподтверждённому адресу значило бы слать код настройки пароля на непроверенную почту — это ослабление, а не починка. `/lookup` для черновика отвечает `free` — не запирание, а неразглашение. Не трогал; описано как вопрос ведущему в п. 8. |
| `app.email_password_find_reset_candidate(text)` | сам читает `user_contacts` с `confirmed_at IS NOT NULL` | **Верно по замыслу:** восстановление пароля обязано идти на подтверждённый адрес. Не трогал. |
| `app.email_auth_find_email_owner_conflict(uuid,text)` | делегирует «по подтверждённой» | **Верно по замыслу:** конфликт владения — это про подтверждённого владельца. Не трогал. |
| `pgOAuthUserResolve.ts` | зовёт «по подтверждённой» (`findUserIdsByAnyConfirmedEmail`, `findUserIdsByVerifiedEmail`) | **Дефекта нет:** рядом уже живёт `findActiveUserIdsByEmail` БЕЗ фильтра подтверждения, специально «mirrors the uq_user_contacts_email uniqueness so we link instead of INSERT-colliding». Неподтверждённый черновик OAuth подхватывает. Не трогал. |

## 6. Доказательство — живое

### 6.1. Поведение двери на `bcb_webapp_dev`

Новый opt-in пруф: `deploy/postgres/privileges/registration-resend-candidate.devDbProof.test.mjs`
(форма соседей — админ-сокет, фикстура заводится сама, каждая проба — одна транзакция с `ROLLBACK`,
контекст порта строкой в `app_ext.accepted_port_contexts`). Проба зовёт дверь ДОСЛОВНО тем запросом,
которым её зовёт `tryResendRegistrationChallenge`, включая `WHERE email_verified = false`.

Режим кандидата (тело берётся из самого файла миграции и применяется внутри транзакции пробы, потому что
`--execute` из ветки запрещён — DEV ведёт главное дерево):

```
RUN_REGISTRATION_RESEND_CANDIDATE_DB=1 RESEND_CANDIDATE_PROOF_APPLY_CANDIDATE=1 \
  node --test deploy/postgres/privileges/registration-resend-candidate.devDbProof.test.mjs
→ # tests 6  # pass 6  # fail 0
```

Тот же файл против ЖИВОГО (ещё не исправленного) тела — красный ровно на двух пробах про поиск черновика,
то есть это гейт, а не украшение:

```
RUN_REGISTRATION_RESEND_CANDIDATE_DB=1 node --test .../registration-resend-candidate.devDbProof.test.mjs
→ # tests 6  # pass 4  # fail 2
not ok 1 - неподтверждённый черновик регистрации найден: переотправка кода снова возможна
not ok 3 - регистр и пробелы вокруг адреса на поиск черновика не влияют
```

Шестая проба — **инъекция неисправности**: внутри своей транзакции возвращает прежнее тело (поиск по
подтверждённой) и требует, чтобы черновик перестал находиться. Зелёная в обоих режимах.

### 6.2. Живой прогон приложения (worktree, `:5300` → `bcb_webapp_dev`)

`POST /api/auth/specialist-signup/start`, одна и та же почта:

| Шаг | Тело двери | Ответ |
| --- | --- | --- |
| 1. первый `start` | прежнее (как на TEST) | `200 {"challengeId":"a5895f5a-…"}` |
| 2. повтор, ТОТ ЖЕ пароль | прежнее | **`409 {"error":"duplicate_email"}`** — симптом владельца воспроизведён на DEV |
| 3. повтор, ТОТ ЖЕ пароль | кандидат | **`200 {"challengeId":"a01a07f8-…"}`** — новый код, `challengeId` другой |
| 4. повтор, ЧУЖОЙ пароль | кандидат | `409 {"error":"duplicate_email"}`; строк в `email_challenges` было 1, стало 1 — кода нет |
| 5. адрес подтверждён, повтор с тем же паролём | кандидат | `409 {"error":"duplicate_email"}` — прежний отказ дубля на месте |

Между шагами 2 и 3 маршрут сначала отвечал `429 rate_limited retryAfterSeconds:40` — это уже пройденная
дверь: под прежним телом на том же вызове был `409`. Дождался истечения окна, получил `200`.

Продукт возвращён побайтно: тело двери на DEV снято до опыта (`pg_get_functiondef`, md5
`b646a0a2347fd86a931ae92aa3e66bc6`) и после восстановления даёт тот же md5, `diff` пуст, владелец по-прежнему
`app_seam_password_auth_owner`. Пробные строки (`platform_users`, `user_contacts`,
`user_password_credentials`, `email_challenges`, `specialist_signup_intents`) удалены, остаток — 0.

## 7. Проверки

| Гейт | Результат |
| --- | --- |
| `bash deploy/host/migrate-dev.sh --preflight` | **PASS** — `pending=1 total=40`, DDL прогнан от `bcb_dev_migrator` под `app_seam_password_auth_owner` и откатан (`--execute` не запускался) |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | PASS, побайтно |
| `node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only` | PASS, побайтно |
| `pnpm test:db-privileges` | 204 теста, 142 pass, 62 skip, **0 fail** |
| `npx vitest run` по затронутым auth-сюитам (`passwordEligibility.route`, `publicAuthSnapshot.unit`, `specialistSignupSlugOrder.unit`, `pgEmailPasswordLookup`) | 4 файла, 11 тестов, 0 fail |
| `pnpm typecheck` (все 7 проектов) | Done, ошибок нет |
| `eslint` по изменённым файлам | 0 замечаний |
| `check-migration-privileges` (+`--self-test`), `check-c4-migration-owned-function-bodies`, `check-drizzle-migration-order`, `check-legacy-migrations-frozen`, `check-db-chokepoint`, `check-no-new-raw-sql`, `check-test-runner-visibility` | все OK |

## 8. Вопросы ведущему (не работа)

1. **`resolveAuthState` отвечает `free` на неподтверждённый черновик.** Класс тот же, что и у
   исправленной двери, но запирания не даёт: единственный потребитель `pending_registration` —
   недостижимый `/api/auth/email-password/register`, а `/forgot`, `/setup-access` и `/setup-code/complete`
   требуют подтверждённого ПО ЗАМЫСЛУ. Открывать `loadEmailAuthStateRows` неподтверждённым нужно только
   вместе с решением, что делать с `needs_email_setup`: сейчас его расширение отправит код настройки пароля
   на непроверенный адрес. В плане владельца строки на это нет — не делал.
2. **`/api/auth/email-password/register` мёртв целиком** (`isPasswordEligibleRole('client') === false`), а не
   только в ветке переотправки. Удалять ли маршрут — решение владельца, не находка исполнителя.
3. **Единый параметризованный резолвер личности по почте.** Сегодня «по подтверждённой» отвечает
   `app.find_platform_user_ids_by_any_confirmed_email(text)`, а «по любой» — три места:
   исправленная дверь, `app.email_password_find_reset_candidate` (со своим фильтром) и
   `pgOAuthUserResolve.findActiveUserIdsByEmail`. Свести это к одной точке с параметром «требовать ли
   подтверждение» — это смена сигнатуры делегата, то есть DROP+CREATE, новый OID, правки в
   `declaration.ts`, `function-census.ts`, грант-файлах и четырёх колл-сайтах, плюс перенос в миграцию гейта,
   который сегодня принадлежит генератору и переписывается им на каждом reconcile (об этом прямо сказано в
   шапке `20260822T100000_*.sql`). Отдельная работа, называю её вслух, в этой правке не делал.

## НЕ СДЕЛАНО

- Полный деплой, запись на TEST, `push` и full CI — вне объёма по границам брифа.
- `bash deploy/host/migrate-dev.sh --execute` НЕ запускался: DEV ведёт главное дерево. Миграция
  `20260822T130000_*` на DEV **не приземлена**, живое тело двери там прежнее (проверено побайтно).
  Приземляет ведущий.
- Пункт **Б2** плана владельца галочкой не отмечен — закрывает ведущий.
- Соседи из п. 5 и вопросы из п. 8 не чинились сознательно.
