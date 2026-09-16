# Аудит D9/Q4: single session mint в specialist signup confirm

Аудитор: Codex.
Кандидат: `8aa623a9708b658e9f6b37e63aeaaca0a39e6390` (`wt/single-session-mint`).
Автор: `gpt-5.6-sol high`.

Authority:
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, D9/Q4: «одно рождение сессии на одно подтверждение личности».
- Brief аудита: local, полный CI не нужен; тест нужен для «один вход даёт одну запись рождения» и «отказ выдачи организации оставляет рабочую сессию».

## Проверки

1. `SINGLE-MINT` → PASS → `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts:184` остаётся единственным рождением сессии на первом подтверждении личности; финальный шаг `route.ts:240` зовёт `updateCurrentSessionFromUser`, а не `setSessionFromUser`. Fault injection с возвратом второго `setSessionFromUser` дал красный тест: `expected "vi.fn()" to be called once, but got 2 times` на `route.route.test.ts:172`.
2. `UPDATE-NOT-MINT` → PASS → `apps/webapp/src/modules/auth/service.ts:1055` читает текущий cookie, `service.ts:1065` отказывает без сессии/с просроченной сессией через `decodeSessionCookie`, `service.ts:1068` отказывает чужому `userId`, `service.ts:1083` отказывает при изменившейся эпохе, `service.ts:1086` пишет только session cookie. Вызовов журнала входа, fresh-login cookie и device marker в этой операции нет; они остаются только в `persistNewAuthSession` (`service.ts:242-319`).
3. `AUDIENCE-GATE` → PASS → mint и update проходят один общий `assertSessionAudience`: `persistNewAuthSession` вызывает его на `service.ts:250`, `updateCurrentSessionFromUser` на `service.ts:1072`.
4. `TTL` → PASS → update не продлевает сессию: `expiresAt` считается как `Math.min(current.expiresAt, current.issuedAt + sessionTtlSecondsForRole(user.role))` на `service.ts:1076-1079`. Для перехода в doctor TTL может только остаться прежним или сократиться до staff idle TTL от исходного `issuedAt`.
5. `PROVISIONING-PENDING-CODE` → PASS → код рождает рабочую pending-enrollment doctor-сессию до провижининга (`route.ts:143-190`), а при ошибке выдачи организации возвращает `503 provisioning_pending` с `redirectTo: /app/account?tab=security` без очистки cookie (`route.ts:211-228`). Временный аудиторский сценарий с `provisionSpecialistOwner.mockRejectedValueOnce(new Error('transient'))` прошёл: 2/2 теста PASS, session cookie decoded как `{ userId, role: 'doctor', sessionEpoch: 7 }` + `staffSecurity.pending_enrollment`.
6. `PROVISIONING-PENDING-TEST` → FAIL → постоянного теста для обязательного поведения «отказ выдачи организации оставляет рабочую сессию» нет. `rg -n "provisioning_pending|specialist-signup/confirm|provisionSpecialistOwner|route.route.test" apps/webapp/src docs/_TODO/D9_Q4_SINGLE_SESSION_MINT_2026-09-16.md` показывает один permanent test в `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.route.test.ts:166-188`, без 503-сценария; авторский отчёт `docs/_TODO/D9_Q4_SINGLE_SESSION_MINT_2026-09-16.md:41` говорит, что 503-сценарий был временным и удалён.
7. `ESTABLISHED-SESSION` → PASS → повторный заход без `findUserIdByEmailChallengeId` принимает только уже существующую doctor pending-enrollment сессию (`route.ts:88-103`), не вызывает первое рождение (`route.ts:143` guarded by `!establishedSession`), затем выполняет тот же финальный update (`route.ts:193-245`).
8. `TEST-QUALITY` → FAIL → новый happy-path тест доказывает «нет второго рождения», но не доказывает финальное обновление после провижининга: временная мутация, полностью убирающая `updateCurrentSessionFromUser` и оставляющая `void sessionUser`, сохранила тест зелёным (`1 passed`). Это не опровергает код, но по линейке §10a тест не показывает конец цепочки, заявленный в названии как `refreshing the provisioned doctor session`.
9. `MIGRATIONS` → PASS → миграций/схемы/privilege declaration в candidate нет: `git diff --name-only HEAD^ HEAD -- '*.sql' 'apps/webapp/db/schema/**' 'deploy/postgres/privileges/declaration.ts'` → empty.

## Прогоны

- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts"` → PASS, 1 файл / 1 тест.
- Fault injection 1: второй `setSessionFromUser` на финальном шаге → тот же тест FAIL, `recordIdentitySessionStart` called 2 times.
- Fault injection 2: финальный update заменён на no-op → тот же тест PASS, 1 файл / 1 тест.
- Временный 503-сценарий добавлен в route test только для аудита → PASS, 1 файл / 2 теста; затем удалён.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts src/app/api/auth/specialist-signup/start/route.route.test.ts src/modules/auth/sessionColdComposition.unit.test.ts src/modules/auth/telegramMiniAppTokenSeparation.unit.test.ts src/modules/auth/service.publicIdentityCutover.acceptance.test.ts"` → PASS, 5 файлов / 21 тест.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec eslint src/modules/auth/service.ts src/app/api/auth/specialist-signup/confirm/route.ts src/app/api/auth/specialist-signup/confirm/route.route.test.ts"` → PASS.

## MUST FIX

1. Добавить permanent route-level test для `provisioning_pending`: после успешного подтверждения кода и первого session mint `provisionSpecialistOwner` падает, ответ `503 provisioning_pending` содержит `redirectTo: /app/account?tab=security`, session cookie остаётся рабочей doctor pending-enrollment, а `recordIdentitySessionStart`/`recordUserLoginEvent` вызваны ровно один раз.
2. Усилить happy-path test так, чтобы no-op финального `updateCurrentSessionFromUser` краснел, либо переименовать/сузить его oracle до факта одного рождения. Если oracle заявляет refresh provisioned session, входные данные должны отличать pre-provision user от post-provision user наблюдаемым полем итоговой session projection.

VERDICT: FAIL

## Круг 2

Кандидат коррекции: `b9e2f2beba2d9263a83374b54af5ae9008cfe24f` поверх `8aa623a97`.
Классификация по brief: `local`; оба прежних MUST FIX проверены тестом/fault injection, остальное из первого круга заново не перепроверял.

1. `MUST-FIX-2` → PASS → финальный no-op `updateCurrentSessionFromUser` теперь краснит постоянный route-test. Мутация: в `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts` заменить финальный `await updateCurrentSessionFromUser(...)` на `void sessionUser;`. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts"` → FAIL: `route.route.test.ts:184` ожидал `displayName: "Иван Иванов, клиника"`, получил `"Иван Иванов"`. Фикстура честная, не подгонка: реальный `app.provision_specialist_owner` пишет post-provision projection (`deploy/postgres/specialist-owner-provisioning-rls.sql:217-220` меняет `platform_users.role/display_name`, `:291-309` создаёт membership, `:328-350` создаёт specialist и связывает membership, `:353-358` помечает intent provisioned). Поэтому правдивое отличие после провижининга — как минимум новая `displayName` из `specialist_full_name` и созданная staff/org projection; прежнее отличие только ролью не ловило no-op, потому что первый mint уже принудительно ставит `role: 'doctor'`.
2. `MUST-FIX-1` → PASS → постоянный refusal-test есть в `route.route.test.ts:200-219` и по §10a держит наблюдаемый выход цепочки: HTTP `503`, `error: provisioning_pending`, `redirectTo: /app/account?tab=security`, сохранённая рабочая doctor pending-enrollment session cookie и один login birth side effect. Это не упадёт само: без теста route может честно вернуть 503 и при этом оставить пользователя без сессии. При честной правке кода тест править не надо, пока oracle остаётся тем же route-level контрактом отказа; он не закрепляет внутренний порядок вызовов, а читает ответ и декодированную session cookie. Мутация отказного пути: заменить первый `await setSessionFromUser(...)` перед `provisionSpecialistOwner` на `void verifiedSessionUser;`. Команда `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts -t 'keeps the working session when provisioning refuses'"` → FAIL: `route.route.test.ts:211` ожидал `recordUserLoginEvent` once, получил 0; дальше тот же сценарий не получил бы рабочую session cookie.

Контроль после отката обеих мутаций: `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts"` → PASS, 1 файл / 2 теста.

VERDICT: PASS
