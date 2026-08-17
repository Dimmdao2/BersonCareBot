# DROP 2FA ENFORCEMENT — перенос поверх принятого Ч7 (#1082)

## Итог

Платформенное принуждение персонала к TOTP через `auth_2fa_enabled` удалено поверх принятого
database-only Ч7 (`c921cafa4`). Перенесён только продуктовый смысл кандидата `359f27ee7`: staff без
самостоятельно заведённого фактора после password login возвращается в свой кабинет, а не на
`/app/account`. Добровольный TOTP не затронут: `securityFactorRequired`, recovery, enrollment,
status, verify и защита merge старого аккаунта остаются действующими.

## Перенос и конфликты

- Сверены `92388d1df`, `359f27ee7` и текущее дерево после `c921cafa4`; старые runtime-defaults и
  другие изменения кандидата не переносились.
- Удалены platform policy reader, guard/login branches, admin toggle, API allowlist и registry/runtime key.
- `requiresEstablishedStaffFactorVerification()` сохранён: пользователь с заведённым фактором без
  подтверждения в текущей сессии по-прежнему получает отказ до membership lookup.
- Обновлён account copy: TOTP добровольный, общего требования персоналу нет.

## Миграция

Создана только `0303_remove_platform_staff_2fa_enforcement.sql`: две идемпотентные по результату
`DELETE` удаляют `auth_2fa_enabled` из `public.app_runtime_settings` и `public.system_settings`.
Старая migration `0300_remove_platform_staff_2fa_enforcement.sql` не переносилась. Journal получил
`idx: 303`, `when: 1793539230004` и tag `0303_remove_platform_staff_2fa_enforcement` после `0299` и
принятых `0300`–`0302`.

## Проверки

- `pnpm --dir apps/webapp exec vitest --run src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` — PASS, 2 files / 13 tests. Первый тестирует password-login staff без самостоятельно заведённого фактора → `/app/doctor`; второй сохраняет отказ до membership lookup при `securityFactorRequired: true`.
- `pnpm --dir apps/webapp typecheck` — PASS.
- `pnpm --dir apps/webapp exec eslint <10 changed TypeScript files>` — PASS, без предупреждений.
- `DATABASE_URL=postgres://user:pass@127.0.0.1:1/db pnpm --dir apps/webapp exec drizzle-kit check --config=drizzle.config.ts` — PASS, `Everything's fine`; соединения с БД не было.
- `git diff --check -- <tracked scoped paths>` плюс `git diff --no-index --check /dev/null <each new scoped file>` — PASS.
- `rg -n 'auth_2fa_enabled|platformRequiresStaffTwoFactor' apps/webapp/src` — 0 hits; `securityFactorRequired` и `requiresEstablishedStaffFactorVerification()` остались в guard и route-test. Start/verify/status/recovery routes и merge code не менялись.

### НЕ ПРОВЕРЕНО / внешние blockers

- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — FAIL уже на принятом `c921cafa4`: `0299_reference_catalog_seed_owner_local` имеет `idx: 299` при array-position `298`. Эта bounded-задача не меняет `0299`; новая `0303` имеет требуемые `idx: 303`, tag и `when: 1793539230004`.
- `pnpm --dir apps/webapp lint` — FAIL до затронутых файлов на предсуществующем raw-SQL gate: `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:40,45,53,63` (файл есть в `c921cafa4`). ESLint дополнительно выводит две предсуществующие warnings в clinic billing и YooKassa provider. Полный lint поэтому **НЕ ПРОВЕРЕНО** как зелёный.

## Не проверено

- DEV/TEST/PROD, миграция и dev-server не запускались.
- Живой сценарий staff с заведённым TOTP не выполнялся; его сохраняет targeted route test.
- Независимый аудит не проводился, финальная галочка Ч7-з не ставилась.
- Worker сам локальный коммит **НЕ СОЗДАЛ**: `git add <scoped paths>` не смог создать
  `/home/dev/dev-projects/BersonCareBot/.git/worktrees/bcb-wt-2fa-enforcement-current/index.lock`
  (`Read-only file system`). После возврата worker lead проверяет дерево и фиксирует ровно этот scope;
  push и merge до независимого аудита не выполняются.
