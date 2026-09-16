# Адверсарный аудит снятия OTP-эскалации администратора

Дата: 2026-09-16. Роль: независимый аудитор. Scope: кандидат в текущем worktree; TEST/PROD не трогались, миграции не накатывались, `.env` не читался.

Oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md` С9: дверь платформенного администратора — только email и пароль. 2FA администратора не усиливалась: владелец 16.09 — «у админа пока не обязательно».

## Классификация

- Взгляд: отсутствие живой третьей точки list/env/config elevation; кто теперь может войти в административный кабинет; влияние снятого чтения verified email; мертвый код.
- Тест: две двери поведения — OTP-confirm не повышает роль по списку; последующее session resolution не повышает роль по списку.
- UI-тесты не создавались.

## Blind kill-set

1. OTP-confirm для адреса из списка возвращает/пишет `admin` вместо persisted `client`.
2. Session resolution для уже выданной сессии возвращает `admin` вместо persisted `client`.
3. Настоящий persisted `admin` не может войти через email+password.
4. Снятие чтения verified email ломает не-роль: principal, audit, organization или session refresh.
5. Другая дверь или config/env/list поднимает роль не из `platform_users.role`.

## Findings

MUST FIX: нет.

OWNER QUESTION: `PLATFORM_OWNER_IDENTITY`, `isVerifiedEmailGlobalAdminAsync` и связанные устаревшие комментарии/моки живых runtime-потребителей больше не имеют. Это отдельная вычистка, не дефект текущего снятия.

## Evidence

A1 третья живая точка подъема роли → PASS → `node /home/dev/brain/tools/code-search.mjs "isVerifiedEmailGlobalAdminAsync PLATFORM_OWNER_IDENTITY" --repo bcb -k 20`; затем точный `rg -n --glob '!**/*.test.*' --glob '!docs/**' "isVerifiedEmailGlobalAdminAsync|PLATFORM_OWNER_IDENTITY" apps packages deploy`. Runtime-вызовов снятой функции нет; остались определение, env-поле, comments/ops artifact. `rg -n --glob '!**/*.test.*' --glob '!docs/**' "ADMIN_TELEGRAM_ID|ADMIN_MAX_IDS|ADMIN_PHONES|ALLOWED_TELEGRAM_IDS|ALLOWED_MAX_IDS" apps packages deploy` не нашел live role-elevation call site; живые auth-двери читают DB-проекцию (`findByUserId`, `resolveByChannelBinding`, passkey user lookup).

A2 кто теперь входит в административный кабинет → PASS → code-read: `/app/admin/login` передает `roleLoginPortal="admin"`; `platform_admin` policy содержит `password`/`totp`; password-route после проверки пароля загружает пользователя через `findByUserId`, проверяет `roleCanUsePortal(..., 'admin')` и пишет session с DB-ролью. Live DEV: обычная браузерная форма email+password в Chromium дала `/api/me`: `role=admin`, административная page: `HTTP 200`.

A3 мутационная проверка → PASS → session-mutation: временно возвращен verified-email role override в `getCurrentSessionWithPrincipalMode`; команда `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run src/modules/auth/sessionColdComposition.unit.test.ts"` дала `rc=1`, failing assertion: expected `client`, received `admin`. OTP-mutation: временно возвращено исключение в `email-otp/confirm`; команда `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run src/app/api/auth/email-otp/confirm/route.route.test.ts"` дала `rc=1`, failing assertion: expected `client`, received `admin`. Временные изменения откатаны; `git diff` по product-файлам пуст.

A4 verified email read не держал другое поведение → PASS → `resolveSessionIdentityAgainstDb` по-прежнему читает актуального пользователя через `findByUserId`, сравнивает `session_epoch`, сохраняет `mustChangePassword`, absolute age, doctor session shape, surface/principal stamping через `finalizeCurrentSession`. Удаленный блок делал только `getVerifiedEmailForUser` + `isVerifiedEmailGlobalAdminAsync` + `buildSession(... role: 'admin')`. `rg -n "getVerifiedEmailForUser|verifiedEmail" apps/webapp/src packages --glob '!**/*.test.*'` показывает другие verified-email consumers в security/password/booking/support/broadcast, но не session role resolution.

A5 тесты по §10a/§10b → PASS → измененные тесты проверяют наблюдаемый выход цепочки: HTTP role/session role остаются persisted `client`, а staff/admin DB-role получает отказ на bare email-code. Oracle внешний к реализации: owner С9 и auth-canon. Они не проверяют DOM, текст исходника, порядок строк или внутренний DTO; две fault injection выше доказали, что тесты ловят именно возврат снятой эскалации.

A6 мертвый код → OWNER QUESTION → `rg -n --glob '!docs/**' "isVerifiedEmailGlobalAdminAsync" apps packages deploy` нашел только определение, тестовые mocks и комментарий; `rg -n --glob '!docs/**' "PLATFORM_OWNER_IDENTITY" apps packages deploy` нашел env-поле, определение функции, comments/ops artifact и тестовый комментарий. Живого runtime-потребителя нет. Отдельно спросить ведущего, вычищать ли функцию, env-поле, ops artifact и устаревшие комментарии.

A7 2FA администратора не трогали → PASS → diff кандидата ограничен OTP-confirm, session service и двумя тестами; password-route/staffSecurity не менялись. Live password login прошел без требования фактора, что совпадает с owner-уточнением «пока не обязательно».

A8 итоговый targeted-набор → PASS → `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest --run src/app/api/auth/email-otp/confirm/route.route.test.ts src/modules/auth/sessionColdComposition.unit.test.ts"`: 2 files, 19 tests passed.

VERDICT: PASS
