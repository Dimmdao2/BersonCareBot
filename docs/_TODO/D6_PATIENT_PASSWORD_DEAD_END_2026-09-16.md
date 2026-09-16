# Д6 — contact-only пациент не попадает в тупик установки пароля

Дата: 2026-09-16

Ветка: `wt/d6-patient-password-deadend`

Authority: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md` §Д6; исходная находка —
`docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md` F7; продуктовый oracle —
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`: пациенту больше не предлагают установку пароля.

## Итог

Разрыв закрыт в источниках обещания:

- `email-password/forgot` сохраняет единый внешний ответ, но больше не выпускает ни
  `password_setup`, ни `password_reset` challenge для роли `client`;
- автоматическое письмо contact-only пациенту после создания врачом теперь несёт обычный
  passwordless challenge `login`, который потребляет действующая дверь
  `POST /api/auth/email-otp/confirm`;
- пациентская поверхность не показывает парольную форму и отбрасывает сохранённый staff
  `password_reset` draft, если человек перешёл между поверхностями в том же браузере;
- отказ роли `client` в `setup-code/complete` оставлен как нижняя страховка;
- галочка Д6 в плане не изменена: её ставит ведущий после независимого аудита.

## Где рождалось обещание пароля

Поиск по индексированному коду выполнен командами:

```bash
node /home/dev/brain/tools/code-search.mjs "password_setup challenge email template setup code complete patient AuthFlowV2" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "auth_email_otp resolveAndRenderAuthCodeMailProfile senderDisplayName Ваш код" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "patient surface auth policy email_code phone_bot oauth passkey password" --repo bcb -k 12
```

Полный точный проход по заданному file-scope выполнен командой:

```bash
rg -n --hidden --glob '!**/.next/**' --glob '!**/node_modules/**' \
  "password_setup|PASSWORD_SETUP|setup-code|email-setup|setup access|setupAccess|password setup|установ.*парол|зада.*парол" \
  apps/webapp apps/integrator packages
```

Найдена такая цепочка:

1. `apps/webapp/src/app-layer/auth/passwordRecovery.ts` по состоянию
   `needs_email_setup` выбирал `password_setup`, а по `verified_with_password` —
   `password_reset`. До правки обе ветки могли дойти до отправки для `client`.
2. `apps/webapp/src/app-layer/doctor/createDoctorClient.ts` и
   `createScheduledManualPatientVisit.ts` вызывают общий `EmailSetupAccessPort` после создания
   contact-only пациента. Реализация `apps/webapp/src/infra/repos/pgEmailSetupAccessPort.ts`
   выпускала ему `password_setup` challenge.
3. `apps/webapp/src/modules/auth/emailPasswordLookup/requestSetupAccess.ts` — оставшаяся после
   удаления route обёртка того же `EmailSetupAccessPort`; точный
   `rg -n "requestEmailSetupAccessForUser" apps/webapp apps/integrator packages` находит только её
   определение, поэтому отдельным живым producer она не является.
4. DB-функция старта challenge ставит `auth_email_otp` в
   `outgoing_delivery_queue`; purpose в пользовательский payload не попадает. Integrator
   `apps/integrator/src/integrations/email/mailProfile.ts` для platform-профиля пациента реально
   рендерит тему `Код подтверждения <имя patient surface>` и текст
   `Ваш код <имя patient surface>: <код>`; значение по умолчанию — `TherapyGo`, при deploy оно
   может быть заменено `PATIENT_APP_NAME`. Пароль в существующем тексте шаблона не назывался;
   ложное обещание создавали purpose и следующий экран. Ссылки в этом шаблоне нет.
5. `apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx` содержит staff recovery-экран с
   текстом про смену пароля, полями кода и нового пароля и completion через
   `setup-code/complete`/`reset`. Кнопка «Забыли пароль?» находится только в ветке
   `passwordLoginEnabled`, но сохранённый в `sessionStorage` reset-draft раньше мог восстановить
   эту форму после перехода на patient surface.
6. `apps/webapp/src/app-layer/auth/completePasswordSetup.ts` отклоняет `client` до записи
   password credential. Этот guard не удалён и не ослаблен.

Оставшиеся упоминания `password_setup` после правки относятся к staff recovery, типу purpose,
историческим миграциям, completion-маршрутам и проверкам. Нового пациентского producer среди них
нет.

## Что изменено

- В `requestPasswordRecoveryChallenge` роль адресата проверяется до
  `startEmailChallenge`: парольные challenge выпускаются только password-eligible ролям.
- В `createPgEmailSetupAccessPort` purpose заменён с `password_setup` на `login`. Это не новый
  путь: `EmailOtpPublicDbPort` уже разрешает `login`, а `email-otp/confirm` после проверки кода
  допускает `client` и создаёт пациентскую сессию.
- В `AuthFlowV2` hydration password-reset draft на поверхности без метода `password` очищает
  draft и оставляет режим входа по email-коду. Deep-link `?recover=1` уже был ограничен тем же
  `passwordLoginEnabled`; кнопка recovery уже была вложена в password-only ветку.
- Подсказка `Отправим 6-значный код на вашу почту.` и подтверждение
  `Код отправлен на почту: <email>` на затронутом пациентском экране идут из
  `notificationText.ts`; близнец текста не создан.
- Документация `apps/webapp/src/modules/auth/auth.md` приведена к действующему разделению:
  password recovery — только персонал, пациент — email OTP.

## Что теперь видит человек

Contact-only пациент, которого создал врач, получает письмо:

- тема: `Код подтверждения <имя patient surface>`;
- тело: `Ваш код <имя patient surface>: <код>`;
- обещания установить или сменить пароль и ссылки на парольную форму нет.

Для конфигурации по умолчанию `<имя patient surface>` равно `TherapyGo`; renderer использует
`PATIENT_APP_NAME`, если deploy явно переопределил имя.

Рабочий вход пациента — существующая patient-форма email-кода. Она показывает
`Отправим 6-значный код на вашу почту.`, после старта — экран ввода OTP с
`Код отправлен на почту: <email>`, а подтверждение идёт в
`POST /api/auth/email-otp/confirm`. Матрица patient surface также оставляет действующие
`phone_bot`, OAuth и passkey; метода `password` в ней нет.

Само platform-письмо ссылки не содержит и экран не открывает. Если человек начинает вход из
приложения, ввод email переводит его на экран email OTP и выпускает актуальный `login`-код. Это
тот же рабочий passwordless путь, а не отдельная форма установки пароля.

На staff-форме `forgot` внешний ответ по-прежнему одинаков для неизвестного адреса,
contact-only пациента, staff-учётки с паролем и legacy пациента с password credential. Для
`client` побочного эффекта отправки теперь нет, поэтому нейтральный ответ не превращается в
парольное обещание.

## Доказательства

### Взгляд: письмо и экран

- `platformMailProfileForRecipientRole('client')` выбирает конфигурируемое имя patient surface;
  platform-ветка общего renderer формирует приведённые выше тему и тело без слова «пароль» и без
  ссылки.
- `DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient` содержит `email_code`, `phone_bot`, `oauth`,
  `passkey`, но не `password`.
- В `AuthFlowV2` recovery deep-link и recovery-кнопка доступны только при
  `passwordLoginEnabled`; дополнительный hydration guard удаляет единственный найденный обход
  через сохранённый draft.
- UI-тесты не создавались и не запускались: пункты про пользовательский текст и ветвление по
  brief и §10a принимаются взглядом. Live-проверка до landing не выполнялась по §1a/§24.

### Поведение маршрутов

Финальный точечный gate:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts && pnpm --dir apps/webapp exec tsc --noEmit && pnpm --dir apps/webapp exec eslint src/app-layer/auth/passwordRecovery.ts src/infra/repos/pgEmailSetupAccessPort.ts src/modules/auth/emailSetupAccess/ports.ts src/modules/auth/passwordEligibility.route.test.ts src/modules/auth/passwordAuth.route.test.ts src/shared/notifications/notificationText.ts src/shared/ui/patient/auth/AuthFlowV2.tsx"
```

Результат: `2 passed` test files, `29 passed` tests; `tsc --noEmit` и точечный ESLint завершились
с общим `rc=0`. Сообщение `permission denied for table platform_users` в stderr — намеренно
инъецированный operator error существующего теста; suite зелёный.

Тест на единый `forgot` fingerprint вызывает публичный handler для неизвестного адреса,
contact-only пациента, staff-учётки с паролем и legacy пациента с password credential, повторяет
запросы и сравнивает status/body/headers. Конечный side effect разрешён только для staff reset;
patient challenge отсутствует. Это одновременно удерживает результат Д3 и новый источник
пациентского письма.

### Fault injection

1. Временно снят role guard `isPasswordEligibleRole` из
   `completePasswordSetupAfterVerification`, затем выполнено:

   ```bash
   /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run --project=route src/modules/auth/passwordEligibility.route.test.ts"
   ```

   Результат: `1 failed, 5 passed`; сценарий «patient после верного setup-кода» ожидал `403`, но
   получил `200`. Guard восстановлен.

2. Временно возвращён пациентский producer в `requestPasswordRecoveryChallenge`: фильтр роли
   заменён на проверку только наличия recipient, затем выполнена та же команда.

   Результат: `1 failed, 5 passed`; проверка конечной отправки ожидала только два staff reset
   challenge, но получила шесть вызовов — вернулись `password_setup` для contact-only пациента и
   `password_reset` для legacy пациента. Фильтр роли восстановлен.

Обе названные поломки пойманы; временных продуктовых изменений после инъекций не осталось.

### Неуспешные подготовительные попытки

Первый запуск того же route-набора завершился `rc=254` с `Command "vitest" not found`: в clone не
было локального `node_modules`. После проверки совпадения lockfile подключены временные symlink на
уже установленные зависимости основного clone. Первый `tsc --noEmit` затем показал отсутствие
`luxon` у integrator по той же причине; после подключения его dependency tree типизация прошла.
Все временные dependency-symlink и созданный typecheck-файл `tsconfig.tsbuildinfo` удалены до
коммита и в него не входят.

## Не выполнялось

- полный CI — прямо запрещён brief;
- автоматические UI-тесты — запрещены brief и §10a;
- запуск второго Next-сервера и live UI до landing — запрещены §1a/§24;
- DEV/TEST/PROD БД, миграции и хосты не затрагивались;
- галочка Д6 и verdict в `feat` не менялись.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.
