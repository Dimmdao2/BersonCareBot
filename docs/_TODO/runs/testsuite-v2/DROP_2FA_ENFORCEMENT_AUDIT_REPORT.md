# Ч7-з — независимый аудит удаления обязательной 2FA (#1082)

**Роль:** `auditor-live`  
**Product candidate:** `22a7a1acb`  
**Execution HEAD:** `e1965f38abf3710e41a6a79269535ee556cdaa71`  
**Verdict:** **FAIL**

## Authority и blind phase

Kill-set ниже зафиксирован до чтения product diff и тестов. Oracle: прямое решение владельца в board у
`92388d1df`, принятый integration brief `ceb26b689`, audit brief и ограничение владельца: удалить только
platform-wide enforcement, не ослабляя самостоятельно заведённый фактор, recovery и merge-security.

Заявленная brief-ом строка `Ч7-з` в текущем
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` отсутствует. Это проверено тремя способами:

- `rg -n 'Ч7-з|платформенное принуждение|обязательной 2FA|двухфактор' docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`
  → пусто;
- `node /home/dev/brain/tools/code-search.mjs "SINGLE_ENTRY_CLEANUP Ч7-з 2FA enforcement 92388d1df 22a7a1acb" --repo bcb -k 20`
  → документ найден только по Ч7/`auth_2fa_enabled`, строки Ч7-з нет;
- `git log --all --oneline -S'Ч7-з' -- docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` и поиск той же строки по
  всем revisions → пусто.

Oracle не двусмысленен: точное owner requirement сохранено в
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` у `92388d1df`, а оба bounded brief-а повторяют его без
расширения.

## Blind kill-set

1. Staff без собственного TOTP после password login получает свой кабинет, а не обязательный enrollment.
2. Уже enrolled staff не получает staff workspace до проверки factor challenge в текущей сессии.
3. `recovery` и `recovery_confirmation` закрывают обычный doctor workspace, но identity-self security API
   остаётся достижимым для завершения recovery.
4. Добровольные status/start/verify/recovery-confirmation endpoints сохраняют рабочий цикл и завершают его
   `factor_verified`.
5. `auth_2fa_enabled` отсутствует в активном UI, platform API, registry/runtime types и production callers;
   исторические append-only migrations не переписываются.
6. `0303` удаляет только legacy rows из `public.app_runtime_settings` и `public.system_settings`; journal
   продолжает `0300`–`0302`, а номер принадлежит single-entry.
7. Ни один альтернативный staff login/session path не превращает `securityFactorRequired=true` в доступ к
   platform/doctor surfaces без `factor_verified`.

## Inspection и census

- Diff `22a7a1acb^..22a7a1acb`: 17 файлов, `+89/-198`. Удалены policy reader, login/guard enforcement глобального
  ключа, admin switch, platform API key, registry/runtime key и старые проверки. TOTP service/routes,
  `verifiedStaffPrimaryLogin`, session field `securityFactorRequired` и merge-код не изменены.
- `git diff 22a7a1acb..HEAD -- <2FA product paths>` → пусто: последующий merge не менял принятую поверхность.
- `rg -n 'auth_2fa_enabled|platformRequiresStaffTwoFactor' apps/webapp/src apps/integrator/src packages` →
  **0 строк**. В production TypeScript/UI/API/registry/runtime readers ключа нет.
- Исторический migration census оставляет упоминания только в `0236`, `0242`, `0300` и cleanup `0303`.
  `0300` создаёт исходную DB-only строку; `0303` затем удаляет её из обеих таблиц. Это ожидаемая append-only
  последовательность, а не активный application reader.
- `0303_remove_platform_staff_2fa_enforcement.sql` содержит ровно два `DELETE ... WHERE key =
  'auth_2fa_enabled'`; DDL, другие ключи и другие таблицы отсутствуют.
- Board: `0300–0302` и `0303` забронированы single-entry; следующий общий номер начинается с `0305`.
- Одноразовая JSON-проверка journal подтвердила точную последовательность
  `[[300,1793539230001,"0300_..."], ... [303,1793539230004,"0303_remove_platform_staff_2fa_enforcement"]]`,
  наличие четырёх SQL-файлов и уникальность `idx`/`when`/`tag` → **PASS**.

## Behavioral acceptance и fault injection

Аудит расширил два существующих route test-файла, не создавая новый тяжёлый graph. На неизменённом product до
добавления red oracle: `pnpm --dir apps/webapp exec vitest --run
src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` → **2 файла,
18/18 PASS**.

| Временная поломка | Покрасневший oracle | Результат |
| --- | --- | --- |
| Password login без фактора возвращает `/app/account?tab=security` | `sends staff without a self-enrolled factor to their cabinet` | KILLED |
| `prepareVerifiedPrimaryLoginWithStatus()` игнорирует `security.enrolled` | `requires the already-enrolled staff factor before issuing a session` | KILLED |
| Recovery states больше не входят в workspace restriction | оба cases `keeps a recovery... out of the doctor workspace` | KILLED |
| Общий identity-self security guard запрещает recovery | `keeps the self-security API reachable during recovery` | KILLED |
| Recovery confirmation оставляет assurance `recovery_confirmation` | voluntary TOTP/recovery cycle ожидает `factor_verified` | KILLED |
| TOTP start принудительно отключён | voluntary TOTP/recovery cycle получает `ok:false` вместо `ok:true` | KILLED |

Все шесть временных product mutations откатаны точными обратными `apply_patch`; `git status --short` после них
показывает только audit-owned tests/report.

Финальный targeted run на product candidate намеренно красный: **2 файла; 18 passed, 1 failed**. Единственный
красный тест — fixed oracle finding F1 ниже. Файл реально выбран Vitest project `route`, что видно в выводе
`|route|`.

## Finding

### MUST FIX F1 — enrolled global admin проходит platform API после email-OTP без проверки своего TOTP

**Достижимый сценарий.** `POST /api/auth/email-otp/confirm` загружает полный `SessionUser` через
`userByPhone.findByUserId()` и напрямую вызывает `setSessionFromUser(sessionUser)`. Этот reader переносит
`securityFactorRequired=true`, когда у staff уже есть verified factor, но email-OTP route не вызывает
`prepareVerifiedPrimaryLogin()` и не выставляет `staffSecurity.assurance='factor_verified'`.

После candidate `requirePlatformOperationsApiContext()` вызывает `isRestrictedStaffSecuritySession()`, а эта
функция теперь ограничивает только `recovery`/`recovery_confirmation` и игнорирует
`securityFactorRequired=true`. Поэтому такая валидная admin session проходит `GET /api/platform/settings`:
acceptance test получил **HTTP 200 вместо обязательного 403**, после чего был вызван settings reader.

**Impact.** Global admin, который добровольно завёл TOTP, может войти по email OTP и читать platform settings
без подтверждения собственного фактора. Удаление общего platform toggle тем самым ослабляет уже активированную
per-account 2FA — прямо запрещённый owner requirement. Это не теоретический новый auth method: email-OTP route
существует, сам вычисляет global-admin role и создаёт cookie.

**Нарушено:** owner requirement «проверку уже заведённого фактора не ослаблять» и audit kill-set 7.

**Fixed oracle:** `apps/webapp/src/app/api/doctor/requestAccess.route.test.ts` →
`keeps platform operations closed when an enrolled factor is not verified in-session`. Product fix аудитор не
вносил.

## Проверки

| Команда | Результат |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest --run src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` | **EXPECTED RED:** 2 файла; 18 passed, 1 failed; platform settings вернул 200 вместо 403 |
| `pnpm --dir apps/webapp exec eslint src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` | **PASS** |
| builds `operator-db-schema`, `db-principal`, `error-tracking`, `platform-merge` → `pnpm --dir apps/webapp typecheck` | **PASS** |
| `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` | **FAIL до `0303`:** pre-existing `0299... idx 299; expected array position 298` |
| одноразовая проверка JSON sequence/files/uniqueness для `0300–0303` | **PASS** |
| source census и scoped diff inspection выше | **PASS** |

Full CI не запускался: audit local/app scope и обязательный красный acceptance oracle делают его неуместным.
DEV/TEST/PROD, DDL, migration application и server/deploy не выполнялись.

## Verdict

**FAIL.** Глобальный ключ/читатели и UI удалены корректно; password login без фактора, doctor workspace для
enrolled staff, recovery restriction/completion, добровольные TOTP routes и форма `0303` прошли свои проверки.
Но альтернативный реальный вход global admin обходит проверку уже заведённого фактора и получает platform
settings. Product candidate нельзя принимать до bounded fix по F1 и зелёного прогона сохранённого oracle; новый
blind pass той же поверхности не нужен.

## F1 bounded fix — 2026-08-02

`isRestrictedStaffSecuritySession()` теперь использует общий
`requiresEstablishedStaffFactorVerification()`: staff session с
`securityFactorRequired=true` остаётся закрытой для doctor/platform workspace, пока assurance не станет
`factor_verified`. Existing recovery restriction и identity-self security API не менялись; global toggle,
enrollment и migration не возвращались.

| Команда | Результат |
| --- | --- |
| `pnpm --dir apps/webapp exec vitest --run src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` | **PASS:** 2 файла, 19 passed |
| `pnpm --dir apps/webapp exec eslint src/app-layer/guards/requireRole.ts src/modules/auth/passwordAuth.route.test.ts src/app/api/doctor/requestAccess.route.test.ts` | **PASS** |
| `pnpm --dir apps/webapp typecheck` | **PASS** |
| `rg -n 'auth_2fa_enabled|platformRequiresStaffTwoFactor' apps/webapp/src apps/integrator/src packages` | **PASS:** 0 active matches (exit 1) |
| `git diff --check` | **PASS** |

Повторный blind audit/fault injection не запускался: это тот же принятый kill-set, а постоянный F1 oracle стал
зелёным. DEV/TEST/PROD, DDL и migration application не выполнялись.
