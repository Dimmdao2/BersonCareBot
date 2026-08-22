# Одиннадцать тел pre-session не пускают reconcile: гейт в теле не совпал с декларацией

**Роль:** worker. **Канон:** `AGENTS.md` — сначала карта заголовков (`grep -n "^## \|^### " AGENTS.md`),
затем §1 (миграции: timestamp forwards, «⛔ Миграция не выдаёт и не отзывает права», «Перед приземлением
миграции — разбор её прав»), §5, §6, §10a, §24.2/§24.6.
Поиск — `node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт Б2 — дословная
запись требования владельца: «просто зайти на открыто, создать самостоятельно новую клинику. так как это
сделал бы, ну, реальный человек» и «Если это не работает, надо разобраться почему».

## Замер ведущего — начинай с него, не переизмеряй

Приземлённая ветка `wt/signup-pre-session-20260822` перевела одиннадцать корней пути регистрации и входа
в класс `pre_session` в декларации (`deploy/postgres/privileges/declaration.ts`), но **тела этих функций
в базе по-прежнему несут старый гейт** `app.require_attested_context_for_roles(...'app_patient'...)`.
Из-за этого `bash deploy/host/migrate-dev.sh --execute` падает на шаге reconcile:

```
ERROR:  pre-session exact gate missing or mismatched: app.email_auth_delete_email_challenges_for_user(uuid)
```

Проверено интроспекцией `pg_proc` на именованной `bcb_webapp_dev`: старый гейт стоит во ВСЕХ одиннадцати:

`app.email_auth_delete_email_challenges_for_user(uuid)`, `app.email_auth_find_email_challenge_for_confirm(uuid,uuid)`,
`app.email_auth_find_email_owner_conflict(uuid,text)`, `app.email_auth_increment_email_challenge_attempts(uuid)`,
`app.email_auth_verify_user_email(uuid,text)`, `app.email_password_delete_unverified_registration(uuid)`,
`app.email_password_find_login_candidate(text)`, `app.email_password_find_user_id_by_email_challenge(uuid)`,
`app.email_password_register_pending(text,text,text,text,text,text)`,
`app.find_platform_user_ids_by_any_confirmed_email(text)`, `app.get_specialist_signup_intent_by_challenge(uuid)`.

Это блокер: пока reconcile красный, ни DEV не сводится, ни TEST не выкатывается.

## Задача

Одна forward-миграция, которая пересоздаёт эти одиннадцать тел с гейтом `app.require_accepted_context(...)`
класса `pre_session`, ровно в той форме, которую ждёт сверяющий гейт reconcile и которую уже используют
соседние pre-session-корни (образцы — миграции `20260821T070000`, `20260821T080000`, `20260821T090000`
и `20260822T090000`; аргументы гейта включают `app.hash_port_typed_args(...)` и `::regprocedure` самой функции).

Жёсткие требования:

- **Меняется только строка гейта.** Всё остальное тело, владелец (`BCB-MIGRATION-OWNER`), сигнатура, список и
  типы аргументов, `search_path`, `SECURITY DEFINER`, возвращаемый тип — байт-в-байт как сейчас в базе.
  Сигнатуру не трогать: `function_identity` — `regprocedure`, её смена ломает объявленную возможность.
- **Брать текущее тело из `pg_proc.prosrc` на именованной DEV, а не из старой миграции** — часть тел уже
  переписывалась позже (`app.email_auth_verify_user_email` пересоздавалась `20260822T090000`, у неё арбитр
  `ON CONFLICT (value_normalized) WHERE contact_kind='email'` и форма update-then-insert; её терять нельзя).
- `require_accepted_context(...)` остаётся ПЕРВЫМ исполняемым оператором тела.
- `BCB-MIGRATION-VERIFY` обязателен и должен утверждать факт, а не существование файла: например, что ни одна
  из одиннадцати не содержит `require_attested_context_for_roles`.
- Ни `GRANT`, ни `REVOKE`, ни `CREATE POLICY` в миграции. Права — только декларация и генератор.
- `CREATE OR REPLACE`, не `DROP`+`CREATE`, там где возвращаемый тип не меняется (owner сохраняется сам).

## Проверка (без неё работа не сдана)

1. `bash deploy/host/migrate-dev.sh --preflight` — PASS.
2. `bash deploy/host/migrate-dev.sh --execute` на именованной `bcb_webapp_dev` — **разрешено и обязательно
   в этой работе**, потому что именно reconcile сейчас красный и его зелёный — единственное доказательство.
   Ожидается `migrate-dev: PASS`, без `pre-session exact gate` в логе.
3. Живой прогон на DEV (приложение уже поднято на :5200), последовательно:
   `POST /api/auth/email-otp/start` → код читается из `public.outgoing_delivery_queue` → `POST /api/auth/email-otp/confirm`
   → ожидание `{"ok":true}`; затем `POST /api/auth/specialist-signup/slug` и `POST /api/auth/specialist-signup/start`
   → ожидание **200**, а не 500. Приложить фактические ответы.
4. `pnpm test:db-privileges` и webapp auth-сюиты — зелёные.

## Границы

- ⛔ Deploy на TEST/PROD, остановка сервисов, push, full CI — запрещены. `--execute` разрешён ТОЛЬКО на
  именованной `bcb_webapp_dev`.
- ⛔ Фикстуры, disposable-базы, новые тестовые базы, новая машинерия — запрещены прямым словом владельца.
- ⛔ Не расширяй `app_pre_session` и не заводи обобщённую возможность `pre_session`.
- Если какое-то тело не переводится без продуктового решения — переведи остальные, а это вынеси отдельным
  пунктом отчёта (§24.6). Галочку Б2 не закрывай.
