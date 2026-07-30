# Global-admin channel & auth-method toggles + mini-app removal (spec capture)

> **Owner requirement, 2026-07-24** — prod-prep feature. Captured verbatim-structured; current-state recon in
> progress (grounds the plan). Related: `SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` (login config,
> U-contracts), tariff/entitlements/mechanics-flags (`SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`),
> capability-guard. Реализация ведётся по этапам: `#1005` этап 1 закрыт ниже; `#993` mini-app removal поставлен
> владельцем на паузу.

## Requirement (owner, plain)

Global-admin settings must expose **checkboxes to enable/disable each available channel & auth method**, and the
login/registration UI must reflect those toggles **dynamically**.

### R1 — toggleable methods (each independently on/off)

- **Telegram** (auth/registration channel)
- **MAX** (auth/registration channel)
- **SMS** (registration/auth via phone code)
- **2FA** (two-factor authentication)
- **Email** — with **per-provider** control:
  - **Google / Gmail OAuth** — independent toggle
  - **Yandex OAuth** — independent toggle
  - ~~**Apple — NOT included** (owner 2026-07-24; even though implemented, no Apple toggle / not offered).~~
    **Заменено последующим решением владельца 2026-07-30:** «apple - переключатель в админке.»
- **2FA / TOTP** — owner 2026-07-24: required for **global admin AND specialists** (staff). The toggle governs
  whether TOTP 2FA is in effect for those roles.

### R2 — dynamic UI gating

- Turning a method **OFF** in global-admin → it **disappears** from the login/registration surface, **regardless of
  whether credentials/keys are configured** for it. (Example: disable Gmail → Gmail login option vanishes even if a
  Google OAuth key is still set.)
- Turning a method **ON** → it **appears to the client ONLY if its required config exists** (integration key /
  needed keys+addresses in settings). **Owner ruling 2026-07-24:** if a method is ON but its keys/config are
  missing → **NOT shown to the client**, AND the admin sees a **warning next to that toggle** ("parameters not
  configured"). So visible-to-client = `enabled AND fully-configured`; admin always sees the toggle + a
  not-configured warning when applicable.
- Must apply to: patient login, staff/specialist login, registration flows — everywhere the method is offered.

### R3 — remove Telegram & MAX mini-apps

- The Telegram mini-app and MAX mini-app must be **removed** — they duplicate the main web app's capabilities. Keep the
  bots for **auth codes / notifications only** (aligns with RU-privacy `NTF-01`: push/messenger for auth codes only, no
  product fallback in Telegram/MAX). Scope of "remove": the mini-app entry points / launch buttons / webapp-in-bot
  surfaces — NOT the bot's auth/notification messaging.

## Open questions for owner (collect into decision sheet)

- Method ON but unconfigured (no key/creds): hide it, or show + admin-warning?
- Is the toggle **global** (platform-wide, single-tenant owner) or **per-clinic** (tenant-scoped)? (Current owner model
  is single-owner; but SaaS direction may want per-clinic. Default assumption: **global**, matching "global-admin
  settings".)
- 2FA toggle semantics: disabling 2FA entirely vs making it optional-per-user?
- Confirm which email/OAuth providers are in scope (Google, Yandex, + others?).

## Current state — RECON (verified 2026-07-24, `scratchpad/channel-auth-toggles-recon.md`)

- **Login resolver:** `apps/webapp/src/modules/auth/authChannelPolicy.ts` + `loginAlternativesConfig.ts` →
  `/api/auth/login/alternatives-config`, `/api/auth/telegram-login/config`, `/api/auth/oauth/providers` →
  `AuthFlowV2.tsx`/`AuthBootstrap.tsx`. **Fail-closed by default**, and ~30 API routes ALSO server-enforce the channel
  flag (not just UI hiding — good). So the dynamic-gating machinery already exists; we extend its inputs.
- **Per-method gating today:**
  - **email / sms / telegram / max** — ALREADY have individual `system_settings` booleans (`auth_email_enabled` etc.,
    `registry.ts:102-105`), wired end-to-end. **DONE — reuse.**
  - **Google / Yandex / Apple OAuth** — currently DERIVED FROM CREDENTIAL PRESENCE via DB trigger (migrations
    0193/0209/0210), NOT an independent toggle. **GAP vs R2** ("disable Gmail regardless of configured key").
  - **2FA** (staff TOTP, `modules/staff-security/`) — NO global gate, per-user opt-in only. **GAP.**
- **Admin write path:** `/api/platform/settings` (`app/api/platform/settings/route.ts`) — the existing global-admin
  settings API; already carries the 4 boolean auth-channel keys (`PLATFORM_GLOBAL_SETTINGS_API_KEYS`, generic boolean
  normalization). **Reuse point** — new toggles = new registry keys + add to that array. **No admin UI page found** → build.
- **OAuth inventory:** Google, Yandex, **Apple** all implemented (Apple not in owner's list → open question).
- **Mini-apps:** single chokepoint — any bot button carrying `web_app:{url}` (MAX converts `web_app`→`open_app` in
  `deliveryAdapter.ts`). Removal targets: `reminderInlineKeyboard.ts`, `reminderMessengerWebAppUrls.ts`,
  `executeAction.ts:362-382` (no_channel_binding fallback), `helpers.ts:373-459` (`webAppUrlFact`). Bot `sendMessage` /
  Telegram Login Widget / MAX auth codes are SEPARATE → keep untouched. (Not yet located: menu-button mini-app vector,
  staff-login separateness — confirm before removal.)

## Исходный grounded plan (частично реализован; актуальные этапы `#1005` ниже)

1. **Extend the settings registry** with independent boolean toggles: `auth_oauth_google_enabled`,
   `auth_oauth_yandex_enabled`, (`auth_oauth_apple_enabled`?), `auth_2fa_enabled` — add to `registry.ts` +
   `PLATFORM_GLOBAL_SETTINGS_API_KEYS`. OAuth toggle becomes `enabled AND creds-present` (decouple from creds-only).
2. **Login resolver:** feed the new toggles into `authChannelPolicy`/`oauth/providers` + the ~30 server-enforcing routes
   so a disabled method vanishes from UI AND is rejected server-side (fail-closed).
3. **2FA:** add the global gate honoring `auth_2fa_enabled` (define disable semantics — owner Q).
4. **Admin UI:** build the global-admin settings page (checkbox grid) consuming `/api/platform/settings` (backing API
   exists).
5. **Mini-app removal:** strip the `web_app` button chokepoint (the 4 targets above), keep bot auth/notification
   messaging. Aligns `NTF-01`.
6. Tests + live TEST verification (toggle off → method gone from login UI + server rejects; mini-app buttons gone).

## Owner decisions

- ✅ **RESOLVED 2026-07-24** — Method ON but unconfigured → **hidden from client + admin-side warning** next to the
  toggle. visible-to-client = `enabled AND configured`.
- ~~✅ **RESOLVED 2026-07-24** — **Apple NOT included** (no toggle).~~
  **Заменено последующим решением владельца 2026-07-30:** «apple - переключатель в админке.»
- ✅ **RESOLVED 2026-07-24** — 2FA/TOTP toggle applies to **global admin AND specialists (staff)**.
- ✅ **RESOLVED 2026-07-24** — Toggle scope: **GLOBAL / platform-wide**, configured by the **global admin only**;
  specialists do NOT access these settings. (Not per-clinic.)

Решения этого исходного среза зафиксированы; последующие решения владельца и актуальный порядок выполнения
ведутся в разделе `#1005` ниже. Mini-app removal (`#993`) поставлен владельцем на паузу.

## Консолидированный workstream Auth / аккаунт / онбординг (`#993`)

Этот раздел сохраняет непотерянный scope карточек группы 10 перед их предложенной свёрткой в одну
workstream-карточку `#993`. Он не объявляет требования выполненными и не выбирает решения за владельца.
Существующие архитектурные каноны продолжают действовать; здесь собрана единая очередь исполнения.

### `#993` — канал/auth control plane и mini-app removal

Требование: выполнить R1–R3 и grounded plan этого файла целиком — независимые global-admin toggles для Telegram,
MAX, SMS, 2FA, Google/Gmail OAuth и Yandex OAuth; client visibility = `enabled AND fully-configured`; admin warning
для включённого, но не настроенного метода; удалить Telegram/MAX mini-app entry points, сохранив ботов для кодов
аутентификации и уведомлений.

- [-] ~~Не предлагать Apple OAuth как способ входа даже при сохранённых legacy credentials: public providers API и
      SSR snapshot возвращают `apple: false`, прямой `POST /api/auth/oauth/start` отклоняет `provider=apple`~~ —
      ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 2026-07-30: «apple - переключатель в админке.»
- [x] Удалить Telegram/MAX mini-app launch из ошибки `user.phone.link → no_channel_binding`, сохранив сообщение и
      остановку ошибочного сценария — `apps/integrator/src/kernel/domain/executor/executeActionMiniAppRemoval.unit.test.ts`.
- [x] Удалить главный/home mini-app launch из Telegram/MAX menu, reply-menu, content-сценариев и post-bind меню,
      сохранив booking-действие и обычную browser-auth ссылку —
      `apps/integrator/src/kernel/domain/executor/executeActionHomeMiniAppRemoval.unit.test.ts`.
- [ ] Удалить оставшиеся Telegram/MAX mini-app entry points из booking/diary/reminder-путей, сохранив ботов для
      кодов аутентификации и уведомлений.
- [ ] Провести живую TEST-проверку: выключенный метод исчезает из login/registration и отклоняется сервером;
      Telegram/MAX mini-app launch buttons отсутствуют.

Ограничения карточки: toggles глобальные, не per-clinic; Apple управляется отдельным переключателем и остаётся
скрыт без полного набора credentials; 2FA относится к global admin и staff; выключенный метод исчезает из
login/registration независимо от наличия ключей.

### `#985` — owner TEST login, PWA и Web Push

- [ ] Привязать подтверждённый email `dimmdao@gmail.com` к DB-backed global-admin resolution, включить email OTP
      на TEST, настроить/установить staff PWA и Web Push для global-admin аккаунта, доказать auth/security и
      живой TEST, затем записать точные шаги входа для владельца.

Authority карточки: `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §Track B. Границы: без PROD и без push в
`main`/`test`. Существующее evidence: `UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md`
фиксирует, что ветка `codex/task-985-smtp-otp` была byte-identical к feat, а feat дополнительно содержит
`58c577ef0` locked-principal binding; `TEST_DEPLOY_EVIDENCE_2026-07-22.md` оставляет owner OTP/PWA acceptance
открытой.

### `#1005` — политика входа: маршрутизация кода, пароль и 2FA клиентов

Решения владельца, дословно:

> «если смс путь не включен и пуша у человека нет - то даже при вводе телефона отправляется на имейл».
>
> «Мы подготовим для всех потом обязательный запрос на регистрацию почты - пусть вводят и подтверждают чтобы
> работать могли дальше и логиниться.»

Решение владельца 2026-07-30: Telegram, MAX и SMS подтверждают владение номером; Yandex OAuth и VK ID
подтверждают номер только когда provider реально передал его. Email и Web Push номер не подтверждают; будущий
WhatsApp подтверждает его только при таком же доказанном факте.

Уточнение владельца 2026-07-30, дословно:

> «код, пришедший на email, подтверждает email, но не телефон - это верно
> но если пользователь с УЖЕ подтвержденным телефоном и email ввожит телефон - мы можем прислать на имэйл код
> для входа. для входа а не для подтверждения телефона.»
>
> «Мне от тебя нужен отдельный блок в админке - там где я включаю / выключаю авторизацию кнопками (какие oauth
> можно использовать, какие мессенджеры, можно ли смс и тд).
>
> в новом блоке я должен иметь возможность настраивать все эти пути - куда отправлять код в каком порядке. можно
> ли войти с паролем без кода и тд.
> плюс двухфакторка клиентам.»

Последующие решения владельца 2026-07-30, дословно:

> «apple - переключатель в админке.
> 2FA - пока добровольной»
>
> «значит пин надо как и осталоные провайдеры логина включать-выключать в алминке»
>
> «тогда план такой.
> подклчам библиотек, добвляем включение галочкой
>
> затем исправляем баги которые ты уже нашел
> потом вместе продумываем как настроить последовательность подклбчения аутентификационных путей»

Уточнение про trusted phone: широкий перечень допустим для доверенных OAuth/мессенджер-провайдеров, потому что
это тот же класс доказанного атрибута, что verified email, только для телефона. Провайдер выставляет trust только
когда реально вернул подтверждённый номер; сам факт OAuth-входа без номера trust не создаёт.

Действующий продуктовый смысл:

- введённый идентификатор и канал доставки кода — разные вещи;
- email-код может использоваться для **входа** в уже найденный аккаунт только через его уже подтверждённый email;
  это не подтверждает введённый телефон и не меняет trusted-phone состояние;
- фиксированный порядок SMS → email ниже описывает только уже реализованное текущее поведение. Целевой порядок
  допустимых путей доставки должен задаваться global admin в новом блоке auth-policy;
- тот же блок управляет доступными OAuth/мессенджерами/SMS, разрешением входа только по паролю без дополнительного
  кода и клиентской 2FA;
- Apple, PIN и passkey — самостоятельные способы входа с отдельными переключателями в том же global-admin блоке;
- клиентская 2FA пока добровольная: включение платформенной возможности не принуждает пациента к enrollment;
- до проектирования настроек требуется отдельное исследование практик зрелых auth-систем и стандартов безопасности:
  какие комбинации допустимы, какие должны быть запрещены, какие значения безопасны по умолчанию.

- [x] Отвязать канал доставки одноразового кода от введённого идентификатора: в текущей реализации при вводе
      телефона выбирать живой канал в фиксированном порядке SMS, если включён и номер подходит → привязанный
      подтверждённый email. Web Push решением владельца от 27.07 пока не используется для регистрации и кодов
      входа. —
      `apps/webapp/src/app/api/auth/phone/start/route.ts` +
      `apps/webapp/src/modules/auth/phoneStartFallback.route.test.ts` +
      `apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx` (13/13 narrow).
- [ ] Провести обязательную кампанию сбора и подтверждения email для аккаунтов, у которых мессенджер был
      единственным входом; на TEST-копии зафиксированы **22** аккаунта без email, телефона и пароля.
- [x] Доказать одинаковые ответ и timing независимо от наличия канала, не раскрывать наличие привязанного email;
      допустима только одинаково ведущая себя маскированная подсказка вида `d***@g***.ru`. — нейтральный
      `deliveryChannel: automatic`, одинаково сохранённый challenge/lockout и единое минимальное окно ответа;
      внешняя доставка выполняется через Next `after` уже после ответа:
      `phone/start/route.ts` + `integratorSmsAdapter.ts` + `stubSmsAdapter.ts` +
      `integratorSmsAdapter.deferred.unit.test.ts` + `pgPhoneChallengeStore.unit.test.ts` +
      `phoneStartFallback.route.test.ts`.
- [x] Развести «канал доставки» и «подтверждённый фактор»: код, доставленный по email после ввода телефона,
      подтверждает email и не выставляет trusted-phone признак. —
      `apps/webapp/src/modules/auth/phoneAuth.ts:55,183` +
      `apps/webapp/src/infra/repos/pgUserByPhone.ts` (оба условных пути `phoneNumberProven === true` вызывают один
      typed Drizzle update в той же транзакции; scan legacy raw `UPDATE ... patient_phone_trust_at` пуст).
- [ ] Сопоставить текущий код со всей матрицей путей входа и доставки: введённый идентификатор → найденный аккаунт
      → подтверждённые каналы аккаунта → разрешённые global-admin policy пути → фактический способ входа; отдельно
      перечислить расхождения, не меняя код до согласования целевой модели.
- [ ] Зафиксировать по первичным стандартам и официальным реализациям зрелых auth-систем целевую auth-policy:
      password/passwordless, порядок code-delivery, клиентская 2FA, enrollment/recovery, безопасные значения по
      умолчанию и запрещённые комбинации; принести владельцу на согласование до разработки.
- [x] **Этап 1 — passkey и переключатели способов входа.** Подключить поддерживаемые
      `@simplewebauthn/server` + `@simplewebauthn/browser`; реализовать добровольное добавление/удаление и вход по
      passkey без передачи биометрии приложению; хранить несколько credentials на аккаунт; добавить в существующий
      global-admin auth-блок отдельные переключатели passkey, PIN и Apple. Каждый выключенный способ должен
      отклоняться сервером, а не только исчезать из UI. Apple сохраняет configured-check, безопасный default новых
      переключателей — `false`. — `apps/webapp/src/modules/auth/passkeyAuth.ts` +
      `apps/webapp/src/app/api/auth/passkey/**` +
      `apps/webapp/src/app/app/patient/profile/PasskeySection.tsx` +
      `apps/webapp/src/app/app/admin/auth/PlatformAuthChannelPolicySection.tsx`; narrow unit/route `8/8`,
      webapp typecheck, scoped ESLint, Drizzle journal sync и `check:saas-db-regression` — PASS.
- [ ] **Этап 2 — два подтверждённых бага текущего fallback.** Phone→email разрешён только когда введённый телефон
      уже trusted и email уже verified; email-код не меняет phone trust. Включённый, но ненастроенный SMS не
      перехватывает вход: evaluator пропускает его и рассматривает следующий реально доступный канал.
- [ ] **Этап 3 — только совместно с владельцем.** После этапов 1–2 спроектировать настраиваемую
      последовательность auth/code-delivery путей. До зафиксированного решения владельца не добавлять порядок,
      drag-and-drop, скрытые приоритеты или новую универсальную policy-схему.
- [ ] После согласования этапа 3 реализовать оставшуюся auth-policy: упорядоченные пути доставки,
      password-only policy и добровольную клиентскую 2FA. Клиентский UI и серверные маршруты применяют одну
      сохранённую policy fail-closed.

Нормативные ссылки карточки: W3C WebAuthn Level 3 — биометрия остаётся в authenticator и не раскрывается
Relying Party; стандарт рекомендует разрешать несколько credentials на аккаунт из-за потери/смены устройства.
NIST SP 800-63B-4 — SMS/PSTN является restricted authenticator и требует
альтернативного типа аутентификатора; при этом NIST прямо **не** считает email допустимым out-of-band
authenticator, поэтому email-fallback здесь — отдельное продуктовое решение владельца, а не заявка на
NIST-AAL. OWASP ASVS 5.0 6.3.8, CWE-204 и OWASP Forgot Password Cheat Sheet задают защиту от enumeration:
одинаковый публичный ответ и сопоставимое время независимо от существования аккаунта/канала. Связь: `#1004`
уже зафиксировал недоказанный `patient_phone_trust_at`; fallback не должен повторить этот класс.

### `#1011` — phone auth должен пережить включение SMS

- [ ] Перевести `/api/auth/phone/start` и `/confirm` с прямого доступа `pgPhoneChallengeStore` /
      `pgPhoneOtpLimits` к `public.phone_challenges` и `public.phone_otp_locks` на узкие
      `SECURITY DEFINER` accessors по существующему образцу `app.phone_otp_public_booking_*` /
      `app.email_otp_public_*`; не выдавать таблицы роли целиком.
- [ ] Выдать `EXECUTE` непосредственно bootstrap login-роли, потому что NOINHERIT login не делает `SET ROLE`;
      одного grant роли `app_patient` недостаточно.

Проверенный факт: `bcb_test_nonstaff_login` имеет `has_table_privilege = f` для обеих таблиц; дефект скрыт
`system_settings.auth_sms_enabled = false` и проявится после включения SMS. Готовый образец — миграция `0246`,
commit `53b93c41e`; точный grant-путь — `d3-4-bootstrap-base-login-read-grants.sql`.

### `#1031` — разные двери входа для ролей

Решения владельца 26.07:

- маршруты `/app/doctor/login`, `/app/patient/login`, `/app/admin/login` имеют своё оформление;
- на doctor/patient экранах всегда есть статичная перекрёстная ссылка; она не зависит от введённых данных и
  поэтому не раскрывает роль конкретного аккаунта;
- врачебный вход обслуживает специалиста, администратора клиники и сотрудника; роли внутри клиники — права,
  не отдельные двери;
- landing ведёт отдельно специалиста и пациента; пациент также входит со страницы записи, public clinic page
  и из своего кабинета.

- [ ] Реализовать role-specific login surfaces и перенаправлять неавторизованного с `/app/doctor/*`,
      `/app/patient/*`, `/app/admin/*` на соответствующую дверь, исключив сами login routes из redirect rule.
- [ ] Сохранить `next=` и все public pages под этими префиксами; public surface нельзя отправлять на login.
- [ ] Авторизованного с чужой ролью вести в его собственный кабинет с отказом `app_access_denied=1`, а не на
      экран входа.
- [ ] Исследовать и зафиксировать текст для верных credentials на чужом portal. Предложение владельца —
      тот же текст, что для неверного пароля; не выдавать это за решение до завершения сравнения Epic, Doctolib,
      Zocdoc, Shopify, Atlassian и Salesforce.

Строить текст ошибки и redirect rules одним проходом: они живут в одних файлах. Канон модели дверей:
`docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md` §«Разные двери для разных ролей».

### `#1035` — юридический gate способов авторизации

Факты исследования карточки: 406-ФЗ от 31.07.2023 добавил ч.10 ст.8 149-ФЗ с действием с 01.12.2023; штрафы
введены 199-ФЗ от 26.06.2026 и действуют с 07.07.2026; для юрлица указаны 500–700 тыс. рублей, повторно до
1,4 млн по ст.13.55 КоАП. Перечислены российский абонентский номер, ЕСИА, ЕБС или иная информационная система
российского лица; порог по размеру в тексте не найден. Практические источники противоречат друг другу по вопросу,
считается ли собственная база логинов «иной информационной системой»; судебная практика и разъяснения РКН не
найдены. ЕСИА — единственный названный в законе безусловный вариант.

- [ ] Получить заключение юриста: достаточно ли собственного email/password аккаунта или обязателен
      номер/ЕСИА; считается ли иностранный номер; удовлетворяет ли MAX ч.10 ст.8 149-ФЗ.
- [ ] После юридического ответа решить судьбу Google OAuth в российском контуре. `auth_oauth_google_enabled`
      сейчас выключен; Yandex российский и включён. Не удалять возможность своим решением.

Связи: `#1034` — ЕСИА; `#1031` юридическим вопросом не блокируется.

### `#1044` — два различимых TEST-аккаунта одной клиники

Владелец, дословно: «для отличия администратора клиники и врача мне нужны тестовые аккаунты для админа клиники
и ее врача».

- [ ] Подготовить в одной TEST-клинике два разных аккаунта — clinic admin и ordinary doctor — чтобы владелец
      увидел фактическую разницу или её отсутствие; не трогать аккаунты чужих реальных людей.
- [ ] Оставить границы ролей владельцу: проход 27.07 по **114** маршрутам дал byte-identical доступ и нулевой diff,
      а владелец ранее сказал: «у админа клиники нужен будет расписание клиники - отдельный режим или отдельный
      экран видимо» (`#1028`).

### `#1049` — TOTP definer grants

- [ ] Починить кнопку «подключить аутентификатор»: определить фактический principal
      `enterStaffSecuritySelfPrincipal` и выдать ему узкий `EXECUTE` на
      `save_pending_staff_totp`, `complete_staff_totp_enrollment`, `get_staff_security_profile`,
      `ensure_staff_security_profile`; не выдавать таблицы и не расширять права сверх соседних образцов.
- [ ] Добавить механический gate, который ловит `SECURITY DEFINER` функцию без grant фактической вызывающей роли.

Проверено: для всех четырёх функций `login=false` и `staff=false`; routes `totp/start`, `totp/verify`,
`recovery/confirm`, `status`, `sessions/revoke` уже существуют. Это третий одинаковый случай после password reset
(`684f49fdd`, `5737c8b7e`, `c170071ee`) и phone login `#1033`. Связь: `#999` починил мёртвый
`auth_2fa_enabled`, но без этих grants 2FA всё равно нельзя подключить.

### `#1063` — непрерывный first-run клиники

- [ ] Выбрать с владельцем и реализовать один понятный путь для нового owner без `specialist_id`: подсказка со
      ссылкой на first-run на organization settings, redirect gate на `/app/account` либо автоматическое создание
      специалиста при регистрации. До решения не выбирать вариант за владельца.
- [ ] Доказать, что новый владелец понимает обязательные шаги 2FA/recovery codes/«Подключить рабочий кабинет» и
      получает `clinical.workspace`, не упираясь в немую стену.

Проверенная цепочка: `app.provision_specialist_owner` создаёт membership owner с `specialist_id = NULL`;
`ensureOwnBookableSpecialist` вызывается только из
`api/account/first-run/bind-specialist/route.ts:6-39`; `workspaceCapabilities.ts:64-66` требует
`owner|doctor AND specialist_id != null`; `requireRole.ts:429-437` уводит на
`/app/settings?tab=organization`, где подсказки нет. Живой TEST-пример «Тест Клиника» создан 25.07:
`specialist_id NULL`, `factor_type NULL`, `recovery_codes_confirmed_at NULL`; «Точка Здоровья» имеет
привязанного специалиста. Этот разрыв также помешал decisive ветке `#998`.

### `#1065` — rate limit на password login/change

- [ ] Добавить per-IP и per-account throttling для `email-password/login`; сейчас route проверяет пароль без
      любого limiter.
- [ ] Добавить per-account failed-attempt counter к смене пароля, сохранив общий `auth.confirm` budget
      **30/10 мин** и не копируя race-prone email-OTP counter.
- [ ] Зафиксировать временную, не бессрочную блокировку и получить решение владельца по D-2; рекомендация карточки —
      **5 попыток / 15 минут**, throttling/растущая задержка предпочтительнее жёсткой блокировки.

Готовые образцы: `staff_security_profiles.failed_attempts/locked_until`,
`app.record_failed_staff_factor_attempt` (5 → 15 минут, `0215_staff_security_profiles.sql:261-285`) и
`user_pins.attempts_failed/locked_until`. Нормативы: OWASP Authentication Cheat Sheet и NIST SP 800-63B 5.2.2.
Связи: `#1047` per-IP confirm routes done; находка должна остаться в `#1001` рядом с D2.
Точные исходные места: `email-password/login/route.ts:26` проверяет пароль без limiter;
`api/account/security/password/change/route.ts:28` имеет только общий per-IP budget, а
`passwordChange.ts:37-43` возвращает `wrong_current_password` без инкремента.

### `#1066` — разные ошибки и надёжное feedback на security screen

- [ ] Добавить `try/catch`, busy state и отдельные тексты по коду ответа для `startEnrollment`,
      `verifyEnrollment`, `confirmRecovery`, `bindSpecialist`, `retryProvisioning`, `revokeSessions`.
- [ ] Вынести общий client error-code → text mapper и переиспользовать в `StaffSecuritySection` и
      `AuthFlowV2`; серверный `apiResponse.ts` из `#976` не является таким client mapper.
- [ ] Провести один независимый presentation-аудит без серийных correction rounds.

Проверено по `StaffSecuritySection.tsx`: только `changePassword` (`142-170`) использует
`passwordChangeErrorText` (`37-52`); `startEnrollment` (`74-92`) схлопывает
`security_session_required`, `verified_email_required`, `factor_already_enrolled`,
`totp_enrollment_start_failed`; `verifyEnrollment` (`94-113`) различает только `factor_locked` и не имеет
`try/catch`; четыре оставшихся действия (`115-140`) могут молча завершиться. Это нарушает
`OWNER_PRODUCT_RULES.md` §20: «разные причины обязаны выглядеть по-разному; один текст на все отказы —
сообщение о том, что кто-то не стал разбираться».
