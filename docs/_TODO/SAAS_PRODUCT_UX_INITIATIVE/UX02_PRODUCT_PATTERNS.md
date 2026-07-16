# UX-02 — External product patterns

**Дата исследования и доступа к источникам:** 2026-07-15
**Область:** specialist/clinic acquisition, onboarding, staff и patient invitations, role IA, patient record,
handoff, multi-practice patient context, branding/domains и platform-admin lifecycle.
**Тип источников:** только официальные product sites, help centers и technical documentation.

## 1. Как читать этот документ

В документе жёстко разделены:

- **Факт продукта** — поведение, прямо описанное официальным источником.
- **Вывод для BersonCare** — продуктовая гипотеза для следующих этапов UX-03–UX-06, не owner ruling.
- **Решение владельца** — вопрос, который нельзя закрыть внешним паттерном.

Исследование не сравнивает визуальный стиль и не предлагает копировать чужой UI. Маркетинговые утверждения
использованы только там, где они подтверждают операционную развилку тарифа, onboarding или состава ролей.

Продукты в основном сравнении:

1. SimplePractice;
2. Jane;
3. Healthie;
4. Practice Better;
5. Cliniko.

Для platform-admin lifecycle дополнительно использованы официальные technical docs Auth0 Organizations и
Stripe Billing/Connect. Это не рекомендации заменить ими существующие BersonCare identity или billing.

## 2. Короткий вывод

1. Сильный общий паттерн — **одна practice/organization account model**, которая стартует с solo owner и
   раскрывает team-возможности по мере роста. При этом acquisition и first-run должны рано спросить
   `solo / clinic`, потому что checklist, тариф и первый полезный экран различаются.
2. Owner/admin и clinician — не взаимоисключающие личности. Продукты назначают одному staff account несколько
   ролей или независимые role/capability признаки. Для BersonCare это поддерживает один вход и явное переключение
   между management и clinical surfaces.
3. Staff invite — не «создать пользователя», а lifecycle: role/capabilities до отправки, email activation,
   pending/resend/revoke, seat/plan failure, active/inactive и безопасная передача ownership.
4. Patient invite — отдельный lifecycle от patient record: `not invited → invited → activated → active →
   deactivated`. Email — основной проверяемый канал; прямую ссылку можно дать как controlled fallback. Новый resend
   должен инвалидировать прежнюю ссылку или интерфейс должен требовать самую новую ссылку.
5. Для UX-03 наиболее сильный evidence-backed кандидат — **одна organization-scoped patient record**, внутри
   которой записи имеют автора/специалиста, а история фильтруется по специалисту, типу и периоду. Permission
   enforcement должен выполняться до фильтра. Это не принятое решение владельца: отдельные карточки или episodes
   могут понадобиться при legal, privacy, clinical-episode, access или billing boundaries, но несут риск дублей,
   merge и фрагментации истории.
6. «Передать пациента» нельзя оставлять одной абстрактной операцией. В продуктах встречаются разные primitives:
   смена primary clinician, добавление в care team, доступ к общей карточке, назначение конкретного визита и
   юридически контролируемый transfer/copy между практиками.
7. Patient multi-practice UX в отрасли неоднороден: от отдельных порталов на каждую клинику до единого login и
   profile/practice picker. Для BersonCare единая global identity с явным organization context лучше соответствует
   уже зафиксированной модели, но это остаётся выводом discovery.
8. Branding обычно распространяется на public booking, patient portal и email, но staff admin shell остаётся
   platform-branded. Переименование URL требует совместимого redirect. Domain/host помогает выбрать entry context,
   но не заменяет membership или authorization.
9. Platform admin должен видеть отдельно organization state, identity/onboarding state, billing state,
   entitlement и operational health. Один флаг `active` скрывает слишком много разных recovery paths.

## 3. Матрица продуктов

| Продукт | Acquisition: solo / clinic | Staff и owner/admin | Patient entry / activation | Patient record, shared history, handoff | Branding / domain | Полезный сигнал для BersonCare |
|---|---|---|---|---|---|---|
| SimplePractice | Solo-тарифы и group flow 2–5 / 6+ специалистов разведены на pricing; group требует Plus | Один Account Owner; clinical и administrative roles можно сочетать; owner/manager управляет team | Email welcome; состояния «sent, not signed in», resend до первого входа, затем обычный portal URL; practice-wide и per-client portal access | Primary clinician; другим clinicians выдаётся access. Для частой работы нескольких clinicians допускаются отдельные client profiles, затем portal profile picker | Practice-wide portal URL; owner/manager настраивает его. Practice name и контакты видны пациенту | Хороший invite lifecycle и role composition; отдельные profiles на специалиста — предупреждение о фрагментации |
| Jane | Одна account model от solo до clinic; первый practitioner включён, team добавляется; setup checklist clinic info → disciplines → treatments → staff → schedule | Один Account Owner, Full Access и granular staff access. Practitioner Limited видит свои schedule/patients; owner transfer требует подтверждённого работающего staff login | My Account создаётся из booking или Welcome Email. Staff и patient стороны разделены URL (`/admin` и `/account`) | Одна clinic patient profile и chart; shared charts имеют author/privacy. History/export фильтруется по practitioner. Между Jane accounts transfer — отдельный owner-authorized copy process | Clinic subdomain; branding на booking, My Account и email, но не admin shell. Старый URL остаётся redirect после rename | Сильный эталон author-attributed общей истории и безопасного URL migration; отдельные practice portals остаются ограничением |
| Healthie | Solo Core/Essentials/Plus; Group добавляет provider/support seats и care teams; Enterprise — sub-org/white-label | Standard и Support — базовый тип; admin designation независим. Permission templates и granular permissions; один Account Owner | Client invite email → password. Time-limited link; resend создаёт новый link и инвалидирует старый; retry rate limit | Один client может иметь несколько assigned providers в Care Team. Email может вести к нескольким отдельным client portals/accounts с explicit toggle | Logo/name/colors и branded platform path; full web/mobile white-label — enterprise option | Полезны care team, permission templates и строгие invite recovery states; опасны неочевидно связанные дубли по email |
| Practice Better | Individual tiers и отдельный Team plan; solo account может войти в Team с сохранением client records/resources | Один Team Owner; Practitioner, Admin user и Practice Admin; custom roles/permissions; practitioner/admin invite email | Invitation-only activation; явные statuses Not Invited, Invited, Activated, Last Active, Deactivated; resend, copy link, revoke | Несколько practitioners могут создать profiles для одного email; после linking patient получает profile picker. Shared team resources и explicit sharing recipients | Personalized URL и portal/email branding зависят от тарифа | Лучший status vocabulary для patient activation; profile picker полезен, но отдельные practitioner profiles не должны стать default BersonCare model |
| Cliniko | Одна clinic account; practitioner count влияет на тариф, non-practitioner admin users бесплатны | Security role отделён от признака Practitioner. Administrator может менять subscription/users, но non-practitioner admin не может писать treatment notes | Public booking не требует login: данные сопоставляются с existing patient или создают record; patient portal invite не является основным паттерном продукта | Одна patient record хранит appointments, notes, communications и forms. History фильтруется по practitioner/business/record; ограничения чтения notes применяются отдельно. Duplicate records merge сохраняет историю | Business logo и online booking settings настраиваются по business/location | Самое прямое evidence для `one record + filter`, где permission не подменяется фильтром; полезен low-friction public booking |

## 4. Проверенные факты по продуктам

### 4.1 SimplePractice

**Acquisition и account shape — факты**

- Pricing разделяет solo plans, groups 2–5 и assisted/custom path для 6+ practitioners. Group practice требует
  тарифа Plus. Источники: [SimplePractice pricing](https://www.simplepractice.com/pricing/),
  [subscription FAQ](https://support.simplepractice.com/hc/en-us/articles/115005956266-SimplePractice-pricing-and-subscription-FAQs).
- Group role model допускает clinical role вместе с supervisor и administrative roles; account owner и practice
  manager могут добавлять staff. Источники:
  [adding team members](https://support.simplepractice.com/hc/en-us/articles/360052248892-Adding-and-managing-team-members),
  [group setup](https://support.simplepractice.com/hc/en-us/articles/360031772051-Setting-up-a-group-practice-account-in-SimplePractice).

**Staff и patient invite — факты**

- Team invite отправляется после выбора clinical/administrative roles и review изменения тарифа; приглашённый
  создаёт пароль по email link. Email, уже занятый существующим account, вызывает ошибку; invitation можно resend.
- Patient portal access можно дать при создании client record или позже. До первого входа UI показывает, что invite
  отправлен, но вход не выполнен, и позволяет resend. После первого входа resend invite исчезает; пациенту передают
  обычный portal URL. Portal можно выключить practice-wide или per client.
- Для возвращающегося patient login link действует 24 часа, одноразовый, и при нескольких запросах работает только
  самый новый. Источники:
  [inviting clients](https://support.simplepractice.com/hc/en-us/articles/17128873739277-Inviting-clients-to-the-Client-Portal),
  [client login](https://support.simplepractice.com/hc/en-us/articles/360043816891-Getting-started-guides-for-clients-How-to-log-in-to-the-Client-Portal-).

**Patient record — факты**

- У client profile есть один primary clinician; другим clinicians можно выдать clinical access.
- Для нескольких регулярно работающих clinicians SimplePractice также предлагает отдельные profiles на одного
  клиента. Чтобы управлять ими через один portal, profiles связываются через contact access; intake и card data при
  этом не переносятся между profiles автоматически.
- Один email должен быть уникальным для обычного user/client account; официальная документация предлагает aliases
  как workaround для некоторых multi-account cases. Источники:
  [profile access](https://support.simplepractice.com/hc/en-us/articles/43120004142605-Granting-and-revoking-access-to-a-client-s-profile),
  [multiple client profiles](https://support.simplepractice.com/hc/en-us/articles/360019735192-Sharing-clients),
  [same email](https://support.simplepractice.com/hc/en-us/articles/360038866472-Adding-team-members-or-clients-using-the-same-email-address).

**Brand/domain — факты**

- Portal имеет practice-wide URL, который устанавливает owner/manager; перед включением рекомендуется проверить
  practice name, timezone, phone и locations, потому что они видны пациенту. Источник:
  [setting up Client Portal](https://support.simplepractice.com/hc/en-us/articles/207925883-Setting-up-the-Client-Portal).

**Вывод для BersonCare**

- Перенять visible activation status и recovery, но не переносить уникальность email «на каждый account» и
  practitioner-specific duplicate patient profiles как базовую модель.

### 4.2 Jane

**Acquisition и setup — факты**

- Одна pricing model покрывает solo и teams: первый practitioner включён, дополнительные practitioners добавляются,
  non-bookable admin/support staff не тарифицируются как practitioners. Источник:
  [Jane pricing](https://jane.app/pricing).
- Начальный checklist состоит из clinic info, disciplines, treatments, staff и schedule. Источники:
  [clinic information](https://jane.app/guide/step-1-clinic-information),
  [staff setup](https://jane.app/guide/step-4-staff).

**Roles и mode boundary — факты**

- Jane различает Account Owner, Full Access, administrative/front-desk и несколько practitioner levels. Только
  Account Owner управляет subscription/ownership; Practitioner Limited по умолчанию видит свои appointments и
  patients. Staff может иметь patient component, но staff/admin login использует `/admin`, patient side — clinic
  URL или `/account`.
- Ownership transfer выполняется только к существующему staff profile; перед transfer документация требует
  убедиться, что новый owner успешно входит. Источники:
  [staff access levels](https://jane.app/guide/staff-access-levels),
  [account ownership](https://jane.app/guide/how-to-check-who-s-listed-as-account-owner),
  [staff vs patient login](https://jane.app/guide/help-i-m-a-practitioner-but-keep-getting-logged-in-as-a-patient).

**Patient record и handoff — факты**

- Practitioner Limited может видеть общих patients и shared charts в зависимости от `Access Charts` и privacy;
  каждая chart entry имеет автора и может быть shared или private.
- Общая chart/history поддерживает filter/export по practitioner. Treatment plan виден staff с доступом к patient,
  но вложенные charts всё равно подчиняются собственным access rules.
- Draft chart можно передать другому author; изменение сохраняется как контролируемая операция. Между разными Jane
  accounts transfer копирует charts/files и требует участия source owner, practitioner и destination owner; это не
  обычная смена assignee внутри clinic.
- Patient My Account относится к конкретной clinic; для другой Jane clinic создаётся отдельный My Account.
  Источники:
  [staff access and shared charts](https://jane.app/guide/staff-access-levels),
  [chart history filters](https://jane.app/guide/exporting-chart-notes-print-or-pdf),
  [treatment plan visibility](https://jane.app/guide/treatment-plans),
  [change chart author](https://jane.app/guide/deleting-moving-or-changing-a-chart),
  [Jane-to-Jane transfer](https://jane.app/guide/jane-to-jane-chart-transfer-data-transfers-faqs),
  [patient portal](https://jane.app/guide/my-account-your-patient-client-portal).

**Brand/domain — факты**

- Clinic colors/logo распространяются на online booking, My Account и emails, но не меняют administrative side.
- Clinic получает `businessname.janeapp.com`. Изменение URL делает support по запросу Account Owner; старый URL
  остаётся secondary redirect, чтобы bookmarks не ломались. Источники:
  [client-facing branding](https://jane.app/guide/branding-your-online-booking-page),
  [URL change](https://jane.app/guide/how-to-change-your-jane-account-website-address-url).

**Вывод для BersonCare**

- Использовать `one organization record + authored entries + server-enforced visibility + practitioner filter` как
  основной кандидат. Разделить понятия internal handoff и cross-organization record transfer.

### 4.3 Healthie

**Acquisition и roles — факты**

- Solo plans отделены от Group; Group добавляет provider/support seats, organization calendar, Care Teams и org
  reporting; Enterprise добавляет optional web/mobile white-label и sub-org возможности. Источник:
  [Healthie pricing](https://help.gethealthie.com/article/773-healthie-pricing).
- Staff имеет тип Standard или Support и независимый admin designation. Admin выбирает permission template и может
  настраивать granular permissions. Enterprise parent org может добавить одного member в несколько sub-orgs.
  Источники:
  [add/remove team member](https://help.gethealthie.com/article/1178-add-or-remove-a-team-member),
  [Standard vs Support](https://help.gethealthie.com/article/944-standard-vs-support-roles),
  [multi-sub-org member](https://help.gethealthie.com/article/1321-sub-orgs-add-new-team-members-to-multiple-organizations).

**Patient activation — факты**

- Add client отправляет email invite и предлагает создать password. Secure activation link действует 4 дня.
  Resend создаёт новый link; предыдущий link перестаёт действовать. Resend ограничен пятью попытками за 24 часа.
- При duplicate/existing email продукт может показать предупреждение, создать/связать отдельные client accounts и
  затем дать account toggle. Непреднамеренную связь исправляют сменой email или через support.
  Источники:
  [inviting a client](https://help.gethealthie.com/article/160-overview-inviting-a-client-to-healthie),
  [resend/reset](https://help.gethealthie.com/article/161-resend-a-clients-welcome-e-mail),
  [email already in use](https://help.gethealthie.com/article/1006-client-email-address-already-in-use).

**Patient record и handoff — факты**

- Несколько providers одной organization можно назначить к client как Care Team; assignment определяет updates и
  возможность direct messaging. Organization calendar требует отдельных permissions для поиска всех clients и
  записи в calendars других providers. Источники:
  [client Care Team](https://help.gethealthie.com/article/160-overview-inviting-a-client-to-healthie),
  [organization calendar](https://help.gethealthie.com/article/167-using-healthies-organizational-calendar).

**Brand/domain — факты**

- Non-enterprise branding включает logo, company name, colors и персонализированный path вида
  `secure.gethealthie.com/go/...`; это branded URL на platform domain, не подтверждение custom hostname.
- Branding surfaces различаются по тарифу; цвета web portal не обязательно переходят в mobile apps. Full web/mobile
  white-label является отдельной enterprise capability. Источники:
  [brand and logo](https://help.gethealthie.com/article/125-setting-up-your-brand-company-information-and-colors),
  [client portal link](https://help.gethealthie.com/article/199-adding-a-client-portal-login-to-your-website).

**Вывод для BersonCare**

- Перенять явный Care Team и permission templates. Не связывать identities автоматически только по совпавшему email
  без экрана подтверждения и recovery.

### 4.4 Practice Better

**Acquisition и roles — факты**

- Individual plans имеют одну practitioner license; Team начинается с 2+ practitioners и добавляет team scheduling,
  shared calendar, custom roles и managed billing. Existing solo practitioner accounts могут быть merged в Team с
  сохранением records/resources. Источники:
  [pricing](https://practicebetter.io/pricing), [Team plan](https://practicebetter.io/teams).
- Team имеет одного Owner, Practitioner, Administrative User и дополнительный Practice Admin capability. Перед
  отправкой staff invite выбираются user type, role и access level. Seat/add-on limit может блокировать invite.
  Источник:
  [team management](https://help.practicebetter.io/hc/en-us/articles/360035388872-Inviting-and-Managing-Team-Members-in-Practice-Better).

**Patient activation — факты**

- Patient portal activation — только по invitation. Staff видит состояния `Not Invited`, `Invited`, `Activated`,
  `Last Active` и `Deactivated`, может resend или получить direct activation link.
- Invite можно revoke. После activation вместо resend используется password reset. Некоторые inactive/prospective
  состояния нельзя пригласить.
  Источники:
  [client status](https://help.practicebetter.io/hc/en-us/articles/360039362731-How-to-Check-Your-Client-s-Account-Status),
  [send/revoke invitation](https://help.practicebetter.io/hc/en-us/articles/115003962651-Sending-a-Client-Invitation-in-Practice-Better).

**Patient multi-practitioner model — факты**

- Разные practitioners могут создать profiles для одного client email. После приглашения второго practitioner
  existing patient входит прежними credentials и получает profile picker между practitioners.
- При upload patient явно выбирает, какому practitioner/team member открыть document. Источники:
  [same email with multiple practitioners](https://help.practicebetter.io/hc/en-us/articles/360015346112-Can-Clients-Use-the-Same-Email-Address-for-Multiple-Practitioners),
  [sharing documents](https://help.practicebetter.io/hc/en-us/articles/115003708711-How-to-Upload-and-Share-Documents-in-the-Client-Portal).

**Вывод для BersonCare**

- Перенять status vocabulary и явного recipient. Не моделировать каждого specialist как отдельный верхнеуровневый
  patient portal внутри одной organization: BersonCare context должен начинаться с organization.

### 4.5 Cliniko

**Roles и staff invitation — факты**

- Security role и флаг `Is this user a practitioner?` выбираются отдельно. Non-practitioner administrator может
  управлять account, но treatment notes пишет только practitioner. Practitioner и administrative user получают
  email invite на создание password; invitation можно resend. Источники:
  [security roles](https://help.cliniko.com/en/articles/1087327-user-security-roles),
  [add practitioner](https://help.cliniko.com/en/articles/1023845-add-a-practitioner),
  [add administrative user](https://help.cliniko.com/en/articles/1023883-add-an-administrative-user).

**Public booking — факты**

- Public booking не требует patient login. Форма собирает базовые данные и либо сопоставляет existing patient,
  либо создаёт новую record. Источник:
  [online booking overview](https://help.cliniko.com/en/articles/1023955-a-quick-overview-of-online-bookings).

**Patient record, permissions и filters — факты**

- Duplicate patient profiles merge в одну target record; appointments, treatment notes, invoices, communications,
  forms и другие связанные records переносятся. Merge необратим и требует проверки identity.
- Patient History по умолчанию включает appointments, notes и forms; его можно фильтровать по date, practitioner,
  business и record type. Если practitioner permission ограничивает notes только собственным авторством, History
  показывает только разрешённые notes — фильтр не расширяет доступ.
- При deactivation practitioner исчезает из calendar; future appointments нужно обработать заранее, иначе для
  исправления требуется reactivate → изменить appointments → снова deactivate.
  Источники:
  [merge duplicate patients](https://help.cliniko.com/en/articles/1024106-merge-duplicate-patients),
  [patient history filters](https://help.cliniko.com/en/articles/1271009-download-or-print-all-of-a-patient-s-notes-forms-and-appointment-history),
  [make practitioner inactive](https://help.cliniko.com/en/articles/10031573-make-a-practitioner-inactive).

**Вывод для BersonCare**

- Это прямое подтверждение композиции `единая карточка → разрешённый history set → default filter «мои» → optional
  «вся доступная история» / specialist filter`. В BersonCare нельзя выводить option, который API затем массово
  запрещает: capability и scope должны быть рассчитаны до screen composition.

## 5. Solo specialist и clinic specialist

### 5.1 Факты рынка

- Jane использует одну account model: solo — это account с одним bookable practitioner; team наращивается staff и
  licenses.
- Healthie и Practice Better явно разделяют solo и group/team plans, потому что team добавляет support/admin seats,
  shared calendar, Care Team, roles и org reporting.
- SimplePractice оставляет общий core product, но acquisition и assisted onboarding различаются по размеру group.
- Practice Better допускает последующее включение solo account в Team без потери records.

### 5.2 Вывод для BersonCare — не решение

Предпочтительная модель discovery:

| Слой | Solo owner-specialist | Clinic specialist | Общий или различный |
|---|---|---|---|
| Identity | Один staff login | Один staff login в одной active organization | Общий |
| Clinical home | Мой день, мои patients, мои tasks | Мой день, мои patients, team handoffs | Общая composition, разные capability blocks |
| Patient list default | Все patients практики фактически равны «моим» | «Мои» по умолчанию; «все доступные в clinic» отдельно | Разный default/filter set |
| Patient card | Полная разрешённая история без team filter | Разрешённая org history, default filtered to me | Общая record composition с дополнительной filter bar |
| Team/handoff | Не показывать пустой team layer | Care team, transfer/assignment, pending handoffs | Только clinic |
| Schedule | Личный calendar + setup shortcut | Личный calendar; org schedule/setup по capabilities | Общий calendar, разные management actions |
| Management | Компактные practice settings | Отдельная organization management surface | Разная глубина IA |
| Billing/plan | Solo usage/plan | Seats, roles, usage, billing | Разные summaries |

Одна полностью одинаковая sidebar для solo и clinic создаст пустые team abstractions у solo. Два независимых
продукта создадут migration debt при росте solo → clinic. Нужна одна information architecture с ранним
`practice shape` и capability-driven composition.

## 6. Clinic patient record и handoff

### 6.1 Сравнение двух моделей карточки

| Критерий | Отдельная карточка на специалиста | Одна organization-scoped карточка |
|---|---|---|
| Подтверждение продуктами | SimplePractice допускает multiple profiles; Practice Better использует practitioner profile picker | Cliniko имеет один history с practitioner filter; Jane — общую patient chart с author/privacy; Healthie — Care Team |
| Непрерывность истории | Фрагментируется; нужны link/merge и отдельная отправка forms | Сохраняется, если каждая запись имеет author/context |
| Privacy | Простая изоляция по profile, но есть риск ложной уверенности при shared contacts | Требует настоящего entry-level authorization и visibility policy |
| Handoff внутри clinic | Похож на копирование/создание ещё одной карточки | Смена assignment/care team без копирования identity/history |
| Billing/specialty walls | Может быть полезна при реальной необходимости раздельных claim/diagnosis records | Нужны scoped episodes/cases внутри общей identity record |
| Patient UX | Profile picker даже внутри одной clinic | Organization context один; specialist attribution внутри событий |
| Duplicate/merge risk | Высокий | Ниже, но identity resolution всё равно обязательна |

### 6.2 Вывод для BersonCare — не решение

Основной кандидат: **одна patient identity + одна organization enrollment + одна organization-scoped patient card**.
Внутри карточки:

- immutable attribution для visits, notes, programs, messages и files;
- server-enforced permitted dataset;
- default view `Мои визиты / мои назначения` для specialist;
- optional `Вся доступная история` только при соответствующей capability;
- filter по конкретному specialist, episode/program, record type и period;
- заметное состояние `часть истории скрыта политикой доступа`, если это допустимо раскрывать;
- audit trail смены primary specialist/care team.

`Мои / все / специалист` — это presentation filters над уже разрешённым набором. Они не являются security policy и
не должны передаваться в backend как единственный ownership guard.

### 6.3 «Передать пациента» — четыре разные операции

| Операция | Эффект | История | Recovery / audit |
|---|---|---|---|
| Сменить primary specialist | Меняет default clinical owner | Не копируется и не исчезает | Кто/когда/почему; возврат previous assignment |
| Добавить specialist в care team | Совместное сопровождение | Общая разрешённая history с author visibility | Remove member без удаления authored records |
| Передать конкретный work item | Другой specialist получает appointment/task/program | Остальная patient ownership не меняется | Reassign/decline/return, notification status |
| Transfer между organizations | Создаёт новую enrollment и, возможно, контролируемую копию records | Только явно разрешённый subset; source сохраняет retention obligations | Consent/authorization, source/destination acknowledgements, transfer log |

Owner decision должен назвать, какие из этих операций входят в launch scope. Одна кнопка «Передать пациента» без
выбора semantics создаст ошибки доступа и неверные ожидания о clinical history.

## 7. Patient invitation и activation contract

### 7.1 Обобщённая state machine — вывод из фактов продуктов

```text
record_only / not_invited
  -> invite_pending
  -> activated
  -> active
  -> access_suspended | deactivated

invite_pending
  -> expired
  -> revoked
  -> superseded_by_resend
  -> wrong_recipient
  -> activated
```

`activated` и `active` стоит различать: Practice Better отдельно показывает account activated и last activity.
Наличие patient record не означает, что человек получил portal access. Наличие invitation не означает enrollment
или разрешение clinical business actions до завершения identity activation.

### 7.2 Рекомендуемый screen/state contract для BersonCare — не решение

Specialist/clinic side:

- email, patient, organization и будущая роль/relationship перед отправкой;
- status badge + sent time + sender;
- resend, copy safe link, revoke, correct email;
- delivery outcome без раскрытия token;
- explicit state после activation и last active;
- SMS только как дополнительный transport той же invitation, не отдельный account.

Patient side:

- organization name/logo и specialist/clinic sender до подтверждения;
- recipient email confirmation или безопасный masked hint;
- expired/revoked/superseded/wrong-account recovery без тупика;
- existing identity login вместо создания duplicate account;
- после activation — organization enrollment summary и первый полезный экран;
- install PWA и push consent после получения ценности, не до подтверждения relationship.

## 8. Failure и recovery matrix

| Сценарий | Официальное evidence | Требуемое состояние BersonCare — вывод |
|---|---|---|
| Staff email уже используется | SimplePractice блокирует invite существующего account; Healthie различает provider/client collision | Показывать conflict type; не советовать email alias; login/link-existing или owner/support flow |
| Staff invite не дошёл | SimplePractice, Cliniko и Practice Better дают resend | Pending row, resend cooldown, check-address action, delivery timestamp |
| Seat/plan limit | Practice Better блокирует invite при исчерпанном limit/add-on | Сохранить draft invite; CTA к plan/seat management; не терять выбранные permissions |
| Staff покидает clinic | Cliniko требует сначала обработать future appointments; Jane разделяет No Access и Inactive | Offboarding checklist: appointments/tasks/care teams/ownership, затем deactivate; authored history сохраняется |
| Owner уходит | Jane требует работающий login нового owner; Healthie запрещает просто сделать owner inactive | Transfer ownership wizard с preflight и second confirmation; запрет оставить organization без owner |
| Patient invite отсутствует | Все portal-oriented products рекомендуют проверить address/spam и resend | Check masked address, correct email, resend; не раскрывать, существует ли чужая identity |
| Patient invite истёк | Healthie: 4 дня; Auth0: expired state | Expired page с запросом нового invite у clinic, без повторного использования token |
| Несколько invite links | Healthie инвалидирует прежний initial invite после resend; SimplePractice делает недействительными прежние returning-login links после нового запроса | Явно писать «используйте последнюю ссылку»; `superseded` telemetry, а точную initial-invite policy выбрать отдельно |
| Invite отправлен не тому email | Auth0 требует вход с тем же email; Healthie позволяет correction + new invite | Не разрешать silently accept под другой identity; revoke, correct address, generate fresh invite |
| Invite уже принят | SimplePractice/Practice Better меняют resend на ordinary login/password reset | Safe success/already-activated page → login/open app; не создавать вторую enrollment |
| Portal выключен organization-wide | SimplePractice practice-wide toggle перекрывает per-client permission | Объяснять organization suspension, не изображать auth failure; staff видит impacted patients |
| Duplicate patient | Cliniko merge необратим; Healthie предупреждает о linking по email | До merge — identity comparison; после merge — immutable audit; recovery через support для ошибочного merge |
| Patient у нескольких specialists | Jane/Cliniko дают author/filter; Healthie Care Team; другие используют profile picker | Не создавать duplicate по умолчанию; показать care team и author на каждом clinical object |
| Patient у нескольких organizations | Jane — отдельные portals; Healthie/Practice Better — toggle/profile picker | Organization picker с stable global identity; last-used context только если enrollment всё ещё active |
| Practitioner deactivated, но есть future work | Cliniko требует reactivation для исправления appointments | Blocking offboarding summary и bulk reassignment; no silent orphan records |
| URL/slug изменён | Jane сохраняет старый URL redirect | Stable canonical platform URL + alias redirect; loop detection; old links не ломать сразу |
| Billing initial payment failed | Stripe `incomplete`/`incomplete_expired` | Organization onboarding/billing recovery отдельно от clinical data lifecycle |
| Billing past due/unpaid | Stripe различает recoverable `past_due` и access-revoking `unpaid` | Grace/recovery banner, entitlement policy и platform-admin queue; не удалять organization/data |
| Organization login connection misconfigured | Auth0 описывает error при отсутствии видимой connection | Platform-admin diagnostic state с repair action; не показывать generic wrong-password |

## 9. Branding и domain patterns

### 9.1 Факты

- SimplePractice и Jane используют practice-wide platform subdomain/URL.
- Healthie различает personalized path, semi-white-label и full web/mobile white-label.
- Jane применяет clinic branding к public booking, patient portal и email, но сохраняет platform admin styling.
- Jane оставляет старый URL как redirect после rename.
- Auth0 organization invitations включают organization id/name в acceptance route; custom domain меняет
  presentation, но invitation всё равно принимается в organization context. Источник:
  [Auth0 organization invitations](https://auth0.com/docs/manage-users/organizations/configure-organizations/invite-members).

### 9.2 Вывод для BersonCare — не решение

Разделять три capability tier:

1. **Platform default:** BersonCare domain/brand, organization identity как content.
2. **Organization branding:** logo/name/colors на organization public, booking, join, patient context и email header;
   canonical BersonCare URL сохраняется.
3. **White-label:** verified custom domain, расширенная sender presentation и отдельные manifest/icon constraints;
   platform legal/security fallback остаётся доступным.

Custom domain не должен:

- создавать organization membership;
- определять доступ к patient record;
- быть единственным canonical link в invite;
- ломать старые invites при rename;
- скрывать, кто является platform processor/support, где это юридически требуется.

## 10. Platform-admin organization lifecycle

### 10.1 Внешние факты

- Auth0 Organizations разделяет organization, enabled connections, members, member roles, invitations и verified
  domains. Invite может быть pending/expired; domain бывает pending/verified и только verified участвует в discovery.
  Источники:
  [create organization](https://auth0.com/docs/manage-users/organizations/create-first-organization),
  [organization connections](https://auth0.com/docs/manage-users/organizations/configure-organizations/enable-connections),
  [organization invites](https://auth0.com/docs/manage-users/organizations/configure-organizations/invite-members).
- Stripe Billing различает `trialing`, `active`, `incomplete`, `incomplete_expired`, `past_due`, `unpaid`, `paused`,
  `canceled`; recovery и entitlement последствия различаются. Источник:
  [Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview).
- Stripe Connect platform tools разделяют onboarding, account management, capabilities/requirements и removal;
  platform может видеть consolidated reporting, а account status changes приходят отдельно. Источники:
  [how Connect works](https://docs.stripe.com/connect/how-connect-works),
  [platform controls](https://docs.stripe.com/connect/platform-controls-for-stripe-dashboard-accounts).

### 10.2 Вывод для BersonCare — не решение

Global admin organization detail не должен иметь один общий toggle. Минимальные независимые оси:

| Ось | Примеры состояний | Recovery owner |
|---|---|---|
| Organization lifecycle | draft, onboarding, active, suspended, closing, archived | Platform ops / organization owner |
| Owner/staff identity | no owner, owner pending, active owner, ownership transfer pending | Identity/platform ops |
| Subscription | trialing, active, past due, unpaid, canceled | Billing / organization owner |
| Entitlement | enabled, grace, read-only, blocked | Product/billing policy |
| Domain | not configured, pending DNS, verified, certificate error, disabled | Organization admin + platform ops |
| Branding/publication | draft, review-needed, published, hidden | Organization admin |
| Integrations | not configured, healthy, degraded, reauth required | Organization admin / platform ops |
| Operational health | healthy, degraded, incident | Platform ops |
| Data/tenant checks | healthy, migration pending, isolation incident | Restricted platform ops |

Organization list должна поддерживать queues по recovery, а detail — audit trail и actor attribution. Global admin
может repair platform state, но не должен незаметно выполнять clinical actions или входить в specialist workspace как
обычный doctor.

## 11. Что принять, что не принимать

### Принять как рабочие паттерны для следующих этапов

- Один organization account, который может начаться как solo и вырасти в clinic.
- Ранняя acquisition/onboarding развилка solo/clinic без создания двух продуктов.
- Один staff identity с составными roles/capabilities; owner/admin может одновременно быть specialist.
- Separate management и clinical navigation modes в одной авторизации.
- Staff invitation lifecycle с pending/resend/revoke и preselected role/capabilities.
- Patient activation statuses отдельно от patient record и enrollment.
- Email как primary invitation channel; direct link/SMS как controlled alternate transport.
- Рассматривать одну organization-scoped patient card с authored clinical objects, server-enforced access и UI
  filters над уже разрешённым dataset как предпочтительный кандидат UX-03, но не как принятое решение.
- Care team и отдельные primitives primary assignment/work-item handoff/cross-org transfer.
- Global patient identity + explicit organization context picker.
- Branding matrix по surface и tier; canonical platform URL сохраняется.
- Global-admin organization detail с несколькими lifecycle axes и recovery queues.

### Избегать

- Просить solo specialist заполнить team structure до первого полезного действия.
- Делать clinic specialist UI полностью идентичным solo UI и оставлять team/handoff пустыми блоками.
- Разрешать одному display filter определять authorization.
- Создавать отдельную patient identity/card на каждого specialist по умолчанию.
- Называть любое reassignment «передачей пациента» без указания, что именно меняется.
- Советовать email aliases как продуктовый способ multi-practice membership.
- Считать invite отправленным = account activated = enrollment active.
- Делать resend бесконечным без cooldown, delivery status и invalidation старого token.
- Автоматически связывать medical profiles только по email без подтверждения и recovery.
- Смешивать organization management, platform operations и clinical work в одной sidebar.
- Использовать custom host/domain как authorization scope.
- Удалять organization или clinical history из-за billing failure; lifecycle и retention должны быть раздельны.

## 12. Unresolved owner decisions

Эти вопросы нельзя закрыть копированием рыночного паттерна:

1. **Solo → clinic:** solo organization автоматически становится clinic при первом staff invite или owner сначала
   подтверждает смену operating mode и тарифа?
2. **Clinic patient card:** утверждается ли одна organization-scoped card как default, а отдельные clinical
   episodes/cases используются для privacy/billing walls, либо нужны отдельные cards для отдельных специализаций?
3. **Default filter:** что именно означает `Мои` — primary specialist, автор хотя бы одной записи, участник care team,
   будущий appointment или любой active assignment?
4. **All history capability:** какие роли могут открыть всю organization history и какие record types остаются
   author-private даже для них?
5. **Handoff launch scope:** нужны ли на старте primary specialist change, care team, work-item reassignment и
   cross-organization transfer, или только часть primitives?
6. **Handoff acceptance:** требуется ли новому specialist принять patient/work item до смены primary assignment?
7. **Patient visibility:** видит ли patient всю organization care team, только active specialists или author на
   каждом событии без отдельного roster?
8. **Patient multi-org default:** всегда показывать organization chooser после login или безопасно открывать
   last-used active organization с заметным switcher?
9. **Owner/admin mode:** отдельный переключатель `Практика / Клиническая работа` или единый shell с двумя верхними
   разделами?
10. **Assistant baseline:** scheduling + messaging + invite без clinical history, или configurable role template с
    organization-defined permissions?
11. **Public booking enrollment:** booking создаёт onboarding enrollment сразу или только pending relationship до
    подтверждения email/визита?
12. **Patient invite sender:** отображать specialist, organization или `organization via BersonCare`; как меняется
    это по branding tier и для SMS?
13. **White-label launch scope:** только organization branding на platform domain или verified custom domain уже в
    первом SaaS launch?
14. **Global-admin intervention:** допускается ли restricted impersonation/support session, или только diagnostics
    и auditable repair actions без входа от имени organization staff?

## 13. Передача в следующие этапы

UX-03 должен использовать этот документ как evidence, а не как готовую role matrix. В первую очередь требуется:

1. зафиксировать BersonCare operating model solo/clinic;
2. выбрать patient record/episode model;
3. определить capability matrix отдельно от filters;
4. назвать handoff primitives;
5. затем строить UX-04 invite journeys и UX-05 branding/domain contract.

До этих решений нельзя считать экран `patients/[userId]`, clinic staff invites или patient organization switcher
готовыми к реализации только на основании внешних продуктов.
