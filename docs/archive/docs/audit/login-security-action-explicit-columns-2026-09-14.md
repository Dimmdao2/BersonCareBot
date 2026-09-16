# Аудит `consume_login_security_action`: явные колонки

Дата: 2026-09-14
Authority: `docs/_TODO/LOGIN_HISTORY_2026-09-13.md`, Л-8.2в
Candidate: `763517fa7718aa7f616dc344e73457bb3b702cd6`
Base: `c5b8bc09f8c559fc4aa439bfa9984ae7c09d51dd`

## Вердикт

**FAIL — 1 подтверждённая находка.** Сам исходный `42501` исправлен и поведение двери живьём
сохранено, но декларация выдаёт владельцу двери лишние `UPDATE`-права на трёх отношениях.

## Классификация: тест или взгляд

1. Отсутствие whole-row / `*` — **взгляд**: census последних тел миграций и `pg_get_functiondef`
   на DEV. Постоянный тест текста SQL запрещён.
2. Тело ⊆ декларация без лишних прав — **взгляд**: импорт исполняемой декларации, generated grants
   и `information_schema.role_column_grants` на DEV.
3. Четыре исхода двери — **поведение**: публичный HTTP-маршрут и фактические изменения DEV-БД;
   `FOR UPDATE` и порядок внутренних `UPDATE` — **взгляд**, потому что тест порядка внутренних
   операций запрещён.
4. Тот же класс в остальных дверях работы — **взгляд**: census всех эффективных тел дверей #1112
   на DEV, не поиск по одному migration-файлу.
5. Путь человека — **живая проверка**: штатный вход, Mailpit, публичная ссылка, действие,
   инвалидированные сессии и повторный вход. Автоматизированный UI-тест запрещён.

## 1. Починка настоящая

`git diff --name-status c5b8bc09f..HEAD` показал ровно один новый migration-файл:
`20260914T063000_consume_login_security_action_explicit_columns.sql`.

Проверки:

- `rg -n "^CREATE OR REPLACE FUNCTION|^CREATE FUNCTION|SELECT .+\\.\\*|%ROWTYPE"` по исходной и
  исправляющей миграциям показал whole-row только в исторической `20260914T023000`; последняя
  замена функции — `20260914T063000` — читает пять значений явными именами;
- запрос `pg_get_functiondef('app.consume_login_security_action(text)'::regprocedure)` на
  `bcb_webapp_dev` вернул фактическое тело с
  `SELECT action.id, action.user_id, action.used_at, action.expires_at, action.source_login_event_id`;
- catalog-census эффективных функций работы (`list_own_login_devices`, `record_login_failure`,
  `append_user_login_event`, `issue_login_security_action`, `consume_login_security_action`,
  `password_credentials_must_change`, `password_credentials_replace_self`,
  `password_credentials_upsert_self`) вернул для каждой `has_rowtype=0`, `has_qualified_star=0`.

`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`
завершился: `pending=0`, `total=209`, `verified-objects=382`, `PASS`.

## 2. Тело и декларация

Для `SELECT` список декларации точен:

- `login_security_actions`: `id`, `token_hash`, `user_id`, `purpose`, `expires_at`, `used_at`,
  `source_login_event_id` — все используются чтением, фильтром либо возвратом;
- `platform_users`: `id`, `session_epoch`, `updated_at`, `merged_into_id`;
- `user_password_credentials`: `user_id`, `must_change_at`, `updated_at`;
- `user_contacts`: `id`, `platform_user_id`, `contact_kind`, `value_normalized`, `is_primary`,
  `confirmed_at`, `created_at`.

### Finding 1 — лишние `UPDATE`-права

Достижимое состояние: любой код, исполняющийся от `app_seam_password_auth_owner`, может менять
колонки, которых действие защиты учётной записи не меняет. Impact — расширение security boundary
двери сверх её назначения; это прямо нарушает требование брифа «лишнее право у двери — находка».

Импорт `declaration.ts` и запрос к `information_schema.role_column_grants` показали:

- `public.login_security_actions`: выдан `UPDATE` на 7 колонок, тело пишет только `used_at`;
- `public.platform_users`: выдан `UPDATE` на `id`, `session_epoch`, `updated_at`, `merged_into_id`,
  тело пишет только `session_epoch`, `updated_at`;
- `public.user_password_credentials`: выдан `UPDATE` на `user_id`, `must_change_at`, `updated_at`,
  тело пишет только `must_change_at`, `updated_at`.

Причина: у трёх `relationSurfaces` отсутствует `operationColumns.UPDATE`, поэтому генератор
применяет общий union колонок к обеим операциям. Для замка `FOR UPDATE` достаточно одного
колоночного `UPDATE`; фактический `UPDATE used_at` уже даёт его.

## 3. Поведение двери

Слепой kill-set был составлен до чтения реализации: неизвестный, использованный и просроченный
ключи не меняют security-state; годный ключ увеличивает эпоху, ставит требование смены пароля и
помечает действие использованным; два потребления одного ключа не дают два успеха.

Живые результаты через `POST /api/public/account-protection`:

- выдуманный ключ, предварительно подтверждённый как отсутствующий (`SELECT count(*) ...` → `0`):
  `409 {"ok":false,"reason":"invalid"}`, состояние пользователя не изменилось;
- просроченная временная строка: `410 {"ok":false,"reason":"expired"}`, `used_at IS NULL`,
  состояние пользователя не изменилось; строка удалена (`DELETE ... RETURNING 1` → `1`);
- годный ключ: `200 {"ok":true}`; состояние перешло с `used_at IS NULL | session_epoch=1 |
  must_change_at IS NULL` в `used_at IS NOT NULL | session_epoch=2 | must_change_at IS NOT NULL`;
- повтор того же ключа: `409 {"ok":false,"reason":"used"}`; повторного эффекта нет.

`git diff c5b8bc09f..HEAD -- 20260914T063000…sql` подтвердил `FOR UPDATE` и прежнюю
последовательность: эпоха сессий → `must_change_at` → `used_at`. Поведение веток совпадает с
предыдущим телом; изменены только способ загрузки строки и локальные переменные.

## 4. Другие двери работы

Catalog-census из пункта 1 не нашёл whole-row или qualified-star ни в одной эффективной двери
#1112. Контрольная более широкая выборка всего владельца `app_seam_password_auth_owner` нашла три
старых `password_login_*_impl` с `%ROWTYPE`/`alias.*`; `code-search` ведёт их к миграции
`20260821T040000`, они не добавлены и не изменены работой #1112 или дельтой `c5b8bc09f..HEAD`.
По прямому запрету «всё остальное уже проходило аудит — не переаудируй» они не включены в verdict.

## 5. Живая проверка DEV

Проверено на `151.241.228.122`, база `bcb_webapp_dev`, webapp `127.0.0.1:5200`, integrator
`127.0.0.1:4200`, Mailpit `127.0.0.1:8025`. Для Mailpit временно использован локальный SMTP-профиль
и integrator TEST-allowlist только на owner-email; внешней доставки не было.

Прошло живьём дословно:

1. штатный вход owner admin: `200 {"ok":true,"redirectTo":"/app/admin/system-health","role":"admin"}`;
2. Mailpit: счётчик `4 → 5`, новое письмо `Вход в Therapysto с нового устройства` владельцу;
3. публичная ссылка без cookie: `GET 200`; до и после повторного открытия состояние
   `true|1|true`, `cmp` → `state_unchanged=yes`; owner-session: `/api/me 200`;
4. нажатие: `200 {"ok":true}`;
5. обе ранее выданные owner-сессии: `/api/me 401 {"ok":false,"error":"unauthorized"}`;
6. повторное нажатие: `409 {"ok":false,"reason":"used"}`;
7. вход старым паролем: `200 {"ok":true,"redirectTo":"/app/protect-account/password","role":"admin"}`.

После проверки `must_change_at` возвращён из `NOT NULL` в исходный `NULL` (`UPDATE ... RETURNING 1`
→ `1`). Временный `therapysto_smtp_outbound` удалён (`DELETE ... RETURNING 1` → `1`), итоговая
проверка дала `must_change_at IS NULL=true | temporary SMTP absent=true`. DEV-процессы остановлены.

## Тесты

- Новые тесты: нет. Исходный отказ громкий (`500`/`42501`), статическая проверка SQL/registry
  запрещена §10a; требуемое поведение дешевле и достовернее проверено живым публичным маршрутом.
- Удалённые тесты: нет; относящихся к `account-protection`/`login_security_actions` тестов поиск
  `rg -n "account-protection|consumeLoginSecurityAction|consume_login_security_action|login_security_actions"
  --glob '*.{test,spec}.{ts,tsx,mjs,js}' apps deploy packages` не нашёл.
- Автор существующие тесты не трогал: `git diff --name-only c5b8bc09f..HEAD -- '*test*' '*spec*'`
  вернул пусто.
- `pnpm test:db-privileges`: `380` tests, `185` pass, `0` fail, `195` skipped.
- `node deploy/postgres/privileges/generate-cli.mjs --check`: PASS, generated-файлы побайтно
  соответствуют декларации. Это подтверждает, что лишние права действительно генерируются из
  декларации, а не являются дрейфом DEV.
- `git diff --check c5b8bc09f..HEAD`: PASS.

## Вопросы владельцу

1. Во время временной настройки Mailpit authenticated `GET /api/admin/settings` на DEV вернул
   сохранённый SMTP credential без ожидаемой редактуры. Значение не использовалось и здесь не
   записано. Это вне candidate delta; нужен отдельный owner-scope на разбор и решение о ротации.
2. После успешного core-действия DEV-лог показал отказ побочного обращения в поддержку и отказ
   сохранения undelivered submission. Core-действие уже было атомарно выполнено и HTTP вернул `200`.
   Это вне единственной migration-дельты; нужен отдельный owner-scope, если требуется разбирать
   support delivery.

## НЕ СДЕЛАНО

- Лишние права не исправлялись: auditor по брифу не меняет продуктовый код/декларацию.
- TEST не раскатывался и не читался.
- PROD не трогался ни чтением, ни записью.
- Старые `password_login_*_impl` вне #1112 не переаудировались.
- Full `pnpm run ci` не запускался: дельта — одна SQL-миграция; preflight, generated check,
  полный набор DB-privilege tests и живая проверка закрыли применимые риски.
