**Инициатива (инфраструктура):** [`README.md`](README.md) · [`ROADMAP.md`](ROADMAP.md) · [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md) · [`LOG.md`](LOG.md) · этапы [`PHASE_00`](PHASE_00_AUDIT_AND_AGREEMENT.md)…[`PHASE_05`](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md).

**Scope волны 1 (2026-05-19):** только **live-flow** (новые Rubitime events, актуальные email от врача, register/forgot). Backfill, mass setup — **отложены** ([`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md), [`docs/TODO_NOT_NOW/`](../TODO_NOT_NOW/README.md): [PHASE_07](../TODO_NOT_NOW/login-register-backfill-appointments.md), [PHASE_08](../TODO_NOT_NOW/login-register-mass-setup-email.md)); §10 остаётся в MAIN PLAN на следующую волну.

---

Задача: спроектировать и реализовать корректный identity-flow для пациентов из Rubitime, email setup access и merge-сценарии.

Контекст проблемы:
Сейчас Rubitime events сохраняют appointment_records/rubitime_events, но не всегда создают/привязывают platform_user. В результате пациент может быть записан на приём, но врач не всегда получает полноценную пациентскую карточку для назначения программы.

Также есть тупик:
- врач/система добавляет email в карточку существующего пациента;
- email становится занятым;
- пациент не может зарегистрироваться по email, потому что duplicate_email;
- forgot password не отправляет письмо, потому что нет user_password_credentials и/или email_verified_at;
- вход через PWA по email невозможен.

Нужно сделать целевую модель: Rubitime создаёт/находит пациентскую карточку, email из Rubitime/от врача запускает setup access flow, пациент подтверждает email и задаёт пароль, не создавая дубль.

---

## 1. Целевая модель Rubitime → platform_user

Rubitime phone считается обязательным и доверенным источником. Rubitime record без телефона как основной сценарий не проектируем.

При получении Rubitime record created/updated:

1. Нормализовать phone.
2. Нормализовать email, если есть.
3. Найти существующего platform_user:
   - сначала по телефону;
   - если не найден — по email;
   - существующий механизм поиска/автопривязки не ломать, только дополнить.
4. Если user найден:
   - проставить appointment_records.platform_user_id = foundUser.id;
   - если user найден по email и в Rubitime пришёл телефон — добавить телефон пользователю в профиль как trusted/confirmed phone;
   - имя существующего пользователя НЕ затирать;
   - Rubitime name оставить в appointment_records.payload_json / projection и продолжать показывать отдельно как “В Rubitime: …”.
5. Если user не найден:
   - создать нового platform_user с ролью client/patient;
   - имя взять из Rubitime name/clientName как основное display/full name нового пациента;
   - телефон взять из Rubitime и считать trusted/confirmed;
   - email из Rubitime, если есть, сохранить как unverified/contact email;
   - appointment_records.platform_user_id = newUser.id.

Важно по имени:
- Rubitime name приоритетен только при создании нового пользователя.
- Если пользователь уже существует, его имя не трогать.
- В UI допустимо показывать оба имени:
  “Из расписания · 18:00 · Екатерина Косихина”
  “В Rubitime: Косихина Нкатерина Андреевна”

Цель:
- врач видит пациента сразу после записи из Rubitime;
- врач может назначить программу даже если пациент ещё не заходил в PWA;
- не плодятся дубли.

---

## 2. Email из Rubitime или от врача

Email из Rubitime или внесённый врачом — это contact/unverified email, а не автоматически подтверждённый login email.

При появлении/изменении email:
1. Сохранить email_normalized.
2. Сбросить/оставить email_verified_at = null, если пациент сам не подтверждал этот email.
3. НЕ создавать user_password_credentials автоматически.
4. Отправить пациенту email setup code:
   - “Подтвердите email и создайте доступ к кабинету”.
5. TTL кода — как у `email_challenges` (10 минут), повторная отправка через cooldown OTP.

Если врач меняет email существующему пациенту:
- новый email становится unverified;
- отправляется новая setup/confirmation link;
- проверить, что forgot/reset не отправляет reset на неподтверждённый email, внесённый врачом.

---

## 3. Email setup access flow

Нужен отдельный flow: не forgot password, не обычная регистрация, а “создать доступ к существующей пациентской карточке”.

Setup link:
- одноразовая;
- TTL 24 часа;
- привязана к userId + emailNormalized;
- token нельзя использовать повторно;
- старые токены для того же userId/email можно помечать revoked/expired при выпуске нового.

Актуальный flow:
`/api/auth/email-password/setup-access` → `challengeId` → ввод кода в текущей форме → `/api/auth/email-password/setup-code/complete`.

Legacy token-link `/app/auth/email-setup?token=...` оставлен только для уже отправленных старых писем.

При вводе кода:
1. Проверить token:
   - существует;
   - не истёк;
   - не использован;
   - user существует;
   - emailNormalized совпадает с текущим pending/contact email пользователя.
2. Показать форму установки пароля.

Форма должна содержать readonly email input, чтобы браузер/keychain сохранил пару логин+пароль:

```tsx
<input
  type="email"
  name="email"
  autoComplete="username"
  value={email}
  readOnly
/>

<input
  type="password"
  name="new-password"
  autoComplete="new-password"
/>

После submit:
	1.	Повторно проверить token.
	2.	Установить email_verified_at = now().
	3.	Создать или обновить user_password_credentials.
	4.	Пометить token used.
	5.	Создать session.
	6.	Redirect в /app/patient.

После этого пациент может входить по email+паролю.

⸻

4. Если setup code истёк

Expired TTL не должен быть тупиком.

Если пациент открывает истёкшую ссылку:
	•	показать экран:
“Ссылка устарела. Отправить новую ссылку на этот email?”
	•	кнопка “Отправить новую ссылку”.

Backend:
	1.	По token достать userId/email, даже если token expired.
	2.	Проверить, что email всё ещё принадлежит этому user как unverified/contact email или pending setup email.
	3.	Выпустить новый token на 24 часа.
	4.	Старые токены revoked/expired.
	5.	Отправить новое письмо.

Если пациент потерял письмо и просто пришёл на сайт:
	•	на экране входа/регистрации вводит email;
	•	backend определяет состояние email.

Состояния:
	1.	Email свободен → обычная регистрация.
	2.	Email существует + verified + password_credentials есть → обычный вход / forgot password.
	3.	Email существует + unverified/contact-only + password_credentials нет → отправить setup-code заново.
	4.	Email существует + verified, но password_credentials нет → setup password code.
	5.	Email конфликтный / несколько кандидатов → пробовать безопасный auto-merge дублей; если две password-строки или blocker merge-engine — `email_conflict` + admin audit `email_auth_conflict`.

⸻

5. Registration / login по email

Если пользователь вводит email в регистрации:
	1.	Email свободен:
	•	обычная регистрация.
	2.	Email занят у platform_user, но нет password credentials:
	•	не возвращать тупой duplicate_email;
	•	вернуть специальный код, например:
existing_account_needs_email_setup
	•	UI показывает:
“Аккаунт с этой почтой уже есть. Подтвердите email и задайте пароль для входа.”
	•	далее отправка setup code.
	3.	Email занят, verified, password credentials есть:
	•	это существующий аккаунт;
	•	предложить вход / forgot password.
	4.	Email verified у другого активного пользователя:
	•	не мержить автоматически;
	•	conflict/support.

Главное:
	•	не создавать второго пользователя;
	•	activation/setup должен идти в уже существующий platform_user.

⸻

6. Forgot password

Forgot password использовать только для состояния:
	•	email_verified_at IS NOT NULL;
	•	user_password_credentials существуют.

Если email есть, но:
	•	email не verified;
	•	или password_credentials отсутствуют;

то это не reset password, а setup access.

Минимально безопасное поведение:
	•	forgot endpoint может возвращать generic success наружу, чтобы не раскрывать email enumeration;
	•	но register/login flow должен запускать “создать доступ” для существующего contact-only аккаунта.

Проверить, что forgot/reset не отправляет письмо на email, который врач только что внёс, но пациент ещё не подтвердил.

⸻

7. Merge-сценарии

Нужно проверить и при необходимости доработать merge.

Возможный конфликт:
	•	пользователь A: Rubitime patient с приёмами;
	•	пользователь B: PWA/email user с дневниками, разминками, статистикой, reminder rules.

Цель merge:
	•	выбрать основной user;
	•	перенести appointments;
	•	перенести diaries;
	•	перенести warmup/exercise stats;
	•	перенести reminders;
	•	перенести treatment data;
	•	перенести messenger/email/oauth bindings;
	•	не потерять историю.

Принцип:
	•	новая логика должна предотвращать дубли заранее через поиск по телефону/email при Rubitime event;
	•	но если дубль уже возник, merge должен корректно объединять записи.

Проверить:
	1.	Если Rubitime user найден по email, а телефон пришёл из Rubitime — телефон добавляется этому user как trusted/confirmed.
	2.	Если позже появляется bot user с тем же телефоном — должен быть безопасный merge/identity resolution.
	3.	Если один user имеет appointments, а другой дневники/разминки — после merge всё должно быть на одном canonical user.

⸻

8. Что проверить в коде

Найти и изучить:
	•	обработчики Rubitime events created/updated;
	•	запись в appointment_records;
	•	rubitime email-autobind;
	•	создание/поиск platform_users по телефону;
	•	поиск platform_users по email;
	•	заполнение appointment_records.platform_user_id;
	•	user_password_credentials;
	•	email_verified_at;
	•	/api/auth/email-password/register;
	•	/api/auth/email-password/forgot;
	•	/api/auth/email-password/reset;
	•	/api/auth/email/start / /api/auth/email/confirm, если уже есть;
	•	AuthFlowV2;
	•	merge/automerge сервисы;
	•	doctor/admin profile update email flow.

⸻

9. Миграции / таблицы

Проверить, хватает ли текущих полей:
	•	platform_users.email;
	•	platform_users.email_normalized;
	•	platform_users.email_verified_at;
	•	user_password_credentials.

Если нужны токены setup access — предложить минимальную таблицу, например:

user_email_setup_tokens

Поля:
	•	id uuid;
	•	user_id uuid;
	•	email_normalized text;
	•	token_hash text;
	•	expires_at timestamptz;
	•	used_at timestamptz;
	•	revoked_at timestamptz;
	•	created_at timestamptz;
	•	source text (rubitime, doctor_profile, manual_resend, registration_claim);
	•	created_by_user_id nullable.

Токен хранить только hash, не plain token.

TTL: 24 часа.

⸻

10. Backfill / production

Сначала только dry-run, без destructive SQL.

Нужен dry-run для существующих appointment_records:
	•	записи с phone_normalized и platform_user_id IS NULL;
	•	сколько можно связать по телефону;
	•	сколько можно связать по email;
	•	сколько нужно создать новых platform_user;
	•	примеры 10–20 строк.

Потом отдельный согласованный backfill:
	1.	Найти/создать platform_user для appointment_records.
	2.	Проставить appointment_records.platform_user_id.
	3.	Email из payload_json сохранить как unverified/contact email, если безопасно.
	4.	Отправку setup email для старых записей делать только после отдельного подтверждения, чтобы не разослать внезапно письма всем старым клиентам.

Никаких массовых писем без отдельного подтверждения.

⸻

11. Тесты

Добавить/обновить тесты:

Rubitime:
	•	Rubitime record with new phone creates platform_user.
	•	Rubitime record with phone+email creates platform_user, phone trusted, email unverified.
	•	Rubitime record with phone matching existing user attaches appointment and does not overwrite name.
	•	Rubitime record with email matching existing email user attaches appointment and adds trusted phone.
	•	Existing bot/phone user + Rubitime record attaches appointment.

Email setup:
	•	Doctor/Rubitime email creates setup token.
	•	Setup token opens form with readonly email.
	•	Submit setup token verifies email and creates password credentials.
	•	Expired setup token can request resend.
	•	Used token cannot be reused.
	•	New resend revokes previous active token.

Auth:
	•	Register with existing contact-only email returns setup-required state, not duplicate_email.
	•	Forgot password works only for verified email + credentials.
	•	Forgot password does not send reset to unverified doctor/Rubitime email.
	•	Existing normal email+password account still works.

Merge:
	•	appointments + diary/warmup data can be merged into canonical user.
	•	no data loss in basic merge scenario.

⸻

12. Порядок работы

Сначала:
	1.	Аудит текущего кода.
	2.	Короткий план реализации:
	•	какие файлы менять;
	•	какие таблицы/миграции нужны;
	•	какие endpoint добавить;
	•	какие тесты добавить.
	3.	Никакой большой реализации без согласования.

После согласования:
	•	реализация малыми шагами;
	•	запуск только релевантных тестов;
	•	full CI не запускать без подтверждения;
	•	не пушить без подтверждения.

Отчёт:
	•	где сейчас не создаётся/не привязывается platform_user из Rubitime;
	•	как реализован find/create by Rubitime phone/email;
	•	как работает email setup code;
	•	что происходит при expired code;
	•	что изменилось в register/forgot;
	•	что нужно для backfill в prod;
	•	какие тесты прошли.

Смысл постановки для агента:

```text
Rubitime создаёт пациентскую карточку.
Телефон связывает пациента.
Email создаёт путь “подтвердить почту и задать пароль”.
Регистрация по email не должна плодить дубль.
Forgot password не должен заменять setup access.
Существующего пользователя по Rubitime не переименовываем.
Merge нужен как страховка, а не основной механизм.