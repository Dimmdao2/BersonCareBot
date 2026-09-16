# FAIL — 2 MUST FIX

Аудит exact candidate `a46599fe2` + `6ba50076a` в ветке
`wt/patient-support-single-door`. Oracle: `E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` §5 п.1 и
`STAFF_DOORS_HARDCODED_2026-09-16.md` С9. Классификация до проверки: пункты 1, 2 и 4 — тест;
пункты 3 и 5 — взгляд + точечный поиск/live.

## MUST FIX

### 1. G4b пропускает пять прямо названных форм предложения

Достижимый сценарий: разработчик кладёт пользовательское предложение в `message:` как шаблон внутри
тернарника/`??`, module-level template const, `String.raw` либо переносит слова в подстановки. Lint остаётся
зелёным, inline-копия обходит обязательный словарь и затем расходится с другими ответами. Это нарушает пункт 4
брифа и `AGENTS.md` §21a; это не speculative hardening — все формы были внесены в реальный временный `.ts` под
`apps/webapp/src`, который штатный gate обязан сканировать.

Инъекция одним fixture содержала восемь форм: прямой шаблон; три статических слова, разделённые значениями;
слова внутри подстановок; шаблон в тернарнике; шаблон после `??`; module const; `String.raw`; прямой шаблон во
втором аргументе `jsonError`; плюс законную двухсловную динамику как negative control. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd apps/webapp && node scripts/check-notification-text-coverage.mjs"
```

Результат: gate сообщил ровно 3 finding — прямой шаблон, три статических слова между подстановками и
`jsonError`. Пять обходов остались зелёными: слова в подстановках, тернарник, `??`, module const, `String.raw`.
Законная склейка `Укажите поля ${missing.join(', ')}` тоже осталась зелёной. Значит сам порог «три статических
слова» отделяет обычную трёхсловную фразу от двухсловной динамики, но обходы выражений делают G4b неполным.
Fixture удалён.

### 2. Для одного email-конфликта в словаре остались два ключа

Достижимый сценарий уже есть: общий email confirm показывает
`authEmailBelongsToAnotherAccount` с указанием выбрать другой адрес, а patient email-change показывает новый
`authEmailAlreadyUsedByAnotherAccount` без этого указания. Одинаковый конфликт уже расходится по двум ключам;
следующая правка одного ключа даст разные тексты. Это нарушает пункт 3 брифа и прямое правило `AGENTS.md` §21a
«одинаковый смысл — ОДИН ключ».

Команды:

```bash
rg -n --fixed-strings 'Этот email уже используется другим аккаунтом.' apps/webapp/src apps/webapp/scripts
rg -n "authEmailBelongsToAnotherAccount|authEmailAlreadyUsedByAnotherAccount" apps/webapp/src apps/webapp/scripts
```

Результат: `notificationText.ts` содержит оба ключа (`:112` и `:214`); старый используют
`errorCodeText.ts`, `api/auth/email/confirm` и `api/auth/email-otp/confirm`, новый —
`api/patient/email-change/confirm`. Перенос literal выполнен, консолидация смысла — нет.

## 1. Поддержка пациента: ответы и DB principal

Способ: diff прежнего и текущего route, два acceptance-теста через публичные границы и четыре fault injection.
До аудита тестов этой двери не было: semantic search

```bash
node /home/dev/brain/tools/code-search.mjs "patient support route test unauthorized business gate principal support submission" --repo bcb -k 20
```

не нашёл support route test, а точные поиски

```bash
rg -n --fixed-strings "app/api/patient/support/route" apps/webapp/src apps/webapp/test apps/webapp/tests 2>/dev/null || true
rg -n --fixed-strings "requirePatientApiSession" apps/webapp/src --glob '*test*'
```

дали пустой результат. Поэтому добавлены acceptance-тесты
`requirePatientApiSession.audit.unit.test.ts` и `patientSupportDoor.audit.route.test.ts`.

Результат: PASS. Набор наблюдает `401` session-boundary/stale-session, `400` обеих валидаций, `429` повторной
отправки и оба успешных `200` (`delivered=true` и persisted `delivered=false`). Сравнение

```bash
git diff 9130b1926..6ba50076a -- apps/webapp/src/app/api/patient/support/route.ts
```

показало, что набор route-ответов не менялся: заменена только session-boundary и вынесен текст.

Fault injection:

- возврат ручного `getCurrentSession + canAccessPatient` вместо общего прохода → route-набор покраснел `5/5`;
- удаление `enterWithDbPatientPrincipal(...)` → assertion увидел `Number of calls: 0`;
- искусственный email-gate в `requirePatientApiSession` → ожидание `{ ok: true }` получило `{ ok: false }`;
- замена stale-session `401` на `403` → route assertion получил `403` вместо `401`.

Все четыре production-инъекции откатились.

## 2. Поддержка без подтверждённой почты

Способ: независимый oracle E5 §5.1; сессия пациента в acceptance-тесте намеренно не имеет email, business gate
возвращает `need_activation`, затем route проходит до relay и отвечает `200`.

Команда финального прогона вместе с затронутым unit-набором:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit src/app-layer/guards/requirePatientApiSession.audit.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts"
```

Результат: PASS — `2 passed` файла, `12 passed` тестов. Email-gate injection покраснил именно это ожидание.

## 3. Три фразы в словаре

Способ: взгляд на diff и exact `rg`:

```bash
rg -n --fixed-strings 'Введите текст сообщения (до 4000 символов).' apps/webapp/src apps/webapp/scripts
rg -n --fixed-strings 'Введите текст сообщения (до ${MAX_MESSAGE_LEN} символов)' apps/webapp/src apps/webapp/scripts
rg -n --fixed-strings 'Код истёк. Попросите администратора выслать новый.' apps/webapp/src apps/webapp/scripts
rg -n --fixed-strings 'Этот email уже используется другим аккаунтом.' apps/webapp/src apps/webapp/scripts
rg -n "supportMessageTextRequired|authCodeExpiredAskAdminForNew|authEmailAlreadyUsedByAnotherAccount" apps/webapp/src apps/webapp/scripts
```

Результат: PARTIAL / MUST FIX 2. Support-фраза и expired-code живут по одному разу в словаре, оба support route
ссылаются на один `supportMessageTextRequired`, email-change — на новый expired key; смысл сохранён (для support
число `4000` равно прежнему `MAX_MESSAGE_LEN`). Старый support template остался только историческим примером в
комментарии gate, не call site. Email-conflict literal с route удалён, но рядом уже был ключ того же смысла —
дубль описан выше.

## 4. G4b: положительные и отрицательная инъекции

Способ: baseline self-test и реальный временный source fixture.

```bash
/home/dev/brain/host-orch/run-tests.sh "cd apps/webapp && node scripts/check-notification-text-coverage.mjs --self-test"
```

Baseline: PASS — `53 leak fixtures red`, `30 safe shapes green`, tree `OK`. Адверсарная инъекция: FAIL по
MUST FIX 1. Прямой шаблон и `jsonError` пойманы; законная двухсловная склейка не покраснела; пять обходов не
пойманы. Следовательно заявлять, что правило «ловит предложение» для названного kill-set, нельзя.

## 5. Два ожидания admin door

Способ: owner oracle С9, взгляд на production-policy и `AuthFlowV2`, живая проверка уже работающего единственного
DEV `127.0.0.1:5200`, затем возврат `passkey` в production matrix как fault injection.

Живой экран:

```bash
/home/dev/brain/host-orch/run-tests.sh "/usr/bin/chromium-browser --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=5000 --screenshot=/home/dev/bcb-admin-login-live-audit.png http://127.0.0.1:5200/app/admin/login"
```

Результат взгляда: PASS — серый блок, маленький знак сверху, поля `Email` и `Пароль`, кнопка `Войти`; нет
Passkey, телефона, других способов или ссылки поддержки. Временный screenshot после осмотра удалён.

Fault injection: в `DEFAULT_SURFACE_AUTH_POLICY_CONFIG.platform_admin` возвращён `passkey`, затем выполнены:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/proxy.route.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/auth/publicAuthPolicy.unit.test.ts"
```

Оба ожидания покраснели: proxy — `1 failed / 104`, public policy — `1 failed / 11`. Это не подгонка под текущий
код: expected взят из более нового прямого owner-решения С9 и ловит его обратный откат. Инъекция откатилась.

## Финальная проверка кандидата

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=unit src/app-layer/guards/requirePatientApiSession.audit.unit.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/app/api/patient/support/patientSupportDoor.audit.route.test.ts src/proxy.route.test.ts"
/home/dev/brain/host-orch/run-tests.sh "cd apps/webapp && node scripts/check-notification-text-coverage.mjs --self-test"
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp run typecheck"
```

Результат: unit `2 files / 12 tests` PASS; route `2 files / 109 tests` PASS; notification gate baseline PASS;
webapp typecheck PASS. Полный CI по брифу не запускался.

## НЕ СДЕЛАНО

- MUST FIX не исправлялись: это независимый аудит, а не fix-pass.
- Миграции на DEV не применялись; DEV-БД не изменялась.
- TEST и оба PROD не трогались.
- Второй Next-сервер и полный CI не запускались.
- Реальная доставка обращения не выполнялась: relay проверен на route-boundary заглушке.
