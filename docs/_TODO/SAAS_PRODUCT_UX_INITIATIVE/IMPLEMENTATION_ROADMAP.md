# UX-09 — implementation roadmap

**Статус:** full independent UX-09 re-audit PASS; decision-safe execution plan, implementation ещё не начиналась.
**Тип документа:** decision-gated plan, не разрешение на implementation, deploy, DB changes или rollout.  
**Ветка планирования:** `feat/saas-interface-work3`; основной workstream и текущий SaaS enforcement order не
изменяются.

## 1. Результат и граница плана

План доводит проверенный UX-03…08 contract до последовательности самостоятельных implementation stages. В конце
реализации должны существовать единые capability-gated поверхности для platform, organization management,
clinical work, operations, patient и public journeys; старые маршруты должны либо безопасно вести в канонические,
либо быть сняты после доказанного link census.

Этот документ **не**:

- выбирает ответы `UX08-01…12` за владельца;
- проектирует таблицы, поля, enum или migration SQL;
- запускает код, БД, внешнюю доставку, TEST/prod deploy либо merge в основной workstream;
- заменяет `SAAS_FOUNDATION/SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md` или их TEST acceptance;
- обещает public launch, white-label, custom domain, custom sender или per-origin PWA.

Канон результата: `57/57` target screen IDs из `TARGET_IA.md`, семь UX-04 journey families и `150/150` current
`page.tsx` из `ROUTE_MIGRATION_MAP.md` имеют один непротиворечивый implementation destination, guard, compatibility
и acceptance path. Это не означает, что все 57 screens обязательно создаются отдельными route files: tabs,
states, aliases и shared account surfaces остаются ровно такими, как классифицировано в UX-06.

## 2. Источники истины и provenance

При конфликте действует следующий порядок:

1. `AGENTS.md`, `.cursor/rules/*`, `docs/ORCHESTRATION_BINDINGS.md`;
2. `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md`, `SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md` для текущего SaaS/
   TEST workstream;
3. `REQUIREMENTS.md`, `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`;
4. `ENTRY_AND_INVITE_JOURNEYS.md`, `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`;
5. `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md`;
6. `UX07_PROTOTYPE_INDEX.md`, финальный source-bound `UX07_INDEPENDENT_AUDIT.md`;
7. `OWNER_DECISION_PACKET.md` — только список pending choices и их provenance reconciliation, не owner ruling.

Каждая implementation запись и audit report обязаны разделять:

- `owner ruling` — только датированное явное решение владельца;
- `repository/current fact` — доказанный кодом, БД или runtime факт;
- `approved contract/invariant` — уже проверенная UX/security/architecture граница;
- `planner recommendation` — предпочтение, которое не даёт разрешения;
- `safe default` — fail-closed временное поведение до решения;
- `unresolved decision` — заблокированная policy/launch ветка.

## 3. Связь с текущим SaaS enforcement sequence

### 3.1 Два независимых трека

`SAAS_FOUNDATION/SEQUENCE.md` остаётся единственным источником порядка текущей TEST-first foundation/enforcement
работы. UX-09 не вставляет свои stages между его этапами и не переименовывает их. UX implementation может начинаться
только отдельным разрешённым workstream после stage-level readiness review.

| Foundation/enforcement gate | Что UX-09 может делать до него | Что запрещено до него |
|---|---|---|
| Membership/principal/capability contracts подтверждены текущим foundation | Документировать port/API contract, UI composition и fail-closed states | Создавать второй membership resolver, обходить role/GUC/RLS path, закреплять coarse `adminMode` как target auth |
| Settings-root split завершён и patient-readable settings contract доказан | Разделять UI ownership PLAT/MGMT/ACC, описывать consumer payload | Добавлять новые per-flag bypass/read whitelist или читать secret-bearing settings из patient/public UI |
| Enforced role/principal coverage и two-org negatives доказаны для затронутых paths | Реализовывать чистые presentation components поверх уже sanctioned ports | Переносить route/API и объявлять tenant-safe без реального-role direct/list/count/search/export/write proof |
| Organization provisioning/ownership contract утверждён | Делать shell и state composition на существующих read models | Изобретать параллельные organization/branding/invite tables или client-provided `organizationId` authority |
| UX stage прошёл собственный audit | Подготовить интеграционный handoff | Засчитывать UX audit как D3/D4/E1/E2/G1 evidence или наоборот |

### 3.2 Integration handoff gate

Перед каждым implementation stage lead составляет короткий handoff record в существующем `LOG.md`:

- foundation commit/checklist, на котором основан stage;
- ownership path каждого затронутого объекта;
- sanctioned membership/principal/settings/entitlement accessors;
- какие foundation migrations/API уже существуют, а каких контрактов не хватает;
- TEST/enforcement checks, которые принадлежат foundation, и feature checks, которые принадлежат UX stage;
- explicit `no-overlap` statement: какие активные foundation файлы/миграции stage не трогает.

Если нужный ownership/principal contract ещё меняется в основном workstream, UX stage остаётся `waiting dependency`,
а не строит временный второй путь. Интеграция выполняется только после rebase/current-state audit; UX branch не
проталкивает собственную версию foundation sequence.

## 4. Общие engineering invariants

- Tenant = `Organization`; staff имеет ровно одно активное organization membership, patient может иметь несколько
  enrollments. UI selection не является authorization.
- Organization context приходит только из server-resolved membership, enrollment, trusted invite/booking/object или
  published projection. Host/query/client payload — hint/continuation, не authority.
- Порядок проверки: authentication → workspace/persona → principal/relationship → capability/object policy →
  entitlement/mechanic → service/data. Entitlement не расширяет доступ.
- List, count, search, export, direct object и mutation проходят одну и ту же policy. Фильтры применяются после
  authorization и не создают данные.
- Owner/admin membership и specialist binding независимы. Management role не даёт clinical authorship; specialist
  binding не даёт irreversible management actions.
- Invite relationship, delivery attempt и auth/recipient proof — три независимые оси. Email/SMS transport не
  создаёт identity, membership или enrollment сам по себе.
- Patient identity глобальна; clinical context organization-scoped. Переход контекста проверяет active enrollment
  и никогда не смешивает данные двух организаций.
- Core organization identity/context не является paid brand. Branding, domain, sender и PWA presentation не
  участвуют в authz.
- Canonical platform URL остаётся рабочим fallback. Domain fallback однонаправленный и loop-safe.
- Новые integration settings остаются DB-backed и org-aware через sanctioned settings service/mirror; секреты не
  появляются в env или client payload.
- Не создавать параллельные solo/clinic route trees, per-specialist patient cards, assistant copies doctor screens,
  second booking wizard, second account area или cloned white-label app.
- Старый route остаётся guard-equivalent compatibility entry до link/deep-link census; redirect не ослабляет target
  guard и не меняет trusted context.

## 5. Decision gates

Все двенадцать решений пока `pending`; `owner ruling=none`. Safe default разрешает только явно указанную подготовку.

| Gate | Blocks | Разрешённая подготовка | Safe default до ruling |
|---|---|---|---|
| UX08-01 card/history/`Мои` | U5B policy and shared-history UI | Общий card shell, policy ports, authored/assigned provenance | Own/assigned operational scope; shared controls absent |
| UX08-02 handoff launch | U5C transitions | State-contract review, capability names, recovery composition | Нет generic transfer; только уже определённые object actions |
| UX08-03 assistant scope | U2 assistant modules and U3A role summary | Empty capability-gated OPS shell contract | Только явно выданные schedule/intake/contact/invite; clinical denied |
| UX08-04 dual-mode navigation | U2 final shared shell | Независимые management/clinical destinations and guards | Не замораживать общий shell; no binding = no clinical entry |
| UX08-05 patient neutral start | U5A default destination | Resolver, chooser, switcher and revocation recovery | Chooser при неоднозначности; verified target opens exact org |
| UX08-06 public launch scope | U6A/U6B release bundle/directory | Separate landing/profile/booking/join/directory epics | `PUB-06` hidden; no public rollout assumed |
| UX08-07 white-label depth | U7 W presentation | P/O core identity and brand-token contract | Platform trust anchor + org context; no W promise |
| UX08-08 domain/W-PWA scope | U8A/B rollout | Canonical URLs, stable platform manifests, readiness model | Custom-origin/auth/W-PWA disabled |
| UX08-09 sender fallback policy | U8C delivery choice | Sender readiness, message-class registry, audit | Unknown class holds; only preclassified mandatory transaction may use verified platform fallback |
| UX08-10 support workflow | U9 patient-level support | Aggregate/org diagnostics inventory | No patient browsing/session or new repair mutation |
| UX08-11 enrollment timing | U3B active relationship timing | Pending intent, proof/accept separation, idempotency contract | No active portal access/activated label before proof; separately authorized manual enrollment stays explicit |
| UX08-12 communication topology | U5D target inbox/thread topology | Attribution, existing-message authz/parity, reply-target contract | No new unified inbox/cross-specialist visibility; only existing authorized message objects |

Ответ владельца переносится в предусмотренный roadmap датированный rulings artifact; только после этого gate в этом
файле обновляется ссылкой на источник. Recommendation из packet нельзя переносить как ruling.

### 5.1 Upstream provenance reconciliation

Полный registry находится в `OWNER_DECISION_PACKET.md` §«Полная сверка upstream-решений». Execution использует его
как обязательный gate, а не перечитывает молчаливо candidate text как policy:

- `UX08-01…12` — реальные pending product gates с owner ruling `none`;
- tenant/identity, one-org staff, patient multi-org authorization, no persona overwrite, exactly-once, raw-token
  handling, sender truthfulness and permission-before-filter — architecture/security invariants from UX-03…05;
- one signup path with optional practice-shape question, no SMS-only launch and strongest already-trusted booking
  activation channel — planner recommendations with explicit fail-closed safe defaults, not owner rulings;
- staff 2FA mechanics/recovery are mandatory architecture/security scope; exact factor/role/grace is resolved by a
  reviewed security-architecture contract and cannot be represented as completed before that freeze;
- enrollment creation timing is owned only by `UX08-11`; communication topology only by `UX08-12`.

U0 must re-run this registry against current owner rulings before implementation. A new literal open item stops the
affected branch at contract readiness until it is classified in the existing packet; it does not silently become a
stage assumption or trigger an ad hoc decision document.

## 6. Current reuse and gap baseline

### 6.1 Canonical screen ownership

This table is the UX-09 projection of the exact UX-06 registry; ranges are inclusive and expand to `57` IDs.

| Canonical IDs | Count | Primary implementation owner | Conditional owner |
|---|---:|---|---|
| `PUB-01…06` | 6 | U6A | `PUB-06` waits for UX08-06 |
| `ORG-PUB-01…03` | 3 | U6B | U8A/B adds only approved origin variants |
| `PLAT-01…09` | 9 | U9 | `PLAT-09` waits for UX08-10; U8 adds adapters to the same PLAT health/config surfaces |
| `MGMT-01…09` | 9 | U2 | U6B owns publication behavior; U7/U8 owns brand/domain/sender panels |
| `CLIN-01…11` | 11 | U2/U5B | U3B invite action; U5C collaboration; U5D communications; existing clinical modules converge in U10 |
| `OPS-01…04` | 4 | U2 | Exact module set waits for UX08-03 |
| `PAT-01…11` | 11 | U5A | U3B activation/install; U5D communications; existing clinical modules converge in U10 |
| `ACC-01…04` | 4 | U2 | U3S/U3A security; U8B only if approved |
| **Total** | **57** | | |

Flow/state aliases remain non-canonical: `MGMT-SETUP`, `MGMT-TEAM`, `MGMT-INVITE`, `CLIN-PAT-INVITE`,
`ACC-FIRST`, `PAT-INSTALL`, `ORG-PUB-04` and all `ACQ/STF/PIN/SMS/PBK/MOR/ERR` IDs. `OPS-05` remains obsolete;
none of them may create a new screen family.

### 6.2 Reuse and gaps

| Area | Reuse | Gap, который stage должен доказать или закрыть |
|---|---|---|
| Signup/auth | Public auth, registration/start-confirm, email challenge, patient email setup | Specialist binding deferred; patient target passwordless compatibility; persona collision/privacy/session retry; complete 2FA recovery |
| Staff invite | Clinic members/invite UI, hash-token/email mechanics | Coarse roles, lifecycle/delivery conflation, other-active-org conflict, capability/binding intent and target staff password contract |
| Patient invite | Existing patient identity/enrollment primitives and delivery infrastructure | Canonical specialist→patient invite/join absent; no exactly-once relationship exchange and recovery surface |
| SMS | Existing notification channel infrastructure | Patient invite SMS lifecycle absent; SMS must remain transport-only and consent/suppression-aware |
| Public booking | Existing booking wizard and appointment/payment primitives | Success does not prove atomic enrollment/app continuation; internal `userId` authority/leak and identity ambiguity need removal |
| Staff capabilities | Current role/admin/doctor gates and membership resolver | Target granular capability/object parity is not evidenced; owner/admin/specialist/assistant boundaries are incomplete |
| Patient context | Enrollment resolver and patient screens | Chooser/switcher contract incomplete; Patient Today currently exposes `organization_principal_required` defect |
| Card/history | Patient workbench, visits/program components | Entry visibility/private classes and list/direct/count/search/export parity not evidenced; policy pending UX08-01 |
| Handoff | Some specialist/appointment relations | No canonical primary/care-team/generic handoff state machine; no cross-org transfer contract |
| Management | Clinic members/settings, booking/admin tabs, mixed `/app/settings` | No coherent MGMT shell; personal/org/platform settings and booking setup are mixed |
| Public/profile | Current patient-first landing, booking and legal pages | Specialist-first landing, published org projection, trusted join and directory release boundary incomplete |
| Branding/domain/sender | Some settings/content/preview/PWA primitives | No complete org brand resolver, publication version, hostname base/binding UI, authenticated sender readiness or per-origin PWA |
| Platform admin | Analytics, health, audit, settings, merge/name-match pages | Current doctor/admin shell and `adminMode` mix platform/org/clinical ownership |
| Routes | 150 current pages classified, many reusable components | 57 canonical target IDs are logical; route moves need guard-equivalent redirects, link census and no duplicate trees |

Любой gap, который предполагает новую persistence shape, сначала получает reviewed data/API contract. Название
будущей таблицы или поля не является частью этого roadmap.

### 6.3 Journey ownership registry

| UX-04 journey | Implementation owner | Convergence/acceptance |
|---|---|---|
| J1 specialist self-signup | U3S (`ACQ-01…05`) | U4 shared auth/session/privacy review; U6A truthful acquisition entry |
| J2 clinic staff invite | U3A (`STF-01…08`) | U4 relationship/delivery/proof convergence |
| J3 patient email invite | U3B (`PIN-01…09`) | Requires completed U5A; U4 convergence |
| J4 patient SMS fallback | U3B (`SMS-01…03`) | Same invite/enrollment as J3; U4 verifies no auth elevation |
| J5 public booking continuation | U3B (`PBK-01…08`) | U4 identity/enrollment convergence; U6B public projection |
| J6 returning multi-org patient | U5A (`MOR-01…05`) | U3B consumes resolver; U4 verifies invite/install continuation |
| J7 terminal/wrong-recipient/replay recovery | U3S/U3A/U3B per relationship kind | U4 owns cross-journey `ERR-*` consistency and redaction |

This registry assigns implementation ownership; it does not collapse staff membership, patient enrollment, delivery
or authentication policies into one object.

## 7. Execution model and phase sizing

### 7.1 Meaningful phases

| Phase | Full worker scope | Stages | Exit |
|---|---|---|---|
| P0 — contract readiness | Один цельный inventory/contract pass, без product UI | U0 | Все gaps имеют owner/path; docs-only phase check at U0 |
| P1 — authorization and workspace spine | Capability enforcement и shells как два полных stages | U1, U2 | Direct-route matrix + one shell; full CI after U2 |
| P2 — context and relationship acquisition | Ранний patient resolver, specialist signup, staff/patient journeys и общий convergence | U5A, U3S, U3A, U3B, U4 | ACQ/STF/PIN/SMS/PBK/MOR separation green; full CI after U4 |
| P3 — clinical policy | Card/history, collaboration and communications as decision-aware stages | U5B, U5C, U5D | Included policy branches proven; full CI after last included U5 stage |
| P4 — public acquisition | Platform entry и org profile/booking/join | U6A, U6B | Published projection/trusted continuation; full CI after U6B |
| P5 — core presentation and platform operations | Base brand plus core PLAT shell/config/reliability/org ops | U7, U9 | One sanctioned platform ops/config path; full CI after U9 |
| P6 — optional commercial adapters | Independently gated domain, sender and per-origin PWA adapters | U8A, U8B, U8C | Included optional adapters use U9 path; full CI after last included U8 stage |
| P7 — final convergence | Route, responsive, visual and acceptance consolidation | U10 | 57/57, 150/150 and final full CI after U10 |

Не объединять U0–U10 в один megastage и не дробить stage на двухстрочные fixes. Один worker получает весь stage и
его checklist. Этап может занять 5–20 минут и дольше; статус-проверка не является timeout или failure.

### 7.2 Stage cycle

1. **Worker:** полный stage, его data/API/UI/migration/compat/test scope и `LOG.md` entry.
2. **Full independent audit:** весь stage против checklist, кода, migrations, runtime evidence и соседних contracts;
   не только последний diff.
3. **Integrated correction:** один correction owner получает весь audit и свободу исправить связанные причины.
4. **Full re-audit:** повтор всего risk-relevant checklist. Узкий recheck допустим только для доказанно независимой
   механической ошибки.
5. **Checkpoint:** stage commit/push в разрешённую feature branch только после audit; merge handoff отдельно.

После каждого второго completed stage — process auditor перечитывает `ORCHESTRATION_BINDINGS.md` и этот roadmap и
отвечает, сохраняются ли scope, timing, model/effort, audit/correction и документационная дисциплина.

Модель/effort выбираются по целому scope и риску: identity/tenant/security/migration/domain требуют сильного
reasoning; механический route census, visual render matrix и lint/build не получают повышенный effort без причины.
Timeout или недостаток контекста не считаются substantive failure.

## 8. Stages

### U0 — contract, ownership and data-gap readiness

**Outcome:** implementation team знает, какие существующие ports/objects переиспользует, какие contracts отсутствуют
и какой foundation gate обязан прийти раньше; UI work больше не вынуждает изобретать schema по ходу.

- **Screens/flows:** все `PUB/ORG-PUB/PLAT/MGMT/CLIN/OPS/PAT/ACC`; J1…J7; особый trace `ACQ/STF/PIN/SMS/PBK/MOR/ERR`.
- **Reuse/gaps:** baseline §6; exact route denominator `150`, registry `57`, current APIs/migrations verified against
  current branch rather than copied from UX audit date.
- **Scope:** code-search-first census of membership/principal/capability, enrollment, invitation, delivery, auth,
  booking, publication, brand, settings, entitlement, audit and route guards; define ports/state contracts and
  ownership paths; map each gap to existing foundation task or future feature contract.
- **Forbidden:** schema/SQL, runtime behavior, broad refactor, new UI, duplicate foundation checklist, assumptions from
  table names alone.
- **Boundaries:** every clinical/patient/staff object has direct org or documented scoped-parent path; global catalogs
  require evidence; identity and relationship remain separate.
- **Decision gates:** no UX08 ruling required to inventory; U5B/U5C/U7/U8/U9 policy branches remain conditional.
- **Dependencies:** current foundation artifacts and route inventories readable; no deploy dependency.
- **Workstreams:** data — ownership/writer/backfill questions; API — sanctioned ports and policy parity; UI — route/
  screen component reuse; ops — feature/foundation evidence split.
- **Migration/compat:** produce migration requirements and backfill invariants only; no field/table name. Preserve
  legacy paths until target contract is implemented and link/data census exists.
- **Validation:** executable/lexical ID and route census; call-site evidence; contract cross-check with foundation;
  markdown links; `git diff --check`. No app/DB tests because stage changes documentation only.
- **Rollback/degradation:** not applicable to runtime; unresolved ownership becomes `waiting dependency`, never global
  fallback.
- **Completion:** [ ] 57/57 IDs mapped; [ ] 150/150 files mapped; [ ] J1…J7 traced; [ ] every gap has owner/path/gate;
  [ ] no invented schema; [ ] foundation no-overlap reviewed; [ ] full audit PASS.
- **Merge dependency:** prerequisite to every later stage; planning artifact merges separately from foundation code.

### U1 — role/capability guard spine

**Outcome:** every actor reaches only the workspace, object class and action allowed by server capabilities; direct
URLs/APIs cannot use navigation hiding, filters, entitlement or `adminMode` as permission.

- **Screens/flows:** all route families; emphasis `PLAT-*`, `MGMT-*`, `CLIN-*`, `OPS-*`, `ACC-*`, `PAT-*`.
- **Reuse/gaps:** reuse membership/principal resolver and existing route guards after U0 verification; replace/map
  coarse role shortcuts only where target capability exists.
- **Scope:** one capability vocabulary/mapping; server guard adapters; ownership/object checks; direct/list/count/
  search/export/write parity; neutral denial; staff one-org and patient enrollment rules; audit denied sensitive
  actions where policy requires.
- **Forbidden:** changing RLS/enforcement sequence, client-side-only gates, entitlement-as-authz, full UI route move,
  granting assistant clinical access, support impersonation.
- **Boundaries:** capability evaluated after trusted principal and before entitlement/service; specialist authorship
  requires binding; owner/admin without binding stays non-clinical.
- **Decision gates:** UX08-03 blocks assistant grant set; UX08-10 blocks support session. Safe defaults deny both.
- **Dependencies:** U0; foundation principal/role access paths stable and enforcement handoff accepted.
- **Workstreams:** data — no new policy data without reviewed contract; API — guards and error contract; UI — one
  capability resolver for nav/actions; audit — parity matrix.
- **Migration/compat:** existing roles may map conservatively to capabilities behind compatibility adapter; broad
  grants are never backfilled from UI visibility. Adapter removal requires route/API census.
- **Validation:** targeted unit/integration guard tests; role × direct route/object × action matrix; two-org and
  two-patient negatives under correct DB roles where stage touches scoped data; typecheck/lint; affected build;
  audit-event checks. Accumulated P1 full CI belongs after U2, not after each guard edit.
- **Rollback/degradation:** capability enforcement can keep old UI route with fail-closed server denial; no fallback to
  legacy broad access. Rollback must not remove stronger foundation wall.
- **Completion:** [ ] actor/workspace matrix green; [ ] parity paths green; [ ] no binding→clinical shortcut;
  [ ] assistant/support safe defaults; [ ] entitlement order proven; [ ] full audit PASS.
- **Merge dependency:** U0 + relevant foundation gate.

### U2 — organization management, operations and shared account shell

**Outcome:** owner/admin manages one organization without entering doctor/global-admin chrome; specialist works in a
clinical shell; assistant receives only a bounded operations shell; personal account screens are shared once.

- **Screens/flows:** `MGMT-01…09`, `OPS-01…04`, `ACC-01…04`, management↔clinical prototype scenario.
- **Reuse/gaps:** clinic members/settings, booking tabs, `/app/settings`, install and current navigation primitives;
  split mixed ownership instead of copying forms.
- **Scope:** canonical shell composition; capability-driven nav; MGMT overview/setup; shared ACC destinations;
  management vs booking setup vs personal settings ownership; responsive route restoration; non-clinical owner
  first destination.
- **Forbidden:** final assistant modules before UX08-03; final switch style before UX08-04; parallel solo/clinic
  shells; copied ACC pages; domain/sender infrastructure; catalog ownership moves.
- **Boundaries:** one membership org; independent specialist binding; no clinical widgets for non-bound actor;
  assistant has no doctor-route reuse; personal settings never imply org-management rights.
- **Decision gates:** UX08-03 conditional OPS set; UX08-04 final dual-mode composition. Safe shell keeps destinations
  separate and hides unavailable modules/switch.
- **Dependencies:** U1, which includes the accepted ownership map; settings-root split for fields read outside
  privileged settings.
- **Workstreams:** data — reuse scoped org/settings projections; API — management/account/ops ports; UI — shells,
  nav, responsive states, setup summary; route — guarded compatibility entries.
- **Migration/compat:** no data move solely for navigation. Mixed forms split by API ownership while old routes become
  guarded adapters/redirects. Preserve values and defaults; any data backfill follows accepted settings contract.
- **Validation:** role-route/nav tests desktop/mobile; direct legacy route guard equivalence; settings read/write
  ownership tests; typecheck/lint/build; DEV role smoke and screenshots for owner-only, owner+binding, specialist,
  assistant-safe and forbidden states; accessibility keyboard/navigation seal; accumulated full CI at P1 exit.
- **Rollback/degradation:** old guarded route may remain entry; new shell failure returns to safe account/management
  destination, never doctor or platform fallback.
- **Completion:** [ ] one MGMT shell; [ ] one ACC area; [ ] OPS safe variant; [ ] no duplicate solo/clinic tree;
  [ ] legacy entries equivalent; [ ] responsive/accessibility evidence; [ ] full audit PASS.
- **Merge dependency:** U1; conditional areas require UX08-03/04 or are explicitly excluded from acceptance.

### U5A — patient organization resolver and global account context

**Outcome:** patient with zero, one or several relationships always enters an explicit authorized context; deep links,
push and installed launches cannot leak or silently substitute another organization.

- **Screens/flows:** `PAT-01`, `PAT-02`, `PAT-10`, `PAT-11`; `MOR-01…05`; direct `patient/go/[kind]` behavior.
- **Reuse/gaps:** enrollment resolution/profile and patient shell; chooser/switcher/cache contract incomplete and
  Today principal defect must be fixed through the canonical principal path.
- **Scope:** resolver, chooser, visible switcher, remembered preference as non-authoritative hint, verified target
  proposal, cache invalidation, revoked/suspended recovery, zero/one/many states, object→org→enrollment resolution.
- **Forbidden:** merged clinical overview, client-chosen org authority, staff-style multi-membership semantics,
  cached old-org data during switch, query/Host fallback, hiding current org brand/context.
- **Boundaries:** global account/security separate from org care context; every object rechecks current patient and
  relationship; switch changes presentation/query scope only after server confirmation.
- **Decision gates:** UX08-05 final neutral destination. Safe default is chooser whenever ambiguous; trusted target
  opens exact authorized org visibly.
- **Dependencies:** U0 and U1; patient principal/foundation enforcement. Resolver zero/one/many, chooser, switch and
  object authorization are implemented independently of invite, booking and install UI.
- **Workstreams:** data — enrollment list/preference contract; API — resolver/switch/revalidate/cache keys; UI —
  PAT-01 and shell; diagnostics — Today defect root fix without weakening guard.
- **Migration/compat:** preference is optional and never required for authorization; no merge/backfill of clinical
  rows. Existing single-org users transition deterministically only after active enrollment proof.
- **Validation:** zero/one/two org, revoked remembered org, verified foreign/denied object, direct/list/cache isolation,
  concurrent switch, back/forward/deep link, DB-role negatives, typecheck/lint/build; desktop/mobile/PWA screenshots.
- **Rollback/degradation:** resolver failure shows neutral chooser/recovery and clears stale care data; never falls
  through to previous or arbitrary organization.
- **Completion:** [ ] all MOR states; [ ] no stale cache; [ ] Today canonical principal fixed; [ ] switch/deep link
  proof; [ ] UX08-05 branch or safe default explicit; [ ] full audit PASS.
- **Merge dependency:** U0/U1; later integration validation cannot become a reverse prerequisite.

### U3S — specialist self-signup, owner provisioning and secure first run

**Outcome:** an anonymous specialist completes `ACQ-01…05` through one identity/tenant path, receives exactly one
organization + owner membership, becomes a clinical actor only after authorized specialist binding, completes the
required security/recovery setup and reaches a truthful first workspace.

- **Screens/flows:** `PUB-01`, `PUB-03`, `PUB-04`, `MGMT-01`, `CLIN-01`, `ACC-01/02/04`; J1 and
  `ACQ-01…05`, relevant `ERR-*`.
- **Reuse/gaps:** reuse registration start/confirm, email challenge, signup intent and idempotent provisioning only
  after U0 verification; close current deferred `membership.specialist_id`/clinical-actor binding, missing first-run,
  and `challengeId` post-verification session-reissue defect.
- **Scope:** signup intent and verification; duplicate/disabled/expired/retry recovery; exactly-once organization and
  owner membership; authorized idempotent owner membership→specialist binding; server-trusted session/receipt on
  provisioning retry; profile/timezone/service/location/availability/invite-readiness checklist; staff password,
  factor enrollment/verification, recovery codes or alternate recovery, lost-factor/cooldown/replacement and session
  revocation; truthful management/clinical destination through U2 guards.
- **Forbidden:** challenge UUID as a bearer/session credential; second tenant/account model for solo; marking owner as
  clinical without binding; ownerless/duplicate organization; client-provided org/binding; claiming 2FA complete
  without a verified factor and recovery path; weakening high-risk checkpoint while policy is unresolved.
- **Boundaries:** signup organization comes only from server-side intent; owner membership and specialist binding are
  separate audited relationships; one active staff organization; persona additions never overwrite patient persona;
  management authority does not create clinical authorship.
- **Decision gates:** onboarding copy/shape uses planner safe default (one flow, optional practice-shape composition);
  exact factor/mandatory-role/grace policy requires a reviewed security-architecture contract, while complete setup/
  recovery mechanics are mandatory and high-risk actions fail closed until that contract is frozen.
- **Dependencies:** U0, U1, U2; stable organization provisioning/ownership and sanctioned staff auth/session paths.
- **Workstreams:** data — provisioning/binding/idempotency contract before migration; API — start/confirm/retry/bind/
  security/recovery; UI — ACQ-01…05 and first-run checklist; audit/ops — session, factor and owner-action evidence.
- **Migration/compat:** preserve canonical identity and existing provisioned organizations; deterministic binding
  backfill only from proven staff principal/specialist relation with ambiguity report; old confirmation path remains
  fail-closed until secure receipt/session cutover; forward/rollback/idempotency plan required for persistence.
- **Validation:** full ACQ state graph; refresh/concurrent confirm/replay; UUID-only retry denial; duplicate email and
  partial provisioning; owner membership without/with binding destinations; patient-persona collision; 2FA/recovery/
  session revocation; two-org negatives; migration/backfill/rollback where applicable; typecheck/lint/build; DEV
  desktop/mobile smoke/screenshots with no real delivery.
- **Rollback/degradation:** signup-disabled keeps neutral demo/contact; partial provisioning resumes only from trusted
  receipt/session; missing binding stays management-only with explicit recovery; security failure never falls through
  to a clinical session or high-risk owner action.
- **Completion:** [ ] ACQ-01…05 complete; [ ] secure retry/session; [ ] organization+owner exactly once;
  [ ] authorized specialist binding; [ ] clinical actor truthful; [ ] first-run/password/2FA recovery complete;
  [ ] no duplicate tenant/persona overwrite; [ ] full audit PASS.
- **Merge dependency:** U0/U1/U2 plus stable provisioning/auth foundation.

### U3A — staff invitation, activation and first workspace

**Outcome:** authorized owner/admin invites staff by email; recipient safely proves identity, establishes exactly one
membership, completes password/security setup and reaches the correct first workspace.

- **Screens/flows:** `MGMT-02`, `ORG-PUB-03`, `PUB-04`, `ACC-02`; `STF-01…08`, related `ERR-*`.
- **Reuse/gaps:** members/invite UI, email challenge, token hashing; gaps are coarse roles, delivery/relationship
  conflation, other-org/persona conflicts, binding intent and complete 2FA/recovery.
- **Scope:** authorized create/resend/revoke/correct; immutable delivery attempts; raw-token exchange/scrub;
  recipient-safe preview; staff email+password; exactly-once membership mutation; optional specialist binding only
  from trusted invite intent; sessions/recovery/2FA lifecycle; first workspace by U2 guard.
- **Forbidden:** reusable raw link as primary delivery, OTP-only staff auth target, role/binding from query/body,
  second active staff organization, invite consumption on failed auth, external delivery in unapproved environments.
- **Boundaries:** invite org from server record; role/capability/binding authorized by inviter; delivery outcome does
  not equal acceptance; staff/patient persona collision fail-closed or additive only by explicit safe contract.
- **Decision gates:** UX08-03 controls assistant summary/landing only; safe default grants bounded explicit operations.
- **Dependencies:** U0, U1, U2 invite contract; shared staff-security primitives may be reused but staff invite must
  not wait on landing/public composition; sanctioned email delivery and DB settings paths.
- **Workstreams:** data — accepted lifecycle/idempotency contract before migration; API — create/exchange/auth/accept/
  recovery; UI — MGMT invite and neutral join/security states; delivery — attempt health without secrets.
- **Migration/compat:** preserve old invite audit trail; resend creates a fresh invitation and supersedes predecessor;
  backfill only deterministic lifecycle/recipient hashes under reviewed plan; old token path expires/redirects safely.
- **Validation:** lifecycle transition/property/concurrency/replay tests; wrong recipient/expired/revoked/seat/org
  unavailable; cross-org negatives; delivery mock only; no raw token/PII logs; typecheck/lint/build; DEV email-safe
  smoke and desktop/mobile screenshots; DB migration/backfill idempotency and rollback if migration exists.
- **Rollback/degradation:** delivery failure leaves pending acceptance recoverable; revoked/superseded tokens never
  revive; legacy invite acceptance may remain guarded until cutover but cannot create broad membership.
- **Completion:** [ ] STF trace complete; [ ] exactly-once proven; [ ] all terminal/recovery states; [ ] 2FA recovery;
  [ ] no recipient/role leaks; [ ] first workspace correct; [ ] full audit PASS.
- **Merge dependency:** U0/U1/U2; can precede patient invite but shared exchange/auth primitives must not be duplicated.

### U3B — patient invite, delivery, activation, install and public-booking continuation

**Outcome:** specialist sends email-first patient invite with optional SMS delivery; patient proves canonical identity,
gains exactly one enrollment and reaches first value before install/push. Public booking can create the exact
appointment/enrollment and continue safely into the app.

- **Screens/flows:** `CLIN-02/03`, `ORG-PUB-02/03`, `PUB-04`, `PAT-02/04/11`; `PIN-01…09`, `SMS-01…03`,
  `PBK-01…08`, `ERR-*`.
- **Reuse/gaps:** canonical identity/enrollment, booking wizard, notification delivery and PWA UI; canonical patient
  invite/SMS lifecycle and booking→enrollment/app continuation are absent/incomplete.
- **Scope:** invite intent and manual-patient states; email primary proof/passwordless OTP; immutable SMS attempt on
  same invite; consent/suppression/rate limit; exactly-once enrollment; existing patient/multi-org addition; first
  useful org screen; install education, installed first launch/re-auth and later explicit push consent; booking
  identity resolution and signed narrow continuation.
- **Forbidden:** SMS elevation, SMS-created identity/invite, full recipient pre-auth, internal `userId` authority,
  auto-push prompt before value, duplicate identity, silent org switch, real sends outside approved send-safe setup.
- **Boundaries:** invite/booking/object is trusted org source; canonical patient is global; enrollment and every care
  object remain org-scoped; channel transport and topic preference are independent.
- **Decision gates:** UX08-05 controls neutral returning start, not trusted invite/booking entry; UX08-11 controls
  active-enrollment timing for staff invite. Safe defaults open the exact verified org, use chooser on later ambiguity
  and persist only explicit pending intent before proof.
- **Dependencies:** U1 and completed U5A resolver; shared exchange/proof components from U3A or one common prior
  contract; booking ownership and patient-role foundation proof.
- **Workstreams:** data — lifecycle/enrollment/booking transaction contracts; API — invite/delivery/OTP/accept/
  booking continuation/install/push; UI — specialist status, join, first value and PAT-11; ops — send-safe telemetry.
- **Migration/compat:** no schema invention; preserve canonical identity and old booking rows; deterministic linking
  only after ambiguity report; legacy booking done remains compatibility result until signed continuation is proven.
- **Validation:** PIN/SMS/PBK state and concurrency tests; duplicate/ambiguous identity; other-org enrollment;
  expired/replay/wrong recipient; delivery mocks; PWA browser/iOS/already-installed/session-loss/push-denied; DB
  migration/backfill/rollback proof if applicable; typecheck/lint/build; DEV smoke/screenshots; TEST only under
  separately authorized fixture/runbook.
- **Rollback/degradation:** email delivery recovery without consuming invite; SMS unavailable leaves email path;
  install/push unavailable leaves browser app usable; booking success remains accessible without portal session.
- **Completion:** [ ] PIN/SMS/PBK complete; [ ] UX08-11 linked or pending-intent safe subset only;
  [ ] enrollment exactly-once; [ ] no internal-id authority; [ ] first value
  before install; [ ] installed re-auth/context; [ ] delivery privacy; [ ] full audit PASS.
- **Merge dependency:** U1 + U3A + U5A; no reverse resolver dependency.

### U4 — acquisition and relationship integration checkpoint

**Outcome:** solo signup, staff invite, patient invite, SMS fallback and public booking use one coherent identity/
exchange/delivery vocabulary and reach guarded U2/U5A destinations without parallel auth or relationship paths.

- **Screens/flows:** `PUB-03/04`, `ORG-PUB-02/03`, `MGMT-01/02`, `ACC-02`, `CLIN-02/03`, `PAT-02/04/11`;
  complete `ACQ/STF/PIN/SMS/PBK/ERR` families.
- **Reuse/gaps:** U3S/U3A/U3B/U5A outputs; checkpoint looks for duplicated token exchange, proof, delivery attempts, recipient
  privacy, relationship mutation, 2FA/passwordless and continuation implementations.
- **Scope:** one integration adapter/contract per shared concern; end-to-end scenario tests; truthful first
  destination; consistent resend/revoke/replay/support recovery; unified telemetry/redaction; compatibility cutover
  inventory.
- **Forbidden:** feature expansion, new schema, merging staff and patient auth policy, SMS elevation, marking a
  delivery success as relationship acceptance, bypassing U5A for ambiguous patient context.
- **Boundaries:** staff membership and patient enrollment remain distinct; shared exchange scrubs raw token but does
  not choose persona/org beyond the trusted record; every destination repeats its normal guard.
- **Decision gates:** UX08-03 affects assistant landing and UX08-05 affects later neutral patient launch only. Safe
  destinations remain bounded OPS/MGMT and exact verified patient org/chooser.
- **Dependencies:** U2, U3S, U3A, U3B and U5A full audits. The checkpoint consumes these completed outputs and has no dependency
  that points back from them.
- **Workstreams:** data/API — contract convergence and idempotency; UI — recovery/copy consistency; delivery —
  immutable attempt trace; route — compatibility and raw-token scrub; observability — privacy-safe funnel facts.
- **Migration/compat:** no new migration in checkpoint. Reconcile U3S/U3A/U3B migrations/backfills and prove their combined
  forward/rollback order; old entries remain guarded until exact compatibility evidence exists.
- **Validation:** all acquisition scenarios end-to-end; concurrency/replay/persona collision; role/org destination;
  delivery mock/redaction; typecheck/lint/affected build; accumulated targeted tests; full CI at P2 checkpoint;
  desktop/mobile journey screenshots. No TEST send without separate authorization.
- **Rollback/degradation:** each channel/entry can degrade independently to its approved recovery; disabling one
  journey cannot break login, canonical booking result or existing relationship access.
- **Completion:** [ ] J1/J2/J3-J5 use owned outputs; [ ] one shared exchange contract;
  [ ] no staff/patient policy collapse; [ ] all scenario traces;
  [ ] combined migration order/rollback; [ ] privacy telemetry; [ ] full audit PASS.
- **Merge dependency:** U2 + U3S + U3A + U3B + U5A.

### U5B — organization patient card and history policy

**Outcome:** specialist works from one coherent organization patient workbench while every visible section/event is
authorized consistently and authorship remains truthful.

- **Screens/flows:** `CLIN-02`, `CLIN-03`, `CLIN-04`, `CLIN-08`; decision-safe clinic-card prototype.
- **Reuse/gaps:** current patient workbench/card/program/visit components; missing entry visibility/private classes
  and parity policy.
- **Scope:** common card shell; roster meaning; section policy; author/specialist attribution; own/assigned events;
  chosen shared-history policy after ruling; filter-after-policy; amendment trail; operational vs clinical sections.
- **Forbidden:** per-specialist duplicate route tree, empty own list→full org fallback, filter-as-authz, selected
  specialist impersonation, history rewrite, owner/admin clinical read by role alone.
- **Boundaries:** enrollment/object ownership server-resolved; event visibility on list/direct/count/search/export;
  author fixed from authenticated specialist binding; private/restricted class never inferred from membership.
- **Decision gates:** UX08-01. Until ruling, only common shell + own/assigned authorized data; shared/all/specialist
  controls absent and alternate card model not implemented.
- **Dependencies:** U1 and U5A; accepted entry/section policy contract. Patient-facing cross-links use the already
  completed resolver rather than making it conditional.
- **Workstreams:** data — visibility/provenance contract before migration; API — roster/card/history parity; UI — card
  tabs/filters/denials; route — reuse current dynamic tabs and program details.
- **Migration/compat:** do not relabel current rows as shared/private without deterministic evidence; produce ambiguity
  report and explicit backfill/compat policy. Keep old patient IDs/routes behind same guard until link census.
- **Validation:** specialist A/B own/shared/private across all parity paths; owner/admin with/without binding;
  assistant denial; two-org target denial; author/amend audit; migration/backfill/rollback if any; typecheck/lint/build;
  desktop/mobile card screenshots with allowed and withheld controls.
- **Rollback/degradation:** missing visibility classification fails closed to own/assigned/allowed subset; card can
  show section denial without exposing counts or metadata.
- **Completion:** [ ] UX08-01 linked or safe subset only; [ ] parity green; [ ] authorship immutable; [ ] no duplicate
  card tree; [ ] private leakage zero; [ ] full audit PASS.
- **Merge dependency:** U1/U5A; shared policy implementation cannot merge before UX08-01.

### U5C — same-organization collaboration and handoff

**Outcome:** approved team actions have distinct truthful lifecycles; history is retained, stale/deactivated parties
recover safely, and no generic “transfer patient” hides multiple semantics.

- **Screens/flows:** `CLIN-03`, `CLIN-05`, `/app/work/handoffs`; collaboration prototype.
- **Reuse/gaps:** named appointment/specialist relations may be reused only after U0 proof; primary assignment, care
  team and generic handoff are not considered implemented.
- **Scope:** only owner-approved operations among primary assignment, care team and named work-item reassignment;
  request/accept/reject/cancel/expire; capability and entitlement order; deactivation preflight/recovery; audit and
  notifications; post-transition visibility follows U5B policy.
- **Forbidden:** cross-org re-parent, generic button, implicit history grant, authorship rewrite, auto-complete on
  deactivation, one state object reused for semantically different operations.
- **Boundaries:** source/destination active bindings in same org; object-class capability; pending owner remains
  responsible until approved transition; cross-org stays out of launch without separate consent/copy contract.
- **Decision gates:** UX08-02 fully blocks product transitions. Safe default has no generic transfer and retains only
  existing explicitly contracted object actions.
- **Dependencies:** U1 and U5B policy boundary; explicit owner ruling and reviewed state/data contract.
- **Workstreams:** data — transition/audit/notification requirements without naming schema; API — commands and stale
  checks; UI — collaboration tab/queue/recovery; ops — deactivation preflight.
- **Migration/compat:** existing assignments remain source facts until mapping is proven; no inferred pending/accepted
  history. Any backfill gets ambiguity report and reversible compatibility read.
- **Validation:** complete transition matrix, concurrent/stale/double accept, inactive source/destination, capability+
  entitlement combinations, notification idempotency, history/authorship preservation, two-org negatives, DB
  migration/rollback if any, typecheck/lint/build, screenshots for allowed/withheld/recovery states.
- **Rollback/degradation:** disable new transitions while preserving pending/history/audit read and management
  recovery; never silently complete or restore broad access.
- **Completion:** [ ] UX08-02 ruling linked; [ ] named semantics only; [ ] full transition/recovery matrix;
  [ ] no history rewrite/access expansion; [ ] audit/notification proof; [ ] full audit PASS.
- **Merge dependency:** U1/U5B and UX08-02; cross-org transfer is a separate future plan.

### U5D — organization-scoped clinical communications

**Outcome:** patient and staff communication preserves one explicit organization context, truthful author and reply
target, while the owner-gated inbox/thread topology remains absent until selected.

- **Screens/flows:** `PAT-05`, `CLIN-07`, conditional `OPS-04`; these canonical IDs reserve communication surfaces,
  not an approved thread topology; include message/deep-link/notification recovery and handoff-continuity links only
  where already authorized.
- **Reuse/gaps:** reuse current explicitly authorized message/discussion objects only after U0 ownership and parity
  evidence; organization-wide inbox, specialist chat and new thread model are not assumed present.
- **Scope:** server-derived org/object context; author/specialist/recipient attribution; reply-target contract;
  list/direct/count/search/export parity; unread and notification routing; withheld/private classes; existing-object
  compatibility; implement the selected topology only after UX08-12 and a reviewed data/API contract.
- **Forbidden:** silent organization-wide visibility, cross-specialist read by UI filter, routing reply to current
  viewer instead of intended destination, merged cross-org inbox/counts, assistant clinical access, inventing a
  thread migration before the ruling.
- **Boundaries:** enrollment/membership + object policy precede presentation; author is immutable authenticated actor;
  handoff does not rewrite history or implicitly grant message access; notification/deep link revalidates the object.
- **Decision gates:** UX08-12 fully gates target topology. Safe default renders only existing authorized message
  objects with explicit organization/author/reply target; `OPS-04` and new unified/cross-specialist surfaces are absent.
- **Dependencies:** U1, U5A and U5B visibility boundary; UX08-12 plus reviewed topology/data contract for target
  inbox/thread migration. Existing safe attribution/parity work can merge without that branch.
- **Workstreams:** data — message ownership/visibility/provenance inventory; API — parity/unread/reply/deep-link;
  UI — PAT-05/CLIN-07/conditional OPS-04; delivery — notification target/copy; migration — ambiguity census.
- **Migration/compat:** no current conversation is re-parented or merged by display labels; any topology migration
  keeps immutable author/org/object links, reports ambiguous rows and provides guarded compatibility reads/rollback.
- **Validation:** two specialists/two organizations/assistant negatives across parity paths; author and reply target;
  unread/notification/deep-link revocation; handoff visibility continuity; migration forward/rollback/idempotency if
  applicable; typecheck/lint/build; desktop/mobile allowed/withheld/recovery screenshots; accumulated P3 full CI if
  U5D is the last included stage.
- **Rollback/degradation:** disable new topology while preserving authorized existing messages and attribution;
  unavailable routing shows explicit recovery and never broadens recipient or organization scope.
- **Completion:** [ ] UX08-12 linked or safe subset only; [ ] organization/author/reply target explicit;
  [ ] parity/unread/deep-link green; [ ] no cross-org or assistant clinical leak; [ ] migration ambiguity/rollback;
  [ ] full audit PASS.
- **Merge dependency:** U1/U5A/U5B; target topology blocked by UX08-12, safe attribution/parity subset independently
  mergeable. This is the last included P3 stage for its phase full-CI checkpoint.

### U6A — specialist-oriented platform landing and acquisition

**Outcome:** a specialist or clinic understands the product and reaches signup/demo; patient login remains available
but secondary; public legal/support recovery stays reachable on desktop/mobile.

- **Screens/flows:** `PUB-01…05`, `ACQ-01…05` entry; `PUB-06` only conditional.
- **Reuse/gaps:** current public/auth/legal primitives and registration; current landing is patient-first and missing
  full specialist/clinic acquisition composition.
- **Scope:** landing, product/pricing structure without unsupported tariff promise, signup/login/recovery links,
  public support/legal/status, responsive navigation, analytics events with privacy-safe attribution.
- **Forbidden:** directory before UX08-06, product capability claims not backed by mechanics, hidden patient entry,
  branded/custom-origin work, duplicate signup route.
- **Boundaries:** anonymous public data only; persona chosen by trusted auth flow, not query mutation; pricing reflects
  configured platform contract when available.
- **Decision gates:** UX08-06 blocks directory/release bundle. Safe launch navigation excludes `PUB-06` and does not
  imply rollout.
- **Dependencies:** U3S completed signup/security target for truthful CTA; U1 persona guards.
- **Workstreams:** data — published pricing/capability projection contract; API — public read/analytics; UI — landing
  and responsive states; content — plain-language proof/trust.
- **Migration/compat:** `/` and existing auth entries converge through compatibility states; no data migration unless
  published pricing projection contract requires separately reviewed work.
- **Validation:** anonymous route/privacy tests; ACQ states; link/accessibility/SEO metadata; desktop/mobile screenshot
  seals; console/network/overflow; typecheck/lint/build; no application delivery/DB mutation in visual acceptance.
- **Rollback/degradation:** signup disabled/demo fallback; pricing unavailable has honest contact path; legal/support
  remains reachable.
- **Completion:** [ ] specialist-first composition; [ ] patient secondary entry; [ ] ACQ trace; [ ] no PUB-06 leak;
  [ ] responsive/accessibility/visual seals; [ ] full audit PASS.
- **Merge dependency:** U1/U3S; rollout remains separately owner/deploy gated.

### U6B — published organization profile, booking and trusted join

**Outcome:** an organization can publish a safe projection; visitors book or join through a trusted organization
context while canonical platform URLs and recovery always work.

- **Screens/flows:** `ORG-PUB-01…03`, `PBK-01…08`, `STF/PIN/SMS/ERR` public states; `MGMT-04` publication.
- **Reuse/gaps:** current booking wizard, content/preview, services/specialists/locations; no complete publication
  object/version and join projection.
- **Scope:** draft/preview/publish lifecycle; stable platform alias; public projection fields; service/specialist/
  location cards after ownership audit; booking and join integration; unpublished/suspended/degraded states.
- **Forbidden:** reading private org base rows directly, Host/client org authority, directory inclusion by default,
  custom domain/auth/PWA, second booking wizard, pre-auth private recipient data.
- **Boundaries:** public projection is explicit and versioned; booking objects/invite exchange determine org; canonical
  platform path works independently of brand/domain.
- **Decision gates:** UX08-06 decides profile/release bundle/directory. Safe preparation separates each surface;
  no publication rollout without ruling.
- **Dependencies:** U2 and U4 completed acquisition convergence. The convergence output already contains underlying
  journey/context/guard evidence; this stage does not add a reverse journey edge.
- **Workstreams:** data — publication/projection/version requirements; API — preview/publish/public resolve; UI —
  MGMT-04 and ORG-PUB surfaces; route — platform alias and guarded compatibility booking paths.
- **Migration/compat:** create publication data only via reviewed ownership design; do not bulk-publish existing orgs.
  Existing booking URLs remain canonical/redirect-compatible until external-link census.
- **Validation:** draft/published/unpublished/suspended; projection privacy; booking slot race/payment/identity;
  join terminal states; alias rename/redirect semantics where implemented; typecheck/lint/build; desktop/mobile public
  screenshots and no-auth network inspection; migration/backfill/rollback proof if applicable; accumulated P4 full CI.
- **Rollback/degradation:** unpublish removes projection but preserves canonical management data; booking/join shows
  safe recovery; platform legal/support remains.
- **Completion:** [ ] projection privacy; [ ] booking/join trusted context; [ ] no duplicate wizard; [ ] publication
  audit/version; [ ] UX08-06 branch explicit; [ ] full audit PASS.
- **Merge dependency:** U2/U4; public rollout separately gated.

### U7 — core organization identity and optional brand presentation

**Outcome:** every org-scoped surface shows trustworthy organization context, while optional logo/color/content
presentation can change without affecting access, routing or recovery.

- **Screens/flows:** `MGMT-04`, P/O variants across `ORG-PUB`, `PAT`, `MGMT`, `CLIN`, `OPS`, `ACC`; brand/publication
  prototype scenario.
- **Reuse/gaps:** existing settings/assets/content preview and UI tokens; no unified resolver/payload/fallback across
  surfaces.
- **Scope:** minimum core org identity; brand asset/token validation; surface capability matrix; preview/publish;
  platform disclosure/legal/support; fallback and inaccessible-asset behavior; one design-token consumption path.
- **Forbidden:** UX08-07 W depth, hiding required operator/legal/security identity, authz by brand config, copied
  white-label components/app, domain/sender/PWA infrastructure.
- **Boundaries:** core org context always available after trusted resolution; paid brand presentation is entitlement-
  checked after authz; asset ownership and public safety are explicit.
- **Decision gates:** UX08-07 blocks W surfaces and staff-brand depth. Safe default is P/O only with platform trust
  anchor.
- **Dependencies:** U2 management/publication shell, U6B projection, settings-root/asset ownership foundation.
- **Workstreams:** data — brand/public asset ownership requirements; API — resolved presentation payload; UI — tokens,
  preview and fallbacks; QA — surface×tier matrix.
- **Migration/compat:** map existing safe org identity/assets only after deterministic audit; invalid/missing assets
  fall back to platform defaults; no automatic white-label enablement.
- **Validation:** surface matrix across disabled/enabled/degraded entitlement; org context invariant; unsafe asset/
  contrast/accessibility; cache invalidation; typecheck/lint/build; representative desktop/mobile screenshots;
  migration/backfill/rollback if any.
- **Rollback/degradation:** disable paid visuals while preserving org name/context, canonical navigation and recovery;
  no blank or misleading brand.
- **Completion:** [ ] P/O payload consistent; [ ] entitlement cannot grant access; [ ] fallbacks; [ ] W absent pending
  UX08-07; [ ] visual/accessibility seal; [ ] full audit PASS.
- **Merge dependency:** U2/U6B; W work blocked until UX08-07.

### U9 — global administration and bounded support

**Outcome:** platform operator manages organizations, commercial state, platform configuration/reliability and
identity repair from a dedicated shell without ordinary clinical browsing.

- **Screens/flows:** `PLAT-01…09`; current analytics/settings/health/audit/merge/name-match routes.
- **Reuse/gaps:** existing global analytics, system health/archive, audit, admin settings and repair pages; ownership
  currently mixed under doctor/admin navigation.
- **Scope:** platform shell; org lifecycle/detail; tariff/entitlement commercial operations per existing owner
  rulings; aggregate analytics; DB-backed configuration; reliability; true platform catalog governance only after
  ownership split; identity repair with purpose/audit; diagnostics inventory; one extension contract through which
  optional domain/sender/PWA readiness can later appear without changing core ownership or settings paths.
- **Forbidden:** `adminMode` as universal authority, silent organization membership, moving org assets to global by
  route relocation, patient behavior as ordinary analytics, patient-level support/session/repair before UX08-10.
- **Boundaries:** explicit platform capability and target org; aggregate/privacy thresholds; support and repair are
  purpose-specific, timed/audited if ever approved; no clinical authorship.
- **Decision gates:** UX08-10 blocks `PLAT-09` patient session/repair. Safe default is aggregate/org diagnostics and
  already contracted operations only.
- **Dependencies:** U1, U7 core identity where shown, platform data ownership classification and existing tariff/
  settings foundation. Core platform operations have no optional-commercial dependency and establish the sanctioned
  surface later adapters consume.
- **Workstreams:** data — platform/org/aggregate classification; API — dedicated capabilities and audit; UI — PLAT
  shell and moved components; route — guarded compatibility from doctor/admin paths.
- **Migration/compat:** route moves do not reclassify data. Settings writes keep sanctioned service/mirror. Existing
  admin links redirect only after capability equivalence and link census.
- **Validation:** global-admin vs clinic-admin/doctor direct-route matrix; target-org isolation; aggregate threshold;
  secret masking; repair dry-run/audit; no patient browse; typecheck/lint/build; DEV role smoke/screenshots; full CI
  at P5 checkpoint.
- **Rollback/degradation:** old privileged entry may remain guarded; degraded data sources show stale/unavailable,
  never fall back to clinical query. No support session exists under safe default.
- **Completion:** [ ] PLAT ownership split; [ ] dedicated guards; [ ] settings mirror path; [ ] repairs purpose/audit;
  [ ] one optional-adapter extension path; [ ] UX08-10 safe boundary; [ ] full audit PASS.
- **Merge dependency:** U1/U7 and ownership classification; PLAT-09 conditional branch blocked by UX08-10.

### Commercial capability family U8 — domain, sender and white-label PWA

U8 is one commercial phase with three independently mergeable sub-stages. Do not start all three because one owner
ruling mentions them together. Each stage consumes U9's sanctioned platform configuration/reliability/org-ops path;
it adds a typed health/readiness adapter to that path and never creates a second platform settings, incident,
organization-lifecycle or support model. A branch not selected by owner ruling is physically absent, not a skipped
pseudo-stage required by core execution. Accumulated P6 full CI runs once after the last included U8 stage; if none is
included, P6 is absent and U9/U10 proceed directly.

#### U8A — hostname base and surface bindings

- **Outcome:** verified custom hostname can serve only explicitly approved surfaces while canonical platform URLs
  remain available.
- **Screens/flows:** `MGMT-05`; conditional bindings for `ORG-PUB-01…03`, later auth/PWA only if approved.
- **Reuse/gaps:** stable platform alias and UX-05 lifecycle contract; no current UI is treated as a complete base/
  binding implementation.
- **Scope:** ownership proof, TLS/routing base readiness, stable platform alias, independent per-surface lifecycle,
  audit, selective suspend/remove/quarantine and loop-safe canonical fallback.
- **Forbidden:** Host as authz, all-or-nothing domain status, auto-binding every surface, auth/custom PWA before its
  readiness stage, direct DNS/provider secret exposure.
- **Boundaries:** hostname selects a published presentation entry only; authenticated principal/object policy remains
  server-resolved independently; base readiness and each surface binding are separate.
- **Decision gates:** UX08-08. Safe default keeps every custom binding disabled.
- **Dependencies:** U6B/U7/U9 core platform ops/configuration surface; infrastructure/security readiness and separate
  deploy authorization.
- **Workstreams:** data — base/binding lifecycle contract; API — verification/readiness/resolution; UI — MGMT-05;
  ops — DNS/TLS/routing and audit without secret exposure.
- **Migration/compat:** reviewed hostname/binding contracts before persistence; no domain backfill or redirect of
  existing orgs; platform alias immutable target and rename compatibility are preserved.
- **Validation:** ownership/TLS/routing failures; every binding state; redirect loops; unknown/suspended host;
  origin/cookie/CSRF headers for enabled surfaces; typecheck/lint/build; integration smoke in an approved disposable/
  TEST setup; screenshots; accumulated P6 full CI if U8A is the last included optional stage.
- **Rollback/degradation:** disable one binding and return canonical platform URL; base or another surface need not be
  removed.
- **Completion:** [ ] UX08-08 ruling; [ ] base≠binding; [ ] one-way fallback; [ ] selective decommission;
  [ ] canonical URL always works; [ ] full audit PASS.
- **Merge dependency:** U6B/U7/U9 plus approved infrastructure handoff; merge cannot imply DNS/TLS rollout.

#### U8B — auth origin and per-origin white-label PWA

- **Outcome:** an explicitly approved origin can support auth/install/push without cloning the app or weakening
  identity and organization resolution; platform PWA remains stable.
- **Screens/flows:** conditional `ORG-PUB-03/PUB-04`, `PAT-11`, `ACC-04` origin/PWA variants; PIN installed-launch
  and recovery states.
- **Reuse/gaps:** platform PWA/install/push and U8A verified origin; per-origin manifest/session/support contract is
  not considered present.
- **Scope:** only owner-approved origins; origin-bound manifest/name/icons/install/push; session handoff/re-auth;
  OAuth/cookie/CSRF/service-worker scope and support/recovery matrix; subscription rotation.
- **Forbidden:** cloning patient/staff app, cross-origin token replay, service-worker scope leakage, using hostname to
  select tenant after auth, breaking stable platform PWA.
- **Boundaries:** verified origin is presentation/delivery scope, never tenant authority; invite/object/enrollment
  remains trusted source; session and push subscription are origin-bound.
- **Decision gates:** UX08-08 must explicitly include auth/PWA. Safe default is platform auth and platform PWA only.
- **Dependencies:** U8A, U3A/U3B/U5A/U7/U9; security architecture review.
- **Workstreams:** data — origin/PWA binding and subscription ownership contract; API — session/re-auth/manifest/push;
  UI — install/recovery; ops — origin/browser/support matrix.
- **Migration/compat:** platform PWA remains default; subscriptions/manifests are not silently reassigned across
  origins. Any compatibility/re-enrollment path is explicit and reversible.
- **Validation:** browser/origin matrix, cookies/CSRF/OAuth, raw-token exchange, install/update/offline/push rotation,
  revoked org/domain, canonical fallback; typecheck/lint/build and real browser visual/accessibility seals;
  accumulated P6 full CI if U8B is the last included optional stage.
- **Rollback/degradation:** disable origin binding; platform PWA and platform re-auth recovery remain available;
  subscription failure does not remove browser access.
- **Completion:** [ ] owner scope; [ ] platform PWA intact; [ ] no cross-origin authority; [ ] origin matrix;
  [ ] recovery/support; [ ] full security + visual audits PASS.
- **Merge dependency:** U3A/U3B/U5A/U7/U8A/U9 and the explicit UX08-08 branch; no independent per-origin rollout.

#### U8C — organization sender readiness and delivery policy

- **Outcome:** every message uses a truthful authenticated sender identity or a declared hold/fallback policy, with
  visible health and immutable per-attempt audit.
- **Screens/flows:** `MGMT-06` plus delivery/recovery states in `MGMT-02`, `CLIN-02/03`, `ORG-PUB-03`;
  STF/PIN/SMS delivery branches.
- **Reuse/gaps:** U3A/U3B immutable delivery attempts and platform sender; complete organization email identity and
  class-specific fallback policy are missing.
- **Scope:** authenticated email identity readiness, SMS/push presentation, message-class eligibility, effective
  sender audit, bounce/complaint/provider health, retry/hold/fallback state and operator recovery.
- **Forbidden:** spoofing org sender, new integration secrets in env, treating display name as authenticated sender,
  fallback for unknown/marketing class, conflating sender health with invite acceptance.
- **Boundaries:** authorization and invite lifecycle precede delivery; effective sender is presentation/transport;
  credentials remain server-owned and org configuration remains DB-backed/mirrored.
- **Decision gates:** UX08-09 commercial fallback policy. Safe default holds unknown/custom-only classes and uses
  verified platform fallback only for preclassified mandatory transactions.
- **Dependencies:** U3A/U3B delivery model, U7 identity, U9 platform ops/configuration surface, sanctioned DB
  settings/integrator mirror. DNS/provider readiness is engineering invariant, not owner choice.
- **Workstreams:** data — sender/readiness/message-class contract; API — verify/status/effective policy; UI — MGMT-06
  and recovery; delivery — provider attempts/bounce/complaint/audit.
- **Migration/compat:** current platform sender remains truthful; no automatic opt-in to custom sender. Message-class
  mapping and any backfill require audited deterministic source.
- **Validation:** SPF/DKIM/DMARC/envelope/Reply-To/provider states, bounce/complaint, class policy, per-attempt audit,
  send-safe mock/integration only, no secrets/PII logs, typecheck/lint/build, screenshots; accumulated P6 full CI when
  U8C is the last included optional stage (otherwise after the actual last included U8 stage).
- **Rollback/degradation:** hold custom-only classes and use only owner-approved verified fallback; existing accepted
  relationship is not undone by delivery degradation.
- **Completion:** [ ] UX08-09 linked; [ ] readiness complete; [ ] class policy exact; [ ] effective identity audited;
  [ ] no spoof/secret leak; [ ] full audit PASS.
- **Merge dependency:** U3A/U3B/U7/U9 and explicit UX08-09 policy; merge does not authorize real provider rollout.

### U10 — route convergence, visual consolidation and final acceptance

**Outcome:** target IA is the only user-visible system, old entries remain safe only where compatibility requires,
and the implemented product passes role, context, recovery, responsive, accessibility and visual acceptance.

- **Screens/flows:** all `57/57`; all UX-04/07 scenarios; all `150/150` current page allocations.
- **Reuse/gaps:** shared patient/doctor/public primitives and accepted UX-07 direction; remove navigation duplication
  only after behavior is green.
- **Scope:** canonical internal links; compatibility redirects/resolvers; alias retirement census; one component
  ownership per screen family; complete empty/loading/permission/entitlement/context/suspended/error states; design
  tokens and copy convergence; telemetry and runbooks; final screen/route manifest.
- **Forbidden:** broad visual rewrite before functional stages; retiring deep links without evidence; duplicate target
  routes to avoid conflict; changing owner-gated policy during polish; counting prototype seals as implementation
  seals.
- **Boundaries:** redirects retain trusted context and guard; responsive changes composition only; withheld actions
  absent; public recovery never opens authenticated shell; synthetic evidence only.
- **Decision gates:** every affected UX08 branch must have dated ruling or be demonstrably absent under safe default.
- **Dependencies:** all included stages audited; current foundation integration checkpoint; no unresolved red stage.
- **Workstreams:** route/link census; shared UI consolidation; copy/accessibility; telemetry; acceptance automation and
  screenshots.
- **Migration/compat:** observe inbound/deep links and maintain versioned guarded redirects; retire only with zero
  unsupported consumer evidence and rollback mapping. No data migration in visual pass.
- **Validation:** mechanical 57/57 and current page denominator; role × route × direct object × state; J1…J7 and 9
  prototype scenarios; desktop/mobile/PWA; keyboard/focus/semantics/contrast; console/network/overflow; targeted tests,
  typecheck, lint, affected builds and final full CI; migration/DB gates from included stages; DEV smoke and
  owner-authorized TEST acceptance separately; source-bound screenshot manifests and two independent visual seals.
- **Rollback/degradation:** compatibility map allows reverting links/shell without weakening new server guards;
  unavailable optional mechanics degrade to explicit recovery; no owner-gated feature is silently enabled.
- **Completion:** [ ] 57/57 exact; [ ] 150/150 reconciled to current denominator; [ ] no duplicate route/component
  family; [ ] all journey/recovery states; [ ] role/context matrix green; [ ] final CI; [ ] two visual seals;
  [ ] owner decisions traced/absent safely; [ ] full independent implementation audit PASS.
- **Merge dependency:** final integration only after all included stages and foundation handoff gates. Deploy and
  `main`/`test` actions remain owner-authorized operations outside this roadmap.

## 9. Dependency graph

```text
Foundation handoff -> U0 -> U1 -> U2
U1 -> U5A
U2 -> U3S
U2 -> U3A
U3A + U5A -> U3B
U3S + U3A + U3B + U5A -> U4
U1 + U5A -> U5B -> U5C
U5B -> U5D
U3S + U1 -> U6A
U4 + U2 -> U6B -> U7 -> U9
U6B + U7 + U9 -> U8A -> U8B
U3A + U3B + U7 + U9 -> U8C
All included audited stages + current foundation checkpoint -> U10
```

Additional gates:

- The only patient-context direction is `U5A -> U3B -> U4`: U5A has no invite dependency and U4 does not reopen it.
- U5B shared policy waits for UX08-01; U5C waits for UX08-02; U5D target topology waits for UX08-12.
- U2 assistant and final dual-mode variants wait for UX08-03/04, or ship only their safe subsets.
- U5A final neutral behavior waits for UX08-05, while chooser-safe resolver can proceed.
- U6A/U6B release bundle/directory waits for UX08-06.
- U7 W depth waits for UX08-07; U8A/B waits for UX08-08; U8C fallback waits for UX08-09.
- U9 patient-level support waits for UX08-10.
- U3B active-enrollment timing waits for UX08-11 or ships only the pending-intent safe subset.
- U9 core PLAT/config/reliability/org operations precedes every included U8 adapter. An absent U8 branch is not a
  dependency node and never blocks U9, core platform URLs, P/O brand context, stable platform PWA or U10.

### 9.1 Normative direct-dependency registry

The registry below is the machine-check source for stage DAG. The diagram is its compact projection; prose
`Dependencies`/`Merge dependency` may add external foundation, owner-ruling or infrastructure gates but may not add a
reverse stage edge.

| Stage | Direct stage dependencies |
|---|---|
| U0 | none (foundation handoff is external) |
| U1 | U0 |
| U2 | U1 |
| U5A | U0, U1 |
| U3S | U0, U1, U2 |
| U3A | U0, U1, U2 |
| U3B | U1, U3A, U5A |
| U4 | U2, U3S, U3A, U3B, U5A |
| U5B | U1, U5A |
| U5C | U1, U5B |
| U5D | U1, U5A, U5B |
| U6A | U1, U3S |
| U6B | U2, U4 |
| U7 | U2, U6B |
| U9 | U1, U7 |
| U8A | U6B, U7, U9 |
| U8B | U3A, U3B, U5A, U7, U8A, U9 |
| U8C | U3A, U3B, U7, U9 |
| U10 | every included audited stage; absent optional U8 branches are not nodes |

## 10. Validation tiers

| Risk | Required evidence |
|---|---|
| Documentation/contract only | ID/dependency/decision/link consistency, current-state evidence, `git diff --check` |
| UI composition without behavior/data change | targeted component/navigation tests, typecheck/lint, affected build, role smoke, desktop/mobile screenshots, accessibility basics |
| Auth/invite/capability/patient context | unit + integration + concurrency/replay, direct/list/count/search/export/write parity, real-role two-org/two-patient negatives, typecheck/lint/build, DB/migration proof, runtime smoke |
| Migration/backfill | reviewed ownership/schema contract, forward/rollback, idempotency, zero unexplained NULL/orphan/foreign-parent/ambiguous rows, compatibility window, scratch then authorized TEST evidence |
| Delivery/domain/origin/PWA | send-safe provider/mock, DNS/TLS/routing/origin/browser matrices, secret/PII redaction, canonical fallback, fail injection and recovery |
| Stage checkpoint | worker checklist + full independent audit + integrated correction + full re-audit when needed |
| Phase/final checkpoint | accumulated relevant gates and full CI; U10 adds source-bound screenshot manifests and two independent visual/usability seals |

Тесты не повторяются после каждой мелкой правки. Targeted checks идут один раз на цельный stage; full CI — на
крупном phase/integration/final gate или после существенного накопленного пакета.

## 11. Route and component anti-duplication register

- `MGMT-SETUP`, `MGMT-TEAM`, `MGMT-INVITE`, `CLIN-PAT-INVITE`, `ACC-FIRST`, `PAT-INSTALL` — state/flow aliases,
  не новые screen IDs.
- `CLIN-04/05` остаются card tabs/states плюс одна recovery queue; не получают отдельную patient-card hierarchy.
- `CLIN-08` переиспользует patient-card/program routes; `OPS-05` не существует, account = `ACC-01…04`.
- Public and patient booking reuse one canonical wizard family with context-specific entry; alias steps retire after
  census.
- Solo/clinic differences — composition/capability variants одного CLIN shell.
- Owner/admin+specialist — один login и независимые MGMT/CLIN capabilities; финальный switch style зависит от
  UX08-04, но route bodies не копируются.
- Assistant — bounded OPS composition over explicit ports, не doctor route with hidden tabs.
- Platform admin — PLAT shell; перемещение route не меняет ownership данных.
- Branding/domain/PWA — resolver/tokens/bindings, не fork приложения.

Каждый stage audit запускает duplicate search по target ID, candidate route, navigation destination и shared
component ownership. Новый параллельный route/component допустим только после изменения UX-06 canon, а не как
локальная implementation shortcut.

## 12. Final implementation acceptance

План реализации можно считать выполненным только когда:

- [ ] каждый включённый stage имеет worker evidence, полный независимый audit и закрытый re-audit/follow-up;
- [ ] все `UX08-01…12` либо имеют датированное owner ruling, либо соответствующая ветка физически отсутствует и
      безопасная граница доказана;
- [ ] foundation/enforcement handoff пройден без изменения `SEQUENCE.md` и без дублирующих principal/settings/
      membership paths;
- [ ] `57/57` canonical screen IDs и актуальный denominator current pages согласованы механически;
- [ ] J1…J7, recovery, install/push, public booking, multi-org, card/history and approved handoff проходят acceptance;
- [ ] role/capability/tenant/patient/direct-object/parity matrices зелёные;
- [ ] migrations/backfills имеют reviewed ownership, forward/rollback/idempotency and compatibility evidence;
- [ ] canonical platform fallback, core org context, sender truthfulness and optional-feature degradation доказаны;
- [ ] нет duplicate solo/clinic/assistant/card/booking/account/white-label route or component families;
- [ ] targeted checks, typecheck, lint, builds, risk-relevant DB/runtime smoke и final full CI зелёные;
- [ ] final desktop/mobile/PWA screenshot batch source-bound; два независимых visual/usability seals получены;
- [ ] existing `ROADMAP.md`, `LOG.md`, route map and operational runbooks отражают итог; устаревший текст помечен,
      а не конкурирует с каноном;
- [ ] commit/push/merge/deploy выполнены только в разрешённые ветки/среды; `main`/`test` и TEST/prod operations имеют
      явное разрешение владельца.

До выполнения этого checklist отдельный красивый экран, зелёный узкий тест, прототип seal или foundation smoke не
доказывает завершение всей implementation цели.
