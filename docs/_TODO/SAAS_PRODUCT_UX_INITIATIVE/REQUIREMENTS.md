# Requirements — SaaS Product UX

**Authority:** производный contract. При конфликте побеждает
[`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md); Foundation rulings сохраняют приоритет в своём scope.

## 1. Исходная задача владельца

Нужно последовательно, без ухода в локальные улучшения:

1. Сначала определить глобальную модель продукта.
2. Затем определить роли, контексты и состав экранов.
3. Отдельно проработать specialist-oriented публичный лендинг.
4. Спроектировать приглашение пациента специалистом: email как основной путь, SMS как дополнительный.
5. Спроектировать установку клиентского приложения после приглашения.
6. Определить branding и domain model.
7. Определить UX пациента, который связан с несколькими специалистами и/или организациями.
8. Только после этого декомпозировать реализацию.

## 2. Зафиксированные продуктовые роли

Из owner rulings и текущего кода:

| Роль | Назначение |
|---|---|
| Global admin | Управление платформой, организациями, тарифами, биллингом, использованием и system health |
| Organization owner | Владелец SaaS-аккаунта организации; lifecycle, billing, branding, staff и настройки организации |
| Organization admin | Операционное управление организацией; может одновременно быть специалистом |
| Specialist / doctor | Клиническая работа, расписание, пациенты, программы, коммуникации и контент в пределах организации |
| Assistant / receptionist | Будущая clinic capability, не initial release; точные permissions и workspace не утверждены |
| Patient | Собственные данные и care flows в одной или нескольких организациях |
| Onboarding patient | Только активация identity; без business actions до достижения patient tier |
| Anonymous/public | Platform landing, опубликованная страница организации, публичная запись и trusted invite entry; каталог/поиск позже |
| System actors | Worker/integrator/scheduler/media/cron; не пользовательские кабинеты |

Текущий канон персонала: одна активная организация на один staff login; несколько активных membership — ошибка данных, не org switcher. Не менять это скрыто внутри UX-плана.

### 2.1 Launch focus — owner ruling 2026-07-16

Первый выпуск ориентирован на solo specialist. Multi-specialist clinic, assistant/receptionist и сложная clinic
communication сохраняются как future architecture-compatible направления, но не должны добавлять launch UI или
задерживать текущий продукт.

## 3. Продуктовые поверхности, которые надо спроектировать

### 3.1 Platform public

- specialist-oriented landing;
- возможности продукта и специализации;
- тарифы/демо/регистрация специалиста;
- вторичный вход пациента «У меня есть приглашение / войти»;
- опубликованные страницы организаций, публичная запись и trusted join;
- каталог/поиск организаций не входит в initial launch и переносится на потом;
- legal/support/status surfaces.

### 3.2 Organization public

- опубликованная страница организации по стабильному slug;
- специалисты, услуги, локации, запись;
- организация-ориентированный invite/join entry;
- canonical platform URL независимо от custom-domain alias.

### 3.3 Organization workspace

- clinic overview;
- organization settings;
- branding/public page;
- тариф, usage и billing;
- integrations/channels;
- клинический кабинет для owner/admin, которые также являются специалистами.

Staff/team invitations, assistant/receptionist roles and clinic-specific permission presets are reserved future
capabilities. They are absent from the initial organization navigation and do not block solo launch.

### 3.4 Specialist workspace

- сегодня;
- пациенты, включая UX-фильтр «мои / все клиники» без изменения прав;
- карточка пациента;
- расписание;
- коммуникации;
- назначения и каталоги;
- patient-facing content;
- личные настройки и install PWA.

#### Solo specialist vs clinic specialist

Действующее решение владельца:

- launch composition — solo specialist без clinic collaboration/assistant слоя;
- clinic future использует одну organization-scoped карточку;
- пациент виден конкретному clinic specialist только через фактический или запланированный визит/clinical relation;
- по умолчанию специалист видит свои события, а по праву может открыть всю доступную историю организации или
  отфильтровать её по другому специалисту;
- «передача» не является отдельным lifecycle: это создание/запись визита к другому специалисту, через который у
  него появляется рабочая связь с пациентом;
- отдельная patient hierarchy, receiver-approval lifecycle и cross-organization movement не входят в эту модель.

Record-class visibility и authorization всё равно проектируются отдельно от UI-фильтра; одна карточка не означает
безусловный доступ ко всем записям.

Формулировка фильтра уточняется на этапе IA: речь о «мои пациенты / все пациенты организации», а не о выборе организации.

### 3.5 Patient app

- организация как основной care context;
- специалисты внутри организации как участники конкретных записей, программ и диалогов;
- безопасный выбор организации при нескольких enrollment;
- отсутствие смешения clinical data между организациями;
- понятное указание автора назначения/сообщения и получателя ответа;
- единый global identity без дублирования аккаунтов;
- activation, install и notification consent после trusted invite.
- portal activation может привязать verified identity к карточке/визиту, уже созданным специалистом до регистрации.

### 3.6 Manual patient creation and walk-in — owner ruling 2026-07-16

- Specialist/staff может сразу создать карточку/relationship пациента и appointment по имени, телефону и
  необязательному email.
- Walk-in карточка и visit создаются в момент приёма без предварительной booking.
- Patient self-booking — параллельный entry, а не обязательный путь.
- Portal activation отдельно связывает verified email/phone identity с существующей карточкой, программой и
  визитами. Delivery не доказывает identity и не означает активированный portal access.

## 4. Стартовые UX-гипотезы — не решения

Исторические гипотезы ниже уточнены решениями 2026-07-16; они не должны противоречить датированному rulings file:

1. Главный platform landing продаёт продукт специалисту/клинике. Пациент не проходит обычную свободную регистрацию с hero; он входит по приглашению, через запись или отдельную компактную точку входа.
2. Patient invite ведёт не на абстрактную инструкцию установки, а на organization-scoped join page: проверка токена → identity activation → подтверждение связи с организацией → первый полезный экран → предложение установить PWA.
3. Email — основной транспорт приглашения; SMS используется как дополнительный/fallback channel only when its
   channel policy allows it. После настройки organization custom email/SMS provider patient/user delivery никогда
   не переходит на platform sender того же канала. Web Push становится основным только после установки и подписки.
4. Пациент выбирает организацию, а не «логинится к каждому врачу». Внутри организации конкретный специалист отображается в записи, программе и диалоге.
5. Branding имеет уровни: platform brand и paid organization branding. Полное платное брендирование заменяет
   product-facing name/logo на собственном домене или platform subdomain, но не создаёт per-clinic layout/theme.
   Custom domain и branding не являются authorization.
6. Кабинет global admin должен быть отдельной IA-поверхностью, а не растущим cluster внутри doctor sidebar.

## 5. Обязательные вопросы, которые должен закрыть discovery

- Solo specialist и clinic: один onboarding или две развилки одного onboarding?
- Что именно создаётся при self-signup и какой минимальный first-run checklist?
- Future assistant/receptionist сохраняется только как architecture reservation; его capabilities не проектируются
  и не являются текущим вопросом владельцу.
- Как owner/admin переключается между management и clinical work без второй авторизации?
- Какие различия UI обязательны между solo specialist и специалистом клиники, а какие должны оставаться одной
  композицией с capability-driven actions?
- Для future clinic реализовать уже выбранную модель: одна карточка; связь специалиста через visit; own events по
  умолчанию; вся доступная история/конкретный специалист только по праву.
- Как выглядит patient context switch при нескольких организациях?
- Clinic communication topology остаётся future backlog вне текущего discovery; launch сохраняет текущий solo chat.
- Кто считается отправителем email/SMS/push при разных branding tiers?
- Как единый resolved brand contract применяется на landing, join, auth, PWA, email, booking и patient/staff shell:
  org name/logo on branded origin, без custom layout/theme и без ослабления legal/support/security recovery?
- Как автоматически генерируется branded organization PWA из domain/subdomain + org name/logo/manifest settings?
  Отдельное native org app исключено из текущего scope и остаётся research backlog.
- Какие custom-domain сценарии поддерживаются: public page, booking, join, PWA; какой canonical redirect contract?
- Что происходит при истёкшей, повторно использованной или отправленной не тому email invite-ссылке?
- Как portal identity безопасно связывается с уже созданной staff карточкой/визитом без дубля identity/relationship?

## 6. Definition of Done discovery

- есть полная current-state карта экранов с route, actor, purpose и disposition;
- есть role × capability × screen matrix;
- есть end-to-end journeys для specialist signup, staff invite, patient invite/install, public booking и returning patient;
- multi-org/multi-specialist patient model описана состояниями и edge cases;
- branding/domain contract описан по surface и тарифным уровням;
- целевая IA по ролям сопоставлена с текущими route/component reuse points;
- спорные решения вынесены в короткий owner decision packet;
- после решений создан implementation roadmap без смешения с текущим enforcement workstream.
