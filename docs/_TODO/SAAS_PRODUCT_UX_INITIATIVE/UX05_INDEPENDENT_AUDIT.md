# UX-05 — Independent product and architecture audit

**Historical pre-ruling notice (2026-07-16):** этот PASS предшествует
[`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Он сохраняется без переписывания как evidence для
неизменившейся части прежнего scope, но **superseded for current normative acceptance** и не подтверждает
интеграцию новых owner outcomes. Текущий канон ожидает полный re-audit.

**Дата:** 2026-07-15

**Первичный вердикт:** **FAIL — consolidated correction required before UX-05 closure.**

**Финальный вердикт после полного re-audit:** **PASS.**
**Scope:** полный аудит `BRANDING_DOMAIN_CONTRACT.md` и `BRANDING_CAPABILITY_MATRIX.md`; application code, DB,
тарифы и остальные product artifacts не изменялись.

## 1. Канон и evidence

Проверены целиком:

- initiative `README.md`, `REQUIREMENTS.md`, `ROADMAP.md`;
- `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`;
- `UX02_PRODUCT_PATTERNS.md`, `UX02_TECHNICAL_PATTERNS.md`;
- `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md` как смежный journey contract;
- `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md`;
- текущие code facts: patient manifest `apps/webapp/src/app/manifest.ts`, staff manifest
  `apps/webapp/src/shared/lib/pwa/staffPwaManifest.ts`, entitlement registry
  `apps/webapp/src/modules/org-entitlements/types.ts`, settings registry и support resolver
  `apps/webapp/src/modules/system-settings/{types.ts,supportContactUrl.ts}`.

Текущий runtime baseline в drafts описан честно: patient и staff имеют стабильные platform manifests
(`id=/app` и `id=/app-staff`) при общем scope `/app`; registry содержит только `branding` и `custom_domain`;
`support_contact_url`, SMTP и VAPID пока platform settings; готовые org-brand, verified-host, custom-sender и
per-origin PWA contracts кодом не подтверждены.

## 2. Что прошло аудит

- Все обязательные поверхности из roadmap присутствуют: platform landing, organization profile, booking,
  join/auth, patient/staff shells, install/manifest, email/SMS/push, legal/support и domain management.
- Platform landing остаётся specialist-oriented и platform-owned; patient entry вторичен.
- Tenant/authorization boundary корректен: Host, slug, logo, manifest, sender и UI context не дают membership,
  enrollment или object access. Trusted object и server-resolved relationship имеют приоритет.
- P/O/W presentation не объявлена одним organization-wide флагом. `branding`, `custom_domain`, sender и W PWA
  правильно разведены как разные entitlement/readiness axes; capability проверяется до entitlement.
- Canonical fallback направлен custom → platform и не отправляет platform route обратно автоматически. Открытые
  redirect targets, request-derived callback origins и перенос raw bearer token исключены.
- Platform manifest identity не мутирует при выборе другой organization. W PWA вынесена в отдельный origin gate с
  sessions/cookies, CSRF/OAuth, service worker/cache, push, legal/support и browser smoke.
- Custom email/SMS identity не выводится из web-domain или logo. При деградации spoofing запрещён; fallback versus
  hold/reject оставлен незакрытым product/compliance gate с безопасным временным поведением.
- Legal operator, account recovery, platform status и platform support остаются достижимыми при white-label и
  деградации.
- Multi-org patient использует одну platform app; enrollment перепроверяется, а W app не перекрашивается молча в
  другую organization.

Эти части не требуют локального переписывания. Findings ниже имеют общие причины и должны исправляться одним
согласованным pass, а не серией точечных патчей.

## 3. Consolidated findings

### F1 — Domain readiness заявлена per-surface, но lifecycle остаётся all-or-nothing

**Root cause:** hostname lifecycle и surface publication смешаны в одном `active`.

Контракт сначала устанавливает независимость readiness и вычисление tier по каждой surface. Capability matrix также
задаёт `Domain surface = ownership + TLS + routing + ... + surface-specific audit`. Но domain lifecycle имеет один
`active`, который требует пройти audit **каждой enabled surface**. Поэтому неготовый auth или patient PWA способен
логически лишить `active` уже безопасные public profile/booking/join. Это противоречит и per-surface модели, и
предлагаемому launch order `public/booking/join first; auth/PWA later`.

**Риск:** implementation сделает один общий switch; сбой optional W PWA или OAuth callback выключит публичную
страницу/booking либо, наоборот, общий `active` ошибочно будет воспринят как готовность auth/PWA.

**Correction brief:**

1. Разделить `HostnameBase` и `HostnameSurfaceBinding`.
2. Base lifecycle должен отвечать только за normalized ownership, DNS proof, TLS, routing, org lifecycle,
   entitlement/decommission и quarantine.
3. Для каждой surface (`public_profile`, `booking`, `join`, `auth`, `patient_pwa`, `staff_pwa`) определить отдельные
   `disabled / pending_audit / active / degraded / suspended` и required audit tuple.
4. Effective resolver должен возвращать readiness/fallback для конкретной surface; failure одной binding не меняет
   успешные sibling bindings.
5. Domain UI должен показывать base health и отдельную таблицу surface statuses; acceptance scenarios должны включить
   `public active + auth pending`, `booking active + PWA failed` и selective decommission.

### F2 — Обязательный organization context не отделён от платного branding

**Root cause:** core trust/context payload и paid visual/content customization используют одно слово
`organization-aware`.

Матрица одновременно говорит:

- org name as trusted context — core/always;
- organization-aware email/SMS/push content — `branding` mechanic;
- при отключённом `branding` org name/context всё равно показывается where required.

Для join, patient invite, booking confirmation, patient shell и transactional message это оставляет неоднозначность:
должно ли имя организации исчезнуть без branding entitlement. Исчезать оно не может — это часть понятного trusted
context, а не платная косметика.

**Риск:** тарифная деградация либо скроет существенную идентификацию отправителя/care context, либо разные surfaces
начнут по-разному трактовать один mechanic.

**Correction brief:**

1. Ввести явный `Core organization context`, доступный независимо от `branding`: trusted display name, минимальная
   attribution и platform disclosure там, где relationship/object уже подтверждены или public projection разрешена.
2. Отдельно определить `Brand presentation`: logo, colors, typography/assets, custom content/header, optional org
   contacts и templates; именно это гейтится `branding` publication/readiness.
3. Для каждой surface перечислить minimum core payload до/после trusted lookup и paid additions.
4. Переписать email/SMS/push rows так, чтобы neutral organization identification для transactional delivery не
   зависела от branding, а branded header/template — зависела.
5. Добавить acceptance case `branding disabled + valid patient invite/booking/patient shell`: организация видима как
   context, platform visuals используются как fallback.

### F3 — Canonical platform URL обещан, но lifecycle стабильного slug/alias не определён

**Root cause:** custom hostname lifecycle проработан, а обязательная canonical platform identity оставлена
абстрактной строкой URL.

`REQUIREMENTS.md` требует опубликованную страницу по стабильному slug и canonical platform URL независимо от
custom-domain alias. Draft гарантирует наличие canonical URL, но не фиксирует:

- что является стабильным route key;
- уникальность и normalization slug;
- rename/old-alias redirect;
- collision и reserved names;
- hidden/suspended/deleted behavior;
- quarantine/reuse policy для platform slug;
- соответствие одного alias разрешённым surfaces.

Custom hostname quarantine этот пробел не закрывает. Без platform alias lifecycle старые invite/booking/public links
могут сломаться или начать указывать на другую organization после rename/reuse.

**Correction brief:**

1. Добавить canonical platform route/alias object отдельно от custom hostname.
2. Зафиксировать immutable organization target и versioned aliases; slug — lookup/presentation, не authority.
3. Определить normalization, uniqueness, reserved names, rename redirect, retirement/quarantine и запрет silent reuse.
4. Определить behavior для unpublished/suspended/closed organization и каждого canonical surface.
5. Redirect resolver должен использовать server mapping и те же route enums, не query/Host; добавить сценарии old
   slug after rename, slug collision и removed organization.

### F4 — Email sender readiness не моделирует полную authenticated identity

**Root cause:** sender описан как три presentation identity, тогда как DNS/provider readiness требует ещё envelope и
alignment identities.

DKIM/SPF/DMARC перечислены, но контракт не связывает в один проверяемый tuple:

- visible RFC From domain;
- envelope MAIL FROM / Return-Path and bounce routing;
- DKIM signing domain/selector;
- DMARC alignment/policy result;
- provider verification;
- validated Reply-To.

Из-за этого `verified`/`active` можно реализовать по наличию DNS records без доказанного alignment и рабочего bounce
path. Также `effective sender identity per attempt` остаётся недостаточно точным для диагностики fallback.

**Correction brief:**

1. Расширить sender identity/readiness object полями/состояниями From, envelope domain, DKIM signer/selectors, SPF,
   DMARC alignment, provider verification, Reply-To и bounce/complaint route.
2. Развести `domain proof`, `provider_verified`, `alignment_ready`, `template_eligible`, `active`, `degraded/revoked`.
3. Delivery audit должен сохранять effective presentation tier, actual From, envelope/signer identity references,
   fallback/hold reason, provider correlation и template revision — без raw token/clinical body.
4. Добавить recovery scenarios: DKIM passes but DMARC not aligned, Return-Path failure, provider revoke, partial DNS
   rotation и fallback/hold according to pending gate.

### F5 — Pending gates названы «owner decisions», хотя owner их не принимал

**Root cause:** тип решения понятен по контексту, но provenance label двусмысленен.

BD-1…BD-6 — корректные вопросы, recommended candidates и safe defaults. Однако заголовок `Owner decisions` и
формулировка `Owner decision BD-3` могут быть прочитаны как уже данные решения владельца. Канон требует не
подписывать product hypothesis как owner ruling. В `OWNER_RULINGS_2026-07-15.md` решений BD-1…BD-6 нет.

**Correction brief:**

1. Переименовать блок в `Pending owner decision requests` / `unresolved owner gates`.
2. Для каждого BD явно хранить `status=pending`, `owner ruling=none`, `planner recommendation`, `safe default` и
   downstream blocks.
3. Только явный ответ владельца может изменить status на `ruled`; рядом нужна точная source/date, без реконструкции
   решения из safe default.
4. Аналогично маркировать capability names и W launch scope как target candidates, не current facts.

## 4. Required correction pass and re-audit gate

UX-05 можно закрыть только после одного целостного correction pass обоих artifacts. Fixer должен пересобрать общие
tables/state models, а не править только упомянутые строки.

Повторный независимый аудит должен доказать:

1. base hostname readiness не связана all-or-nothing с optional surface readiness;
2. core organization context остаётся видимым при disabled branding, но paid visuals/content корректно деградируют;
3. canonical platform slug/alias переживает rename и не может авторизовать или silently перейти другой organization;
4. email `active` означает provider + DNS authentication/alignment + bounce readiness, а failure исполняет явную
   fallback/hold policy;
5. BD-1…BD-6 однозначно помечены pending, а не attributed owner rulings;
6. исходные прошедшие инварианты Host/authorization, one-way fallback, stable platform manifests, legal/support и
   multi-org не регрессировали.

До этого UX-05 остаётся `pending independent audit corrections`; переход к UX-06 может использовать drafts только как
вход с перечисленными ограничениями, но не как frozen contract.

## 5. Full independent re-audit — 2026-07-15

**Вердикт:** **PASS. UX-05 closed as a decision-ready branding/domain contract.**

Повторно прочитаны целиком оба corrected artifacts и все исходные источники из раздела 1. Проверка проводилась по
всей фазе, а не только по diff или пяти прежним findings.

### 5.1 Re-audit gates

| Gate | Проверка | Результат |
|---|---|---|
| 1. Hostname readiness | `HostnameBase` отвечает только за ownership/TLS/routing/base lifecycle; шесть `HostnameSurfaceBinding` имеют независимые states, audit tuples, fallback и selective decommission | PASS |
| 2. Core context vs paid brand | Для каждой surface определён minimum core payload; disabled `branding` оставляет trusted org name/context и заменяет только платные visuals/content | PASS |
| 3. Stable platform alias | `PlatformAlias` имеет immutable organization target, deterministic normalization, reserved names, uniqueness, versioned rename redirect, lifecycle/quarantine и no silent reuse | PASS |
| 4. Authenticated email identity | `active` требует From, envelope/Return-Path, DKIM/SPF/DMARC alignment, provider, Reply-To, bounce/complaint route и template eligibility; partial failures и per-attempt audit определены | PASS |
| 5. Decision provenance | BD-1…BD-6 явно имеют `status=pending`, `owner ruling=none`, planner source/recommendation, safe default и downstream impact | PASS |
| 6. Original invariants | Authorization precedes presentation; fallback remains one-way/loop-safe; platform manifests stable; legal/support reachable; multi-org patient identity/install model preserved | PASS |

### 5.2 Whole-phase acceptance

- Mandatory surface coverage remains complete for platform public, organization public, booking, join/auth,
  patient/staff shells, PWA/install, email/SMS/push, legal/support and domain management.
- Platform landing remains specialist-oriented and cannot be organization-white-labeled.
- Host, platform alias, route slug, brand, sender, manifest and selected organization remain presentation/entry
  inputs only. Trusted object/relationship, server-resolved organization, capability and entitlement are checked
  before readiness/presentation.
- Organization A Host cannot authorize or retarget organization B invite, booking, enrollment or private object;
  mismatch fails neutrally without foreign organization disclosure.
- `public_profile=active + auth=pending_audit` and `booking=active + patient_pwa=audit_failed` are explicit valid
  states. A failed sibling neither mutates `HostnameBase` nor disables safe bindings.
- Unknown/degraded/removed hosts and retired aliases resolve only through server mappings and route enums. Fallback is
  custom → stable platform alias, never an automatic loop back; arbitrary `next`/absolute return targets and raw-token
  cross-origin propagation remain excluded.
- Stable platform patient/staff manifests are unchanged by organization selection or O branding. W PWA still requires
  its own active binding and full cookie/session, CSRF/OAuth, SW/cache, push, asset, legal/support and browser audit.
- Patient A+B enrollments use one platform installed identity; active organization remains explicit and enrollment is
  revalidated before context change. A W origin cannot silently recolor into another organization.
- Web-domain proof, organization logo and branding entitlement cannot activate email/SMS sender identity. Custom
  sender failure follows pending BD-3 safe default and records the actual effective identity without body/raw token.
- Capability, mechanic entitlement, object readiness and presentation remain separate. Entitlement never broadens
  membership/enrollment/clinical access and tariff loss does not delete retained identity, history or audit data.
- Public organization data is an explicit projection, not the private organization base row. Legal operator,
  platform account/security recovery, status and support remain reachable under O/W and all documented failures.
- Current runtime facts are still labelled as facts; target objects/capability names are labelled future contracts;
  planner recommendations and safe defaults are not attributed to the owner.

### 5.3 Residual gates, not audit failures

- BD-1…BD-6 remain genuine pending owner requests for launch scope and visual freeze.
- OM entitlement/role decisions continue to gate the corresponding UX-06 compositions.
- The corrected schema/resolvers/readiness jobs and UI do not exist yet; they belong to UX-09 implementation epics.
- Exact legal controller/processor text still requires legal approval, while the required UI locations and platform
  fallback are already reserved by this contract.

These are explicitly represented downstream decisions or implementation gaps and do not contradict the UX-05
discovery contract. No further correction pass is required before UX-06 uses UX-05 as a decision-ready input.
