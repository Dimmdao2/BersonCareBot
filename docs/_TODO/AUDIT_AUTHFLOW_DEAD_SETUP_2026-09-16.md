# Adversarial audit — dead password-setup path in `AuthFlowV2`

Дата: 2026-09-16  
Candidate: `aefc1f6844c45a9ce12c086b883dc585618f8538`  
Parent / состояние `feat` до изменения: `185387507`  
Ветка: `wt/authflow-dead-password-setup`

## Итог

Изменение безопасно: удалённые ветви не имели producer на parent SHA, живые двери не потеряли
переходов, а распрямлённый `onConfirm` исчерпывается тремя значениями закрытого union. Обязательная
классификация лида подтверждена: UI-удаление принято взглядом, точным поиском, diff и компилятором;
новые UI/DOM-тесты не создавались. Живые HTTP-границы проверены существующими route-тестами.

MUST FIX: нет.

Два остатка названы ниже, но не являются audit findings по `AGENTS.md` §24.6: они недостижимы и не
ломают build/runtime/security/data. Удаление их — механическая чистка, а не условие безопасности
этого candidate.

## Evidence по пунктам brief

1 → PASS → на parent `185387507` точный `git grep` нашёл все обращения к трём удалённым состояниям:
`emailVerifyPurpose` никогда не получал `setup`; каждый `setPwRecoveryPurpose` передавал только
`reset`; единственное содержательное присваивание `pwResetChallengeId` читало необязательный
`p.challengeId` из `password_reset` draft, но endpoint fork всё равно выбирался по неизменно
`reset`. Query-параметры, pending storage, единственный renderer и specialist entry не имеют
скрытого setter.

2 → PASS → specialist signup, email OTP, patient email registration, staff forgot/reset, passkey,
OAuth return и cross-surface pending restore прослежены до их живой границы; ни одна из них не
зависит от удалённых значений. Patient surface по-прежнему очищает staff `password_reset` draft до
hydration формы.

3 → PASS → после возвращающей ветки `specialist_signup` остаются ровно
`email_otp | patient_registration`; оба идут в `/api/auth/email-otp/confirm`. Каждый исход callback
явно возвращает `{ ok: true }` либо `{ ok: false }`. Четвёртое значение нельзя установить через
текущий setter: fault injection дал `TS2345`.

4 → PASS → удалённые state/i18n references отсутствуют во всём исполняемом дереве. Найдены два
неблокирующих остатка: недостижимый resend-fallback в `AuthFlowV2.tsx:2121-2155` и больше не
потребляемое поле `password_reset.challengeId` в `authFlowPendingStorage.ts:30-31`. Экспорт
`savePasswordResetPending` (`authFlowPendingStorage.ts:186-200`) также не имеет callers, но был
мёртв уже до candidate и не создан этой правкой.

5 → PASS → `setup-code/complete` сохранён и его lower role guard работает. Product caller или email
link не найден; route вызывают route-тесты, а docs перечисляют его как публичную дверь. Staff
`password_setup` challenge всё ещё выпускает `passwordRecovery.ts`, но текущий UI завершает его
унифицированным `/email-password/reset`, который умеет потреблять оба purpose.

6 → PASS → обязательный typecheck: rc=0. Три точечных route-файла: `3 passed`, `34 passed`, rc=0.
Полный CI и полный набор webapp-тестов не запускались.

7 → PASS → две инъекции в изолированной копии того же SHA дали ожидаемый красный сигнал:
фальшивый setter `setup` пойман компилятором; снятие запрета роли `client` у `/reset` поймано
существующим route-тестом (`expected 403`, `received 200`). Временная копия удалена, candidate-код
не менялся.

## 1. Reachability до изменения

Точный проход по parent:

```bash
git grep -n -E "emailVerifyPurpose|setEmailVerifyPurpose|pwRecoveryPurpose|setPwRecoveryPurpose|pwResetChallengeId|setPwResetChallengeId|emailRegPassword|setEmailRegPassword" aefc1f684^ -- apps/webapp ':!apps/webapp/.next'
```

Результат:

- union содержал `setup`, но среди setter-вызовов были только `patient_registration`, `email_otp`
  и `specialist_signup`;
- `pwRecoveryPurpose` инициализировался и сбрасывался только в `reset`; setter со значением `setup`
  отсутствовал;
- `pwResetChallengeId` получал только `p.challengeId` при hydration `password_reset`, однако
  `pwRecoveryPurpose` оставался `reset`, поэтому это значение не могло выбрать
  `setup-code/complete`;
- `emailRegPassword` имел только reset и UI setter внутри ветви, показываемой для недостижимого
  `setup`; producer purpose отсутствовал.

Дополнительные входы:

- `authFlowPendingStorage.ts` хранит только `register_verify`, `password_reset` и
  `specialist_signup_verify`; setup-purpose там нет;
- `AuthBootstrap.tsx:177-198` разбирает `intent`, `devView` и `recover=1`. Они открывают specialist
  signup или password-login/recovery, но не присваивают внутренний verify-purpose;
- `AuthBootstrap.tsx:1177-1188` — единственное место рендера `AuthFlowV2`; props не несут setup-purpose;
- specialist surface приходит с `roleLoginPortal="doctor"` и staff policy. Его register path
  присваивает только `specialist_signup`, а recovery — только обычный reset;
- `git grep` по parent не нашёл ни `setEmailVerifyPurpose('setup')`, ни
  `setPwRecoveryPurpose('setup')` ни в одном другом компоненте.

Следовательно, обе удалённые endpoint-ветви были недостижимы уже на parent SHA.

## 2. Живые двери после изменения

| Дверь | Сохранившийся путь |
|---|---|
| Specialist signup | `openSpecialistSignup`/start/hydration ставят только `specialist_signup`; confirm идёт в `/specialist-signup/confirm`, resend — в `/specialist-signup/start`, пароль resend остаётся видим только здесь (`AuthFlowV2.tsx:854-1018, 1830-1922, 1960-2029, 2192-2207`). |
| Email OTP login | start ставит `email_otp`; confirm идёт в `/email-otp/confirm`, resend — в `/email-otp/start` (`508-550, 1923-1958, 2030-2068`). |
| Patient email registration | register ставит и сохраняет `patient_registration`; restore возвращает ту же цель; confirm использует общую passwordless-дверь, resend — `/email-otp/register` (`352-371, 552-611, 2069-2120`). |
| Staff forgot/reset | recovery доступна только при `passwordLoginEnabled`; `/forgot` переводит в `reset_code`, finalize всегда вызывает `/email-password/reset`. Route сам выбирает `password_reset` или `password_setup` по серверному auth-state и запрещает `client` (`AuthFlowV2.tsx:624-676, 1033-1086`; reset route `65-123`). |
| Passkey | options → browser assertion → verify → redirect/staff factor; ветка не использует email verify/recovery state (`AuthFlowV2.tsx:686-752`). |
| OAuth return | start передаёт provider/portal/next; callback восстанавливает portal из подписанного state, ставит сессию и возвращает redirect. Удалённые локальные states в этой цепочке не участвуют (`AuthFlowV2.tsx:409-444`, OAuth callback handlers). |
| Cross-surface restore | до hydration формы проверяется `p.mode === 'password_reset' && !passwordLoginEnabled`; draft очищается и остаётся `emailAuthMode='login'`. На staff surface draft по-прежнему восстанавливает `reset_code` и email (`AuthFlowV2.tsx:331-405`). |

Замечание о restore: `savePasswordResetPending` сейчас не имеет caller, поэтому новый draft этот SHA
сам не создаёт; guard всё же корректно обрабатывает ранее сохранённый/совместимый payload. Это состояние
существовало до audited commit и removal setter-ов его не меняет.

## 3. Распрямлённый handler

Текущий union объявляет только:

```text
patient_registration | email_otp | specialist_signup
```

`specialist_signup` обрабатывается первым и каждый его исход возвращает результат. После этой ветви
по типу и по всем setter-ам остаются только две passwordless-цели. Общая ветвь возвращает значение при
network failure, success+redirect, rate limit и прочем отказе (`AuthFlowV2.tsx:1830-1958`). Fall-through
без return отсутствует.

## 4. Leftovers

Точный проход после изменения:

```bash
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' \
  "emailRegPassword|pwRecoveryPurpose|pwResetChallengeId|authAccessConfigured|setEmailVerifyPurpose\\('setup'|emailVerifyPurpose === 'setup'" \
  apps/webapp/src apps/integrator/src packages
```

Результат пустой.

Остатки, выявленные чтением CFG:

1. `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:2121-2155` — fallback resend через
   `/api/auth/email-password/forgot`. Три предыдущих ветви покрывают весь текущий union и каждая
   возвращает результат, поэтому fallback недостижим. Это последний UI-хвост прежнего `setup` purpose.
2. `apps/webapp/src/shared/ui/patient/auth/authFlowPendingStorage.ts:30-31` — optional
   `password_reset.challengeId`. До commit его читал удалённый `setPwResetChallengeId`; теперь consumers
   поля нет. Сам mode/email/savedAt остаются нужны restore/clear и support-return.
3. `authFlowPendingStorage.ts:186-200` — `savePasswordResetPending` не имеет callers ни на parent, ни
   на candidate. Это более старый dead helper, не регрессия audited diff.

Серверные `password_setup` purpose и completion helper не dead: они обслуживают staff account без
пароля через унифицированный `/reset` и держат role guard. Удалять серверный enum/helper по этому
UI-аудиту нельзя.

## 5. Сохранённый `setup-code/complete`

Точный поиск:

```bash
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' \
  "setup-code/complete" apps/webapp/src apps/integrator/src packages docs --glob '!docs/archive/**'
```

Нашёл:

- сам route и его комментарий в `passwordRecovery.ts`;
- вызовы только в `passwordEligibility.route.test.ts`;
- активные docs/census/канон, называющие route;
- ни одного `fetch`/link/product caller.

**FINDING FOR OWNER, не defect:** нормальный UI теперь потребляет staff setup-code через
`POST /api/auth/email-password/reset`; email renderer ссылки на `setup-code/complete` не создаёт.
Отдельный route остаётся внешне вызываемым совместимым alias и покрыт тестами, но внутреннего product
caller у него нет. Brief прямо велит сохранить его как lower guard net; удаление/слияние этой публичной
двери — только отдельное решение владельца.

## 6. Compiler и targeted tests

Команда typecheck:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec tsc --noEmit -p tsconfig.json"
```

Результат: `rc=0`, 8 секунд.

Команда route-тестов:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest run --project=route src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts"
```

Результат: `3 passed` files, `34 passed` tests, `rc=0`, 2 секунды. Сообщение
`permission denied for table platform_users` — намеренно инъецированный exception в существующем
тесте `passwordAuth.route.test.ts:498-518`; suite зелёный.

Тесты имеют независимый oracle на нижнем публичном слое: канон §9 запрещает пациентский пароль,
route-тесты проверяют конечный HTTP-ответ/отсутствие credential/session write; email OTP test проверяет
выдачу совместимой patient-session. Новых UI-тестов и тестов текста исходника нет.

Известная до этого commit проблема не маскируется: `email-otp/confirm/route.route.test.ts` сохраняет
global-admin-by-policy вход по одному email-коду, хотя канон §8/часть VII п.8 называет это обходом 2FA.
Это уже вынесено отдельным этапом Д1 и audited diff не меняет; в MUST FIX данного local-stage не входит.

## 7. Fault injection

Инъекции выполнялись в отдельном clone на `aefc1f684`; основной working tree не менялся.

1. Добавлен фальшивый `setEmailVerifyPurpose('setup')`, затем:

   ```bash
   /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-track-state/.audit-fi-worktree && pnpm -C apps/webapp exec tsc --noEmit -p tsconfig.json"
   ```

   Получено ожидаемое:
   `TS2345: Argument of type '"setup"' is not assignable to ... 'email_otp' | 'specialist_signup' | 'patient_registration'`.
   Параллельно clone сообщил о недостающем `luxon` в несвязанном integrator dependency tree; целевой
   diagnostic однозначен и typecheck candidate отдельно прошёл чисто.

2. Временно снята часть условия `!isPasswordEligibleRole(targetUser.role)` у `/email-password/reset`, затем:

   ```bash
   /home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-track-state/.audit-fi-worktree && pnpm -C apps/webapp exec vitest run --project=route src/modules/auth/passwordAuth.route.test.ts"
   ```

   Результат: `1 failed, 22 passed`; сценарий `blocks reset for a patient account even with a valid code`
   ожидал `403`, получил `200`. Это доказывает, что унификация UI на `/reset` не ослабила нижний запрет
   пациентского пароля и существующий тест действительно ловит его потерю.

Обе временные правки отменены; clone удалён в корзину.

## MUST FIX

Нет.

VERDICT: PASS
