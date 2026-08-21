# Fixture retirement — repeat the same owner-login gate after building the candidate package

Роль: `auditor-live`. Это повтор того же разового pre-landing live gate для
`wt/live-fixtures-retirement-20260821`, а не новый audit-cycle. Первый результат
`LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_RESULT_2026-08-21.md` упал до auth-поведения: source
`packages/platform-merge/src/index.ts` экспортирует `mutateCanonicalUserContacts`, но candidate
`packages/platform-merge/dist/index.js` был stale. Product code не исправлять и новый login path не создавать.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1a/§1b, §5/§6, §9–§10 и §24; прочитать
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, auth module doc и
повторить поиск более поздних owner-решений в `docs/OWNER_DECISIONS.md`,
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном `WORK_ORDER.md`.

Authority и PASS-критерии — без изменений из
`LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_BRIEF_2026-08-21.md`: обычный email/password login уже
зарегистрированной owner global-admin учётки, session-cookie + `/api/me`, отсутствующий authenticated
`/api/auth/dev-bypass`, clear-session `/api/auth/dev-public`; без fixture/account/clinic/data creation.

## Механика повтора

1. Доказать, что `12ca8b0ed`, `8b6affa58` и `5ea4c108` — предки HEAD; tracked tree чистое до отчёта.
2. До запуска Next выполнить на candidate:
   `pnpm --dir packages/platform-merge run build`. Дождаться exit code; это обновляет ignored `dist`, не source.
   Затем доказать точным импортом из `packages/platform-merge/dist/index.js`, что export
   `mutateCanonicalUserContacts` доступен. При красной сборке/импорте завершить FAIL, не править продукт.
3. Использовать свободный isolated port `5210–5219`, не трогать общие `5200`/`4200`, TEST или PROD.
4. Как в первом brief, внутри child создать mode-0600 regular copies канонических root `.env` и
   `apps/webapp/.env.dev`, поставить trap удаления только этих копий и запустить candidate
   `npx next dev -H 127.0.0.1 -p <port>` через `setsid`. Не запускать migration или общий dev launcher.
5. Protected password input существует только в `/tmp/bcb-owner-dev-password-20260821`, regular `dev:dev 0600`.
   Не печатать и не передавать его в argv; Node/fetch читает файл внутри процесса. Не пробовать другие пароли,
   не менять пароль/2FA, не создавать fallback actor.
6. Дождаться terminal PASS/FAIL/BLOCKED, остановить только свою process group и удалить protected password file,
   env-копии, PID/cookie/temp. Не заканчивать ход с работающим процессом.

## PASS

- `/api/auth/dev-bypass` — 404;
- ordinary email/password login — `ok=true`, без `factorRequired`, cookie выдана;
- `/api/me` — 200 и точная живая global-admin owner identity/role;
- `/api/auth/dev-public` — обычный redirect к `/app` и session после него очищена.

Законный второй фактор — `BLOCKED`, без обхода. Любой другой runtime/auth failure — `FAIL` с безопасной
классификацией без secret/cookie/PII.

Создать и закоммитить только
`docs/_TODO/runs/integrator-cleanup/LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_RETRY_RESULT_2026-08-21.md`.
Указать candidate SHA, package-build/import result, isolated port, безопасные HTTP classifications, verdict,
cleanup evidence и `NOT DONE: landing / TEST deploy / push / full CI`. Запрещены product edits, DB mutation,
fixture, migration, deploy, landing, push и full CI; staging — только явный report path.
