# C4 — каноническая настройка брендированного шаблона OTP

Ты `worker`. Единственный канон — `AGENTS.md`; прочитай карту, §2–§5, §10a/§10b, §16/§17/§21 и §24.
Authority — `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`, пункт C4, и фактический
инцидент нового PROD: все брендированные `auth_email_otp` доходят до durable queue, затем четыре раза падают с
`BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING`, потому что integrator читает `clinic_transactional_mail_template`,
но webapp не имеет registry/API/settings write surface для этого ключа. SMTP при этом исправен и не вызывается.

## Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` — «Формулировка branded-пары остаётся значением `clinic_transactional_mail_template`, которое должен написать владелец; без него доставка намеренно не подменяет клинику платформенным именем».

## Сделать

1. Добавь `clinic_transactional_mail_template` в единственный `SYSTEM_SETTING_REGISTRY` как per-org admin server
   structured setting. Не создавай новое хранилище, env или второй write path.
2. Создай один typed parser/normalizer webapp для envelope inner value:
   `senderDisplayNameTemplate`, `authCodeSubjectTemplate`, `authCodeTextTemplate`; те же ограничения длины и
   обязательные placeholders, что у integrator renderer: sender содержит `{{clinicName}}` и `{{platformName}}`,
   subject — `{{senderDisplayName}}`, text — `{{senderDisplayName}}` и `{{code}}`. Пустой/неполный payload
   fail-closed. Не дублируй нормализацию между route/service/UI.
3. Проведи ключ через существующий `/api/admin/settings` organization-scoped PATCH и existing
   `createSystemSettingsService().updateSetting`; доступ — владелец/администратор клиники с mechanic `branding`.
   Добавь ключ в оба существующих tariff/mechanic guard maps, чтобы HTTP и внутренний write path не расходились.
4. Расширь существующий `ClinicDeliveryChannelsSection` на вкладке branding тремя компактными полями шаблона и
   одной кнопкой сохранения. Передай initial value из уже загружаемых clinic admin settings; не показывай секреты и
   не связывай шаблон с наличием собственного SMTP — platform SMTP тоже использует branded profile. Не придумывай
   default copy: отсутствие остаётся явным, а конкретные тексты вводит владелец. UI/DOM/copy tests запрещены.
5. Переиспользуй существующие doctor primitives и card; не создавай новую страницу/модалку/endpoint.

Не меняй SMTP resolver, fail-closed поведение integrator, Telegram, provider credentials, PROD/TEST данные или env.
Не создавай миграцию: `system_settings.key` текстовый и новая строка появляется через существующий service.

## Проверки и результат

Добавь/обнови только поведенческие non-UI tests: registry org scope и route/service normalization + guard, используя
существующие suites. Не проверяй строки исходника, DOM, CSS, копирайт или количество полей. Прогони targeted tests,
webapp typecheck, scoped lint и `git diff --check`. Вручную проинспектируй полный путь
settings page → PATCH → service → `public.system_settings` → integrator parser на одинаковом ключе/shape. Обнови
C4 evidence note в плане только фактом candidate readiness, не закрывай C4 до live delivery. Коммить явные пути;
`git add -A` запрещён. Full CI, push, deploy, PROD/TEST writes не запускать.
