FAIL — 4 MUST FIX

# Независимый адверсарный аудит C7, круг 3

Кандидат: `b7e938804` поверх `cf537a2c8`, `ded6884b1` и аудиторского `46e17049e`.
Команда `git diff --shortstat 4aaed427b..b7e938804` дала
`13 files changed, 473 insertions(+), 1457 deletions(-)`; только круги 2–3 по команде
`git diff --shortstat cf537a2c8..b7e938804` — `4 files changed, 244 insertions(+), 26 deletions(-)`.

## Оракул и разбор трёх отклонённых находок круга 2

Действующий оракул — `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:70-76`:

> «вход по номеру ... вырезать все подобное, это старое. Сейчас вход по номеру только по коду после
> подтверждения контактов в мессенджере»; живой путь один —
> `phone/messenger-bind/{start,status,finish}`; автоматический подбор и SMS-подбор снимаются.

С разбором ведущего по трём продуктовым находкам круга 2 **согласен**:

1. `phone/start purpose=profile_bind` — действие уже авторизованного пациента по привязке профиля,
   а не вход по введённому номеру. Оракул C7 его не разрешает и не запрещает.
2. OTP публичной записи — отдельный сценарий подтверждения записи, который затем создаёт сессию.
   Удаление меняет продукт публичной записи; строка C7 про снятую автоматическую ветку `phone/start`
   такого решения не даёт. Это OWNER QUESTION, не работа C7.
3. `patient/diary/purge-otp` — повторная проверка уже вошедшего пациента перед уничтожением данных,
   не вход. Строка C7 не требует её снять.

Итого эти три пункта не являются MUST FIX этого этапа. Это не делает direct `profile_bind` новым
owner-решением: сохраняющие его тесты всё равно обязаны иметь собственный независимый oracle по §10a.

## MUST FIX

### 1. Коммит `b7e938804` не компилируется и не собирается

`phoneStartFallback.route.test.ts:309` читает `clinicRequiredOrganizationId` прямо у union
`PhoneOtpDelivery`; у варианта `{ channel: 'sms' }` такого поля нет.

- `pnpm --dir apps/webapp exec tsc --noEmit` → exit `2`, `TS2339` на строке 309.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"` → exit `1`, тот же `TS2339`
  на стадии `Running TypeScript`.

Impact: кандидат нельзя собрать или приземлить. Нарушен явный критерий брифа C7 «сборка и
`tsc --noEmit`» и §24.6 (реальная build-поломка является finding).

### 2. Исправленный §17 сам себе противоречит и помечает живой путь снятым

`AUTH_AND_IDENTITY_CANON.md:419-422` утверждает, что пункты 1–3 ниже описывают снятый порядок;
`:431` дополнительно маркирует весь ввод телефона как «СНЯТО». Но сами пункты `:433-436` описывают
ровно действующий путь: выбор Telegram/MAX, подтверждение контакта, затем
`phone/messenger-bind/{status,finish}`, без автоматического подбора и SMS.

Impact: следующий исполнитель получает одновременно «это единственный живой путь» (`:424-429`) и
«это история, не действующее правило» (`:419-422`).

Нарушена строка оракула `STAFF_DOORS_HARDCODED_2026-09-16.md:70-76`: снята автоматическая ветка,
а messenger-contact flow прямо оставлен единственным живым. Следует пометить снятым только прежний
автоматический/SMS-порядок, не пункты про messenger proof.

### 3. Positive-тесты direct `profile_bind` взяты из нового кода, а не из owner-оракула, и дают ложную защиту

`phoneStartFallback.route.test.ts:276-312,333-351` закрепляет, что прямой
`phone/start → phone/confirm` для `profile_bind` обязан остаться и что его sender-scope имеет точную
внутреннюю форму. C7-оракул говорит только о **входе**, а живой продукт привязывает номер другим
маршрутом: `PatientBindPhoneBrowser → PhoneMessengerAuthFlow(purpose=profile_bind) →
phone/messenger-bind/*`. Точный поиск
`rg -n --glob '!**/*.test.*' --glob '!docs/**' "/api/auth/phone/start|api/auth/phone/start|phone/start" apps/webapp/src apps/integrator/src packages`
не нашёл product-клиента `phone/start`; остались сам handler и документационные комментарии.

Инъекция удаления `profileBindUserId` из options вызова `startPhoneAuth` оставила
`phoneStartFallback.route.test.ts` полностью зелёным: команда
`/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts"`
дала `12 passed (12)`. В реальном store это создаёт challenge без признака profile bind, после чего
`phone/confirm` отвечает `403 direct_phone_login_disabled`; тесты раздельно подставляют готовый challenge
и не видят разрыв цепочки.

Impact: набор одновременно блокирует удаление неавторизованного owner-решением legacy API и пропускает
поломку единственной связи, ради которой заявлен positive-сценарий. Нарушены §10a и §10b: независимого
oracle нет, а наблюдаемый выход всей цепочки не проверен. Нужно либо назвать owner-источник direct
profile-bind и проверять публичную цепочку целиком, либо удалить эти positive-ожидания; текущий код сам
себе oracle быть не может.

### 4. Живой DEV после штатного входа пациента ведёт в 404

На единственном DEV `127.0.0.1:5200` ручной Chromium-проход (одноразовый browser view, без сохранённого
UI-теста) сделал следующее: `/api/auth/dev-public` → `/app/patient/login` → «Войти по email» →
`kinesiospace@gmail.com` → development email OTP из штатного server log → успешный переход на
`/app/patient`. Итоговый экран: `404 / Страница не найдена / На главную`.

Это общий конец и для оставшегося messenger-flow: `phoneAuth.ts:236-241` возвращает
`getRedirectPathForRole(client)`, а `redirectPolicy.ts:18-21` возвращает `routePaths.patient`.

Impact: пациент успешно подтверждает фактор, но кабинет не получает — вход заканчивается тупиком.
Нарушён прямой критерий брифа: «экран входа ... не ведёт в тупик; сломанный или тупиковый экран входа —
MUST FIX».

DEV обслуживал не кандидат: `git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD` →
`b74f01656`; `git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor b7e938804 b74f01656`
→ exit `1`. Поэтому живой взгляд дополнительно **не может принять UI кандидата**; на DEV остался старый
экран ввода номера. Этот SHA-mismatch сам по себе не приписан кандидату отдельной находкой, но live-gate
кандидата не доказан.

## Матрица отказов `phone/start`

Базовый набор:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts"
```

Результат: `3 passed` файла, `37 passed` тестов. Одноразовое расширение матрицы на
`patient_default` без `phone_bot` и `patient_branded` без `phone_bot` той же командой для route-файла
дало `14 passed (14)`; временные строки удалены.

| Поверхность / purpose | Результат | Identity lookup |
|---|---|---|
| `patient_default`, `login` | `403 direct_phone_login_disabled` | нет |
| `patient_default`, purpose отсутствует | `403 direct_phone_login_disabled` | нет |
| `patient_branded`, `login` | `403 direct_phone_login_disabled` | нет |
| `patient_branded`, purpose отсутствует | `403 direct_phone_login_disabled` | нет |
| `staff`, `phone_bot` отсутствует | `403 auth_method_disabled` | нет |
| `platform_admin`, `phone_bot` отсутствует | `403 auth_method_disabled` | нет |
| `patient_default`, `phone_bot` отсутствует | `403 auth_method_disabled` | нет |
| `patient_branded`, `phone_bot` отсутствует | `403 auth_method_disabled` | нет |
| `profile_bind`, сессии нет | `401 unauthorized` | нет |

Неизвестное значение `purpose` отклоняет Zod до side effect; второй разрешённый enum-вариант
`profile_bind` проходит отдельную session-door.

## Полный каталог production-путей телефонного кода

Поиск выполнен сначала командой
`node /home/dev/brain/tools/code-search.mjs "startPhoneAuth send phone code OTP routes" --repo bcb -k 30`,
затем точным вызовом
`rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!docs/**' --glob '!node_modules/**' "startPhoneAuth\\(|\\.sendCode\\(|generateSmsCode\\(|delivery: \\{ channel: 'sms'|deliveryChannel: 'sms'|otpCode" apps/webapp/src apps/integrator/src packages`.

| Вход | Что выдаёт | Messenger-contact proof | Классификация C7 |
|---|---|---:|---|
| `POST /api/auth/phone/start`, `purpose=profile_bind` | direct OTP через явно выбранный SMS/Telegram/MAX/email | нет | вне слова C7: привязка, не вход |
| `POST /api/booking/public/create` → `/confirm` | SMS OTP, затем booking/session | нет | OWNER QUESTION: отдельный сценарий записи |
| `POST /api/patient/diary/purge-otp/start` | SMS OTP destructive re-auth | нет | вне слова C7: повторная проверка, не вход |
| `POST /api/auth/phone/messenger-bind/start,status,finish` + подписанный integrator complete | challenge только после provider claim и совпадения контакта | да | единственный живой путь входа по номеру |

Других production-вызовов `startPhoneAuth` точный поиск не нашёл: определение, `phone/start` и
`patient/diary/purge-otp/start`. Публичная запись использует отдельный `generateSmsCode`.

## Каталог инъекций тестового коммита

Каждая поломка вносилась отдельно через временный patch production-кода, файл гонялся через host-lock,
затем patch полностью откатывался.

| ID | Независимая поломка | Результат |
|---|---|---|
| I1 | убрать gate отсутствующего `phone_bot` | убита: `3 failed`, surface вернул `400/200` вместо `403` |
| I2 | разрешить явный `purpose=login`, сохранив отказ omitted | убита: `2 failed` |
| I3 | разрешить omitted purpose, сохранив отказ явного login | убита: `2 failed` |
| I4 | поднять `findByPhone` выше session/organization-door | убита: `1 failed`, lookup вызван |
| I5 | удалить `profileBindUserId` из `startPhoneAuth` options | **не поймана: `12 passed (12)`** |
| I6 | удалить branded `clinicRequiredOrganizationId` у Telegram delivery | убита: `1 failed` |
| I7 | разрешить confirm challenge без `profileBindUserId` | убита: `1 failed` |
| I8 | запретить confirm законного profile-bind challenge | убита: `1 failed` |
| I9 | целиком запретить direct `profile_bind` start | убита: `3 failed` |

Итог по независимому каталогу: **убито 8 из 9, непоймано 1**. Число получено перечисленными девятью
отдельными host-lock прогонами, не пересчитано из количества `it`.

## Снятый код и проверки

Команда
`rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "ChannelPicker|otpDoor|filterAuthMethodsByChannelPolicy|OTP_OTHER_CHANNELS_ORDER|OTP_PUBLIC_OTHER_CHANNELS_ORDER|OTP_PUBLIC_NON_SMS_CHANNELS_ORDER|isOtpChannelAvailablePublic|pickPrimaryOtpChannelPublic|phoneStartBrandedOtpSender" .`
нашла только исторические/плановые документы и прежние audit-ссылки; runtime/compile-ссылок нет.

- `git diff --name-only 4aaed427b..b7e938804 -- apps/webapp/src/app/app/patient/bind-phone apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx apps/webapp/src/app/api/auth/phone/messenger-bind apps/webapp/src/app/api/integrator/phone-messenger-bind apps/webapp/src/modules/auth/phoneMessengerBind.ts` → пусто: законный profile-bind messenger-path кандидат не менял.
- `pnpm --dir apps/webapp exec eslint src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/phone/start/route.ts src/app/api/auth/phone/confirm/route.ts` → exit `0`.
- `pnpm --dir apps/webapp exec tsc --noEmit` → exit `2`, MUST FIX 1.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"` → exit `1`, MUST FIX 1.
- targeted Vitest → `3 passed` файла, `37 passed` тестов.
- Полный CI не запускался по прямому запрету брифа.

## Вердикт

**FAIL — 4 MUST FIX.** Два требуемых отказа `phone/start` и порядок session-door реализованы и убиваются
инъекциями; снятых runtime-ссылок не осталось. Кандидат блокируют compile/build-ошибка нового теста,
самопротиворечивый §17, positive direct-profile-bind тесты без owner-oracle с одним непойманным разрывом и
живой тупик после успешного входа пациента. Candidate UI на общем DEV не стоял, поэтому post-land live
acceptance также остаётся недоказанной.
