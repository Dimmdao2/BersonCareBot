# Независимый адверсарный аудит Д7 — пациентская регистрация по паролю

Дата: 16.09.2026

Candidate: `d26b1c0e1` (`wt/auth-register-dupe`)

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, таблица дверей и §9;
`docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, этап Д7; находка D4 в
`docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md`.

## Вердикт: FAIL

Кодовое снятие второй пациентской регистрации выполнено: два route handler удалены, runtime-ссылок на них в
текущем tree нет, живая email-OTP регистрация пациента и отдельная password-регистрация специалиста сохранены.
FAIL вызван одним обязательным дефектом публичной документации.

## MUST FIX 1 — `auth.md` сохраняет ложный контракт пациентского пароля и удалённого `register`

Достижимый сценарий: разработчик открывает публичный модульный контракт
`apps/webapp/src/modules/auth/auth.md` и получает одновременно три неверных указания:

- заголовок `### Email + пароль (пациент)` на строке 37, хотя пациентская дверь passwordless;
- на строке 40 модуль `emailPasswordLookup` объявлен используемым маршрутом `register`, которого после Д7 нет;
- на строке 42 сказано, что при `email_not_verified` UI запускает повторную регистрацию/код, тогда как
  `AuthFlowV2.tsx:918-921` только показывает ошибку и завершает обработчик.

Impact: публичный контракт продолжает описывать снятую пациентскую password-door и направляет следующую правку к
несуществующему consumer/поведению. `apps/webapp/src/app/api/api.md:37` исправлен правильно, но два публичных
контракта расходятся.

Нарушенный authority:

- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md:51`: «пациент — без пароля: код, OAuth, мессенджеры, passkey»;
- `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md:39-40`, Д7: «решить, какая остаётся, вторую снять».

Минимальная коррекция: отделить в заголовке/тексте patient email-code от staff password, убрать `register` из
списка consumers `emailPasswordLookup` и описать фактическую ветку `email_not_verified`.

## 1. Классификация «тест или взгляд»

Классификация сделана до проверки реализации и тестов, по `AGENTS.md` §24.4:

| Вопрос | Способ |
|---|---|
| Удалены route, UI-ветки, port method, OTP purpose и legacy storage payload | ВЗГЛЯД: diff, exact `rg`, `code-search`, обратные ссылки; отсутствие кода не закрепляется тестом |
| Живая patient email-OTP регистрация/confirm | ПРОГОН route-тестов для доступной HTTP-семантики + ВЗГЛЯД на неавтоматизируемый UI wiring |
| Staff password login и specialist signup | ПРОГОН существующих route-тестов + compiler/ВЗГЛЯД на port wiring |
| Старый challenge/open tab | ВЗГЛЯД на TTL, дату блокирующего gate, storage discriminator и поведение fetch; UI-тест запрещён §10a |
| Публичная документация | ВЗГЛЯД: точная сверка двух файлов с текущими route и каноном |
| Соседние Д2/Д3/С2–С5 | ПРОГОН сохранённых тестов + ВЗГЛЯД на merge ancestry и итоговый tree |

## 2. Удалённое и обратные ссылки

Diff candidate:

```bash
git show --stat --oneline --summary d26b1c0e1
git diff --name-status d26b1c0e1^ d26b1c0e1
```

Результат: 9 файлов, `38 insertions(+), 623 deletions(-)`; удалены ровно
`email-password/register/route.ts` и `email-password/register/confirm/route.ts`, изменены UI/storage/port/test и
два публичных документа.

Точные проверки текущего tree без `.next`:

```bash
rg -n -F '/api/auth/email-password/register' apps packages --glob '!**/.next/**'
rg -n 'registerPendingVerification|password_register|emailRegAttemptId' apps/webapp/src
find apps/webapp/src/app/api/auth/email-password apps/webapp/src/app/api/auth/email-otp \
  apps/webapp/src/app/api/auth/specialist-signup -type f -name 'route.ts' -print | sort
```

Первый запрос вернул 0 строк. Во втором нет TypeScript symbol/call `registerPendingVerification`, challenge purpose
`'password_register'` или UI state `emailRegAttemptId`; четыре совпадения относятся только к имени живого DB-root
`app.email_password_register_pending`, который теперь вызывается узким helper с `role: 'doctor'` для
`registerPendingSpecialistVerification` (`pgUserPasswordCredentials.ts:66-104,194-197`). Список route-файлов
содержит `email-otp/{register,confirm}`, `email-password/login` и `specialist-signup/{start,confirm}`, но не два
удалённых route.

Смысловой поиск выполнен командами:

```bash
node /home/dev/brain/tools/code-search.mjs "caller patient email password registration route register confirm" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "registerPendingVerification password credentials caller" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "email challenge purpose password_register consumer" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "AuthFlowV2 password registration verify resend branch" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "authFlowPendingStorage register verify legacy password registration" --repo bcb -k 10
node /home/dev/brain/tools/code-search.mjs "patient email otp registration start confirm AuthFlowV2 caller" --repo bcb -k 8
node /home/dev/brain/tools/code-search.mjs "specialist signup password registration start confirm credentials port" --repo bcb -k 8
```

Индекс датирован `2026-09-15T22:15:02.985Z`, поэтому для удалённых сущностей ещё показал старые файлы candidate
parent. Эти stale-кандидаты не приняты за доказательство; каждый перепроверен exact-поиском и текущим файловым
деревом выше. Актуальные результаты выводят живые `email-otp`, `specialist-signup`, `AuthFlowV2` и storage.

Обратные ссылки storage:

```bash
rg -n "emailVerifyPurpose.*registration|purpose: 'patient_email_otp'|saveRegisterVerifyPending|readAuthFlowPending" \
  apps/webapp/src/shared/ui/patient/auth apps/webapp/src/app/app/contact-support
```

Результат локализован в `AuthFlowV2`, `authFlowPendingStorage` и support-return UI. Оба writer текущей регистрации
ставят `purpose: 'patient_email_otp'` (`AuthFlowV2.tsx:711-719,2360-2368`); reader принимает только этот
discriminator (`authFlowPendingStorage.ts:63-71`) и восстанавливает именно `patient_registration`
(`AuthFlowV2.tsx:458-473`). Password-reset и specialist payload являются отдельными union-ветками и сохранены.

## 3. Живые пациентская и сотрудничья двери

Пациент:

- `email-otp/register/route.ts:50-114` по-прежнему валидирует surface/rate/FIO и вызывает
  `startPublicEmailOtpRegistration`;
- `AuthFlowV2.tsx:679-719` стартует `/api/auth/email-otp/register`, а `:2142-2158` подтверждает через
  `/api/auth/email-otp/confirm`; resend остаётся на `/api/auth/email-otp/register` (`:2329-2368`);
- `email-otp/confirm/route.ts:43-153` подтверждает публичный OTP и создаёт client-session;
- экран не оставлен с dead CTA: exact-поиск runtime URL удалённой пары дал 0 строк, а обе живые ссылки присутствуют.

Сотрудник:

- `email-password/login` не изменён Д7 и прошёл `passwordAuth.route.test.ts`;
- `specialist-signup/start/route.ts:127-133` вызывает сохранённый
  `registerPendingSpecialistVerification`, создаёт purpose `specialist_signup` на `:192-197` и сохраняет cleanup;
- `specialist-signup/confirm/route.ts:76-82` по-прежнему находит владельца challenge через сохранённый port method;
- UI start/confirm specialist остаются отдельными ветками `AuthFlowV2.tsx:2051-2086,2230-2279`;
- `registerPendingVerification` удалён только для пациента; compiler-инъекция ниже доказывает, что вернуть этот
  method call мимо port interface нельзя.

## 4. Старый challenge и открытая вкладка

Неистёкшего challenge удалённого класса на момент Д7 быть не может:

1. gate, безусловно возвращающий 403 до body/challenge, введён `157eedd54` 04.08.2026; команда
   `git merge-base --is-ancestor 157eedd54 d26b1c0e1` завершилась с code 0;
2. email challenge живёт `CHALLENGE_TTL_SEC = 1800` секунд (`emailAuth.ts:16-27`);
3. Д7 создан 16.09.2026; exact-поиск литерала `'password_register'` в текущем `apps/webapp/src` не находит другого
   producer.

Поэтому вкладка со старым JS после deploy может получить 404/общую ошибку при попытке вызвать удалённый URL, но
пригодного к подтверждению кода у неё уже нет: issuance закрыт с 04.08, а прежние коды жили 30 минут. После reload
старый storage payload без `purpose: 'patient_email_otp'` удаляется и человек видит обычную живую дверь; текущий
patient OTP payload с discriminator восстанавливается. Storage TTL 72 часа также не создаёт окно для старого
password challenge — он не выдавался весь этот период.

## 5. Публичная документация

Проверка:

```bash
rg -n 'email-password/register|email-otp/register|email-otp/confirm|specialist-signup/(start|confirm)|email-password/login' \
  apps/webapp/src/modules/auth/auth.md apps/webapp/src/app/api/api.md
```

`api.md:37` правильно отделяет «Email-код (пациент)» от «Email+password (персонал)» и сохраняет описание живых
OTP/login/specialist routes. `auth.md:39` правильно описывает email-OTP, но строки 37, 40 и 42 оставляют ложный
контракт, описанный в MUST FIX 1.

## 6. Удалённый тест

Из `passwordEligibility.route.test.ts` удалён один блок на 24 строки. Он импортировал удалённый
`email-password/register/route` и проверял только его обязательный 403 до записи в DB. После физического удаления
маршрута этот HTTP-contract больше не существует; сохранение теста было бы проверкой снятой двери. Живые тесты
setup/reset/enumeration в том же файле не удалены и прошли. При реальном возврате import+reference runner падает
на отсутствующем module (инъекция 1). Потери покрытия живого поведения этим удалением нет.

## 7. Соседние Д2, Д3 и С2–С5

Merge ancestry перед Д7 содержит:

- `e1b42a678` — Д2; `messenger/start` и `messenger/poll` отсутствуют (`test ! -e ...` для обоих завершился code 0);
- `0b7fa8f5b` — Д3; neutral password recovery matrix сохранена в
  `passwordEligibility.route.test.ts` и прошла;
- `3fd328644` — С2–С5; staff phone/email-code door policy сохранена и прошла три targeted unit-файла.

Д7 пересекается с Д3 только в `AuthFlowV2.tsx`, `auth.md` и `passwordEligibility.route.test.ts`; diff теста удаляет
только dead-route describe/fake/import, а добавленные Д3 matrix cases остаются. Файлы Д2 и policy-файлы С2–С5 Д7
не меняет.

## 8. Fault injection

Все инъекции внесены отдельно и полностью откатаны.

1. **Возвращён удалённый import route.** Простое неиспользуемое импорт-объявление Vitest оптимизировал и прогон
   остался зелёным; после восстановления реальной ссылки, как в старом тесте, команда
   `/home/dev/brain/host-orch/run-tests.sh "... vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts"`
   завершилась rc=1: `Cannot find package '@/app/api/auth/email-password/register/route'`.
2. **Возвращён вызов снятого port method** `registerPendingVerification` в specialist start. Compiler-run добавил к
   baseline ошибку `specialist-signup/start/route.ts:127 TS2339: Property 'registerPendingVerification' does not
   exist on type 'UserPasswordCredentialsPort'`.
3. **Сломана живая ветка регистрации:** URL в `submitPatientEmailRegistration` заменён с
   `/api/auth/email-otp/register` на удалённый `/api/auth/email-password/register`. Targeted route-run остался
   зелёным: 3 files, 19 tests. Компилятор строковый URL не проверяет, автоматизированные UI-тесты запрещены §10a.
   Это одна честно **непойманная автоматикой** инъекция; её ловит обязательный ВЗГЛЯД exact-ссылок.
4. **Сломано чтение `authFlowPendingStorage`:** условие `if (!p) return` инвертировано в `if (p) return`.
   Compiler-run добавил 22 ошибки `AuthFlowV2.tsx:448-501 TS18047: 'p' is possibly 'null'` сверх baseline.

Непойманных автоматикой независимых инъекций: 1. После отката production/test diff отсутствовал.

## 9. Прогоны

Только targeted-команды, все через `/home/dev/brain/host-orch/run-tests.sh`; полный CI, второй Next, PROD, TEST,
миграции и сканирование `.env` не выполнялись.

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-fio-dialog && \
  pnpm --dir apps/webapp exec vitest --run --project=route \
  src/modules/auth/passwordEligibility.route.test.ts \
  src/modules/auth/passwordAuth.route.test.ts \
  src/app/api/auth/email-otp/confirm/route.route.test.ts \
  src/app/api/auth/email-otp/start/route.route.test.ts \
  src/app/api/auth/specialist-signup/start/route.route.test.ts"
```

Результат: 5 files passed, 45 tests passed.

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-fio-dialog && \
  pnpm --dir apps/webapp exec vitest --run --project=unit \
  src/modules/auth/authChannelPolicy.staffPhoneDoor.unit.test.ts \
  src/modules/auth/authChannelPolicy.explicitSurface.unit.test.ts \
  src/modules/auth/publicAuthPolicy.unit.test.ts"
```

Результат: 3 files passed, 25 tests passed.

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-fio-dialog && \
  pnpm --dir apps/webapp exec eslint \
  src/shared/ui/patient/auth/AuthFlowV2.tsx \
  src/shared/ui/patient/auth/authFlowPendingStorage.ts \
  src/infra/repos/pgUserPasswordCredentials.ts \
  src/modules/auth/emailAuthPort.ts \
  src/modules/auth/passwordEligibility.route.test.ts"
```

Результат: PASS.

Baseline webapp typecheck не зелёный:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-fio-dialog && \
  pnpm --dir apps/webapp run typecheck"
```

Единственная baseline-ошибка: `src/infra/repos/pgPatientMergeCandidate.ts:247 TS2769`; candidate этот файл не
меняет. До инъекций ошибок по Д7-файлам не было. Поэтому это внешний blocker общего compiler-gate, не finding Д7;
инъекции 2 и 4 оценивались по новым ошибкам сверх этого baseline.
