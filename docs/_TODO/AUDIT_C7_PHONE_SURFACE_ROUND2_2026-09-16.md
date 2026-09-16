FAIL — 4 MUST FIX

# Независимый адверсарный аудит C7, круг 2

Кандидат: `cf537a2c8` + `ded6884b1`, база `4aaed427b`. Команда
`git diff --shortstat 4aaed427b..ded6884b1` дала `11 files changed, 256 insertions(+), 1456 deletions(-)`.

## Оракул и граница

Основной оракул — `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md:70-76`:

> «вход по номеру ... вырезать все подобное, это старое. Сейчас вход по номеру только по коду после
> подтверждения контактов в мессенджере»; живой путь один —
> `phone/messenger-bind/{start,status,finish}`; автоматический подбор и SMS снимаются.

Тот же контракт закреплён в `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:419-425`: человек выбирает
Telegram/MAX, challenge создаётся только после подтверждения контакта, автоматического канала и SMS-bootstrap
нет, дверь доступна только пациентской поверхности с `phone_bot`.

## MUST FIX

### 1. `phone/start` по-прежнему выдаёт прямой OTP для `profile_bind`

Достижимый сценарий: авторизованный пациент отправляет `POST /api/auth/phone/start` с
`purpose=profile_bind` и произвольным введённым номером. Маршрут после сессионной двери читает пользователя по
этому номеру (`route.ts:127-128`), допускает SMS без доказательства контакта (`:132-134`) и создаёт обычный
challenge через `startPhoneAuth` (`:188-192`). `POST /api/auth/phone/confirm` принимает такой challenge
(`confirm/route.ts:62-76`). Это оставляет снятый класс прямого OTP как публично вызываемую ветку, хотя UI её
больше не вызывает.

Impact: номер можно привязать и подтвердить прямым кодом, не проходя единственный разрешённый
`phone/messenger-bind/*` путь. Нарушены строки оракула `STAFF_DOORS...md:70-76` и канон
`AUTH_AND_IDENTITY_CANON.md:419-425`.

### 2. Публичная запись остаётся альтернативной SMS-дверью в аккаунт

`POST /api/booking/public/create` выдаёт SMS challenge на введённый номер
(`create/route.ts:197-224`, `publicBookingVerification.ts:88-130`). После кода
`POST /api/booking/public/create/confirm` разрешает/создаёт пользователя по номеру и устанавливает полноценную
сессию с причиной `phone_otp` (`confirm/route.ts:98-130`). Подтверждение контакта Telegram/MAX не требуется.

Это не просто подтверждение записи: успешный SMS-код становится результатом входа. Старый owner-текст 19.08
разрешал SMS публичной записи, но более новое прямое решение 16.09 в строках оракула
`STAFF_DOORS...md:70-76` оставляет для входа по номеру только messenger-contact proof. По правилу более позднего
owner-решения эта дверь должна быть переведена на новый путь, не сохранена как обход.

### 3. Удаление дневника всё ещё выдаёт прямой SMS OTP

Авторизованный пациент вызывает `POST /api/patient/diary/purge-otp/start`; маршрут берёт телефон из сессии и
вызывает `startPhoneAuth(..., { delivery: { channel: 'sms' } })`
(`purge-otp/start/route.ts:13-29`). Подтверждённый контакт в мессенджере не требуется.

Сам маршрут не создаёт новую сессию и является re-auth перед разрушительной операцией. Тем не менее явный
критерий этого аудита требует считать **любой** маршрут, выдающий телефонный код без messenger-contact proof,
незакрытым остатком C7; строки оракула `STAFF_DOORS...md:70-76` снимают SMS-ветки вместе со старым классом.

### 4. Переписанный тест закрепляет запрещённую ветку и пропустил перестановку двери

`phoneStartFallback.route.test.ts:276-326,347-366` требует, чтобы прямой `profile_bind` через
`phone/start`/`phone/confirm` продолжал отвечать `200`, а два теста проверяют точные внутренние аргументы
`startPhoneAuth`. Независимого oracle у этих ожиданий нет: они противоречат
`STAFF_DOORS...md:70-76` и `AUTH_AND_IDENTITY_CANON.md:419-425` и дублируют устройство production-кода, что
запрещено §10a.

Кроме того, исходные семь тестов не видели нарушение из коммита ведущего: инъекция переноса
`findByPhone` выше проверки сессии оставила `7/7` зелёными. Я добавил приёмочный тест на наблюдаемое свойство
«неавторизованный profile-bind не читает номер» и матрицу ранних отказов поверхностей; та же инъекция после этого
падает. Запрещённые positive-тесты не удалены аудитором: их нужно снять вместе с production-веткой, иначе тесты
продолжат блокировать исполнение оракула.

## Полный каталог телефонных challenge-путей

Поиск выполнен сначала командой
`node /home/dev/brain/tools/code-search.mjs "send one-time code to phone SMS OTP route" --repo bcb -k 40`,
затем точным вызовом
`rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!docs/**' --glob '!node_modules/**' "\\.sendCode\\(|generateSmsCode\\(|delivery: \\{ channel: 'sms'|deliveryChannel: 'sms'|otpCode" apps/webapp/src apps/integrator/src packages`.

| Вход | Что выдаёт | Messenger-contact proof | Итог |
|---|---|---:|---|
| `POST /api/auth/phone/start`, `purpose=profile_bind` | direct OTP: SMS либо код через найденную Telegram/MAX/email-привязку | нет | MUST FIX 1 |
| `POST /api/booking/public/create` → `/confirm` | SMS OTP, затем `setSessionFromUser(..., 'phone_otp')` | нет | MUST FIX 2 |
| `POST /api/patient/diary/purge-otp/start` | SMS OTP для destructive re-auth | нет | MUST FIX 3 по явному критерию брифа |
| `POST /api/auth/phone/messenger-bind/start,status,finish` + подписанный `POST /api/integrator/phone-messenger-bind/complete` | внутренний challenge/код только после provider claim и совпадения контакта | да | PASS |

Других production-вызовов `startPhoneAuth` команда
`rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!docs/**' --glob '!node_modules/**' "startPhoneAuth\\(" apps packages`
не нашла: только определение, `phone/start` и `patient/diary/purge-otp/start`.

## Инъекции в переписанный набор

Каждая поломка вносилась отдельно в production-код, тест запускался через host-lock, затем поломка полностью
откатывалась. Базовая команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts"
```

Она дала `3 passed` файла и `32 passed` теста до аудиторского дополнения.

| ID | Независимая поломка | Исходный набор |
|---|---|---|
| I1 | убрать surface-gate `phone_bot` | убита: отказ поверхности стал `400` вместо `403` |
| I2 | убрать отказ для явного `purpose=login` | убита: два login-кейса стали `200` |
| I3 | сделать omitted purpose равным `profile_bind` | убита: omitted-purpose стал `200` |
| I4 | не передать `profileBindUserId` в `startPhoneAuth` | убита внутренним assertion; сам тест вредный по §10a |
| I5 | не передать branded `clinicRequiredOrganizationId` | убита внутренним assertion; сам тест вредный по §10a |
| I6 | пропустить non-profile challenge в `phone/confirm` | убита: ожидался `403`, получен `200` |
| I7 | запретить direct profile-bind confirm | убита positive-тестом, но его oracle противоречит owner-решению |
| I8 | перенести `findByPhone` выше session/organization gate | **не поймана**: исходный набор остался `7/7` зелёным |

Итог исходного переписанного файла: каждое из его семи отдельных утверждений удалось покрасить — `7/7`, но
по независимому kill-set поймано `7 из 8`, непоймано `1`. После добавленного аудиторского теста та же I8 дала
`1 failed, 7 passed`; итоговый kill-set — `8 из 8`, непоймано `0`.

## Живой DEV

Второй Next-сервер не запускался. Команды
`ss -ltnp '( sport = :5200 )'`, `readlink -f /proc/244483/cwd` и
`git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD` показали один процесс на
`127.0.0.1:5200`, cwd `/home/dev/dev-projects/BersonCareBot/apps/webapp`, commit `75ea41e94`. Это не
аудируемый кандидат `ded6884b1`.

Ручная проверка реальным Chromium без сохранённого UI-теста:

- вход пациента `kinesiospace@gmail.com` через email-код успешен; профиль открылся, падения/тупика нет;
- после выхода ввод привязанного телефона немедленно показал старую форму «Код отправлен в мессенджер,
  привязанный к вашему номеру» с полем кода и повторной отправкой — без выбора Telegram/MAX и без запроса
  контакта.

Следовательно, живой DEV подтверждает работоспособность старого экрана, но **не может принять оставшийся путь
кандидата**: на общем сервере стоит другое дерево и воспроизводится именно снятая автоматическая ветка. Это не
приписано кандидату отдельным MUST FIX, но live-gate C7 не доказан.

## Снятые символы, сборка и проверки

Команда
`rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "ChannelPicker|otpDoor|filterAuthMethodsByChannelPolicy|OTP_OTHER_CHANNELS_ORDER|OTP_PUBLIC_OTHER_CHANNELS_ORDER|OTP_PUBLIC_NON_SMS_CHANNELS_ORDER|isOtpChannelAvailablePublic|pickPrimaryOtpChannelPublic|phoneStartBrandedOtpSender" .`
нашла только исторические/плановые документы и ссылки прежних аудитов; ссылок runtime/compile на удалённые
символы нет.

- `pnpm --dir apps/webapp exec tsc --noEmit` — exit `0`.
- `pnpm --dir apps/webapp exec eslint src/modules/auth/phoneStartFallback.route.test.ts` — exit `0`.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"` — exit `0`; Next production build,
  TypeScript и синхронизация standalone assets завершены.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts"`
  на итоговом дереве — `3 passed` файла, `37 passed` тестов.
- Полный CI не запускался по прямому запрету брифа.

## Вердикт

**FAIL — 4 MUST FIX.** Прямой login через `phone/start` действительно закрыт для явного и отсутствующего
`purpose`, а surface-gate и дверь до identity lookup работают. Но direct profile-bind OTP, SMS-сессия публичной
записи и SMS re-auth дневника не требуют messenger-contact proof; переписанные тесты закрепляют первую из этих
веток и первоначально не ловили порядок двери. Живой DEV кандидата не обслуживает, поэтому его оставшийся
messenger-путь живым взглядом не принят.
