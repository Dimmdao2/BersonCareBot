# UX-02 — Technical patterns: invite, PWA, branding and domains

**Статус:** research evidence, не product decision.

**Дата доступа ко всем внешним источникам:** 2026-07-15.

**Граница:** факты внешних стандартов и продуктов отделены от рекомендаций для BersonCare. Этот документ не меняет текущие identity, tenant или notification contracts.

## 1. Локальный контекст BersonCare

Канонические входы для этого исследования:

- [`REQUIREMENTS.md`](REQUIREMENTS.md) и [`ROADMAP.md`](ROADMAP.md);
- [`PLATFORM_IDENTITY_SPECIFICATION.md`](../../ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md) и [`PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md);
- [`NOTIFICATION_CHANNELS.md`](../../ARCHITECTURE/NOTIFICATION_CHANNELS.md);
- **SUPERSEDED AS AUTHORITY — 2026-07-27:** archived ADR below is historical, not authority; актуальная точка входа для notification policy — строка **«Уведомления»** в [`CURRENT_AUTHORITY_MAP.md`](../../CURRENT_AUTHORITY_MAP.md).
- исторический, но реализованный [`STAFF_PWA_ADR.md`](../../_ARCHIVE/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/STAFF_PWA_ADR.md).

Текущие ограничения, которые будущий UX не должен скрыто менять:

- один канонический `platform_user`; email/password/OAuth или доверенный телефон могут дать patient tier, но native booking отдельно требует trusted phone;
- onboarding patient не выполняет business actions вне серверного activation whitelist;
- Web Push — основной канал после активной подписки; SMS сейчас не входит в patient topic-channel contract;
- patient и staff уже имеют разные manifest identity, но используют один service worker scope `/app`;
- tenant = `Organization`; host/domain может подсказать entry context, но не заменяет membership, enrollment и authorization;
- один staff login имеет одну активную организацию; multi-org staff switcher не проектируется;
- пациент может иметь несколько organization enrollment; данные разных организаций нельзя смешивать;
- внутри одной клиники специалисты могут передавать пациента и, при наличии полномочий, видеть общую историю визитов. UI-фильтр «мои / все пациенты организации» не является security boundary.

## 2. Trusted email invite

### 2.1 Подтверждённые внешние факты

1. OWASP рекомендует URL-токены, созданные криптографически безопасным генератором, достаточно длинные, безопасно хранимые, одноразовые и ограниченные по времени. URL строится из доверенного/allowlisted origin, только по HTTPS; invite-like landing должен защищаться от brute force и утечки токена через referrer. Источник: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
2. Auth0 organization invitation привязан к organization и email: адресат должен войти или зарегистрироваться именно с приглашённым адресом. После срока приглашение становится expired; приложение получает invitation и organization как параметры trusted entry. Источник: [Auth0 — Invite Organization Members](https://auth0.com/docs/manage-users/organizations/configure-organizations/invite-members).
3. WorkOS хранит явные invitation states и timestamps (`pending`, `accepted_at`, `revoked_at`, `expires_at`); принятие создаёт user и organization membership. Источник: [WorkOS — Invitation API](https://workos.com/docs/reference/authkit/invitation).

Это vendor examples, а не обязательная схема BersonCare. Общий устойчивый паттерн — invite является отдельным server-side lifecycle object, а не бессрочной ссылкой или готовой сессией.

### 2.2 Рекомендуемая state machine BersonCare

```text
draft
  -> pending_delivery
      -> delivered | delivery_failed
  -> pending_acceptance
      -> accepted
      -> expired
      -> revoked
      -> superseded

Любое terminal state --(новая отправка)--> новый invite id/token
accepted --(повторный клик)--> login / existing membership, без повторной мутации
```

`delivery_failed` не отменяет сам invite автоматически: специалист может повторить email или добавить SMS-доставку того же либо нового invite согласно выбранной idempotency policy. Для безопасности проще и наблюдаемее при каждом явном resend выпускать новый token, а предыдущий переводить в `superseded`.

Минимальная серверная запись:

| Поле | Назначение |
|---|---|
| `id`, `token_hash` | opaque lookup; raw token не хранится и не логируется |
| `organization_id` | trusted organization context |
| `patient/enrollment intent` | что именно должно быть создано/подтверждено после accept |
| `invited_email_normalized` | binding к адресату |
| `inviter_platform_user_id`, `specialist_id?` | инициатор и клиническая атрибуция, не authority из URL |
| `status`, `expires_at`, terminal timestamps | lifecycle и идемпотентность |
| `supersedes_invite_id?` | цепочка resend без двух действующих ссылок |
| `delivery attempts` | channel, provider result, timestamps; без raw token/PII payload в общих логах |

### 2.3 Acceptance flow

```text
GET trusted join URL
  -> server hashes token and loads invite
  -> generic invalid/expired/revoked/reused state OR safe org-scoped preview
  -> authenticate / activate canonical identity
  -> prove invited email (existing verified email match or verification in this flow)
  -> transactionally re-check pending + expiry + email match
  -> resolve canonical user
  -> create/confirm organization enrollment exactly once
  -> mark accepted with accepted_user_id
  -> first useful organization-scoped patient screen
  -> later install offer
  -> later push education + native permission prompt
```

Рекомендации:

- token доказывает владение полученной ссылкой, но не переносит роль специалиста, organization authority или доступ к данным сам по себе;
- до успешной активации preview показывает только минимальные данные: название/логотип организации, имя пригласившего специалиста при допустимости и маскированный адрес; без ФИО пациента, диагноза, услуги и других clinical details;
- accept выполняется транзакционно и повторно проверяет все условия, чтобы два клика не создали два enrollment;
- email из формы нельзя использовать для смены адресата invite; mismatch ведёт в «Войти другим аккаунтом / запросить новое приглашение»;
- `return_to` не берётся из произвольного URL. Сервер выбирает destination из allowlist по типу invite и итоговому access context;
- invitation URL строится из серверной конфигурации verified domain/canonical origin, а не из request `Host`.

### 2.4 Failure and recovery UX

| Состояние | Безопасный экран | Recovery |
|---|---|---|
| invalid token | нейтральная ошибка без подтверждения существования пациента | войти в существующий кабинет; обратиться к организации |
| expired | «Срок ссылки истёк» + безопасная organization identity, если invite найден | rate-limited resend на уже привязанный адрес или запрос специалисту |
| revoked/superseded | «Ссылка больше не действует» | использовать последнюю ссылку / запросить новую |
| accepted/replayed | не повторять enrollment | вход и переход в существующий organization context |
| logged in as wrong email | показать только маскированный target | switch account; staff отменяет и создаёт invite на исправленный адрес |
| existing canonical user, new org | обычный login, затем новый enrollment | не создавать второй global identity |
| delivery bounce/complaint | staff видит delivery status без raw provider payload | исправить контакт и выпустить новый invite |
| org suspended/invite entitlement lost | не активировать business access | platform-safe support state; сохранить audit trail |

## 3. SMS as fallback

### 3.1 Подтверждённые внешние факты

NIST относит PSTN out-of-band authentication к restricted authenticators и требует учитывать SIM swap, смену устройства и перенос номера. Источник: [NIST SP 800-63B — Restricted Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/).

Следствие ограничено: NIST говорит об authentication, а не запрещает SMS как delivery/reminder channel. Но SMS-клик нельзя автоматически считать более сильным доказательством личности, чем email invite.

### 3.2 Рекомендуемая граница BersonCare

- Email — primary patient invite и адресная identity binding.
- SMS — опциональная доставка/напоминание, если у организации есть разрешённый канал и законное основание; не скрытый default.
- SMS-ссылка не отменяет email match, canonical identity resolution, invite expiry и single-use.
- Если позже понадобится SMS-only activation, это отдельное security/product решение: OTP, rate limit, trusted-phone policy, abuse controls и восстановление номера; простой possession click недостаточен.
- Не помещать clinical details в SMS. Текст: нейтральное приглашение, организация/платформа, срок действия и HTTPS-ссылка.
- Доставка SMS и consent/opt-out observability отделены от статуса принятия invite: `delivered` не означает `accepted`.
- SMS не входит автоматически в существующую матрицу patient notification topics. Invite delivery — отдельный transactional intent.

## 4. PWA install, deep links and notification timing

### 4.1 Подтверждённые внешние факты

| Факт | Источник |
|---|---|
| Manifest `scope` определяет URL installed experience; `start_url` должен находиться в scope и быть same-origin с manifest. | [MDN — manifest scope](https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest/Reference/scope), [MDN — start_url](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url) |
| Manifest `id` задаёт identity приложения; `name`/`short_name` и icons используются ОС/браузером, но конкретный выбор отображаемого имени остаётся за user agent. | [W3C Web Application Manifest](https://www.w3.org/TR/appmanifest/) |
| `beforeinstallprompt` не поддерживается всеми браузерами; его надо сохранить и вызвать из явного UI. На iOS/iPadOS нужен manual Add to Home Screen fallback. | [web.dev — Installation prompt](https://web.dev/learn/pwa/installation-prompt) |
| Notification API работает только в secure context; разрешение имеет `default/granted/denied`. | [MDN — Notification.requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static) |
| На iOS/iPadOS Web Push доступен Home Screen web app; запрос должен следовать прямому действию пользователя. Начиная с iOS/iPadOS 17.2 cookies копируются в новую Home Screen app при установке, non-cookie local storage не копируется, а дальнейшее состояние app отделено от browser. | [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [WebKit — Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) |
| Apple рекомендует вызвать subscription непосредственно из обработчика user gesture и показывать каждое полученное push-событие пользователю. | [Apple — Sending web push notifications](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) |

Deep linking в PWA зависит от browser/OS и installed state; поэтому invite flow не должен обещать, что внешняя ссылка всегда откроется как установленное приложение. Web URL остаётся полным рабочим entrypoint.

### 4.2 Рекомендуемая последовательность

```text
invite accepted
  -> first useful screen (доказать ценность и корректный org context)
  -> contextual install card
      -> native Chromium prompt when available
      -> platform-specific manual instruction otherwise
  -> detect installed/standalone state
  -> explain concrete notification value
  -> explicit “Включить уведомления” gesture
  -> OS/browser permission
      -> granted: create subscription + topic defaults
      -> denied: explain settings recovery, keep email/channel fallback
      -> default/dismissed: defer without nag loop
```

Не объединять системные prompts install и notifications в один первый экран. Install не является условием доступа через обычный browser. Push permission спрашивается после полезного действия/объяснения, не на landing, join preview или до identity activation.

### 4.3 Manifest/branding contract

| Tier | Рекомендуемый manifest |
|---|---|
| Core platform | стабильный patient `id`, platform name/icons, `start_url` в patient hub; organization identity внутри shell |
| Organization identity | те же platform manifest identity и origin; org logo/name на join, header и content, но не отдельная установка на каждую клинику |
| True white-label | отдельный manifest на verified custom origin допустим как отдельная installed identity; требует отдельной проверки sessions, storage, SW, subscriptions, icons и support |

Причина рекомендации: пациент с несколькими организациями должен устанавливать один основной patient app и выбирать organization context внутри него. Org-specific manifest/icon на общем origin создаёт нестабильную identity: один manifest не может честно одновременно представлять несколько организаций. Custom origin, напротив, является отдельным web origin и operational surface, поэтому white-label PWA — отдельный adoption tier, не косметическая настройка.

Manifest assets проходят publish validation: обязательные размеры/форматы, fallback platform icons, contrast-safe theme/background colors, короткое имя без обрезанной двусмысленности. Изменение бренда не должно менять стабильный `id` существующей установленной app.

## 5. Organization branding across surfaces

### 5.1 Подтверждённый внешний паттерн

Auth0 Organizations хранит logo, primary/background colors и применяет их после trusted organization identification; при этом custom domain обычно tenant-level, а не автоматически отдельный домен каждой организации. Источники: [Auth0 — B2B Branding](https://auth0.com/docs/get-started/architecture-scenarios/business-to-business/branding), [Auth0 — Organizations Overview](https://auth0.com/docs/manage-users/organizations/organizations-overview).

Это подтверждает разделение двух сущностей: organization visual identity и domain/sender ownership. Загрузка логотипа не доказывает право отправлять email от домена или обслуживать hostname.

### 5.2 Рекомендуемая surface matrix

| Surface | Core platform | Organization identity | True white-label |
|---|---|---|---|
| platform landing/signup | BersonCare | организация отсутствует | BersonCare acquisition остаётся отдельно |
| public org page/booking | BersonCare + org | org name/logo/colors | org-first + обязательный legal operator disclosure |
| invite email/join | platform sender + org context | «Организация через BersonCare» | verified org sender/domain; safe platform fallback disclosed |
| auth/account recovery | platform trust anchor | org context только из trusted invite/domain mapping | org skin, но identity и support disclosure не исчезают |
| patient shell | platform app + active org context | org header; explicit context switch | отдельный origin/app только в дорогом tier |
| staff shell | BersonCare workspace | org identity in management/clinical header | optional, не скрывает platform/global admin boundaries |
| PWA manifest/icon | platform patient/staff identity | без per-org mutation | per-origin org identity после readiness gates |
| email/SMS/push | platform sender | effective org presentation | verified sender; push title always includes active org/context |
| legal/support/status | platform operator visible | org contacts alongside platform | contractual ownership explicitly assigned; platform recovery remains reachable |

Brand configuration states:

```text
draft -> validation_failed | ready -> published -> suspended/archived
```

`published` означает только визуальную готовность. Domain и sender identity имеют собственные независимые state machines. Эффективный бренд каждого сообщения/страницы вычисляется server-side из organization, entitlement и readiness; клиент не передаёт произвольный logo URL/name/domain.

## 6. Custom domains and redirect safety

### 6.1 Подтверждённые внешние факты

1. Cloudflare for SaaS разделяет hostname ownership validation и certificate validation. Для production traffic нужны active hostname status, active SSL status и DNS, направленный на SaaS target. Источник: [Cloudflare — Hostname validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/).
2. TXT/HTTP pre-validation позволяет проверить владение и выпустить сертификат до DNS cutover. Источник: [Cloudflare — Pre-validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/).
3. Auth0 также показывает независимые состояния domain (`pending_verification`, `ready`, `failed`), verification и certificate (`provisioning` и далее). Источник: [Auth0 — Verify a custom domain](https://auth0.com/docs/api/management/v2/custom-domains/post-verify).
4. OWASP требует строить trusted token URLs не из непроверенного Host header. Источник: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### 6.2 Рекомендуемая domain state machine

```text
requested
  -> ownership_pending
      -> ownership_failed | ownership_verified
  -> certificate_pending
      -> certificate_failed | routing_pending
  -> active
      -> degraded (DNS/cert drift; canonical fallback remains)
      -> suspended
      -> deleting -> deleted
```

UI должен отдельно показывать:

- введённый hostname и organization owner;
- ownership record/status;
- certificate status/expiry or managed renewal;
- routing/DNS target status;
- effective surfaces (public, booking, join, auth, PWA);
- last check, actionable error и canonical platform URL.

### 6.3 Security and redirect invariants

- `normalized_host -> organization_id` — server-managed verified mapping. Не искать организацию по строке, которую клиент прислал в body/query.
- Host выбирает только entry presentation/context candidate. Доступ всегда требует canonical session user + active enrollment/membership + capability.
- Canonical platform URL существует для каждой organization surface независимо от custom-domain state.
- Invite создаётся с organization id в server-side record; host в ссылке выбирается только из `active` verified domains. После lookup токена organization из URL/host не может переопределить organization invite.
- Не принимать произвольный `next`, `redirect_uri` или абсолютный return URL. Использовать route enum/allowlist и относительные нормализованные paths.
- Redirect graph однонаправленный для одного запроса: inactive custom host -> canonical. Canonical не перенаправляет обратно на тот же custom host без явной server-side policy и `active` readiness. Это предотвращает loops.
- При удалении/деградации домена email links, auth callbacks и recovery продолжают работать на canonical origin; старый hostname не переезжает на другую organization без нового proof и quarantine period.
- TLS/DNS success не является entitlement или authorization proof.
- Cookies, OAuth callback allowlists, CSRF origin checks, SW scope и Web Push subscription проверяются для каждого поддерживаемого origin. Нельзя считать custom domain чистым alias на уровне UI.

## 7. Email sender identity and DNS readiness

### 7.1 Подтверждённые внешние факты

- SES требует verified sending identity; custom MAIL FROM использует MX и SPF records и имеет состояния `Pending`, `Success`, `TemporaryFailure`, `Failed`. При MX failure провайдер может fallback на свой MAIL FROM или отклонить отправку — это явная настройка. Источники: [Amazon SES — Creating identities](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html), [Amazon SES — Custom MAIL FROM](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html).
- Gmail sender guidelines требуют authentication; для bulk senders — SPF, DKIM, DMARC, TLS, DNS hygiene и alignment From с SPF или DKIM domain. Источник: [Google — Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en).

Следовательно, display name/logo, verified web hostname и verified mail sender — разные readiness dimensions.

### 7.2 Рекомендуемые sender tiers

| Tier | `From` / display | Reply-To | Failure policy |
|---|---|---|---|
| Platform | verified BersonCare domain; «Организация через BersonCare» | platform или verified org support | отправка через platform identity |
| Org-branded content | тот же verified platform sender, organization name в display/body | только validated address | platform fallback всегда доступен |
| Custom sender | org domain только после DKIM/SPF/DMARC and provider readiness | verified org mailbox | fallback к verified platform sender с explicit disclosure либо hold/reject delivery — owner decision; никогда не spoof org domain |

Sender state machine:

```text
not_configured
  -> dns_pending
      -> verified
          -> active
          -> degraded
      -> failed
  -> revoked
```

Нужно хранить effective sender decision на delivery attempt: organization id, sender identity id, template version, channel, provider message id/status, без raw token и clinical payload в общих логах. Bounce/complaint suppression применяется к адресу платформенно, а не сбрасывается сменой organization branding.

Invite и account/security email являются transactional, отдельно от marketing preferences. Но neutral content, rate limits, bounce/complaint handling и provider observability обязательны. `Reply-To` не должен принимать непроверенный адрес из формы организации.

## 8. Handoff and shared visit history inside one clinic

Это BersonCare-рекомендации, добавленные к technical scope; внешние продукты здесь не используются как authority.

### Authorization invariants

- «Мои пациенты / Все пациенты организации» — только query/UI filter. Он не выдаёт и не отнимает права.
- Read shared history требует одновременно: active staff membership в той же organization, capability на shared clinical history и active/legally retained patient organization enrollment.
- Transfer требует отдельной capability, а не общего права редактировать пациента.
- Межорганизационный transfer не допускается как смена `organization_id`; это новый explicit enrollment/share workflow с отдельным решением о consent и data boundaries.
- Specialist attribution на записи/визите/назначении неизменяема как historical authorship. Передача меняет текущего ответственного, но не переписывает автора истории.
- Ответы API проверяют scope для каждого объекта; скрытая строка в UI не считается защитой.

### Audit invariants

Transfer event минимум содержит `organization_id`, patient canonical id, old/new responsible specialist, actor, timestamp, reason/category и correlation id. Clinical history view/export и особо чувствительные изменения должны быть audit-visible по действующим правилам проекта. Логи не должны печатать invite token или избыточные clinical details.

Рекомендуемая модель состояний ответственности:

```text
unassigned -> assigned(specialist A)
assigned(A) -> handoff_pending(A -> B) -> assigned(B)
assigned(*) -> care_closed

shared history: append-only attribution; не следует за фильтром и не переписывается handoff
```

Нужно отдельное product решение: handoff мгновенный owner/admin action или accept новым специалистом; видит ли бывший ответственный историю после передачи; какие основания/consent нужны для organization-wide history. До решения UI не должен обещать unrestricted «все пациенты».

## 9. Cross-cutting security invariants

1. Raw invite token — bearer secret: не хранить открыто, не логировать, не класть в analytics, очищать из visible URL после server exchange; `Referrer-Policy: no-referrer` на token entry.
2. Все terminal transitions invite/domain/sender идемпотентны и аудируются.
3. Organization context определяется из trusted DB objects; URL, host, brand assets и sender display не являются authorization.
4. Identity acceptance всегда разрешает canonical merge/resolve до session и enrollment mutation.
5. Никаких clinical details до успешной identity + authorization; neutral email/SMS/push lock-screen content по умолчанию.
6. У каждого branded surface видимы recovery/support и фактический оператор, особенно при custom domain failure.
7. Permission denial не обходится другим prompt loop: сохраняется состояние и предлагаются понятные настройки/fallback channels.
8. Domain, sender, branding, entitlement и organization lifecycle проверяются независимо. `active` в одном измерении не активирует остальные.

## 10. Adoption tiers

### Tier A — launch-safe core

- canonical platform domains;
- organization-branded join/email body на verified platform sender;
- single-use email invite, resend/revoke/expiry/replay recovery;
- один platform patient PWA для multi-org пациента;
- contextual install, затем separate push consent;
- SMS отсутствует или только вручную инициированный fallback без auth elevation.

### Tier B — organization identity

- published org public page/booking/join branding;
- organization-aware templates and verified Reply-To;
- sender/domain readiness UI;
- SMS transactional delivery policy and observability;
- patient org switcher, specialist attribution, audited in-org handoff/shared-history capability.

### Tier C — custom domains

- verified hostname + managed TLS + canonical fallback;
- public/booking/join сначала; auth callbacks и PWA только после отдельного origin audit;
- domain lifecycle UI, health checks, degradation and removal quarantine.

### Tier D — true white-label

- verified custom sender domain;
- per-origin manifest/icons/install/push/session support;
- explicit legal/support/operator contract;
- automated readiness monitoring and safe fallback behavior.

Не включать Tier C/D только как visual entitlement: operational ownership, recovery, security и deliverability являются частью capability.

## 11. Decisions deferred to UX-03/04/05

- invite TTL и resend semantics для staff vs patient;
- создаётся ли patient/enrollment intent при отправке или только transactionally при accept;
- допустим ли SMS-only activation и при каких trusted-phone controls;
- какая organization identity допустима в neutral invite до login;
- custom domain launch surfaces: public/booking/join only или также auth/PWA;
- custom sender failure: platform fallback с disclosure или hold delivery;
- handoff acceptance model и post-handoff history visibility;
- граница platform disclosure в paid white-label.

Эти пункты нельзя скрыто решить экраном настроек. Они меняют identity, authorization, compliance или recovery contract.
