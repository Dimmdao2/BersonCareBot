# UX-08 — решения владельца по будущему интерфейсу

> **Статус:** historical decision packet 16.07. Действующие результаты сохраняются только там, где их не изменил
> [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md). Этот packet не источник текущих открытых вопросов и
> не execution plan.

**Статус:** ответы и последующие уточнения владельца от 2026-07-16 интегрированы и подтверждены полным независимым
re-audit `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02` — **PASS**. Исходные варианты сохранены ниже
как история постановки, а действующий результат каждого пункта указан отдельно.
**Дата решения:** 2026-07-16.
**Назначение:** только продуктовые развилки, которые заметно меняют доступ, рабочую модель или объём будущего
публичного SaaS-релиза. Ответ на этот пакет не разрешает deploy и не меняет TEST-only execution scope.

## Как читать пакет

- Действующий provenance всех результатов: ответ владельца в текущем чате 2026-07-16 и
  [`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md).
- `Рекомендация` — позиция планировщика. `Историческая безопасная граница до решения (superseded)` — то, что можно условно заложить в UX-09 без
  фиксации целевой политики. Это разные вещи.
- Исторические `Рекомендация` и `Историческая безопасная граница до решения (superseded)` не заменяют новое решение. Tentative future language
  владельца остаётся deferred, а не превращается в freeze.

## Общая граница запуска — решение владельца

Initial product focus — solo specialist. Multi-specialist clinic, assistant/reception и сложная clinic communication
остаются future architecture-compatible capabilities и не входят в launch scope. Clinic path не должен задерживать
выход текущего продукта.

## Что уже не спрашивается

| Уже зафиксировано или решается без продуктового выбора владельца | Основание | Как идёт дальше |
|---|---|---|
| Продукт ориентирован на специалистов/клиники; patient entry вторичен | `REQUIREMENTS.md` §§1, 3.1, 4 | Один specialist-oriented acquisition contract; конкретную композицию CTA проверяет UX, а не новый owner gate |
| Персонал использует email + пароль, пациент — passwordless OTP; staff invite идёт по email | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §6; `OWNER_DECISIONS_FOR_REVIEW.md`, часть Б | UX-04 contract |
| Tenant — организация; solo practice и clinic используют одну account/tenant model | `SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` D1 | Architecture invariant |
| Owner/admin может одновременно быть специалистом | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §17 | Пункт 04 выбирает только интерфейс между уже разрешёнными поверхностями |
| UX-фильтр «Мои пациенты» нужен и не создаёт новую tenant-стену | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §7 | Пункт 01 уточняет его продуктовый смысл и clinical-history policy |
| Внутренний список организаций не публикуется; возможный каталог использует отдельную public projection | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §12 | Пункт 06 выбирает только будущий release scope каталога |
| Тарифы и механики настраивает global admin через полный конструктор | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §3; upstream gate OM-8 | UX-09 задаёт per-mechanic lifecycle/degradation; OM-8 не эскалируется как один искусственный yes/no вопрос |
| Owner-only irreversible account/ownership actions и least-privilege delegation admin являются безопасной SaaS-базой | `ROLE_CAPABILITY_MATRIX.md` §2; `UX03_CAPABILITY_ARCH_REVIEW.md` §§3.2–3.3 | UX-09 проектирует capability presets; точные делегируемые grants остаются конфигурацией, а не скрытым owner ruling |
| У platform owner нет общего запрета на доступ к базе; patient-level behavior не является обычной SaaS-аналитикой | `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §5 | Пункт 10 выбирает только продуктовую support surface |
| Token/TTL, RLS, Postgres roles, idempotency, DNS/TLS readiness, обязательные 2FA mechanics и текущие дефекты | UX-03…07 security/architecture contracts | Инженерные/security gates; exact factor/roles/grace проходит отдельный security-policy freeze и до него fail-closed, а не считается готовым |

## Краткая карта решений

| ID | Развилка | Условная ветка UX-09 |
|---|---|---|
| 01 | Clinic patient card/history/`Мои` | Patient-history and clinical-permissions epic |
| 02 | Handoff launch scope and acceptance | Team collaboration epic |
| 03 | Assistant launch workspace | Operations/permissions epic |
| 04 | Dual-role owner/admin navigation | Staff shell/navigation epic |
| 05 | Patient multi-org neutral start | Patient context epic |
| 06 | Future public release scope | Public acquisition/publication epic |
| 07 | Organization branding versus white-label depth | Branding/presentation epic |
| 08 | Custom-domain and per-origin PWA scope | Domain/origin/PWA epics |
| 09 | Custom sender failure policy | Delivery policy/sender-health epic |
| 10 | Platform patient-level support surface | Platform support-intervention epic |
| 11 | Patient relationship before portal activation | Patient-invite/enrollment epic |
| 12 | Organization communication topology | Clinical communications epic |

Пункты 07 и 08 не дублируются: 07 определяет, насколько глубоко меняется визуальная идентичность, а 08 — какие
origins и устанавливаемые приложения вообще поддерживаются. Пункт 01 намеренно объединяет карточку, доступную
историю и смысл `Мои`: раздельные ответы дали бы противоречивую композицию одного patient workbench.

## Решения

### UX08-01 — карточка пациента и история внутри клиники

- **Статус:** `resolved launch`.
- **Решение владельца:** вариант 1 с уточнением: видимость пациента у специалиста появляется через фактический или
  запланированный визит/клиническую связь. По умолчанию видны его события; всю разрешённую историю организации и
  фильтр другого специалиста можно открыть по праву. Никакого primary specialist не вводится.
- **Историческое основание до решения (superseded), не текущий gate:** сводит OM-4/OM-5; исходный owner addendum в `REQUIREMENTS.md` §3.4; обязательность
  фильтра — `OWNER_RULINGS_2026-07-15.md` §7; candidates — `OPERATING_MODEL.md` §6.
- **Вопрос:** какую общую картину пациента должен видеть специалист клиники?
- **Варианты:**
  1. Одна карточка клиники; `Мои пациенты` — текущая ответственность/команда/активная работа; timeline по умолчанию
     показывает мои события, а `Вся доступная история` и конкретный специалист доступны после проверки права.
     Ограниченные записи остаются закрытыми по отдельной visibility policy.
  2. Одна карточка клиники; каждый специалист с базовым клиническим доступом сразу видит всю обычную историю клиники,
     кроме явно ограниченных классов.
  3. Отдельная карточка у каждого специалиста; общая история существует как отдельный clinic-wide режим.
- **Рекомендация планировщика:** вариант 1 — цельная история без перегрузки ежедневного режима и без обещания
  доступа к ограниченным записям.
- **Историческая безопасная граница до решения (superseded):** проектировать общий card shell, но показывать только own/assigned operational
  scope и собственные/разрешённые события; не фиксировать shared-history access и не создавать per-specialist route
  tree до ответа.
- **Последствия:** patient roster, card/timeline, record-class visibility, search/count/direct read/export parity,
  авторство и private-entry presentation.
- **Экраны / эпики:** `CLIN-02`, `CLIN-03`, `CLIN-04`; patient-history + clinical-permissions epics.
- **Исторический UX-09 до ответа (superseded):** общие shell/data-contract epics — да; точная history/access policy — conditional only.

### UX08-02 — что запускаем как «передачу пациента»

- **Статус:** `rejected premise`.
- **Решение владельца:** варианты 1–3 отвергнуты. Сейчас «передать» означает записать пациента на визит к другому
  специалисту; связь этого визита делает пациента видимым новому специалисту. Нет primary/care team, accept/reject,
  отдельного handoff lifecycle или cross-organization transfer.
- **Историческое основание до решения (superseded), не текущий gate:** сводит OM-6/OM-7; owner addendum в `REQUIREMENTS.md` §3.4; четыре разные semantics —
  `OPERATING_MODEL.md` §7.
- **Вопрос:** какой набор same-organization действий нужен в первой версии и требуется ли подтверждение получателя?
- **Варианты:**
  1. Primary specialist + care team + передача поддержанных задач/визитов; specialist-initiated primary handoff
     требует accept/reject. Cross-organization transfer не входит.
  2. Только смена primary specialist с accept/reject; care team и object-level reassignment позже.
  3. Уполномоченный owner/admin меняет primary specialist сразу; остальные collaboration mechanics позже.
- **Рекомендация планировщика:** вариант 1; admin override — отдельное аудируемое исключение. История/авторство не
  переписываются, дальнейшая видимость бывшего специалиста следует обычной policy пункта 01.
- **Историческая безопасная граница до решения (superseded):** не показывать общую кнопку `Передать пациента`; разрешать только уже
  определённые actions конкретного визита/задачи. Cross-org workflow отсутствует.
- **Последствия:** collaboration UI, request lifecycle, accept/reject/cancel, notification ownership, deactivation
  preflight/recovery и post-handoff visibility.
- **Экраны / эпики:** `CLIN-05`, collaboration panels в `CLIN-03`, recovery queue; team-collaboration epic.
- **Исторический UX-09 до ответа (superseded):** state/data contracts — да; реализация переходов — conditional only.

### UX08-03 — рабочая зона ассистента

- **Статус:** `resolved launch`.
- **Решение владельца:** assistant/receptionist отсутствует в initial release. Роль можно заложить архитектурно для
  будущего платного/configurable clinic product; точные grants не выбраны и не являются launch blocker.
- **Историческое основание до решения (superseded), не текущий gate:** сводит OM-2; роль зафиксирована в `REQUIREMENTS.md` §2; тогдашний unresolved baseline —
  `OPERATING_MODEL.md` §4.
- **Вопрос:** какие повседневные задачи ассистент выполняет в первой версии?
- **Варианты:**
  1. Расписание, intake, контакты/демография, приглашения, non-clinical message routing и операционные payment
     statuses; без clinical history, назначений и авторства.
  2. Узкий режим: расписание, intake и приглашения.
  3. Настраиваемые permission templates, включая ограниченное чтение явно выбранных частей истории.
- **Рекомендация планировщика:** вариант 1 как полезный bounded operations baseline; custom templates — позже.
- **Историческая безопасная граница до решения (superseded):** только отдельно выданные schedule/intake/contact/invite actions; clinical read,
  export и write запрещены, OPS-04 отсутствует без явного grant.
- **Последствия:** first workspace, navigation, staff-invite role summary, queues, payment/contact widgets и permission
  setup.
- **Экраны / эпики:** `OPS-01…04`, `STF-08`; assistant operations + permission-presets epics.
- **Исторический UX-09 до ответа (superseded):** bounded shell — да; точный module/grant set — conditional only.

### UX08-04 — навигация owner/admin, который также работает специалистом

- **Статус:** `resolved launch`.
- **Решение владельца:** один login и отдельная понятная management surface. На старте это может быть простая
  страница/раздел меню; switch `Работа / Управление` допустим, если нужен. Точная композиция — implementation choice,
  не новый product gate.
- **Историческое основание до решения (superseded), не текущий gate:** сводит OM-1; владелец подтвердил dual role и назвал допустимыми несколько UI-подходов,
  но не выбрал один — `OWNER_RULINGS_2026-07-15.md` §17; candidate — `OPERATING_MODEL.md` §3.
- **Вопрос:** как переключаться между клинической работой и управлением организацией?
- **Варианты:**
  1. Один login и явный switch `Работа / Управление` с двумя короткими navigation sets.
  2. Одно общее меню с двумя хорошо различимыми группами.
  3. Два entrypoint/cabinet shell под одной авторизацией.
- **Рекомендация планировщика:** вариант 1 — контексты различимы без повторного входа.
- **Историческая безопасная граница до решения (superseded):** планировать management и clinical destinations как независимые capability-gated
  surfaces и не замораживать общий shell; prototype option 1 остаётся candidate. У owner/admin без specialist binding
  clinical entry отсутствует.
- **Последствия:** desktop/mobile navigation, default destination, breadcrumbs, deep links и route restoration.
- **Экраны / эпики:** `MGMT-* ↔ CLIN-*`, shared `ACC-*`; staff shell/navigation epic.
- **Исторический UX-09 до ответа (superseded):** guards/routes — да; финальная shell composition — conditional only.

### UX08-05 — старт пациента с несколькими организациями

- **Статус:** `resolved launch`.
- **Решение владельца:** вариант 1 для platform app: последняя доступная организация + заметный switcher; без
  валидного выбора — chooser. Будущее branded/custom-origin приложение закреплено за одной организацией без
  switcher; оно может сосуществовать с platform app. Последующее уточнение выбрало generated organization PWA как
  будущую web capability и исключило separate native org app из текущего scope.
- **Историческое основание до решения (superseded), не текущий gate:** сводит OM-3; multi-org UX входит в исходную задачу — `REQUIREMENTS.md` §§1, 3.5;
  candidate — `OPERATING_MODEL.md` §5.
- **Вопрос:** что открывать при neutral login/launch пациента с несколькими active enrollments?
- **Варианты:**
  1. Последнюю успешно открытую организацию; persistent switcher всегда заметен.
  2. Каждый neutral entry сначала открывает chooser.
  3. Neutral organization overview без объединения clinical data, затем вход в выбранную.
- **Рекомендация планировщика:** вариант 1; без валидной preference — chooser. Verified invite/booking/deep link
  открывает только свой разрешённый context и явно сообщает о смене.
- **Историческая безопасная граница до решения (superseded):** chooser при любой неоднозначности; remembered/revoked relationship не выбирается
  молча и не подменяется другой организацией.
- **Последствия:** patient home, first installed launch, switcher, push/deep-link recovery и brand context.
- **Экраны / эпики:** `PAT-01`, `PAT-02`, `MOR-01…05`; patient-context resolver/switcher epic.
- **Исторический UX-09 до ответа (superseded):** resolver/switcher — да; neutral-start composition — conditional only.

### UX08-06 — публичные поверхности будущего SaaS-релиза

- **Статус:** `resolved launch`.
- **Решение владельца:** вариант 1: platform landing, organization profiles, booking и join; общий directory позже.
- **Историческое основание до решения (superseded), не текущий gate:** сводит BD-6; platform/org public needs — `REQUIREMENTS.md` §§3.1–3.2; допустимость
  отдельного public directory — `OWNER_RULINGS_2026-07-15.md` §12. Текущий execution остаётся TEST-only по §9–10.
- **Вопрос:** какие public surfaces должны войти в первую будущую публичную версию?
- **Варианты:**
  1. Platform landing + organization profiles + booking + join; общий directory позже.
  2. Вариант 1 + public organization directory/search.
  3. Только platform landing и direct booking/join links; organization profiles и directory позже.
- **Рекомендация планировщика:** вариант 1 — организация уже получает собственную acquisition surface, а release не
  зависит от качества общего directory.
- **Историческая безопасная граница до решения (superseded):** UX-09 разделяет landing, profile/projection, booking/join и directory на
  независимые epics; `PUB-06` не попадает в базовую navigation и никакой публичный rollout не предполагается без
  отдельного разрешения.
- **Последствия:** landing navigation, publication workflow, SEO/content operations, catalog quality и release gates.
- **Экраны / эпики:** `PUB-01…06`, `ORG-PUB-01…03`; public acquisition/publication/directory epics.
- **Исторический UX-09 до ответа (superseded):** contracts и независимые epics — да; общий release bundle — conditional only.

### UX08-07 — граница organization branding и paid white-label

- **Статус:** `resolved future capability`.
- **Решение владельца:** платное полное брендирование работает на собственном домене организации либо platform
  subdomain. Организация задаёт своё name/logo и полностью заменяет product-facing branding на этой поверхности.
  Per-clinic layout/theme/design customization не планируется. BersonCare остаётся platform/personal brand вне
  paid branded org surface. Решение не обещает видимый BersonCare внутри fully branded surface; exact legal/support/
  security information and presentation определяются позднее применимым правом, договорами и security contract.
- **Историческое основание до решения (superseded), не текущий gate:** branding входит в исходную задачу — `REQUIREMENTS.md` §§1, 4; тогда pending BD-1/BD-4 —
  `BRANDING_DOMAIN_CONTRACT.md` §12.
- **Вопрос:** насколько paid white-label скрывает platform brand и распространяется ли он на staff workspace?
- **Варианты:**
  1. Public/booking/join/patient surfaces — organization-first; staff остаётся узнаваемым BersonCare workspace с org
     identity. Operator/legal/account-recovery disclosure сохраняется там, где необходимо.
  2. Organization-first presentation распространяется и на staff workspace; platform остаётся в legal/security/help.
  3. В первой версии только logo/colors/contacts организации без обещания true white-label.
- **Рекомендация планировщика:** вариант 1 — глубокая client-facing identity при стабильном supportable staff app.
- **Историческая безопасная граница до решения (superseded):** P/O presentation only: platform trust anchor + core organization context; W
  visuals и скрытие platform chrome не обещаются.
- **Последствия:** tariff promise, public/patient/staff shells, legal/support copy, design/QA matrix и brand resolver.
- **Экраны / эпики:** W-variants `PUB/ORG-PUB/PAT/MGMT/ACC`, `MGMT-04`; branding/presentation epic.
- **UX-09 после ответа:** U7 фиксирует единый product layout и brand resolver; full branded origin остаётся
  post-launch capability, а не pending owner gate.

### UX08-08 — custom domain и отдельное устанавливаемое приложение

- **Статус:** `resolved staged future capability`.
- **Решение владельца:** сначала platform web app; staff/clinic продукт остаётся web app и может устанавливаться как
  desktop PWA. Для branded/business tier organization PWA может автоматически генерироваться из verified
  domain/subdomain + org name/logo/manifest. Separate organization-branded native mobile app не входит в текущий
  scope; store/account/publication/cost/time — non-blocking research backlog.
- **Историческое основание до решения (superseded), не текущий gate:** domain/PWA входят в исходную задачу — `REQUIREMENTS.md` §§1, 4; architecture direction —
  `SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` D6; тогда pending BD-2/BD-5 — `BRANDING_DOMAIN_CONTRACT.md` §12.
- **Вопрос:** какие surfaces работают на custom domain в первой версии и нужен ли сразу отдельный org PWA brand?
- **Варианты:**
  1. Custom domain для public profile, booking и join; auth и единые patient/staff PWA остаются platform-owned.
  2. Добавить auth на verified domain, но сохранить единые platform PWA.
  3. Full per-origin white-label: auth и отдельный patient PWA с собственными name/icon/install/push.
- **Рекомендация планировщика:** вариант 1; auth и per-origin PWA — отдельные readiness stages после устойчивых
  public bindings.
- **Историческая безопасная граница до решения (superseded):** canonical platform URLs и стабильные platform patient/staff PWA для всех
  surfaces; custom-domain/auth/W-PWA epics остаются выключенными и условными.
- **Последствия:** manifest/install/push, session handoff, origin/cookie/CSRF/OAuth QA, support и стоимость release.
- **Экраны / эпики:** `MGMT-05`, `PAT-11`, `ACC-04`, W auth/join/public bindings; domain-base, surface-binding,
  auth-origin и W-PWA epics.
- **UX-09 после ответа:** platform launch — без U8; U8A/B описывают будущий custom origin и generated PWA без
  native-org-app promise.

### UX08-09 — поведение при отказе custom email/SMS sender

- **Статус:** `resolved launch`.
- **Решение владельца:** вариант 2 с дополнениями. После настройки custom email provider patient/user email не
  использует platform email sender; после настройки custom SMS provider patient/user SMS не использует platform SMS
  sender. Retry идёт только через custom provider соответствующего канала в пределах `expires_at`; expired не
  отправляется. Sender-health incident без patient content даёт owner/solo in-app alert + platform service email на
  account email, затем максимум daily reminder и recovery notice. Численные defaults и transport classification —
  engineering policy из `BRANDING_DOMAIN_CONTRACT.md` §7.1, не вопрос владельцу.
- **Историческое основание до решения (superseded), не текущий gate:** коммерческая fallback/hold policy тогда оставалась открытой в `BRANDING_DOMAIN_CONTRACT.md`
  §7.1/BD-3. DNS/provider readiness и запрет spoofing уже являются engineering/security invariants и не спрашиваются.
- **Вопрос:** можно ли использовать verified platform sender, когда sender организации недоступен?
- **Варианты:**
  1. Transactional/account messages отправляются от platform sender с явной org attribution; marketing/custom-only
     delivery удерживается.
  2. Все сообщения удерживаются до восстановления custom sender.
  3. Все допустимые classes, включая marketing, переходят на platform sender с org attribution.
- **Рекомендация планировщика:** вариант 1 — activation/security delivery сохраняется без ложного branded sender.
- **Историческая безопасная граница до решения (superseded):** при неизвестном message class ничего не отправлять; verified platform fallback
  разрешать только для заранее классифицированных mandatory account/security transactions, custom-only/marketing
  удерживать. Sender identity никогда не подделывать.
- **Последствия:** contractual white-label promise, delivery policy, sender health, templates, recovery и audit.
- **Экраны / эпики:** `MGMT-06`, invite/delivery recovery states; delivery-policy + sender-health epic.
- **Исторический UX-09 до ответа (superseded):** sender readiness/audit — да; fallback policy constant by class — conditional only.

### UX08-10 — patient-level support workflow platform admin

- **Статус:** `rejected premise`.
- **Решение владельца:** patient-level browsing/session/repair для global admin не создаётся. Global admin получает
  aggregate/org/platform diagnostics и support reports. Patient data исправляют авторизованные patient/doctor через
  продуктовый UI; platform team исправляет system/code defects, а не records пациента.
- **Историческое основание до решения (superseded), не текущий gate:** owner has platform-wide DB authority, но patient behavior не относится к ordinary SaaS
  analytics — `OWNER_RULINGS_2026-07-15.md` §5; product surface была поставлена как вопрос в раннем
  `OPERATING_MODEL.md` §3/§9 и теперь отвергнута dated ruling.
- **Вопрос:** нужен ли в первой версии отдельный интерфейс patient-level support intervention?
- **Варианты:**
  1. Organization diagnostics и безопасные repair/retry actions; patient-level support session позже.
  2. Сразу purpose-specific read-only support session с причиной, ограниченным временем и audit trail.
  3. Такой session + отдельно подтверждаемые repair actions над разрешёнными patient objects.
- **Рекомендация планировщика:** вариант 1; read-only session — отдельный последующий epic, write repair — только по
  доказанной support-потребности.
- **Историческая безопасная граница до решения (superseded):** не создавать patient-level browsing/session; оставить только уже существующие
  aggregate/org diagnostics. Новые repair actions также требуют отдельного object contract.
- **Последствия:** `PLAT-09`, support training, purpose/audit UX, escalation and repair ownership.
- **Экраны / эпики:** `PLAT-07…09`; platform support-intervention epic.
- **Исторический UX-09 до ответа (superseded):** diagnostics inventory — да; patient support session/repair — conditional only.

### UX08-11 — когда появляется relationship пациента при приглашении персоналом

- **Статус:** `rejected premise`.
- **Решение владельца:** staff сразу может создать patient card/relationship и appointment/visit по имени, телефону
  и необязательному email; walk-in card+visit создаётся без booking. Portal activation отдельно связывает verified
  email/phone identity с существующей карточкой/программой. Self-booking — дополнительный, не обязательный entry.
- **Историческое основание до решения (superseded), не текущий gate:** literal question in `REQUIREMENTS.md` §5 and carried UX-04 decision in
  `ENTRY_AND_INVITE_JOURNEYS.md` §§7, 13. Security contract already requires that delivery and an unproved invite do
  not masquerade as accepted identity or portal access; it does not choose the staff-side business lifecycle.
- **Вопрос:** что должен создать специалист до того, как пациент подтвердил приглашение?
- **Варианты:**
  1. Patient/intake shell + explicit enrollment intent; active portal enrollment is created/confirmed exactly once
     only after canonical identity proof and acceptance.
  2. Active organization enrollment is created by authorized staff immediately, but remains visibly
     `portal_not_activated`; invite acceptance only binds the canonical identity and never claims prior proof.
  3. No patient relationship before acceptance; staff sees only a pending invite/contact record until activation.
- **Рекомендация планировщика:** вариант 1 — staff can track intake without turning message delivery into portal
  identity or hiding the activation boundary.
- **Историческая безопасная граница до решения (superseded):** persist only an explicit intent/pending portal state; no active portal access,
  clinical disclosure or `activated` status before recipient proof. An already authorized manual enrollment remains
  a separately named lifecycle, not an invite side effect.
- **Последствия:** staff roster labels, manual patient creation, duplicate resolution, invite idempotency, booking
  convergence, retention and migration/backfill semantics.
- **Экраны / эпики:** `CLIN-02`, `CLIN-03`, `MGMT-02`, `PIN-01…09`; patient-invite/enrollment epic.
- **Исторический UX-09 до ответа (superseded):** invite/proof/delivery contracts and pending-intent UI — да; active-enrollment timing branch —
  conditional only.

### UX08-12 — структура коммуникаций пациента с организацией

- **Статус:** `resolved launch`.
- **Решение владельца:** launch сохраняет текущий solo-specialist chat без изменений. Clinic topology остаётся
  future/configurable: per-specialist, receptionist/assistant routing или owner routing. Сейчас её не freeze и не
  реализовывать.
- **Историческое основание до решения (superseded), не текущий gate:** literal open choice in `REQUIREMENTS.md` §5. `OPERATING_MODEL.md` fixes organization as
  care context and truthful author/recipient attribution, but no owner ruling chooses one organization chat,
  specialist chats or explicit threads.
- **Вопрос:** как пациент и команда клиники видят переписку в первой версии?
- **Варианты:**
  1. Organization-scoped conversation threads by purpose/care episode; every message shows author/specialist and
     explicit response destination.
  2. One organization inbox/chat with visible message author and internal routing to responsible staff.
  3. Separate patient↔specialist conversations; organization operations messages remain a distinct channel.
- **Рекомендация планировщика:** вариант 1 — organization context stays stable while clinical and operational
  conversations remain attributable and routable.
- **Историческая безопасная граница до решения (superseded):** keep existing explicitly authorized message objects only; every visible message
  must show organization, author and reply target. Do not add an organization-wide unified inbox, cross-specialist
  visibility or a new thread model before the ruling/data contract.
- **Последствия:** `PAT-05`, `CLIN-07`, `OPS-04`, unread counts, notification routing, private/clinical visibility,
  handoff continuity and export/search parity.
- **Экраны / эпики:** `PAT-05`, `CLIN-07`, conditional `OPS-04`; clinical-communications epic.
- **Исторический UX-09 до ответа (superseded):** attribution/authorization parity and safe existing-message composition — да; target topology
  and migrations — conditional only.

## Полная сверка upstream-решений

Эта таблица не добавляет скрытых rulings. Она классифицирует literal items из `REQUIREMENTS.md` и UX-03…05 как
dated outcome, invariant, implementation policy или non-blocking future backlog. Pending owner gates launch = `0`.

| Upstream choice | Классификация и источник | Execution consequence |
|---|---|---|
| Один onboarding с развилкой solo/clinic или отдельные CTA | Planner recommendation + safe default: one account flow with optional practice-shape composition; `ENTRY_AND_INVITE_JOURNEYS.md` §5 | U3S implements one identity/tenant path; copy/branch can be tested without a second account model |
| Signup result, owner membership, specialist binding and first-run | Architecture/security contract: `OPERATING_MODEL.md` §2; `ENTRY_AND_INVITE_JOURNEYS.md` §5 | U3S must close deferred binding, secure retry/session and first-run security before clinical actor success |
| Solo specialist vs clinic specialist composition | Existing owner requirement + approved operating invariant: one organization/account and shared components, but solo omits meaningless team/filter chrome while clinic exposes only capable collaboration/history controls; `REQUIREMENTS.md` §3.4, `OPERATING_MODEL.md` §3 | U2/U5 stages use capability/composition variants, never parallel solo/clinic route trees |
| Assistant scope | Owner ruling: absent from initial release; future design outside current scope | No OPS launch surface; architecture reservation only, no pending owner question |
| Dual-role owner/admin navigation | Owner ruling: one login, distinct management surface | Simple page/menu first; switch is implementation choice |
| Card, `Мои`, shared history and private classes | Owner ruling: one card, visit relation, own events default, authorized history on demand | U5B; private classes still enforced |
| Rejected transfer hierarchy/acceptance premise | Rejected premise | No lifecycle; future clinic may only use an ordinary appointment concept |
| Patient neutral multi-org start | Owner ruling: last active + visible switcher; invalid preference → chooser | U5A platform app; org-specific app pinned later |
| Communication topology | Owner ruling: current solo chat at launch; clinic topology outside current scope | No new clinic topology in launch; non-blocking backlog only |
| Entitlement packaging/degradation | Existing owner ruling on configurable mechanics plus architecture invariant capability-before-entitlement: `OWNER_RULINGS_2026-07-15.md` §3; OM-8 | Per-mechanic lifecycle is implementation contract; no new bundle-wide yes/no gate |
| Owner vs delegated admin and non-clinical access | Existing least-privilege role contract: owner-only irreversible account/ownership actions; explicit delegated grants; no clinical authorship from management role, `ROLE_CAPABILITY_MATRIX.md` §2 and `UX03_CAPABILITY_ARCH_REVIEW.md` §§3.2–3.3 | U1/U2 capability presets and denial parity; exact grants remain configuration, not a reconstructed owner ruling |
| Cross-organization patient transfer | Rejected as part of current transfer premise | No current workflow or U5C state machine |
| Staff 2FA factors/roles/grace/step-up | Architecture/security invariant + source: complete factor enrollment, verification, recovery and session revocation are mandatory; exact factor/role/grace is resolved by a reviewed security-architecture contract, `ENTRY_AND_INVITE_JOURNEYS.md` §§5–6 | U3S/U3A cannot claim completion before that contract; until freeze high-risk owner actions fail closed |
| Invite TTL/resend timing and terminal replay | Engineering/security invariant: `ENTRY_AND_INVITE_JOURNEYS.md` §§2–3, 11 | Configurable/rate-limited timing; fresh token/invite, immutable attempts and exactly-once are mandatory |
| Additive patient+staff persona wording/support | Architecture/security invariant: no overwrite; UX copy is planner-owned recovery, `ENTRY_AND_INVITE_JOURNEYS.md` §§2, 13 | Fail closed until sanctioned additive-persona path; no owner product choice is invented |
| Staff patient creation vs portal activation | Owner ruling: card/relationship + scheduled/walk-in visit first; verified portal identity links later | U3B named implementation scope; delivery is not proof/access |
| SMS-only activation | Planner recommendation + safe default: out of launch; `ENTRY_AND_INVITE_JOURNEYS.md` §8 | SMS remains transport-only; phone-only identity needs a separately funded trust/security contract |
| Booking activation channel when phone+email exist | Planner recommendation + safe default: strongest already trusted channel, no silent identity merge; `ENTRY_AND_INVITE_JOURNEYS.md` §9 | U3B preserves booking and routes ambiguity to recovery; channel selection remains policy-configurable after proof |
| Invite expiry/wrong-recipient/replay behavior | Engineering/security invariant: `ENTRY_AND_INVITE_JOURNEYS.md` §11 | No mutation from terminal/wrong-recipient token; support/resend creates a fresh lifecycle |
| Public scope/directory | Owner ruling: landing/profile/booking/join; directory later | U6A/U6B; no directory in initial nav |
| Paid brand depth/platform disclosure/staff workspace | Owner ruling: own domain or platform subdomain, org name/logo replace product-facing branding; shared design/layout | U7/U8 preserve one product layout; no required visible BersonCare is inferred; exact legal/support/security presentation follows later applicable contracts |
| Custom-domain/auth/installed app | Future capability: generated org PWA from domain/subdomain + brand manifest; separate org native app out of current scope | Platform web app first; U8A/B future only; native research does not block |
| Sender identity and degraded policy | Owner ruling: no platform fallback once custom provider configured; engineering policy owns bounded retries/expiry/retention | U8C applies standards-backed configurable defaults; no spoof/fallback |
| Platform patient support intervention | Rejected premise | Aggregate/org/platform diagnostics only; no patient record repair |

## Текущий результат

Ответы перенесены в датированный rulings artifact. Для solo-first launch осталось **0 pending owner product
decisions**. Future assistant grants, clinic communication topology и separate organization native app сохраняются
как non-blocking backlog, а sender timing/retention — engineering configuration. Это не утверждает, что future
clinic/native product полностью спроектирован. Последние уточнения ожидают полного независимого аудита.
