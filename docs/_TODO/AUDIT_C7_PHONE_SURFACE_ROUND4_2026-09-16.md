FAIL — 1 MUST FIX

# Независимый адверсарный аудит C7, круг 4

Кандидат: `276448209` поверх `b7e938804`, `cf537a2c8`, `ded6884b1` и аудиторских
коммитов предыдущих кругов. Команда `git diff --shortstat 4aaed427b..276448209` дала
`13 files changed, 465 insertions(+), 1455 deletions(-)`.

## Классификация до проверки

1. Отказы `phone/start` и порядок session/organization-door — повторяемое поведение: route-тесты и
   fault injection.
2. Живой вход и экран — взгляд на единственный DEV `127.0.0.1:5200`, без второго Next и без UI-теста.
3. Снятый код — качество разового удаления: итоговый `rg`, typecheck и build.
4. Сохранность профильной привязки — взгляд на живой product caller и существующий messenger-proof набор;
   direct `phone/start → phone/confirm` продуктовым путём не является.

## Разбор ведущего и канон

С разбором ведущего по трём находкам круга 2 **согласен**. Оракул C7 —
`STAFF_DOORS_HARDCODED_2026-09-16.md:70-76`: «вход по номеру ... вырезать все подобное» и живой путь
`phone/messenger-bind/{start,status,finish}` после подтверждения контакта в мессенджере.

- `phone/start purpose=profile_bind` — действие уже вошедшего пациента, не вход по введённому номеру.
- `booking/public/create → confirm` — отдельный продукт публичной записи; его удаление меняет сценарий и
  требует owner-решения.
- `patient/diary/purge-otp` — повторная проверка уже вошедшего пациента перед уничтожением данных, не вход.

Они не являются работой C7. Это не создаёт самостоятельного owner-требования сохранять неиспользуемый direct
`profile_bind`: такой positive-тест всё равно обязан иметь свой независимый oracle.

Исправленный `AUTH_AND_IDENTITY_CANON.md:417-432` теперь записан верно: строки 419-424 снимают
автоматический выбор/SMS-bootstrap и называют оба HTTP-отказа, а строки 426-432 оставляют живым выбор
Telegram/MAX → provider contact proof → `phone/messenger-bind/{status,finish}`. Живой путь больше не помечен
снятым; противоречия круга 3 нет.

## MUST FIX 1 — одно positive-ожидание direct profile-bind всё ещё самооракульно

`phoneStartFallback.route.test.ts:302-320` требует `200` от direct
`phone/confirm` для искусственно подготовленного challenge с `profileBindUserId`. Но:

- owner-строка C7 (`STAFF_DOORS...md:70-76`) регулирует вход, а не обещает этот compatibility API;
- точный product-поиск не нашёл клиента `phone/start`; живая привязка профиля —
  `PatientBindPhoneBrowser → PhoneMessengerAuthFlow(purpose=profile_bind) → phone/messenger-bind/*`;
- сам комментарий того же теста на строках 278-282 признаёт отсутствие product-клиента и самооракульность
  direct-пути, но следующий test case закрепляет его положительный ответ.

Инъекция полного запрета direct profile-bind confirm (`403 direct_profile_bind_disabled` сразу после
проверки challenge) дала `1 failed, 9 passed`: покраснел только
`keeps profile binding confirmation available for a profile-bind challenge`. Живой messenger-bind caller и
его код инъекция не затрагивает.

Impact: тест блокирует честное удаление неиспользуемого compatibility API, хотя наблюдаемое поведение привязки
остаётся целым. Это прямое продолжение находки круга 3, где диапазон positive-ожиданий был указан как
`276-312,333-351`, но `276448209` удалил только первые два start-теста и оставил confirm-тест.

Нарушенный оракул правил: `AGENTS.md:1433-1437,1462-1480` — тест требует независимый oracle, дорогую
молчаливую поломку и конечный наблюдаемый выход; наличие «зубов» не оправдывает тест формы реализации;
`AGENTS.md:1543-1559` — проверяемая реализация не придумывает ожидаемый результат. Требуется удалить этот
positive-test. Production-ветку в рамках C7 удалять нельзя без отдельного owner-решения: три находки круга 2
остаются вне scope.

## Матрица `phone/start`

Базовый committed-набор:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/modules/auth/phoneStartFallback.route.test.ts src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts"
```

Результат: `3 passed` файла, `35 passed` тестов. Временное расширение surface/purpose-матрицы той же
route-командой дало `18 passed (18)`; временные строки удалены.

| Surface / набор методов / purpose | Результат | `findByPhone` |
|---|---|---:|
| `staff`, без `phone_bot`, `login` / отсутствует / `profile_bind` | `403 auth_method_disabled` | нет |
| `platform_admin`, без `phone_bot`, `login` / отсутствует / `profile_bind` | `403 auth_method_disabled` | нет |
| `patient_default`, без `phone_bot`, отсутствует / `profile_bind` | `403 auth_method_disabled` | нет |
| `patient_branded`, без `phone_bot`, отсутствует / `profile_bind` | `403 auth_method_disabled` | нет |
| `patient_default`, с `phone_bot`, `login` / отсутствует | `403 direct_phone_login_disabled` | нет |
| `patient_branded`, с `phone_bot`, `login` / отсутствует | `403 direct_phone_login_disabled` | нет |
| `patient_default`, `profile_bind`, без сессии | `401 unauthorized` | нет |

Другой допустимый enum-вариант purpose — только `profile_bind`; неизвестное значение отклоняется Zod до
side effect. Surface-gate стоит до parse, поэтому на поверхности без `phone_bot` даже отсутствующее/невалидное
тело получает один и тот же `403 auth_method_disabled`.

## Каталог телефонных code/challenge-путей

Поиск сначала выполнен командой
`node /home/dev/brain/tools/code-search.mjs "startPhoneAuth send phone code OTP routes" --repo bcb -k 40`,
затем точными командами:

```bash
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!docs/**' --glob '!node_modules/**' \
  'startPhoneAuth\(|smsPort\.sendCode\(|generateSmsCode\(|delivery: \{ channel: .sms.|deliveryChannel: .sms.|otpCode' \
  apps/webapp/src apps/integrator/src packages
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!docs/**' --glob '!node_modules/**' \
  'PhoneMessengerAuthFlow|/api/auth/phone/start|/api/auth/phone/confirm|/api/patient/diary/purge-otp/start|/api/booking/public/create' \
  apps/webapp/src apps/integrator/src packages
```

| Вход | Что выдаёт | Messenger-contact proof | Классификация C7 |
|---|---|---:|---|
| `POST /api/auth/phone/start`, только `profile_bind` | direct OTP в явно выбранный SMS/Telegram/MAX/email | нет | вне слова C7: привязка, не вход; product-клиента нет |
| `POST /api/booking/public/create` → `/confirm` | SMS OTP, затем booking/session | нет | OWNER QUESTION: отдельный сценарий записи |
| `POST /api/patient/diary/purge-otp/start` | SMS OTP destructive re-auth | нет | вне слова C7: повторная проверка, не вход |
| `phone/messenger-bind/start,status,finish` + signed integrator complete | внутренний challenge после provider claim и совпадения телефона | **да** | единственный живой вход по номеру |

Других production-вызовов `startPhoneAuth` нет: определение, `phone/start` и diary purge. Публичная запись
использует отдельный `generateSmsCode`; остальные `otpCode` в Integrator — транспорт результата messenger-bind,
а не ещё одна телефонная дверь.

## Fault injection переписанного route-набора

Каждая поломка вносилась отдельно в production-код, файл запускался через host-lock, затем поломка полностью
откатывалась.

| ID | Поломка | Красный результат |
|---|---|---|
| I1 | снять surface-gate `phone_bot` | `3 failed, 7 passed` |
| I2 | разрешить явный `purpose=login`, оставив omitted закрытым | `2 failed, 8 passed` |
| I3 | разрешить omitted purpose, оставив явный login закрытым | `2 failed, 8 passed` |
| I4 | прочитать `findByPhone` выше session-door | `1 failed, 9 passed` |
| I5 | пропустить non-profile challenge через `phone/confirm` | `1 failed, 9 passed` |
| I6 | запретить direct profile-bind confirm | `1 failed, 9 passed`; тест красный, но само ожидание запрещено MUST FIX 1 |

Шесть независимых мутаций задели все десять test cases файла: **убито 10 из 10, непойманного 0**. По
authority-valid kill-set пойманы все пять классов I1-I5; I6 показывает не полезную защиту, а вредный
self-oracle. Временных production-изменений не осталось.

## Живой DEV

Второй Next не запускался. Команды
`ss -ltnp '( sport = :5200 )'`, `readlink -f /proc/244483/cwd`,
`git -C /home/dev/dev-projects/BersonCareBot rev-parse --short HEAD` и
`git -C /home/dev/dev-projects/BersonCareBot merge-base --is-ancestor 276448209 b93d36e30`
показали: один listener, cwd `/home/dev/dev-projects/BersonCareBot/apps/webapp`, DEV SHA `b93d36e30`,
ancestry exit `1`. Кандидат на DEV не стоит.

Одноразовый живой Chromium-проход через штатный UI (не сохранённый UI-тест):

- public patient door открывается, не падает; видны Яндекс, email, номер и поддержка;
- переход «Войти по номеру телефона» открывает ввод номера, но этот старый DEV после продолжения реально
  вызвал старый `POST /api/auth/phone/start 200`; поэтому он не может принять удаление automatic-flow кандидата;
- штатный вход `kinesiospace@gmail.com` по fresh development email OTP завершился на `/app/patient`, где всё
  ещё показал `404 / Страница не найдена`.

Последний 404 — уже вынесенный отдельно дефект интеграционного DEV, а не ветки C7: сервер не содержит
кандидата, и `git diff 4aaed427b..276448209` не меняет redirect policy или patient route. По прямому указанию
брифа круг 4 не превращает его в MUST FIX C7. Post-land live acceptance кандидата остаётся обязательным:
после landing нужно увидеть messenger picker без вызова `/api/auth/phone/start` и успешный конец входа вместо
404. Код кандидата для этого использует `AuthFlowV2 → PhoneMessengerAuthFlow`; сам messenger-flow и
`patient/bind-phone` кандидат не менял (`git diff --name-only ...` пуст).

## Снятый код и проверки

Команда
`rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "ChannelPicker|otpDoor|filterAuthMethodsByChannelPolicy|OTP_OTHER_CHANNELS_ORDER|OTP_PUBLIC_OTHER_CHANNELS_ORDER|OTP_PUBLIC_NON_SMS_CHANNELS_ORDER|isOtpChannelAvailablePublic|pickPrimaryOtpChannelPublic|phoneStartBrandedOtpSender" .`
нашла только исторические/плановые документы и прежние audit-ссылки; runtime/compile-ссылок нет.

- `pnpm --dir apps/webapp exec tsc --noEmit` — exit `0`.
- `pnpm --dir apps/webapp exec eslint ...` по затронутым route/test/UI/repo-файлам — exit `0`.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"` — exit `0`; Next build,
  TypeScript, 433 static pages и standalone assets завершены.
- Targeted Vitest — `3 passed`, `35 passed`.
- Полный CI не запускался по прямому запрету брифа.

## Вердикт

**FAIL — 1 MUST FIX.** Оба отказа `phone/start`, порядок session-door, удаление automatic/SMS UI-кода,
компиляция, сборка и исправленный §17 приняты. Три продуктовые находки круга 2 действительно вне слова C7.
Блокирует только оставшийся самооракульный positive direct-profile-bind confirm test. Живой post-land gate
отдельно не закрыт: общий DEV обслуживает другой SHA и сохраняет уже известный 404.
