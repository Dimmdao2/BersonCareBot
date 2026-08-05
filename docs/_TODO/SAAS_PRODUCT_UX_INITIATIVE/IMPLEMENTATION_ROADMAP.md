# UX-09 — implementation roadmap

**Жанр:** роадмап порядка и зависимостей. Статус каждой работы берётся только из её карточки, требования и
доказательства — только из связанного execution checklist. [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md)
остаётся единственным источником требований; этот файл не является планом исполнения.
**Authority:** `OWNER_REVIEW_2026-07-18.md` побеждает более ранние product/UX contracts при конфликте;
`OWNER_RULINGS_2026-07-16.md` действует в неизменённой им области. Foundation canon остаётся выше только в
foundation/tenant/enforcement scope.
**Тип документа:** decision-gated plan, не разрешение на implementation, deploy, DB changes или rollout.  
**Интеграционная ветка исполнения:** `feat/doctor-ui-rebuild`; историческая planning-ветка
`feat/saas-interface-work3` больше не является execution base.

## 1. Результат и граница плана

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

План доводит проверенный UX-03…08 contract до последовательности самостоятельных implementation stages. В конце
реализации должны существовать единые capability-gated поверхности для platform, organization management,
clinical work, operations, patient и public journeys; старые маршруты должны либо безопасно вести в канонические,
либо быть сняты после доказанного link census.

Этот документ **не**:

- выбирает ответы `UX08-01…12` за владельца;
- проектирует таблицы, поля, enum или migration SQL;
- запускает код, БД, внешнюю доставку, TEST/prod deploy либо merge в основной workstream;
- заменяет `SAAS_FOUNDATION/SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md` или их TEST acceptance;
- обещает public launch, custom-domain/PWA rollout, custom sender или separate native organization app.

Канон результата: `57/57` target screen IDs из `TARGET_IA.md`, семь UX-04 journey families и `152/152` current
`page.tsx` из `ROUTE_MIGRATION_MAP.md` имеют один непротиворечивый implementation destination, guard, compatibility
и acceptance path. Это не означает, что все 57 screens обязательно создаются отдельными route files: tabs,
states, aliases и shared account surfaces остаются ровно такими, как классифицировано в UX-06.

## 2. Источники истины и provenance

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

При конфликте действует следующий порядок:

1. `AGENTS.md`, `.cursor/rules/*`, `docs/ORCHESTRATION_BINDINGS.md`;
2. `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md`, `SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md` для текущего SaaS/
   TEST workstream;
3. `OWNER_REVIEW_2026-07-18.md` — последний product/UX authority; финальные решения побеждают более ранние
   варианты этой сессии и старые product/UX документы, но не меняют Foundation scope из пункта 2;
4. `OWNER_RULINGS_2026-07-16.md` — предыдущий authority в части, не изменённой пунктом 3;
5. `REQUIREMENTS.md`, `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`;
6. `ENTRY_AND_INVITE_JOURNEYS.md`, `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`;
7. `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `ROUTE_MIGRATION_MAP.md`;
8. `UX07_PROTOTYPE_INDEX.md` и `UX07_INDEPENDENT_AUDIT.md` как historical pre-ruling evidence;
9. `OWNER_DECISION_PACKET.md` — исходные варианты и history/provenance, подчинённые dated rulings.

Каждая implementation запись и audit report обязаны разделять:

- `owner ruling` — только датированное явное решение владельца;
- `repository/current fact` — доказанный кодом, БД или runtime факт;
- `approved contract/invariant` — уже проверенная UX/security/architecture граница;
- `planner recommendation` — предпочтение, которое не даёт разрешения;
- `safe default` — fail-closed временное поведение до решения;
- `unresolved decision` — заблокированная policy/launch ветка.

## 3. Связь с текущим SaaS enforcement sequence

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 3.1 Два независимых трека

`SAAS_FOUNDATION/SEQUENCE.md` остаётся единственным источником порядка текущей TEST-first foundation/enforcement
работы. UX-09 не вставляет свои stages между его этапами и не переименовывает их. UX implementation может начинаться
только отдельным разрешённым workstream после stage-level readiness review.

| Foundation/enforcement gate                                                        | Что UX-09 может делать до него                                           | Что запрещено до него                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Membership/principal/capability contracts подтверждены текущим foundation          | Документировать port/API contract, UI composition и fail-closed states   | Создавать второй membership resolver, обходить role/GUC/RLS path, закреплять coarse `adminMode` как target auth |
| Settings-root split завершён и patient-readable settings contract доказан          | Разделять UI ownership PLAT/MGMT/ACC, описывать consumer payload         | Добавлять новые per-flag bypass/read whitelist или читать secret-bearing settings из patient/public UI          |
| Enforced role/principal coverage и two-org negatives доказаны для затронутых paths | Реализовывать чистые presentation components поверх уже sanctioned ports | Переносить route/API и объявлять tenant-safe без реального-role direct/list/count/search/export/write proof     |
| Organization provisioning/ownership contract утверждён                             | Делать shell и state composition на существующих read models             | Изобретать параллельные organization/branding/invite tables или client-provided `organizationId` authority      |
| UX stage прошёл собственный audit                                                  | Подготовить интеграционный handoff                                       | Засчитывать UX audit как D3/D4/E1/E2/G1 evidence или наоборот                                                   |

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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
- Initial launch = solo specialist. Multi-specialist clinic, assistant/receptionist and complex clinic communication
  are future-compatible capabilities and cannot delay launch.
- Не создавать параллельные solo/clinic route trees, per-specialist patient cards, assistant copies doctor screens,
  second booking wizard, second account area или cloned branded app.
- Старый route остаётся guard-equivalent compatibility entry до link/deep-link census; redirect не ослабляет target
  guard и не меняет trusted context.

## 5. Decision gates

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Все двенадцать ответов пакета 16.07 классифицированы в dated rulings artifact. Review 18.07 добавил новые final
decisions и branch-local decision gates. Execution gate теперь означает `0 unclassified owner decisions`, а не
ложное `0 unresolved`: каждый открытый вопрос обязан иметь owner, зависимую ветку и безопасный stop. `Resolved
future capability` не означает initial scope; engineering configuration и research backlog не являются owner
decisions.

| Decision                              | Current classification                                         | Initial-release execution                                                                                                   | Implementation policy / non-blocking backlog                                |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| UX08-01 card/history/`Мои`            | resolved launch                                                | U5B implements one org card, visit relation and own-events default                                                          | Record-class authorization policy, not a product decision gate              |
| UX08-02 transfer premise              | rejected premise                                               | No transfer lifecycle stage; solo/manual visit path stays in U3B/U5B                                                        | Another-specialist booking belongs only to a future clinic extension        |
| UX08-03 assistant scope               | resolved launch absence                                        | No role/workspace/grants implemented at launch                                                                              | Future clinic design is outside current scope; no owner gate                |
| UX08-04 dual-role navigation          | resolved launch                                                | U2 provides one login and a simple management destination                                                                   | Menu entry versus explicit mode switch is implementation choice             |
| UX08-05 patient neutral start         | resolved launch                                                | U5A restores last active org and shows switcher                                                                             | None beyond normal implementation design                                    |
| UX08-06 public launch scope           | resolved launch                                                | U6A/U6B include landing/profile/booking/join; directory absent                                                              | Directory is future-deferred, not blocked launch work                       |
| UX08-07 brand depth                   | resolved future capability                                     | U7 implements core org identity/shared layout; full org brand waits for U8 origin                                           | Own domain or platform subdomain + org name/logo; no per-clinic design fork |
| UX08-08 domain/org-app direction      | resolved staged future capability                              | U8A/B absent from initial DAG; platform web app first                                                                       | Generated org PWA later; separate native org app is research backlog only   |
| UX08-09 custom-sender failure         | resolved direction, future feature                             | If U8C is later built: standards-backed bounded retry within `expires_at`, expiry and owner alerts; never platform fallback | Configurable engineering defaults, not owner gate                           |
| UX08-10 global-admin patient workflow | rejected premise                                               | U9 implements diagnostics/reports only; no patient workflow branch                                                          | None                                                                        |
| UX08-11 patient relationship premise  | rejected old invite-first premise; replacement resolved launch | U3B creates card + scheduled/walk-in visit, then links verified portal identity                                             | Detailed matching/conflict policy                                           |
| UX08-12 communication topology        | resolved launch; future scope excluded                         | Existing solo chat is unchanged; no clinic communication stage in launch                                                    | Architecture reservation only; no owner gate                                |

Ответ владельца переносится в предусмотренный roadmap датированный rulings artifact; только после этого gate в этом
файле обновляется ссылкой на источник. Recommendation из packet нельзя переносить как ruling.

### 5.1 Upstream provenance reconciliation

Полный registry находится в `OWNER_DECISION_PACKET.md` §«Полная сверка upstream-решений». Execution использует его
как обязательный gate, а не перечитывает молчаливо candidate text как policy:

- `UX08-01…12` — dated owner outcomes: resolved launch, resolved future capability, excluded future scope or rejected premise;
- tenant/identity, one-org staff, patient multi-org authorization, no persona overwrite, exactly-once, raw-token
  handling, sender truthfulness and permission-before-filter — architecture/security invariants from UX-03…05;
- one signup path with optional practice-shape question, no SMS-only launch and strongest already-trusted booking
  activation channel — planner recommendations with explicit fail-closed safe defaults, not owner rulings;
- staff 2FA mechanics/recovery are mandatory architecture/security scope; exact factor/role/grace is resolved by a
  reviewed security-architecture contract and cannot be represented as completed before that freeze;
- staff-created relationship/card/visit before activation is ruled by `UX08-11`; solo launch chat and deferred clinic
  topology are ruled by `UX08-12`.

U0 must re-run this registry against current owner rulings before implementation. A new literal open item stops the
affected branch at contract readiness until it is classified in the existing packet; it does not silently become a
stage assumption or trigger an ad hoc decision document.

## 6. Current reuse and gap baseline

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 6.1 Canonical screen ownership

This table is the UX-09 projection of the exact UX-06 registry; ranges are inclusive and expand to `57` IDs.

| Canonical IDs   |  Count | Primary implementation owner | Conditional owner                                                                                                      |
| --------------- | -----: | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PUB-01…06`     |      6 | U6A                          | `PUB-06` is a reserved deferred ID and is absent from initial release by ruling                                        |
| `ORG-PUB-01…03` |      3 | U6B                          | U8A/B adds only approved origin variants                                                                               |
| `PLAT-01…09`    |      9 | U9                           | PLAT-09 is support reports/escalation only; no patient intervention                                                    |
| `MGMT-01…09`    |      9 | U2                           | U6B owns publication behavior; U7/U8 owns brand/domain/sender panels                                                   |
| `CLIN-01…11`    |     11 | U2/U5B                       | U3B manual patient/visit; CLIN-05 is future-reserved; existing solo chat remains as-is; launch modules converge in U10 |
| `OPS-01…04`     |      4 | Future clinic plan           | Reserved IDs; assistant/receptionist not initial scope                                                                 |
| `PAT-01…11`     |     11 | U5A                          | U3B activation/install; existing solo PAT-05 remains as-is; launch modules converge in U10                             |
| `ACC-01…04`     |      4 | U2                           | U3S launch security; future U3A/U8B only if separately activated                                                       |
| **Total**       | **57** |                              |                                                                                                                        |

Flow/state aliases remain non-canonical: `MGMT-SETUP`, `MGMT-TEAM`, `MGMT-INVITE`, `CLIN-PAT-INVITE`,
`ACC-FIRST`, `PAT-INSTALL`, `ORG-PUB-04` and all `ACQ/STF/PIN/SMS/PBK/MOR/ERR` IDs. `OPS-05` remains obsolete;
none of them may create a new screen family.

### 6.2 Reuse and gaps

| Area                             | Reuse                                                                           | Gap, который stage должен доказать или закрыть                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup/auth                      | Public auth, registration/start-confirm, email challenge, patient email setup   | Specialist binding deferred; patient target passwordless compatibility; persona collision/privacy/session retry; complete 2FA recovery                          |
| Future clinic staff invite       | Current members/invite UI and token mechanics as historical reuse evidence      | Deferred; no initial implementation. Exact future staffing/grants require a later clinic contract                                                               |
| Manual patient + portal linking  | Existing patient identity/enrollment, calendar/booking and delivery primitives  | Manual card + scheduled/walk-in visit and identity-to-existing-card linking are incomplete; invite/proof remains separate                                       |
| SMS                              | Existing notification channel infrastructure                                    | Patient invite SMS lifecycle absent; SMS must remain transport-only and consent/suppression-aware                                                               |
| Public booking                   | Existing booking wizard and appointment/payment primitives                      | Success does not prove atomic enrollment/app continuation; internal `userId` authority/leak and identity ambiguity need removal                                 |
| Staff capabilities               | Current role/admin/doctor gates and membership resolver                         | Launch owner/admin/specialist capability/object parity is not evidenced; assistant is absent rather than assigned provisional grants                            |
| Patient context                  | Enrollment resolver and patient screens                                         | Chooser/switcher contract incomplete; Patient Today currently exposes `organization_principal_required` defect                                                  |
| Card/history                     | Patient workbench, visits/program components                                    | Ruled one-card/visit relation needs entry visibility/private-class and list/direct/count/search/export enforcement                                              |
| Future clinic visit coordination | Existing specialist/appointment relations                                       | Deferred; launch uses current-specialist manual/scheduled/walk-in visits only                                                                                   |
| Management                       | Clinic members/settings, booking/admin tabs, mixed `/app/settings`              | No coherent MGMT shell; personal/org/platform settings and booking setup are mixed                                                                              |
| Public/profile                   | Current patient-first landing, booking and legal pages                          | Specialist-first landing, published org projection, trusted join and directory release boundary incomplete                                                      |
| Branding/domain/sender           | Some settings/content/preview/PWA primitives                                    | No complete org brand resolver, publication version, hostname base/binding UI, authenticated sender readiness or per-origin PWA                                 |
| Platform admin                   | Analytics, health, audit, settings and aggregate identity-integrity diagnostics | Current doctor/admin shell and `adminMode` mix platform/org/clinical ownership; patient merge/name-match pages are not reusable platform-admin product surfaces |
| Routes                           | 152 current pages classified, many reusable components                          | 57 canonical target IDs are logical; route moves need guard-equivalent redirects, link census and no duplicate trees                                            |

Любой gap, который предполагает новую persistence shape, сначала получает reviewed data/API contract. Название
будущей таблицы или поля не является частью этого roadmap.

### 6.2a U0 current-contract handoff (2026-07-19)

**Basis.** Current-source handoff only: base
`be30065f24810a49a46a2aa3b5ef5095f3a27309`; Foundation canon `SEQUENCE.md`,
`SAAS_ENFORCE_ROADMAP.md`, `R2_READINESS_CLOSURE.md`, T0.4 and P0.11; current screen/route/journey canon.
Historical P0/R2 checklists were used only as provenance and not executed. C2/C3 closure at `4a889093d` and the
bounded FIO subset at `a9d70dc85` are evidence, not completion of residual contracts.

**Sanctioned reuse, not substitutes.** Staff context is
`OrganizationMembershipPort` → `createOrganizationMembershipService().resolveOrganizationForUser` →
`requireOrganizationWorkspaceContext` / `requireDoctorWorkspaceContext` / `require*WorkspaceApiContext`; exactly
one active staff membership is resolved and multiples are a data-integrity error. Clinical authorship remains the
resolved `specialistId` binding, not management membership. Specialist provisioning is the existing
`organization-provisioning` port/service. Patient context is the existing `patient-organization` port/service/repo.
Settings use only `createSystemSettingsService().updateSetting` and its matching-org mirror
`syncSettingToIntegrator`; global fallback is NULL-org. Entitlement reads use only `resolveOrgEntitlements` /
`isMechanicEnabled` behind `requireEntitlement`; they are currently default-on/dormant and therefore do **not**
prove a feature entitlement wall.

| §6 gap                 | Current fact / ownership                                                                          | Missing contract → stage/task gate                                                                                                                                                                            | Safe default                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Signup/auth            | Global identity; staff org comes from membership; specialist binding is separate.                 | Binding, first-run, 2FA/recovery → **U3S**. The 2026-07-19 FIO ruling separates new-patient registration from passwordless existing-account login. | Do not ask FIO before every OTP login.                  |
| Future staff invite    | Current member/invite mechanics are reuse; assistant has no launch workspace.                     | Clinic grants/seats → future **U3A/C4A** after S4-0/S4-1.                                                                                                                                                     | Unentitled team route/API absent or denied.                                             |
| Manual patient/linking | Global patient; org-scoped relationship/enrollment; exact-org booking resolver exists.            | Card + scheduled/walk-in + verified link → **U3B**, consuming **U5A**.                                                                                                                                        | Delivery/auth creates neither enrollment nor merge.                                     |
| SMS                    | Notification infrastructure is transport, not identity authority.                                 | Attempt/consent/suppression lifecycle → **U3B SMS-01…03**; custom sender → future **U8C**.                                                                                                                    | Email-bound route; no SMS elevation or real send.                                       |
| Public booking         | Exact-org/canonical-phone path exists; response currently exposes `userId`.                       | Atomic booking+enrollment and narrow continuation → **U3B**, publication → **U6B**.                                                                                                                           | Booking may complete without portal access; never use internal ID as authority.         |
| Staff capabilities     | Membership/role guards exist; management and clinical binding are distinct.                       | Real-principal object/capability parity → **U1**; C4 stays Foundation S4-owned.                                                                                                                               | Missing binding/capability denies; entitlement never expands access.                    |
| Patient context        | Enrollment resolver exists; Today has recorded `organization_principal_required` defect.          | Last-active/chooser/switch/deep link → **U5A**.                                                                                                                                                               | Neutral chooser/recovery, never arbitrary/global org fallback.                          |
| Card/history           | Workbench/visit/program surfaces are reuse only.                                                  | One card, visit relation and all parity paths → **U5B**.                                                                                                                                                      | Missing class → own/assigned subset only.                                               |
| Future clinic visits   | Current appointment relation only; transfer premise rejected.                                     | Future ordinary clinic contract → absent **U5C**.                                                                                                                                                             | No transfer queue/hierarchy/cross-org movement.                                         |
| Management             | Members/settings/booking and `/app/settings` are mixed.                                           | MGMT/ACC shell → **U2**; team/billing bodies → **C4/C5**.                                                                                                                                                     | No second settings tree; absent body stays fail-closed.                                 |
| Public/profile         | Existing landing is patient-first; route name is not publication proof.                           | Landing **U6A**, published profile/trusted join **U6B**.                                                                                                                                                      | Directory absent; unknown context fails closed.                                         |
| Branding/domain/sender | DB-backed org-aware settings exists; TEST integrator mirror lacks locked-mode principal stamping. | Brand resolver → **U7**; origin/PWA/sender → future **U8A/B/C**.                                                                                                                                              | No env secret path; configured custom channel holds/expires, never platform-falls-back. |
| Platform admin         | Current shell mixes platform/org/clinical ownership.                                              | Aggregate diagnostics/config boundary → **U9**.                                                                                                                                                               | No patient browse/merge/repair/impersonation.                                           |
| Routes                 | `152` current pages are classified; `57` IDs are logical screen ownership.                        | Guard-equivalent migration/link census → later owners, converged **U10**.                                                                                                                                     | Preserve guarded compatibility; no duplicate route tree.                                |

**Present/missing migration and API boundary.** P0.11 already provides org-aware settings storage/read/write and the
webapp service chokepoint; the mirror principal defect is a Foundation follow-up, not a UX workaround. Existing
membership/provisioning/patient-organization APIs are sanctioned reuse. No U0 evidence proves a migration/API for
atomic booking enrollment, patient invite/SMS lifecycle, switcher, safe booking continuation, record-class parity,
publication version, branded origin/PWA, custom sender, or commercial quota lifecycle: those belong to the named
stages, not to a guessed schema.

**No overlap and decisions.** S4, C2 and C3 are separate workstreams and are not reimplemented by this handoff.
All dated UX08 outcomes remain classified. Resolved-future/absent nodes (`U3A`, `U5C`, `U5D`, `U8A`, `U8B`,
`U8C`) remain absent from launch. C4C5-01…07 and the FIO ruling are resolved product-policy branches under the
2026-07-19 addendum. C4C5-08 is explicitly deferred.

### 6.3 Journey ownership registry

| UX-04 journey                               | Implementation owner                  | Convergence/acceptance                                                |
| ------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| J1 specialist self-signup                   | U3S (`ACQ-01…05`)                     | U4 shared auth/session/privacy review; U6A truthful acquisition entry |
| J2 clinic staff invite                      | Future U3A (`STF-01…08`)              | Deferred; not part of launch U4 acceptance                            |
| J3 patient email invite                     | U3B (`PIN-01…09`)                     | Requires U5A runtime gate; U4 convergence                              |
| J4 patient SMS fallback                     | U3B (`SMS-01…03`)                     | Same invite/enrollment as J3; U4 verifies no auth elevation           |
| J5 public booking continuation              | U3B (`PBK-01…08`)                     | U4 identity/enrollment convergence; U6B public projection             |
| J6 returning multi-org patient              | U5A (`MOR-01…05`)                     | U3B consumes resolver; U4 verifies invite/install continuation        |
| J7 terminal/wrong-recipient/replay recovery | Launch U3S/U3B; future U3A separately | U4 owns launch `ERR-*` consistency and redaction                      |

This registry assigns implementation ownership; it does not collapse staff membership, patient enrollment, delivery
or authentication policies into one object.

## 7. Execution model and phase sizing

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 7.1 Meaningful phases

| Phase                                          | Full worker scope                                                                                                                      | Stages                       | Exit                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 — contract readiness                        | Один цельный inventory/contract pass, без product UI                                                                                   | U0                           | Все gaps имеют owner/path; docs-only phase check at U0                                                                                                                   |
| P1 — authorization and solo workspace spine    | Capability enforcement and launch shells; future OPS absent                                                                            | U1, U2                       | Direct-route matrix + one launch shell; full CI after U2                                                                                                                 |
| P2 — context and relationship acquisition      | Ранний patient resolver, specialist signup, patient journeys и общий launch convergence                                                | U5A, U3S, U3B, U4            | ACQ/PIN/SMS/PBK/MOR separation green; full CI after U4                                                                                                                   |
| P3 — solo clinical policy                      | One card/history, manual/scheduled/walk-in visit relation; existing solo chat unchanged                                                | U5B                          | Solo launch path proven; full CI after U5B                                                                                                                               |
| P4 — public acquisition                        | Platform entry и org profile/booking/join                                                                                              | U6A, U6B                     | Published projection/trusted continuation; full CI after U6B                                                                                                             |
| P5 — core presentation and platform operations | Base brand plus core PLAT shell/config/reliability/org ops                                                                             | U7, U9                       | One sanctioned platform ops/config path; full CI after U9                                                                                                                |
| P6 — deferred future branches                  | Staff/team invite, multi-specialist visit coordination, clinic communications, domain/PWA/sender work; all absent from initial release | U3A, U5C, U5D, U8A, U8B, U8C | Not a launch dependency; approved domain/generated-PWA work needs future commercial/implementation activation, readiness and audit; native org app remains research-only |
| P7 — final convergence                         | Route, responsive, visual and acceptance consolidation                                                                                 | U10                          | 57/57, 152/152 and final full CI after U10                                                                                                                               |

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

### 7.3 Binding owner-review correction program — 2026-07-18

Этот раздел является исполнимой декомпозицией последнего owner-review. Он не копирует требования: acceptance
каждого пункта берётся из точного раздела `OWNER_REVIEW_2026-07-18.md`. При расхождении формулировок owner-review
побеждает. Старые планы и punch-lists могут давать только implementation evidence по уникальным пунктам.

#### Execution-mode reinforcement — owner, 2026-07-18 (обязательно, приоритет над 7.2 при расхождении)

Владелец: план верный и нацелен на его пункты, но исполнение идёт медленно и с непропорционально тяжёлым
аудит-циклом на мелких стадиях (пример: C1 presentation — ~10 agent-port прогонов на одну визуальную правку).
Усиление — не добавлять церемонию, а привести режим в соответствие с каноном (risk-proportional + автостоп):

1. **Аудит по риску стадии + жёсткий автостоп.**
   - **Presentation/visual/mechanical стадии** (C1-слайсы, render matrix, route census, lint/build/format) =
     worker + **ОДИН** independent audit. Серийные correction-раунды здесь запрещены.
   - **>2 correction-раундов** на одной стадии без закрытия её owner-review checklist = **ЖЁСТКИЙ СТОП**, без
     3-го круга. Неснятая дельта эскалируется владельцу как **вопрос о неоднозначном требовании**, а не как новый
     круг работы. Находка аудита без строки в `OWNER_REVIEW_2026-07-18.md` — вопрос владельцу, НЕ задача
     (см. запрет аудит-разгона в CLAUDE.md).
   - Полный многораундовый адверсарный цикл (7.2) остаётся **только** на C2/C2F/C4/C5
     (identity / FIO-migration / capability / commercial), где цена ошибки реальна.
2. **Параллель на независимом file-scope.** Непересекающиеся слайсы/стадии идут одновременно в отдельных worktree,
   **≤3 параллельно** (канон нагрузки). Явно применимо: три слайса C1 (`Сегодня/Клиенты` ∥ `Расписание` ∥
   `Коммуникации`) и `C2 (identity)` ∥ `C3 (settings)` — разные файлы. Сериализуется **только** шаг живого DEV-скрина
   на общем `:5200`; implementation/tests/typecheck сервер не требуют. Второй Next-сервер по-прежнему запрещён.
3. **Owner TEST-приёмки В СЕРЕДИНЕ плана, а не только на C7.** После **C1** и после **C3** — раскатка накопленной
   feature-ветки на TEST (**code-only** `deploy/host/deploy-test.sh`, без prod-дампа) и передача владельцу на живой
   клик-through. **Определение «готово» стадии = галочка owner-review checklist + зелёный full CI + живая проверка**;
   «audit PASS» сам по себе — гейт, НИКОГДА не критерий завершения.
4. **Заранее собранный лист решений владельца.** До старта C4/C5 все pending owner-gates (`UX08-01…12`, OM/BD,
   quota / trial / PSP / seat-pricing / analytics-формулы / solo-label) сводятся в **один** плейн-лист:
   по каждому — рекомендация + safe-default. Для текущей программы этот checkpoint закрыт addendum 2026-07-19:
   C4C5-01…07 resolved, C4C5-08 deferred. Новый gate сначала добавляется в тот же канон, а не угадывается в полёте.

#### Stage launch manifest — обязателен перед первым worker

Для каждого C-stage оркестратор сначала фиксирует в существующем initiative `LOG.md`, не создавая нового плана
и не добавляя narrative в taskdb-карточку:

1. текущий branch/HEAD и TEST SHA, на котором будет acceptance;
2. exact task IDs, owner-review section и stage checklist;
3. prerequisite tasks/commits и их фактический status; для U0/U1/U2 — sanctioned principal/membership/settings
   accessors, ownership paths и список ещё отсутствующих contracts;
4. synthetic roles/org/data scenario, desktop/mobile viewport и send-safe/PII-safe ограничения;
5. file-scope после code-search, no-overlap statement с соседними workers и запрещённый adjacent scope;
6. worker → independent audit → correction → re-audit commands/evidence и stop/owner-gate condition.

Если prerequisite не доказан, первый исполнимый slice — именно его evidence/handoff либо уже заведённая foundation
card; запрещено строить временный resolver, второй settings tree или compatibility write-path. Отсутствие заранее
записанного текущего SHA/file list не является пробелом плана: это intentionally launch-bound evidence, которое
устаревает при каждом merge.

#### C-1 — authority, dedup и task mapping

- **Outcome:** taskdb `#838` закрывает только planning normalization: один requirements canon, один execution
  roadmap, подчинённые/superseded документы явно промаркированы, каждый owner-review block имеет stage/card.
- **Gate:** `0 unclassified` решений; open decisions перечислены в owner-review/S4 и блокируют только зависимые
  substages. Code/runtime implementation в C-1 не входит.

#### C0 — Rubitime runtime removal: завершённый исторический этап

- **Status:** Rubitime выведено 2026-07-27; решение владельца 2026-07-29 запрещает возобновлять архивные CSV,
  execution plan и R1–R7 gates как текущую работу.
- **Historical scope:** taskdb `#839` устранял зависимость canonical create/reschedule/cancel от Rubitime,
  `staffRubitimeManualBooking`, migrated settings и duplicate profiles; UI-вкладка Rubitime была удалена.
- **Current boundary:** provider-neutral booking lifecycle и его отдельные дефекты остаются в своих текущих
  планах. Архив retirement не доказывает и не разрешает новую чистку provider-neutral данных.
- **Evidence archive:** `docs/archive/2026-07-rubitime-retirement/`; материалы внутри не исполняются.

#### C1 — текущие исправления интерфейса TEST

- **Outcome:** исправлены подтверждённые владельцем дефекты без изменения продуктовой модели.
- **Цельные независимые slices:**
  1. `Сегодня + Клиенты` — owner-review §§1-2 и live TEST correction 20:48: единый KPI contract через обе
     dashboard-колонки; default показывает всех людей текущей
     organization; слева остаются поиск и сортировка по недавним canonical interactions, а не фильтры;
     Клиенты/Подписчики classifier остаётся dormant/reversible без UI-сегмента и не применяется к default list;
     одна строка structured ФИО; отдельная строка count + reversible `Недавние`/`По фамилии`; Клиенты используют
     50/50 desktop,
     Exercises-style mobile master/detail; right-side factual filters и недублирующиеся non-interactive row indicators.
     Повторная живая TEST-приёмка временно отключает показ правого appointment KPI row на «Сегодня» без удаления
     реализации, поднимает календарь, требует hover/focus-подсказки всех видимых KPI и уточняет клиентские KPI:
     `С записями` = любая будущая либо прошедшая неотменённая запись, `С визитами` заменяет `Новые`, `Без будущих`
     заменяет неоднозначное `Бывшие`; active filter использует общий primary selected-state.
  2. `Расписание` — §§3-4: desktop default week, услуги, специалисты календаря, short name в create-location и
     отсутствие Rubitime tab; перенос всей booking settings IA отменён и сюда не входит.
  3. `Коммуникации` — §§5-8 и live TEST correction 20:48: shared 45/55 desktop split во всех четырёх вкладках
     (разрешённый fallback 50/50) и
     Exercises-style mobile master/detail; comments empty/selected layouts и toggle filters; intake без default
     фильтра, clearable single-select, newest-first и жирные new rows; broadcasts collapsed/expanded layout с
     собственной высотой строки. Уже принятую ссылку «Открыть карточку» не переделывать.
- **Dependencies:** slices могут идти параллельно после code/taskdb dedup, если файловые scope не пересекаются;
  Rubitime UI removal координируется с C0. Existing BCB2 triage не может закрыть эти новые acceptance по совпадению
  названия страницы. Новый full reset требует отдельного решения владельца.
- **Gate:** targeted tests + typecheck/lint affected files + desktop/mobile source-bound screenshots каждого
  состояния из owner-review; независимый UI audit.

#### UI-0…UI-9 — Doctor UI Rework execution cluster (owner addendum 2026-07-20)

- **Authority:** продуктовые решения и вопросы находятся только в
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §16a. Детальный
  `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` — исполнимый artifact этого roadmap, не второй источник статуса
  или решений. Его раздел `Atomic owner checklist` является обязательным completion tracker: stage нельзя закрыть
  общим audit PASS или summary, пока каждый in-scope checkbox не имеет code/test/live evidence; owner acceptance
  остаётся отдельным taskdb-layer.
- **UI-0 — первый P0-этап:** DEV reproduction/trace/fix четырёх подтверждённых симптомов booking funnel: SSR после
  выбора услуги, service/location filtering, клиент из календаря и кликабельное ФИО. Это не утверждение единой
  первопричины. Owner ruling 2026-07-20 задаёт booking projection: выбран специалист — только его включённые услуги;
  clinic-wide запись без специалиста — только услуги, назначенные хотя бы одному специалисту этой организации;
  solo — только услуги текущего специалиста; location-only assignment недостаточен. TEST journal/DB/remote host
  требуют отдельного разрешения. До `doing` выполнить taskdb dedup/mapping; U3B/`#801` покрывает только manual
  patient/walk-in и не форкается.
- **Presentation cluster после UI-0:** UI-1 Расписание, UI-3 Коммуникации, UI-4 Клиенты и UI-6 Сегодня имеют
  непересекающиеся file scopes и идут параллельно (≤3). Уже интегрированные и прошедшие независимый audit baseline
  slices UI-4a/UI-6a не перезапускаются; выдаётся только новый owner delta/residual после current code/live census.
  Каждый presentation scope: worker + один audit; live DEV evidence на единственном `:5200` сериализуется. UI-3
  делится на cosmetics, broadcast IA и composer/backend; UI-4 presentation не смешивается с backend metrics.
- **UI-1c appointment detail owner delta (2026-07-21, `#951`):** отдельный sibling C1 `#851`, а не
  перезапуск всего C1. Existing calendar/Today detail получает один close-control, semantic status badge рядом с
  выделенными актуальными датой/временем, labelled branch/service/specialist с solo-aware specialist row, без
  Rubitime service data и дублирующих status/patient links; исходное время показывается только после реального
  переноса. FIO остаётся canonical card link и получает existing chat/phone actions; create-visit центрируется,
  blank comment disabled. Диагностический payment panel скрывается до отдельной proof полной organization payment
  readiness и server contracts cash/invoice/pay-link/QR; money backend не входит в UI-1c. Exact manifest и live
  matrix — в Doctor UI execution artifact.
- **UI-P shared presentation delta (owner 2026-07-20; background subpoint SUPERSEDED 2026-07-22):** taskdb `#925`;
  doctor workspace получил единый shared-primitives pass для исторического gap background `#faf9f4`, белой page header, радиусов block/KPI/control `12/8/24px`,
  padding основных блоков `18px`, белого input, порядка KPI label→value и более крупного/лёгкого основного list
  text. Поздняя live-коррекция 2026-07-21 заменяет буквальное копирование padding эталоном строк «На сопровождении»:
  inset divider, спокойное выравнивание текста/иконок и selected state без отдельной карточки. Поиск «Клиентов»
  переносится в правую половину page header на одну линию с title. Это не patient/public UI и не изменение
  data/metric semantics.
- **SUPERSEDED — 2026-07-22:** the former white/inherited workspace outcome (`#967`) conflicts with the later
  `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2. The current doctor canvas is exact Design DNA
  `#F6F4EF`; white page header and primary `#406ca7` remain.
  Общие section tabs получают более округлённую doctor-control форму и более тёмный neutral hover. Clients и
  Messages используют один shared flat-list contract: геометрия/границы как у «На сопровождении», full-row hover и
  divider `#f0efeb`. Отдельный Today residual `#966` возвращает desktop `50/50`, превращает «Открыть расписание» в
  кнопку и доказывает ровно час до первой записи без двойного calendar-window padding. Оба среза идут параллельно,
  live DEV и тяжёлые проверки сериализуются; baseline stages целиком не переоткрываются.
  Latest clarification: sidebar/mobile menu items — не rounded control pills; им возвращается прежняя почти
  прямоугольная форма с минимальным скруглением, тогда как более округлённые section tabs остаются отдельным
  требованием.
- **Order after presentation:** UI-5 разделён на layout/routing predecessor UI-5a `#958` и полный UI-5b/U5B.
  Последнее решение владельца 2026-07-22 заменяет `desktop list+content`: обычный экран «Клиенты» сохраняет
  `list + filters + functional preview`, а выбранная полная карточка заменяет весь рабочий content container,
  сохраняя sidebar, direct URL/reload/back-forward и восстановление list state при возврате. UI-5a переиспользует
  exact existing protected view/guards/data и не меняет composition/visibility/schema. Полный UI-5b стартует после
  U5A + record-class policy и исполняет без сокращения exact composition из Doctor UI plan. Затем идут остальные
  dependency-ready UI stages. UI-8 строится только на уже принятом S4 engine `#888` внутри C4D/C5 и не создаёт
  parallel registry/polarity/seed/keys; только organization/clinic axis. UI-9 `#564` после C4D exact-org
  isolation интегрирован в `feat/doctor-ui-rebuild`: personal exercise остаётся instance-scoped по умолчанию,
  org-catalog save только явный, patient video использует существующий exact-org media path. UI-2 — bounded built-in
  toggleable «Онлайн» location на существующей модели, гейтящая
  существующие service checkboxes; новую schema/booking engine не вводить. UI-9 media scope и любые
  identity/schema/tenant/data изменения проходят полный risk-sized цикл.
- **Owner decisions G1–G6:** G1 `#564` — да; G2 voice/STT — post-production `#922`, сейчас не трогать; G3
  toggles — organization/clinic only; G4 communications — 45/55 с fallback 50/50; G5 online уже существует,
  требуется только встроенная toggleable location; G6 — UI-P shared doctor chrome из предыдущего пункта.
  Независимый SCH-G5 требует своего owner gate `#848`.
  `#191`: default новых разминок `12:00`/`15:00` в рабочие дни, существующих клиентов не менять.
- **Task mapping:** C1 `#850/#851/#852`; UI-1c `#951`; schedule picker `#960`; communications gradient/broadcast
  IA `#961`; shared composer `#962`; configurable Today `#963`; scheduled messages `#964`; UI-4/UI-5a `#958`;
  full UI-5b `#971` with contract `#928`; Patient Today mood `#924`; Today/shared presentation `#966/#967/#977`;
  Online location `#197`, expanded online booking `#215`, published Online proof `#926`; UI-P `#925`; manual
  patient/walk-in `#801`; mechanics/reminders `#191`; individual exercises `#564` + design `#565`; voice
  post-production `#922`; S4 engine `#888`. Новые duplicate cards не создавать; subscopes фиксировать в note/meta
  существующей карты при фактическом запуске.
- **Dependency gates:** UI-5b `#971` ждёт U5A `#796`; UI-7 `#964` ждёт owner placement ruling; U6B public Online
  proof ведётся в `#926`; expanded online booking `#215` и Voice/STT `#922` не входят в текущий launch scope.
- **Gate:** TEST deploy не подразумевается и требует отдельного прямого разрешения владельца; при разрешении — только
  code-only. Full CI запускается на milestone, а не повторяется для каждого presentation slice.

#### C2 — identity команды и фактический invite journey

- **Outcome:** один `platform_user` имеет одну строку membership в организации; owner включает admin capability;
  specialist binding не создаёт второго человека. Текущий email invite доказан end-to-end.
- **Scope:** taskdb `#840` и `#841`; сначала identity/membership evidence, затем data repair только по ID, никогда по
  совпадению имени; new/existing email, replay, expiry, revoke, reinvite, doctor first-login specialist provisioning
  и admin-without-specialist.
- **Dependencies:** стабильные U0/U1 membership/principal contracts. C2 может доказать текущий flow до коммерческого
  clinic entitlement, но не открывает team UI не entitled организации.
- **Gate:** owner-review §14; unique `(organization_id, platform_user_id)` path, concurrency/idempotency, direct API
  negatives и TEST e2e без реальной prod-доставки.

#### C2F — structured FIO residual и migration closeout

- **Outcome:** все собственные identity writers создают structured FIO; doctor/patient surfaces читают правильные
  поля; owner-reviewed production backfill и parser retirement проходят отдельные доказуемые gates.
- **Scope/order:** owner-review §19 и каноны
  [FIO initiative](../../FIO_IDENTITY_CLEANUP_INITIATIVE/README.md) / [`fio_identity_cleanup.plan.md`](../../../.cursor/plans/fio_identity_cleanup.plan.md):
  1. patient email + specialist/clinic registration writers;
  2. manual/booking/provisioning/OAuth/Telegram/MAX writer audit and correction;
  3. doctor full-FIO + patient first-name display cleanup;
  4. current-copy production preview, exact artifact owner gate, transactional apply/rollback/reconciliation;
  5. legacy fallback audit;
  6. runtime parser retirement only after every preceding gate.
- **Task mapping:** `#855` structured registrations; `#856` remaining writers + display; `#857` owner-gated
  production closeout; `#858` fallback audit + parser retirement. All start `auto_ok=false`.
- **Dependencies:** `#855` owner gate is resolved by the 2026-07-19 addendum: a separate new-patient registration
  collects required `lastName` + `firstName` and optional `patronymic`, derives `display_name`, while «Войти по коду»
  remains existing-account login without repeated FIO. Registration/writer work can proceed after U0/U1 identity
  contracts; display follows writer
  correction. Production data mutation is independently blocked on explicit owner approval of the current preview.
  Parser retirement follows production reconciliation and legacy audit. Notification templates are a separate track.
- **Gate:** registration/provisioning/provider tests; clients/card/schedule/communications/search/prefill and patient
  greeting acceptance; exact-target/stale-row/rollback tests; owner-gated production evidence; zero active
  parser-dependent identities/consumers before parser removal.

#### C3 — единый settings hub и один owner каждой настройки

- **Outcome:** одна nav-ссылка «Настройки» и role/capability-driven вкладки; route не меняет состав меню; одно поле
  имеет один write-path.
- **Scope:** taskdb `#842`; organization/practice, specialist, install, team (только при clinic entitlement) и
  «Тариф и биллинг» (только payer role). Appointment reminders становятся organization-level booking setting;
  owner-only patient-home controls уходят из общих settings; daily bot reminder удаляется из UI/scheduler/delivery.
  Остальные отложенные настройки остаются как в owner-review §15.
- **Explicit non-scope:** текущую вкладку настроек расписания сейчас не переносить и не превращать в «Модуль записи»;
  это отменённый текущий запрос и только future IA option.
- **Dependencies:** U1/U2 + settings-root split; team/billing tab bodies активируются C4/C5, но shell/guards не
  должны создавать второй settings tree.
- **Gate:** role × nav × direct route/API matrix; one-write-path tests; desktop/mobile; отсутствие regressions у
  сохранённых notification/event settings.

#### C4 — независимые capability/ownership substages

- **Outcome:** capability скрыта и запрещена server-side без entitlement; активный тариф открывает ровно
  оплаченный scope.
- **C4A — clinic boundary (`#843`):** entitlement, included/extra seats, server-side invite limit and
  over-limit/downgrade states. Цена add-on остаётся gate C5.
- **C4B — CMS (`#853`):** owner-org isolation и минимальная master-detail IA из §§11-12; full blog/CMS polish
  deferred.
- **C4C — courses (`#26`):** немедленный hide/deny вне owner organization; будущая модель и redesign без
  обязательного template — отдельный deferred pass.
- **C4D — library ownership (`#724`):** own-only и новая platform base library; owner-clinic exercises никогда не
  становятся global. Future store surface/commerce не блокирует C4D.
- **Dependencies:** U0/U1/U2, S4-0/S4-1 registry/chokepoint и C2 identity. Store commerce не блокирует первые два
  library modes. C4A-C4D исполняются/аудируются независимо; blocked seat pricing, course redesign или store не
  останавливает готовую tenant isolation.
- **Gate:** two-org list/direct/count/search/picker/media negatives, entitlement OFF/ON/downgrade, seats limit and
  overage policy; owner-review §§P1, P4, 11-13, 15.

#### C5 — независимые commercial substages

- **Outcome:** global admin собирает любое число произвольно названных тарифов из boolean entitlements и
  numeric/unlimited quotas; ~~trial-policy ссылается на выбранный тариф и duration~~ **УСТАРЕЛО / ЗАМЕНЕНО → T5
  (03.08):** trial-policy = duration + post-trial + discount window на **первый** тариф организации; billing
  обслуживается на уровне platform operator и organization payer.
- **C5A — constructor/trial (`#751`):** arbitrary tariffs, typed entitlements/quotas, ~~trial tariff+duration and~~
  **trial duration + post-trial/discount (T5–T6, 03.08), не отдельный trial tariff,** branch-local post-trial/quota
  gates.
- **C5B — billing (`#844`, `#845`):** platform operator + organization payer surfaces, subscription lifecycle,
  checkout/invoice, reconciliation, failed payment/grace, upgrade/downgrade, refunds/cancel, receipts/invoices/B2B
  transfer and immutable audit. Оплата услуг пациентом остаётся отдельным commerce contour.
- **C5C — clinic seat commerce (`#843`):** add-on purchase/price and subscription effect, only after C4A seat
  enforcement exists.
- **C5D — future store commerce (`#724`):** purchase/subscription/licensing/moderation only after its owner decisions;
  absent from launch acceptance unless explicitly activated.
- **Resolved policy / implementation readiness:** YooKassa — first candidate, но real activation ждёт точных merchant/
  legal/receipt/retry/proration proof; quota units/period остаются data-configured, а behavior следует принятой policy
  80% warning / 100% new-growth-only hard block; trial/grace/post-trial задаются global-admin data, один trial на
  organization, audited overrides only. C4C5-08 store purchase/subscription model остаётся deferred. Неготовая real
  PSP activation не блокирует registry, ownership, provider-neutral state-machine contract, mock/recorded adapter
  tests или UI IA.
- **Dependencies:** S4-0/S4-1, C3 shell и relevant C4 ownership substage. C5A/B/C/D не образуют один общий стоп:
  provider-neutral inventory/ports/security tests и transitions по resolved policy могут идти до real-provider
  activation proof; real payment mutations — нет. Billing mutations только server-authorized, идемпотентны и не
  могут вручную объявить деньги полученными.
- **Gate:** owner-review §§P1-P3; global operator vs organization payer vs ordinary specialist; webhook replay/
  amount/org negatives; audit, reconciliation, TEST provider-safe acceptance.

Checklist C5C ведётся в
[`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](../SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md)
§16 `#843 — clinic/team entitlement и места`.

#### 2026-07-19 owner addendum — C4/C5 and shared-foundation execution boundary

- **C4C5-01…07:** resolved in [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md) addendum; they no longer
  wait for owner response. Client SMS is organization-paid/provider-neutral (SMSC initial adapter; SMS.ru only a
  possible later/additional adapter), quota is 80% warning/100% new-growth-only hard block, trial/grace is
  global-admin data with one audited trial per organization, YooKassa is candidate only, seat/analytics/solo-label
  recommendations are accepted.
- **Still deferred/non-blocking:** exact one-time phone-verification channel; patient confirmation may also use
  Telegram/MAX bot. It does not block email-based staff/specialist or patient registration. C4C5-08 store commerce
  remains deferred.

#### C6 — platform analytics и capacity threshold

- **Outcome:** global admin видит организации как клиентов платформы, billing/subscription/use aggregates и
  диагностическую карточку организации без просмотра клинической жизни пациента.
- **Scope:** taskdb card платформенной аналитики; glossary для `active`, сопровождения, временных окон и источников;
  PII-bounded event/aggregate path; storage/retention/overhead; load profile и измеримый threshold выноса аналитики.
- **Dependencies:** C5 billing source of truth и утверждённые metric definitions. Сбор сырых трекеров не начинается
  без overhead budget/SLO; отдельная analytics DB не создаётся до load evidence.
- **Gate:** owner-review §P5; formula fixtures, two-org/privacy negatives, load test текущей конфигурации и записанный
  migration threshold.

#### C7 — общий TEST acceptance и production-candidate handoff

- **Outcome:** correction program и launch-included U-stages сведены в один проверяемый TEST candidate; deploy не
  подразумевается автоматически.
- **Dependencies:** C0-C6 и C2F в фактически включённом launch scope, foundation enforcement handoff, U10 и
  launch-included repository slices из канонического `RU_PRIVACY_AND_PRODUCTION_READINESS` master plan. Для
  уведомлений это как минимум принятый N1 guard, N1A platform auth-channel policy и N1B0 safe template foundation;
  конкретные event builders закрываются соответствующими N3 children. Deferred
  store/course/full CMS branches отмечены отсутствующими и не симулируются пустыми экранами.
- **Gate:** актуальный TEST SHA, synthetic role/org fixtures, full CI, security/tenant matrices, source-bound
  screenshots, два независимых visual/usability seals, rollback/runbook readiness. Переход в `main`/`test`, deploy
  и production data operations остаются отдельным прямым разрешением владельца.

#### 2026-07-21 owner addendum — stability/security и unsupported-client в общем DAG

Владелец включил два новых execution artifact в текущую программу. Они подчинены этому roadmap и не создают
параллельный источник статуса/решений:

- [`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md`](../STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md) —
  проверяемость tenant isolation, целостность денег/booking, auth/session security, observability и contracts;
- [`UNSUPPORTED_CLIENT_FALLBACK_PLAN.md`](../UNSUPPORTED_CLIENT_FALLBACK_PLAN.md) — bounded patient-entry
  watchdog/fallback и минимизированная telemetry для браузеров, где application bundle не стартует.
- [`OUTBOUND_DELIVERY_ALERTING_PLAN.md`](../OUTBOUND_DELIVERY_ALERTING_PLAN.md) — subordinate incident-response
  stage `#950`: отказ email/SMS/provider становится красным open incident с независимым multi-channel alerting.

#### Linked execution plans

Roadmap выбирает dependency-ready workstream, но **не является worker checklist**. Перед запуском оркестратор
открывает связанный execution plan и берёт статус из карточки.

| Workstream | Execution plan | Позиция в порядке / внешний gate |
| --- | --- | --- |
| Rubitime retirement (завершён 2026-07-27) | [`retirement archive`](../../archive/2026-07-rubitime-retirement/README.md) | Историческое evidence; CSV/R1–R7 не возобновлять и не использовать как worker checklist. |
| Doctor UI | [`DOCTOR_UI_REWORK_2026-07-20/PLAN.md`](../DOCTOR_UI_REWORK_2026-07-20/PLAN.md) | UI cluster; UI-5b после U5A, public Online proof в U6B. |
| Editor migration | [`EDITOR_TIPTAP_MIGRATION_PLAN.md`](../EDITOR_TIPTAP_MIGRATION_PLAN.md) | Собственный TEST/live gate; не закрывает соседние UI stages. |
| Structured FIO | [`.cursor/plans/fio_identity_cleanup.plan.md`](../../../.cursor/plans/fio_identity_cleanup.plan.md) | Production closeout перед parser retirement. |
| Stability/security | [`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md`](../STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md) | Phase 0 → Phase 1 → Phase 2 → exact launch residual → C7. |
| Global admin/support | [`ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md`](../SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md) | U9; schema/code после contract и owner gates самого плана. |
| Unsupported client | [`UNSUPPORTED_CLIENT_FALLBACK_PLAN.md`](../UNSUPPORTED_CLIENT_FALLBACK_PLAN.md) | После hardening Phase 0; launch slice до C7. |
| Delivery alerting | [`OUTBOUND_DELIVERY_ALERTING_PLAN.md`](../OUTBOUND_DELIVERY_ALERTING_PLAN.md) | После A3 и notification foundation; TEST fault injection — отдельный owner gate. |
| Security CI | [`SECURITY_CI_STACK_PLAN.md`](../SECURITY_CI_STACK_PLAN.md) | Параллельный release gate. |
| Privacy scope/register | [`PR-00_SCOPE_LOCK.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md), [`PR-01_PROCESSING_REGISTER.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md) | Owner/legal inputs precede dependent privacy stages. |
| Host/secrets | [`SEC-02_HOST_AND_SECRETS.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-02_HOST_AND_SECRETS.md) | Host/TEST/PROD mutations only through their owner gates. |
| Backup/recovery | [`DR-01_BACKUP_AND_RECOVERY.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/DR-01_BACKUP_AND_RECOVERY.md) | Real keys/offsite/PITR/restore require named gates. |
| Encryption/cutover | [`CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md), [`INFRA-01_ENCRYPTED_PROD_MIGRATION.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md) | Stable dependency/legal gates, then owner production window. |
| Notifications | [`NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md) | Native push after MOB gates; staff deep-link remains inside N3/N4. |
| Log hygiene | [`LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md) | L2 after G-03 and NTF census. |
| Consent/rights | [`PR-02_HEALTH_CONSENT.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-02_HEALTH_CONSENT.md), [`PR-03_DATA_RIGHTS_AND_RETENTION.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md) | PR-02 after D4/S5-7/legal text; PR-03 after PR-02, payment slice after billing freeze. |
| Clinical/governance/release | [`SEC-03_CLINICAL_ACCESS_AUDIT.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-03_CLINICAL_ACCESS_AUDIT.md), [`SEC-04_GOVERNANCE_AND_INCIDENTS.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md), [`PR-04_ISPDN_RELEASE_GATE.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-04_ISPDN_RELEASE_GATE.md) | D4 → SEC-03 → SEC-04; PR-04 is final owner/external release gate. |

Порядок включения:

1. Hardening reconciliation определяет exact residual и не перезапускает уже покрытые Foundation paths.
2. Hardening Phase 0 предшествует Phase 1; Phase 1 предшествует Phase 2.
3. Unsupported-client Ф0/Ф1 может идти после Phase 0; persisted analytics ждёт C6 + `LOG-01`, TEST telemetry —
   отдельного owner-разрешения.
4. Outbound delivery alerting идёт после A3 и notification foundation; broken-provider TEST — отдельный owner gate.
5. Phase 2 и exact launch residual закрываются до C7; Phase 3 берёт только доказанный Foundation residual.
6. Phase 4 — post-launch, кроме capacity/health signals, которые прямо требует C6 или release gate.

Privacy/readiness остаётся отдельным каноническим треком
[`RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md):
repository/DEV launch slices исполняются параллельно по его dependency gates; host encryption/firewall/SSH,
реальные secrets, production telemetry/cutover и PROD FIO backfill — только в owner-approved production window.
Единый owner-facing список решений/юридических inputs/окон: [`OWNER_ACTIONS.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md)
§0; полный decision registry: [`OWNER_AND_LEGAL_GATES.md`](../RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_AND_LEGAL_GATES.md).
`SESSION_HANDOFF_2026-07-17.md` перенесён в archive как полностью superseded snapshot: все перечисленные там commits
уже достижимы из текущей ветки, старых worktree нет, а fresh-reset TEST инструкция больше не применима.

#### Dependency summary

```text
C-1 -> C0 ------------------------> C7
C-1 -> C1 ------------------------> C7
U0/U1 -> C2 -> C4A ----+
U0/U1 -> C2F ----------+-----------------------------> C7
U1/U2/settings-root -> C3 --------+-> C5A/B/C -> C6 -> C7
S4-0/S4-1 -----------> C4A-D -----+
launch-included U-stages + U10 ---------------------> C7
hardening reconciliation -> Phase 0 -> Phase 1 -> Phase 2 -> exact launch residual -> C7
hardening Phase 0 -> unsupported-client F0/F1 -------------------------------> C7
privacy/readiness launch-included repository slices --------------------------> C7
```

Taskdb хранит status/owner/acceptance links, а не копию требований. Любая новая Product UX карта обязана ссылаться
на конкретный раздел owner-review и один stage `C0…C7`/`C2F`; hardening/unsupported-client/privacy карты вместо
этого ссылаются на датированный owner addendum выше и точный subordinate-plan checklist. Найденный аудитором scope
без строки в одном из этих owner-authorized источников не добавляется.

## 8. Stages

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### U0 — contract, ownership and data-gap readiness

**Outcome:** implementation team знает, какие существующие ports/objects переиспользует, какие contracts отсутствуют
и какой foundation gate обязан прийти раньше; UI work больше не вынуждает изобретать schema по ходу.

- **Screens/flows:** все `PUB/ORG-PUB/PLAT/MGMT/CLIN/OPS/PAT/ACC`; J1…J7; особый trace `ACQ/STF/PIN/SMS/PBK/MOR/ERR`.
- **Reuse/gaps:** baseline §6; exact route denominator `152`, registry `57`, current APIs/migrations verified against
  current branch rather than copied from UX audit date.
- **Scope:** code-search-first census of membership/principal/capability, enrollment, invitation, delivery, auth,
  booking, publication, brand, settings, entitlement, audit and route guards; define ports/state contracts and
  ownership paths; map each gap to existing foundation task or future feature contract.
- **Forbidden:** schema/SQL, runtime behavior, broad refactor, new UI, duplicate foundation checklist, assumptions from
  table names alone.
- **Boundaries:** every clinical/patient/staff object has direct org or documented scoped-parent path; global catalogs
  require evidence; identity and relationship remain separate.
- **Decision gates:** no owner outcome is reopened. Inventory records `0` unclassified owner decisions; classified
  open questions block only their named branch. Generated
  org PWA and custom origin are future capability, native org app/assistant/clinic communications are non-blocking
  backlog, and sender timing/retention is engineering configuration.
- **Dependencies:** current foundation artifacts and route inventories readable; no deploy dependency.
- **Workstreams:** data — ownership/writer/backfill questions; API — sanctioned ports and policy parity; UI — route/
  screen component reuse; ops — feature/foundation evidence split.
- **Migration/compat:** produce migration requirements and backfill invariants only; no field/table name. Preserve
  legacy paths until target contract is implemented and link/data census exists.
- **Validation:** executable/lexical ID and route census; call-site evidence; contract cross-check with foundation;
  markdown links; `git diff --check`. No app/DB tests because stage changes documentation only.
- **Rollback/degradation:** not applicable to runtime; unresolved ownership becomes `waiting dependency`, never global
  fallback.
- **Merge dependency:** prerequisite to every later stage; planning artifact merges separately from foundation code.

### U1 — role/capability guard spine

**Outcome:** every actor reaches only the workspace, object class and action allowed by server capabilities; direct
URLs/APIs cannot use navigation hiding, filters, entitlement or `adminMode` as permission.

- **Screens/flows:** launch route families; emphasis `PLAT-*`, `MGMT-*`, `CLIN-*`, `ACC-*`, `PAT-*`. Reserved
  `OPS-*` must remain absent.
- **Reuse/gaps:** reuse membership/principal resolver and existing route guards after U0 verification; replace/map
  coarse role shortcuts only where target capability exists.
- **Scope:** one capability vocabulary/mapping; server guard adapters; ownership/object checks; direct/list/count/
  search/export/write parity; neutral denial; staff one-org and patient enrollment rules; audit denied sensitive
  actions where policy requires.
- **Forbidden:** changing RLS/enforcement sequence, client-side-only gates, entitlement-as-authz, full UI route move,
  granting assistant clinical access, support impersonation.
- **Boundaries:** capability evaluated after trusted principal and before entitlement/service; specialist authorship
  requires binding; owner/admin without binding stays non-clinical.
- **Owner rulings:** assistant grant set/workspace is absent from initial release; global-admin patient session/repair
  is rejected. U1 enforces those absences rather than waiting for gates.
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
- **Merge dependency:** U0 + relevant foundation gate.

### U2 — organization management and shared account shell

**Outcome:** owner/admin manages one organization without entering global-admin chrome; specialist works in a
solo-first clinical shell; personal account screens are shared once. Future assistant OPS surfaces remain absent.

- **Screens/flows:** launch management/account shell (`MGMT-01`, applicable solo settings/booking/plan destinations,
  `ACC-01…04`) and management↔clinical scenario. Team `MGMT-02` is absent for an unentitled solo organization and
  becomes the C3/U3A settings-team surface only after clinic entitlement; `OPS-01…04` remain registry-only future
  IDs. Publication/branding/integration panels remain owned by their later launch or deferred stages.
- **Reuse/gaps:** clinic members/settings, booking tabs, `/app/settings`, install and current navigation primitives;
  split mixed ownership instead of copying forms.
- **Scope:** canonical shell composition; capability-driven nav; MGMT overview/setup; shared ACC destinations;
  management vs booking setup vs personal settings ownership; responsive route restoration; non-clinical owner
  first destination.
- **Forbidden:** assistant/reception modules in initial release; parallel solo/clinic
  shells; copied ACC pages; domain/sender infrastructure; catalog ownership moves.
- **Boundaries:** one membership org; independent specialist binding; no clinical widgets for non-bound actor;
  personal settings never imply org-management rights; no assistant principal or destination is introduced.
- **Owner rulings:** no OPS set at launch; one login with distinct management/clinical destinations. Prefer a simple
  management page/menu; exact menu-versus-switch composition is an implementation choice.
- **Dependencies:** U1, which includes the accepted ownership map; settings-root split for fields read outside
  privileged settings.
- **Workstreams:** data — reuse scoped org/settings projections; API — management/account ports; UI — shells,
  nav, responsive states, setup summary; route — guarded compatibility entries.
- **Migration/compat:** no data move solely for navigation. Mixed forms split by API ownership while old routes become
  guarded adapters/redirects. Preserve values and defaults; any data backfill follows accepted settings contract.
- **Validation:** role-route/nav tests desktop/mobile; direct legacy route guard equivalence; settings read/write
  ownership tests; typecheck/lint/build; DEV role smoke and screenshots for owner-only, owner+binding, specialist and
  forbidden launch destinations; verify OPS routes are absent; accessibility keyboard/navigation seal; accumulated
  full CI at P1 exit.
- **Rollback/degradation:** old guarded route may remain entry; new shell failure returns to safe account/management
  destination, never doctor or platform fallback.
- **Merge dependency:** U1; assistant/clinic-only areas are explicitly excluded from launch acceptance.

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
- **Owner ruling:** platform app opens last active organization with visible switcher; invalid preference uses chooser;
  trusted target opens exact authorized org visibly. Future org-specific app is pinned without switcher.
- **Dependencies:** U0 and U1; patient principal/foundation enforcement. Resolver zero/one/many, chooser, switch and
  object authorization are implemented independently of invite, booking and install UI.
- **Workstreams:** data — enrollment list/preference contract; API — resolver/switch/revalidate/cache keys; UI —
  PAT-01 and shell; diagnostics — Today defect root fix without weakening guard.
- **Migration/compat:** preference is optional and never required for authorization; no merge/backfill of clinical
  rows. Existing single-org users transition deterministically only after active enrollment proof.
- **Validation:** zero/one/two org, revoked remembered org, verified foreign/denied object, direct/list/cache isolation,
  concurrent switch, back/forward/deep link, DB-role negatives, typecheck/lint/build; desktop/mobile/PWA screenshots.
- **Implementation evidence (`#1074`):** invited/non-active enrollment is rejected as `no_active_enrollment`; `apps/webapp/src/modules/patient-organization/service.ts` + `apps/webapp/src/modules/patient-organization/service.unit.test.ts`; deleting the status guard makes the inactive-enrollment assertion fail; DB/RLS and live seals remain open.
- **Today principal defect (`#796`) closed:** canonical RSC principal propagation is preserved by `2f7b0b41a`;
  during the owner TEST walkthrough on 2026-07-30 the patient home, organization list, training/video and completion
  flows loaded successfully after the related runtime corrections. This closes the former
  `organization_principal_required` symptom only; it does not substitute the two lifecycle seals below.
- **Rollback/degradation:** resolver failure shows neutral chooser/recovery and clears stale care data; never falls
  through to previous or arbitrary organization.
- **Owner defer (`#796`, 2026-07-31):** principal defect is closed; the remaining A↔B switch and
  revoked-remembered-organization lifecycle seals are deferred until the patient/client screens are elaborated.
  Do not build a temporary TEST-only lifecycle harness or invent discharge/reactivate API/UI now. The later
  client-screen stage must define the real per-enrollment discharge/reactivate behavior first and then perform the
  canonical owner-authorized TEST walkthrough for both seals. Unit/component/API coverage proves stale-preference
  and neutral-recovery behavior in the meantime but does not replace those live seals. Ad hoc SQL, a privileged DEV
  writer or a reset remains forbidden evidence.
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
- **Merge dependency:** U0/U1/U2 plus stable provisioning/auth foundation.

### U3A — clinic staff invitation under paid entitlement (post-solo capability)

**Outcome:** current doctor/admin invitation flow becomes a verified clinic capability guarded by the paid
entitlement and seat policy. It remains absent from the solo initial-release DAG and cannot block patient activation
or public launch, but its product direction is no longer an unanswered future placeholder.

- **Screens/flows:** `MGMT-02`, `STF-01…08` only after clinic entitlement; unentitled solo navigation/API remains
  absent/denied.
- **Reuse/gaps:** reuse the existing email invite/OTP/membership/specialist-provisioning flow; first prove C2, then
  add C4 seat and entitlement enforcement. Assistant/reception remains outside approved scope.
- **Scope:** C2 TEST e2e and identity repair; after C4 activation, doctor/admin invitations, seat usage and limit
  states in the settings hub.
- **Forbidden:** assistant/reception roles, bypassing seat limits, client-side-only gating or a second membership
  system.
- **Boundaries:** registry reservation grants no membership capability or destination.
- **Owner ruling:** solo-first release need not wait for clinic staffing; when a tariff includes clinic mode, team
  management and invited-specialist seats are active in settings. Ordinary specialists do not gain billing rights.
- **Dependencies:** U0/U1/U2, C2 identity evidence, C4 entitlement/seats and C3 settings shell; no solo launch edge.
- **Workstreams:** membership/invite verification, entitlement/seat policy, settings team UI and billing handoff.
- **Migration/compat:** current memberships/invites are preserved and normalized by identity, not display name.
- **Validation:** owner-review §§P1, 14-15; new/existing email, replay/revoke/expiry, one membership row, entitlement
  OFF/ON, seat exhaustion/downgrade and direct API negatives.
- **Rollback/degradation:** not applicable while absent.
- **Merge dependency:** none for initial release; excluded from U3B, U4 and U10 launch dependencies.

### U3B — patient invite, delivery, activation, install and public-booking continuation

**Outcome:** specialist can immediately create a patient card/relationship plus scheduled appointment or walk-in;
optional email-first portal invite with SMS delivery links a verified canonical identity to that existing card and
care state. Public self-booking remains another entry and can continue safely into the app.

- **Screens/flows:** `CLIN-02/03`, `ORG-PUB-02/03`, `PUB-04`, `PAT-02/04/11`; `PIN-01…09`, `SMS-01…03`,
  `PBK-01…08`, `ERR-*`.
- **Reuse/gaps:** canonical identity/enrollment, booking wizard, notification delivery and PWA UI; canonical patient
  invite/SMS lifecycle and booking→enrollment/app continuation are absent/incomplete.
- **Scope:** manual patient create (name, phone, optional email), scheduled appointment and walk-in state; portal
  not-activated/invited/linked status; email/phone identity proof and exactly-once link to existing card/program/visits;
  immutable SMS attempt on same invite; consent/suppression/rate limit; existing patient/multi-org addition; first
  useful org screen; install education, installed first launch/re-auth and later explicit push consent; booking
  identity resolution and signed narrow continuation.
- **Forbidden:** SMS elevation, SMS-created identity/invite, full recipient pre-auth, internal `userId` authority,
  auto-push prompt before value, duplicate identity, silent org switch, real sends outside approved send-safe setup.
- **Boundaries:** invite/booking/object is trusted org source; canonical patient is global; enrollment and every care
  object remain org-scoped; channel transport and topic preference are independent.
- **Owner rulings:** staff-created relationship/card/visit precedes portal activation; delivery is not proof/access.
  Platform neutral returning start follows U5A last-active/switcher behavior; trusted invite/booking opens exact org.
- **Dependencies:** U1 and U5A resolver/live gate `#796`; shared exchange/proof primitives come from U3S/common identity
  contract, never from deferred U3A; booking ownership and patient-role foundation proof.
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
- **Merge dependency:** U1 + U5A; deferred clinic-staff stage U3A is not a dependency.

### U4 — acquisition and relationship integration checkpoint

**Outcome:** solo signup, patient portal invitation/linking, SMS fallback and public booking use one coherent identity/
exchange/delivery vocabulary and reach guarded U2/U5A destinations without parallel auth or relationship paths.

- **Screens/flows:** `PUB-03/04`, `ORG-PUB-02/03`, `MGMT-01`, `ACC-02`, `CLIN-02/03`, `PAT-02/04/11`;
  complete launch `ACQ/PIN/SMS/PBK/ERR` families. `STF` is future-deferred.
- **Reuse/gaps:** U3S/U3B/U5A outputs; checkpoint looks for duplicated token exchange, proof, delivery attempts, recipient
  privacy, relationship mutation, 2FA/passwordless and continuation implementations.
- **Scope:** one integration adapter/contract per shared concern; end-to-end scenario tests; truthful first
  destination; consistent resend/revoke/replay/support recovery; unified telemetry/redaction; compatibility cutover
  inventory.
- **Forbidden:** feature expansion, new schema, merging staff and patient auth policy, SMS elevation, marking a
  delivery success as relationship acceptance, bypassing U5A for ambiguous patient context.
- **Boundaries:** future staff membership and launch patient relationship remain distinct; shared exchange scrubs raw token but does
  not choose persona/org beyond the trusted record; every destination repeats its normal guard.
- **Owner rulings:** assistant landing is absent from initial release; patient neutral launch uses last active +
  visible switcher with chooser on invalid preference. Exact trusted invite/booking organization still wins.
- **Dependencies:** U2, U3S, U3B and U5A full audits. The checkpoint consumes these outputs and has no dependency
  that points back from them.
- **Workstreams:** data/API — contract convergence and idempotency; UI — recovery/copy consistency; delivery —
  immutable attempt trace; route — compatibility and raw-token scrub; observability — privacy-safe funnel facts.
- **Migration/compat:** no new migration in checkpoint. Reconcile U3S/U3B migrations/backfills and prove their combined
  forward/rollback order; old entries remain guarded until exact compatibility evidence exists.
- **Validation:** all acquisition scenarios end-to-end; concurrency/replay/persona collision; role/org destination;
  delivery mock/redaction; typecheck/lint/affected build; accumulated targeted tests; full CI at P2 checkpoint;
  desktop/mobile journey screenshots. No TEST send without separate authorization.
- **Rollback/degradation:** each channel/entry can degrade independently to its approved recovery; disabling one
  journey cannot break login, canonical booking result or existing relationship access.
- **Merge dependency:** U2 + U3S + U3B + U5A; U3A is excluded.

### U5B — organization patient card and history policy

**Outcome:** specialist works from one coherent organization patient workbench while every visible section/event is
authorized consistently and authorship remains truthful.

**Owner clarification 2026-07-22 — layout predecessor `UI-5a/#958`.** The normal «Клиенты» screen keeps its
`list + filters + functional preview`. Opening the already protected standalone doctor patient-card replaces the
entire doctor content container rather than occupying the right split pane; the doctor sidebar remains. Returning
restores search/sort/filters/preview/scroll, and standalone URL/reload/back-forward compatibility remains. This may
proceed before U5A runtime closure only if it reuses the exact existing server-guarded view and data/API paths and
proves guard equivalence. It may not add or merge sections, broaden queries/counts/search/export, reclassify records,
change authorship/ownership, introduce schema or create a duplicate card tree. All data-policy, exact owner
composition and clinical-visibility work below remains U5A/U5B-gated and is specified without abbreviation in the
Doctor UI execution artifact.

- **Screens/flows:** launch `CLIN-02`, `CLIN-03`, `CLIN-04`, `CLIN-08`; solo patient-card and manual-visit path.
- **Reuse/gaps:** current patient workbench/card/program/visit components; missing entry visibility/private classes
  and parity policy.
- **Scope:** one organization card shell; roster relation from actual/scheduled visit; section policy;
  author/specialist attribution; own events default; authorized all-history/specialist filters after policy;
  amendment trail; operational vs clinical sections.
- **Forbidden:** per-specialist duplicate route tree, empty own list→full org fallback, filter-as-authz, selected
  specialist impersonation, history rewrite, owner/admin clinical read by role alone.
- **Boundaries:** enrollment/object ownership server-resolved; event visibility on list/direct/count/search/export;
  author fixed from authenticated specialist binding; private/restricted class never inferred from membership.
- **Owner ruling:** one card and visit-based relationship are resolved. Shared/all/specialist controls appear only
  after record-class authorization. Patient hierarchy and alternate per-specialist cards are absent.
- **Dependencies:** U1 and U5A; accepted entry/section policy contract. Patient-facing cross-links use the already
  U5A resolver rather than making it conditional.
- **Workstreams:** data — visibility/provenance contract before migration; API — roster/card/history parity; UI — card
  tabs/filters/denials; route — reuse current dynamic tabs and program details.
- **Migration/compat:** do not relabel current rows as shared/private without deterministic evidence; produce ambiguity
  report and explicit backfill/compat policy. Keep old patient IDs/routes behind same guard until link census.
- **Validation:** own/authorized/private records across all parity paths; owner/admin with/without binding;
  absent future-role destinations; two-org target denial; author/amend audit; migration/backfill/rollback if any; typecheck/lint/build;
  desktop/mobile card screenshots with allowed and withheld controls.
- **Rollback/degradation:** missing visibility classification fails closed to own/assigned/allowed subset; card can
  show section denial without exposing counts or metadata.
- **Execution checklist:** `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` §UI-5b; implementation waits for U5A runtime gate
  `#796`. Exact-view layout predecessor `UI-5a/#958` is the only explicit exception.
- **Merge dependency:** U1/U5A plus reviewed record-class policy; UX08-01 itself is resolved and is not a blocker.

### U5C — deferred future multi-specialist visit coordination

**Outcome:** registry placeholder for a future clinic extension. It is absent from the initial-release DAG and cannot
block U10. A later owner-approved clinic scope may reuse the ordinary appointment relation; this stage does not freeze
clinic UI, permissions or workflow now.

- **Screens/flows:** reserved `CLIN-05`; no initial route or screen.
- **Reuse/gaps:** future analysis may reuse appointment/specialist relations and U3B manual creation; no new object is
  approved by this placeholder.
- **Scope:** none for initial release. Future scope starts only after clinic product/grants are explicitly approved.
- **Forbidden:** implementing a transfer/collaboration queue, receiver acceptance, hierarchy, cross-organization
  movement or implicit history access.
- **Boundaries:** initial solo product creates visits only for the current specialist. Future destination-specialist
  authorization and visibility require a separate clinic contract.
- **Owner ruling:** old transfer premise is rejected; only a possible future ordinary appointment mechanic remains.
- **Dependencies:** future activation may depend on U1/U3B/U5B, but there is no launch edge.
- **Workstreams:** deferred; exact data/API/UI/notification work is intentionally unspecified.
- **Migration/compat:** none in initial release; existing assignments are not reclassified.
- **Validation:** initial acceptance proves `CLIN-05` is absent and no transfer lifecycle exists. Future validation is
  defined only with the future clinic contract.
- **Rollback/degradation:** not applicable while absent.
- **Merge dependency:** none for initial release; excluded from U10 launch dependencies.

### U5D — deferred future clinic communication topology

**Outcome:** registry placeholder for later configurable clinic communication. Initial release keeps the existing
solo-specialist chat unchanged and has no U5D implementation or acceptance dependency.

- **Screens/flows:** reserved future `OPS-04` and future clinic variants of `PAT-05`/`CLIN-07`; no launch changes.
- **Reuse/gaps:** future design may reuse current message objects, but no clinic inbox/thread/routing model is assumed.
- **Scope:** none for initial release. Exact future routing may be designed later under a separate clinic scope.
- **Forbidden:** implementing an organization-wide inbox, specialist threads, receptionist/owner routing, delegated
  grants or message migration before the future topology decision.
- **Boundaries:** existing solo authorization and recipient behavior remain unchanged; registry reservation grants
  no new visibility.
- **Owner ruling:** solo chat stays as-is; clinic communication topology is outside current scope and does not await
  an owner answer now.
- **Dependencies:** future activation may consume U1/U5A/U5B; there is no launch edge.
- **Workstreams:** deferred; no data/API/UI/delivery/migration work is specified now.
- **Migration/compat:** none in initial release; current conversations are untouched.
- **Validation:** initial acceptance proves no clinic/OPS communication surface or routing change was introduced.
  Future validation waits for the future contract.
- **Rollback/degradation:** not applicable while absent; existing solo chat remains the baseline.
- **Merge dependency:** none for initial release; excluded from U10 launch dependencies.

### U6A — specialist-oriented platform landing and acquisition

**Outcome:** a specialist or clinic understands the product and reaches signup/demo; patient login remains available
but secondary; public legal/support recovery stays reachable on desktop/mobile.

- **Screens/flows:** `PUB-01…05`, `ACQ-01…05` entry; `PUB-06` is explicitly deferred and absent.
- **Reuse/gaps:** current public/auth/legal primitives and registration; current landing is patient-first and missing
  full specialist/clinic acquisition composition.
- **Scope:** landing, product/pricing structure without unsupported tariff promise, signup/login/recovery links,
  public support/legal/status, responsive navigation, analytics events with privacy-safe attribution.
- **Forbidden:** directory in initial release, product capability claims not backed by mechanics, hidden patient entry,
  branded/custom-origin work, duplicate signup route.
- **Boundaries:** anonymous public data only; persona chosen by trusted auth flow, not query mutation; pricing reflects
  configured platform contract when available.
- **Owner ruling:** initial public product includes landing/profile/booking/join; `PUB-06` directory is deferred.
  Rollout still requires its normal release gate.
- **Dependencies:** U3S signup/security target for truthful CTA; U1 persona guards.
- **Workstreams:** data — published pricing/capability projection contract; API — public read/analytics; UI — landing
  and responsive states; content — plain-language proof/trust.
- **Migration/compat:** `/` and existing auth entries converge through compatibility states; no data migration unless
  published pricing projection contract requires separately reviewed work.
- **Validation:** anonymous route/privacy tests; ACQ states; link/accessibility/SEO metadata; desktop/mobile screenshot
  seals; console/network/overflow; typecheck/lint/build; no application delivery/DB mutation in visual acceptance.
- **Rollback/degradation:** signup disabled/demo fallback; pricing unavailable has honest contact path; legal/support
  remains reachable.
- **Merge dependency:** U1/U3S; rollout remains separately owner/deploy gated.

### U6B — published organization profile, booking and trusted join

**Outcome:** an organization can publish a safe projection; visitors book or join through a trusted organization
context while canonical platform URLs and recovery always work.

- **Screens/flows:** `ORG-PUB-01…03`, `PBK-01…08`, launch `PIN/SMS/ERR` public states; `MGMT-04` publication.
  Future `STF` states remain reserved but absent.
- **Reuse/gaps:** current booking wizard, content/preview, services/specialists/locations; no complete publication
  object/version and join projection.
- **Scope:** draft/preview/publish lifecycle; stable platform alias; public projection fields; service/specialist/
  location cards after ownership audit; booking and join integration; unpublished/suspended/degraded states.
- **Owner route/slug addendum 2026-07-20 (`#926`):** organization owner chooses a unique slug during first setup;
  canonical platform-origin paths are `/<slug>`, `/<slug>/booking` and `/<slug>/booking/widget`. Existing
  `/book/<slug>` remains a compatibility alias/redirect through external-link census. Public projection includes
  owner-published logo/avatar, name, public information/contacts, specialists, services/locations and booking CTA.
  Slug rename is audited and preserves a redirect alias. Slug selects a public projection only and never grants
  organization authority.
- **Widget contract:** one existing booking wizard powers direct, inline and modal forms. A small platform loader
  creates an iframe for `/<slug>/booking/widget`; `data-mode=inline` inserts a responsive block, `data-mode=modal`
  opens an overlay from a site button. Typed `postMessage` is limited to resize/close/success; attribution may be
  forwarded, internal org IDs/secrets/cookies are not. No copied JS form or second booking engine.
- **Forbidden:** reading private org base rows directly, Host/client org authority, directory inclusion by default,
  custom domain/auth/PWA, second booking wizard, pre-auth private recipient data.
- **Boundaries:** public projection is explicit and versioned; booking objects/invite exchange determine org; canonical
  platform path works independently of brand/domain.
- **Owner ruling:** profile/booking/join are in initial public scope; directory remains separate/deferred. Publication
  rollout still requires its normal release gate.
- **Dependencies:** U2 and U4 acquisition convergence. The convergence output contains underlying
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
- **Merge dependency:** U2/U4; public rollout separately gated.

### U7 — core organization identity and shared-layout brand presentation

**Outcome:** every org-scoped surface shows trustworthy organization context, while optional logo/color/content
presentation can change without affecting access, routing or recovery.

- **Screens/flows:** `MGMT-04`, conservative platform + organization-context variants across launch `ORG-PUB`, `PAT`,
  `MGMT`, `CLIN`, `ACC`; brand/publication
  prototype scenario.
- **Reuse/gaps:** existing settings/assets/content preview and UI tokens; no unified resolver/payload/fallback across
  surfaces.
- **Scope:** minimum core org identity; brand asset/token validation; surface capability matrix; preview/publish;
  reachable legal/support/security functions with exact presentation deferred to applicable review; fallback and
  inaccessible-asset behavior; one design-token consumption path.
- **Forbidden:** per-clinic layout/theme fork, omitting information/functions later required by legal/contract/security review, authz by brand config,
  copied branded-app components, domain/sender/app infrastructure.
- **Boundaries:** core org context always available after trusted resolution; paid brand presentation is entitlement-
  checked after authz; asset ownership and public safety are explicit.
- **Decision gate:** UX08-07 is resolved: paid full branding uses own domain or platform subdomain and org name/logo
  across product-facing surfaces while preserving the shared product layout/design. U7 implements the common brand
  resolver on platform surfaces; full origin presentation remains a later U8 capability. Exact legal copy is not
  invented here.
- **Dependencies:** U2 management/publication shell, U6B projection, settings-root/asset ownership foundation.
- **Workstreams:** data — brand/public asset ownership requirements; API — resolved presentation payload; UI — tokens,
  preview and fallbacks; QA — surface×tier matrix.
- **Migration/compat:** map existing safe org identity/assets only after deterministic audit; invalid/missing assets
  fall back to platform defaults; no automatic deeper-brand enablement.
- **Validation:** surface matrix across disabled/enabled/degraded entitlement; org context invariant; unsafe asset/
  contrast/accessibility; cache invalidation; typecheck/lint/build; representative desktop/mobile screenshots;
  migration/backfill/rollback if any.
- **Rollback/degradation:** disable paid visuals while preserving org name/context, canonical navigation and recovery;
  no blank or misleading brand.
- **Merge dependency:** U2/U6B; full custom-origin brand remains absent until U8 readiness/activation.

### U9 — global administration and bounded support

**Bounded foundation start (2026-07-21, NTF N1A / taskdb `#929`).** Current code has a platform-only page
capability but no platform API/DB writer principal; `/api/admin/settings` remains intentionally organization-scoped.
Before the owner-approved Email/SMS/Telegram/MAX auth switches, N1A lands the narrow U9A platform-settings spine:
dedicated API guard, least-privilege global-settings DB principal/role and a whitelisted endpoint over the existing
system-settings service/mirror/audit. This does not complete the U9 shell, organization operations, billing,
diagnostics or support chat, and it cannot borrow organization membership or widen clinical access.

**Later bounded platform default (`#932`, owner 2026-07-21).** Platform admin configures an ordered default palette
for new clinic locations (initially at least five values, extensible) and a separate default for the built-in
`Online` location. Creation consumes the relevant default; clinic owner/admin may then override the stored branch
color. When physical locations outnumber palette entries, assignment cycles (`N mod palette length`); `Online` is
separate and does not consume a palette slot. Existing location colors are never rewritten. This replaces the current hardcoded creation defaults only
after a DB-backed global setting and migration-safe fallback exist; it is not part of N1A `#929`.

**Outcome:** platform operator manages organizations, commercial state, platform configuration/reliability and
system identity diagnostics from a dedicated shell without patient browsing or patient-record repair.

- **Screens/flows:** `PLAT-01…09`; current analytics/settings/health/audit routes plus aggregate system diagnostics.
- **Reuse/gaps:** existing global analytics, system health/archive, audit and admin settings; ownership currently
  mixed under doctor/admin navigation. Existing patient merge/name-match pages are retired/reclassified, not moved.
- **Scope:** platform shell; org lifecycle/detail; C5 global billing operations (subscriptions/payers,
  paid/trial/grace/past-due states, payment attempts, refunds/cancellations, invoice/receipt/provider-event detail,
  reconciliation, safe support actions and immutable audit); tariff/entitlement commercial operations; C6 aggregate
  analytics; DB-backed configuration; reliability; true platform catalog governance only after ownership split;
  aggregate identity-integrity diagnostics and support reports; one extension contract through which optional
  domain/sender/PWA readiness can later appear without changing core ownership or settings paths.
- **Forbidden:** `adminMode` as universal authority, silent organization membership, moving org assets to global by
  route relocation, patient behavior as ordinary analytics, any patient-level browsing/session/record repair.
- **Boundaries:** explicit platform capability and target org; aggregate/privacy thresholds; support diagnostics are
  purpose-specific and audited; no patient profile lookup/mutation and no clinical authorship.
- **Owner ruling:** `PLAT-09` is aggregate/org/platform diagnostics, support reports and escalation only. Patient
  session/repair is rejected; platform team fixes system/code defects.
- **Dependencies:** U1, U7 core identity where shown, platform data ownership classification and existing tariff/
  settings foundation. Core platform operations have no optional-commercial dependency and establish the sanctioned
  surface later adapters consume.
- **Workstreams:** data — platform/org/aggregate classification; API — dedicated capabilities and audit; UI — PLAT
  shell and moved components; route — guarded compatibility from doctor/admin paths.
- **Migration/compat:** route moves do not reclassify data. Settings writes keep sanctioned service/mirror. Existing
  patient merge/name-match admin links are not redirected into PLAT; any future self-correction/identity-resolution
  workflow requires its own reviewed authorization contract. Other admin links move only after capability equivalence.
- **Validation:** global-admin vs clinic-admin/doctor direct-route matrix; billing operation authorization,
  reconciliation/idempotency and audit; target-org isolation; aggregate threshold; secret masking; aggregate
  diagnostic/support-report audit; no patient browse or mutation; typecheck/lint/build; DEV role smoke/screenshots;
  full CI at P5 checkpoint.
- **Rollback/degradation:** old privileged entry may remain guarded; degraded data sources show stale/unavailable,
  never fall back to clinical query. No support session exists under safe default.
- **Merge dependency:** U1/U7 and ownership classification. UX08-10 is rejected and creates no pending branch.

### Deferred commercial capability family U8 — custom domain, sender and generated organization PWA

U8 is post-launch and must not delay the solo platform product. U8A/B implement an already approved future path:
custom domain or platform subdomain plus a generated organization PWA from verified name/logo/manifest settings.
Separate native organization apps are outside this roadmap and remain research backlog. U8C has a resolved
failure-policy direction plus engineering defaults, but remains a future custom-provider feature. Each stage
consumes U9's sanctioned path and never creates a second platform settings/incident/org-support model. Initial
release omits all U8 branches and proceeds from U9 to U10.

#### U8A — hostname base and surface bindings

- **Outcome:** verified custom hostname can serve only explicitly approved surfaces while canonical platform URLs
  remain available.
- **Screens/flows:** `MGMT-05`; conditional bindings for `ORG-PUB-01…03`; approved later auth/PWA activates only
  when its future implementation stage and readiness gates are enabled.
- **Reuse/gaps:** stable platform alias and UX-05 lifecycle contract; no current UI is treated as a complete base/
  binding implementation.
- **Scope:** ownership proof, TLS/routing base readiness, stable platform alias, independent per-surface lifecycle,
  audit, selective suspend/remove/quarantine and loop-safe canonical fallback.
- **Forbidden:** Host as authz, all-or-nothing domain status, auto-binding every surface, auth/custom PWA before its
  readiness stage, direct DNS/provider secret exposure.
- **Boundaries:** hostname selects a published presentation entry only; authenticated principal/object policy remains
  server-resolved independently; base readiness and each surface binding are separate.
- **Future gate:** owner direction includes custom entry/auth/PWA eventually; activation requires implementation
  readiness and commercial scheduling, not another product answer. Initial release keeps every custom binding disabled.
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
- **Merge dependency:** U6B/U7/U9 plus approved infrastructure handoff; merge cannot imply DNS/TLS rollout.

#### U8B — deferred organization-specific auth and generated PWA

- **Outcome:** an explicitly approved origin can support auth/install/push without cloning the app or weakening
  identity and organization resolution; platform PWA remains stable.
- **Screens/flows:** conditional `ORG-PUB-03/PUB-04`, `PAT-11`, `ACC-04` origin/PWA variants; PIN installed-launch
  and recovery states.
- **Reuse/gaps:** platform PWA/install/push and U8A verified origin; per-origin manifest/session/support contract is
  not considered present.
- **Scope:** only verified, organization-configured origins; origin-bound manifest/name/icons/install/push; session handoff/re-auth;
  OAuth/cookie/CSRF/service-worker scope and support/recovery matrix; subscription rotation.
- **Forbidden:** cloning patient/staff app, cross-origin token replay, service-worker scope leakage, using hostname to
  select tenant after auth, breaking stable platform PWA.
- **Boundaries:** verified origin is presentation/delivery scope, never tenant authority; invite/object/enrollment
  remains trusted source; session and push subscription are origin-bound.
- **Future gate:** organization-specific auth/generated PWA is intended later and uses verified origin/name/logo/
  manifest settings. Initial release is platform auth/app only; separate native org app is outside roadmap.
- **Dependencies:** U8A, U3B/U5A/U7/U9; security architecture review. Deferred clinic staffing is not required for
  the approved organization-pinned generated-PWA branch.
- **Workstreams:** data — origin/PWA binding and subscription ownership contract; API — session/re-auth/manifest/push;
  UI — install/recovery; ops — origin/browser/support matrix.
- **Migration/compat:** platform PWA remains default; subscriptions/manifests are not silently reassigned across
  origins. Any compatibility/re-enrollment path is explicit and reversible.
- **Validation:** browser/origin matrix, cookies/CSRF/OAuth, raw-token exchange, install/update/offline/push rotation,
  revoked org/domain, canonical fallback; typecheck/lint/build and real browser visual/accessibility seals;
  accumulated P6 full CI if U8B is the last included optional stage.
- **Rollback/degradation:** disable origin binding; platform PWA and platform re-auth recovery remain available;
  subscription failure does not remove browser access.
- **Merge dependency:** U3B/U5A/U7/U8A/U9 and explicit future commercial/implementation activation; no
  independent per-origin rollout.

#### U8C — organization sender readiness and delivery policy

- **Outcome:** every custom-provider message uses a truthful authenticated sender identity or is held/expired, with
  visible health and immutable per-attempt audit.
- **Screens/flows:** future `MGMT-06` plus delivery/recovery states in `CLIN-02/03`, `ORG-PUB-03`;
  PIN/SMS delivery branches. Future team/STF surfaces are not required.
- **Reuse/gaps:** U3B immutable delivery attempts and platform sender; complete organization email identity and
  configured-channel no-fallback policy are missing.
- **Scope:** authenticated email identity readiness, SMS/push presentation, message-class eligibility, effective
  sender audit, bounce/complaint/provider health, retry/hold/expiry state and operator recovery.
- **Forbidden:** spoofing org sender, new integration secrets in env, treating display name as authenticated sender,
  platform-email delivery after custom email configuration or platform-SMS delivery after custom SMS configuration
  for patient/user messages, conflating sender health with invite acceptance.
- **Boundaries:** authorization and invite lifecycle precede delivery; effective sender is presentation/transport;
  credentials remain server-owned and org configuration remains DB-backed/mirrored.
- **Owner ruling/policy:** channel-exact no fallback: configured custom email forbids platform-email delivery and
  configured custom SMS forbids platform-SMS delivery for all patient/user messages. Apply standards-backed
  `expires_at`, stable delivery id/provider-callback dedupe and configurable `1m/5m/15m` jittered BersonCare
  pre-acceptance application submission retries; direct SMTP `4xx`/MTA cadence remains separate and is also capped
  by `expires_at`. Accepted provider submission is never resubmitted; ambiguous SMTP disconnect after `DATA` stays
  `unknown` for reconciliation. After three systemic failures (or immediate permanent auth/config failure), open the
  unhealthy circuit and send an in-app + platform service email incident without patient content, at most daily
  reminder and recovery notice. Metadata default is 90 days; values are engineering configuration, not owner gates.
- **Dependencies:** U3B delivery model, U7 identity, U9 platform ops/configuration surface, sanctioned DB
  settings/integrator mirror. DNS/provider readiness is engineering invariant, not owner choice.
- **Workstreams:** data — sender/readiness/message-class contract; API — verify/status/effective policy; UI — MGMT-06
  and recovery; delivery — provider attempts/bounce/complaint/audit.
- **Migration/compat:** current platform sender remains truthful; no automatic opt-in to custom sender. Message-class
  mapping and any backfill require audited deterministic source.
- **Validation:** SPF/DKIM/DMARC/envelope/Reply-To/provider states, bounce/complaint, class policy, per-attempt audit,
  send-safe mock/integration only, no secrets/PII logs, typecheck/lint/build, screenshots; accumulated P6 full CI when
  U8C is the last included optional stage (otherwise after the actual last included U8 stage).
- **Rollback/degradation:** hold within `expires_at`, retry only the configured custom provider, expire without
  sending, and alert account owner in-app + platform service email without patient content;
  existing accepted relationship is not undone by delivery degradation.
- **Merge dependency:** U3B/U7/U9 and explicit future custom-provider activation; merge does not authorize real provider rollout.

### U10 — route convergence, visual consolidation and final acceptance

**Outcome:** initial-release IA is the only user-visible system, old entries remain safe only where compatibility
requires, deferred IDs remain demonstrably absent, and the implemented solo product passes role, context, recovery,
responsive, accessibility and visual acceptance.

- **Screens/flows:** all `57/57` are accounted for, but deferred `PUB-06`, `MGMT-02`, `CLIN-05`, `OPS-01…04` and U8 surfaces
  pass launch acceptance by explicit absence/reservation, not implementation; launch UX-04 scenarios and all
  `152/152` current page allocations remain traced.
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
- **Decision gates:** all dated outcomes traced; unresolved/deferred future branches demonstrably absent.
- **Dependencies:** launch-included stages audited; current foundation integration checkpoint; U5C/U5D/U8 absent
  optional nodes never block U10.
- **Workstreams:** route/link census; shared UI consolidation; copy/accessibility; telemetry; acceptance automation and
  screenshots.
- **Migration/compat:** observe inbound/deep links and maintain versioned guarded redirects; retire only with zero
  unsupported consumer evidence and rollback mapping. No data migration in visual pass.
- **Validation:** mechanical 57/57 and current page denominator; reserved/future absence checks; role × route × direct
  object × state; launch J1/J3-J7 traces plus explicit J2 absence reconciled to dated rulings; desktop/mobile/platform app;
  keyboard/focus/semantics/contrast; console/network/overflow; targeted tests,
  typecheck, lint, affected builds and final full CI; migration/DB gates from included stages; DEV smoke and
  owner-authorized TEST acceptance separately; every included C0-C6/C2F owner-review acceptance; source-bound screenshot
  manifests and two independent visual seals.
- **Rollback/degradation:** compatibility map allows reverting links/shell without weakening new server guards;
  unavailable optional mechanics degrade to explicit recovery; no owner-gated feature is silently enabled.
- **Merge dependency:** final integration only after launch-included stages and foundation handoff gates. Deferred
  U5C/U5D/U8 branches are not included. Deploy and
  `main`/`test` actions remain owner-authorized operations outside this roadmap.

## 9. Dependency graph

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

```text
Foundation handoff -> U0 -> U1 -> U2
U1 -> U5A
U2 -> U3S
U1 + U5A -> U3B
U3S + U3B + U5A -> U4
U1 + U5A -> U5B
U3S + U1 -> U6A
U4 + U2 -> U6B -> U7 -> U9
All launch-included audited stages + current foundation checkpoint -> U10

Future-only, absent from launch DAG:
U0 + U1 + U2 -> U3A (only after future clinic staffing scope)
U1 + U3B + U5B -> U5C (only after future clinic contract)
U1 + U5A + U5B -> U5D (only after future clinic communication decision)
U6B + U7 + U9 -> U8A -> U8B
U3B + U7 + U9 -> U8C
```

Additional gates:

- The only patient-context direction is `U5A -> U3B -> U4`: U5A has no invite dependency and U4 does not reopen it.
- U5B owns the launch one-card + visit-relation scope. U5C/U5D are absent future placeholders; current solo chat is
  unchanged without a stage.
- U2 has no assistant launch branch; one-login management composition is an implementation choice.
- U5A uses last active + switcher, with chooser for invalid preference.
- U6A/U6B include landing/profile/booking/join; directory is deferred.
- Paid branding is resolved (domain/subdomain + org name/logo, shared design). U8A/B are post-launch
  custom-origin/generated-PWA branches; native org app is outside roadmap; U8C uses no platform fallback.
- U9 contains no patient-level support workflow.
- U3B must include manual patient card, scheduled/walk-in visit and later verified identity linking.
- U9 core PLAT/config/reliability/org operations precedes every included U8 adapter. An absent U8 branch is not a
  dependency node and never blocks U9, core platform URLs, P/O brand context, stable platform PWA or U10.

### 9.1 Normative direct-dependency registry

The registry below is the machine-check source for stage DAG. The diagram is its compact projection; prose
`Dependencies`/`Merge dependency` may add external foundation, owner-ruling or infrastructure gates but may not add a
reverse stage edge.

| Stage | Direct stage dependencies             | Initial-release inclusion                                         |
| ----- | ------------------------------------- | ----------------------------------------------------------------- |
| U0    | none (foundation handoff is external) | included                                                          |
| U1    | U0                                    | included                                                          |
| U2    | U1                                    | included                                                          |
| U5A   | U0, U1                                | included                                                          |
| U3S   | U0, U1, U2                            | included                                                          |
| U3A   | U0, U1, U2                            | absent optional node; dependencies apply only if future-activated |
| U3B   | U1, U5A                               | included                                                          |
| U4    | U2, U3S, U3B, U5A                     | included                                                          |
| U5B   | U1, U5A                               | included                                                          |
| U5C   | U1, U3B, U5B                          | absent optional node; dependencies apply only if future-activated |
| U5D   | U1, U5A, U5B                          | absent optional node; dependencies apply only if future-activated |
| U6A   | U1, U3S                               | included                                                          |
| U6B   | U2, U4                                | included                                                          |
| U7    | U2, U6B                               | included conservative presentation only                           |
| U9    | U1, U7                                | included                                                          |
| U8A   | U6B, U7, U9                           | absent optional node; dependencies apply only if future-activated |
| U8B   | U3B, U5A, U7, U8A, U9                 | absent optional node; dependencies apply only if future-activated |
| U8C   | U3B, U7, U9                           | absent optional node; dependencies apply only if future-activated |
| U10   | every launch-included audited stage   | included; absent optional nodes are not dependencies              |

## 10. Validation tiers

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Risk                                        | Required evidence                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Documentation/contract only                 | ID/dependency/decision/link consistency, current-state evidence, `git diff --check`                                                                                                        |
| UI composition without behavior/data change | targeted component/navigation tests, typecheck/lint, affected build, role smoke, desktop/mobile screenshots, accessibility basics                                                          |
| Auth/invite/capability/patient context      | unit + integration + concurrency/replay, direct/list/count/search/export/write parity, real-role two-org/two-patient negatives, typecheck/lint/build, DB/migration proof, runtime smoke    |
| Migration/backfill                          | reviewed ownership/schema contract, forward/rollback, idempotency, zero unexplained NULL/orphan/foreign-parent/ambiguous rows, compatibility window, scratch then authorized TEST evidence |
| Delivery/domain/origin/PWA                  | send-safe provider/mock, DNS/TLS/routing/origin/browser matrices, secret/PII redaction, canonical fallback, fail injection and recovery                                                    |
| Stage checkpoint                            | worker checklist + full independent audit + integrated correction + full re-audit when needed                                                                                              |
| Phase/final checkpoint                      | accumulated relevant gates and full CI; U10 adds source-bound screenshot manifests and two independent visual/usability seals                                                              |

Тесты не повторяются после каждой мелкой правки. Targeted checks идут один раз на цельный stage; full CI — на
крупном phase/integration/final gate или после существенного накопленного пакета.

## 11. Route and component anti-duplication register

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- `MGMT-SETUP`, `MGMT-TEAM`, `MGMT-INVITE`, `CLIN-PAT-INVITE`, `ACC-FIRST`, `PAT-INSTALL` — state/flow aliases,
  не новые screen IDs.
- `CLIN-04` is launch card history; `CLIN-05` is a reserved absent future ID with no recovery queue or hierarchy.
- `CLIN-08` переиспользует patient-card/program routes; `OPS-05` не существует, account = `ACC-01…04`.
- Public and patient booking reuse one canonical wizard family with context-specific entry; alias steps retire after
  census.
- Solo/clinic differences — composition/capability variants одного CLIN shell.
- Owner/admin+specialist — один login и независимые MGMT/CLIN capabilities; финальный switch style зависит от
  UX08-04, но route bodies не копируются.
- Assistant/receptionist — future-only; no launch OPS route bodies.
- Platform admin — PLAT shell; перемещение route не меняет ownership данных.
- Branding/domain/PWA — resolver/tokens/bindings, не fork приложения.

Каждый stage audit запускает duplicate search по target ID, candidate route, navigation destination и shared
component ownership. Новый параллельный route/component допустим только после изменения UX-06 canon, а не как
локальная implementation shortcut.

## 12. Final implementation acceptance

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

План реализации можно считать выполненным только когда:

- [ ] каждый включённый stage имеет worker evidence, полный независимый audit и закрытый re-audit/follow-up;
- [ ] все dated owner outcomes traced: resolved launch implemented, future/deferred branches absent, rejected
      premises absent;
- [ ] foundation/enforcement handoff пройден без изменения `SEQUENCE.md` и без дублирующих principal/settings/
      membership paths;
- [ ] `57/57` canonical screen IDs и актуальный denominator current pages согласованы механически;
- [ ] launch J1/J3-J7 plus explicit J2 absence, manual patient/card/appointment/walk-in, portal linking, recovery,
      install/push, public booking,
      multi-org and card/history pass acceptance; no rejected transfer lifecycle exists;
- [ ] role/capability/tenant/patient/direct-object/parity matrices зелёные;
- [ ] migrations/backfills имеют reviewed ownership, forward/rollback/idempotency and compatibility evidence;
- [ ] safe platform-domain entry fallback, core org context, custom-sender no-fallback truthfulness and
      optional-feature degradation доказаны;
- [ ] нет duplicate solo/clinic/assistant/card/booking/account/branded-app route or component families;
- [ ] targeted checks, typecheck, lint, builds, risk-relevant DB/runtime smoke и final full CI зелёные;
- [ ] final desktop/mobile/PWA screenshot batch source-bound; два независимых visual/usability seals получены;
- [ ] existing `ROADMAP.md`, `LOG.md`, route map and operational runbooks отражают итог; устаревший текст помечен,
      а не конкурирует с каноном;
- [ ] commit/push/merge/deploy выполнены только в разрешённые ветки/среды; `main`/`test` и TEST/prod operations имеют
      явное разрешение владельца.

До выполнения этого checklist отдельный красивый экран, зелёный узкий тест, прототип seal или foundation smoke не
доказывает завершение всей implementation цели.
