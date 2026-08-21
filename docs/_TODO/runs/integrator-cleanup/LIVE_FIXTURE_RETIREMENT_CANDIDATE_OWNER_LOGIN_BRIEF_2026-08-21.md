# Fixture retirement — isolated candidate ordinary owner-login live gate

Роль: `auditor-live`. Проверить candidate worktree `wt/live-fixtures-retirement-20260821` до landing после
product `12ca8b0ed` и wording closure `8b6affa58`. Product-fix, новый audit-cycle и новый login path запрещены.

Классификация «тест или взгляд»: это разовый live behavior gate по уже зарегистрированной owner-учётке. Оракул —
штатный email/password HTTP flow кандидата, выданная session-cookie и `GET /api/me`; permanent source-string test,
fixture и blind fault injection не нужны.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1a/§1b, §5/§6, §9–§10 и §24; прочитать
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, auth module doc и
снова проверить более поздние owner-решения в `docs/OWNER_DECISIONS.md`,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, актуальном `WORK_ORDER.md`.

Источник оракула: `AGENTS.md` §1a — ролевые проверки DEV/TEST проходят штатным email/password, OAuth или
messenger-входом уже зарегистрированных owner-учёток; persistent fixture/token/preset-вход запрещён,
`/api/auth/dev-public` только очищает session. Owner-аккаунт global admin указан в
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §11; пароль в git/brief/log не записывается.

## Exact candidate и среда

- Доказать, что `12ca8b0ed` и `8b6affa58` — предки текущего `HEAD`, tracked tree чистое.
- Использовать свободный isolated candidate port из `5210–5219`; общий `5200`, integrator `4200`, TEST `6300` и
  PROD-порты не трогать.
- Candidate worktree не хранит env. В detached child-process создать regular mode-0600 copies канонических
  `/home/dev/dev-projects/BersonCareBot/.env` и `apps/webapp/.env.dev` в candidate, поставить trap удаления только
  этих двух копий, затем запустить напрямую `npx next dev -H 127.0.0.1 -p <isolated-port>` из `apps/webapp`.
- **Не запускать `pnpm dev`/`webapp:dev`/`dev:turbo`**: они убивают общий порт. **Не запускать migration**:
  fixture-retirement не меняет schema, а D15 candidate проходит свой отдельный migration gate.
- Сервер запускать через `setsid` с логом `/tmp/live-fixture-owner-login-candidate-20260821.log` и PID-файлом;
  он должен пережить обрыв auditor turn. Текущий ход ждёт terminal result и в конце гарантированно останавливает
  только свою process group.

## Probe без утечки секрета

Protected input подготовлен lead в `/tmp/bcb-owner-dev-password-20260821` как regular `dev:dev 0600`.
Не печатать и не передавать пароль в argv. Одноразовый Node/fetch probe читает файл внутри процесса, отправляет
JSON body на `POST /api/auth/email-password/login` для owner global-admin email из §11, держит Set-Cookie только в
памяти и затем вызывает `GET /api/me` на том же isolated origin.

PASS требует одновременно:

1. candidate `/api/auth/dev-bypass` не существует (404; не редирект и не session);
2. `/api/auth/dev-public` очищает session и редиректит к обычному `/app`, не создавая authenticated role;
3. ordinary email/password login возвращает `ok=true` без `factorRequired`, выдаёт session-cookie;
4. `GET /api/me` с этой cookie возвращает 200 и живую global-admin owner identity/role; никаких новых аккаунтов,
   клиник или данных не создаётся.

Если существующий owner account законно требует второй фактор, не обходить и не менять его: записать `BLOCKED`
с безопасным ответом без cookie/body secrets. Не пробовать другие пароли, не сбрасывать пароль/2FA и не создавать
fallback actor.

После probe удалить protected password file, env-копии, cookie/temp файлы и остановить candidate server. Не читать
и не печатать secret env/password/session cookie.

## Артефакт

Создать и закоммитить только
`docs/_TODO/runs/integrator-cleanup/LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_RESULT_2026-08-21.md`:
candidate SHA, isolated port, безопасные HTTP status/classifications, PASS|FAIL|BLOCKED, cleanup evidence и
`NOT DONE: landing / TEST deploy / push / full CI`. Запрещены DB/TEST/PROD mutation, fixture, migration, deploy,
landing, push и product edits. Коммитить report явным путём без `git add -A`.
