> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Log — SaaS Product UX Initiative

## 2026-07-23 — U5A TEST lifecycle harness audit correction (`#796`)

The first candidate was rejected by independent audit because its CLI used the seeder-style database authority
directly and its private proof did not reproduce the locked TEST principal/ACL wall. The corrected harness now uses
the protected `SAAS_ISOLATION_OPERATOR_DATABASE_URL` login only. Before product access the CLI verifies exact
`bersoncarebot_test`, LOGIN/INHERIT, all dangerous role attributes off, no application-role membership, no direct
`org_enrollments` privilege and exact EXECUTE on one ephemeral capability.

The root-only exact-TEST wrapper installs a closed `SECURITY DEFINER` function owned by the existing canonical
NOLOGIN `app_owner`, invokes the ordinary operator login, and removes the function on success or failure. The
function uses the canonical patient-invites strict-overlay `app_owner` `SELECT, UPDATE` ACL; it creates no role,
table grant or seeder BYPASS window. A short table lock protects the exact two-row A+B relationship set against
concurrent writers, Clinic A must remain active, and only the exact Clinic B row can move
`active ↔ discharged`. Arbitrary `PGOPTIONS` pass-through was removed.

The repository proof starts a private disposable PostgreSQL, applies the exact generated strict
`org_enrollments` policy with ENABLE+FORCE and canonical ACL shape, then runs the actual operator CLI through
`status → discharge → repeated discharge → restore → repeated restore → status`. It also proves a concurrent third
relationship insert is blocked, ends with exactly two active rows, and leaves neither the capability nor an operator
table grant. Focused tests, typecheck/lint, shell/static gates and diff-check are recorded with the correction commit.
No persistent TEST/DEV/PROD database, deploy, service, environment secret or external channel was touched. The U5A
live checkboxes remain open until an authorized TEST browser pass records A↔B/deep-link/refresh/revoked-preference
evidence and restores the fixture.

A second independent audit then found two remaining entry-boundary gaps: a raw libpq URI `options=-c role=...`
could make `session_user` differ from apparently-safe `current_user`, and the wrapper validated its checkout/env/SQL
but not `BASH_SOURCE` itself. The hardened boundary now rejects every case/percent-encoded URI `options` key before
connection, scrubs ambient libpq `PG*` variables at every psql/Node child, requires
`URL login = session_user = current_user`, and validates the operator's exact sole direct
`saas_telemetry_operator` membership. The SQL function repeats the session/current and membership checks, while
EXECUTE is granted only to that exact login. The root wrapper must itself be the regular non-symlink canonical
`/opt/projects/bersoncarebot-test/deploy/host/run-u5a-patient-organization-test-lifecycle.sh`; relative paths,
aliases, symlinks and FIFOs are negative-tested. The disposable PostgreSQL proof reproduces a real startup
role-switch mismatch and proves the actual CLI rejects it before connecting. This remains repo/disposable-only:
TEST/DEV/PROD and external systems were not opened or changed.

## 2026-07-22 — owner roadmap reconciled against full Doctor UI brief (`#959`)

Owner stopped further implementation after the active plan had compressed part of the detailed Doctor UI brief.
Code workers were stopped before changes, and the original plan commit `f48f35a56`, current implementation,
OWNER_REVIEW, roadmap, active subordinate plans and taskdb were compared in three independent read-only passes.

The existing canon now restores the exact requirements that had been lost or downgraded: broadcast detail opens in
the left communications pane with its error log on the right; one shared composer covers doctor/patient chat and
doctor/patient comments; the normal «Клиенты» screen retains filters plus a functional preview; opening the full
patient card replaces the whole doctor content workspace and restores list state on return; the complete patient-card
composition is preserved without abbreviation; configurable Today signals remain an owner-requested stage; scheduled
messages cover all four chat/comment consumers with durable status and worker delivery. No parallel roadmap was
created.

After the owner challenged checklist granularity, the Doctor UI artifact also gained one atomic completion tracker:
every verifiable owner item is an individual checkbox, partial stages are split into closed and open requirements,
and repository completion is explicitly separated from TEST/live owner acceptance. Future worker briefs may cite
that checklist but may not compress it into a parent-stage summary.

A recursive linked-plan census separated seven top-level entrypoints and twenty leaf execution plans. Umbrella,
Foundation-helper and production-runbook documents remain subordinate to their owning leaf and are not counted as
extra stages. None of the twenty leaf plans is fully closed: two have only a completed partial slice, six have
executable residual and twelve are gated. Doctor UI has one proven completion/checklist shortcut; two Rubitime
artifacts have incomplete checklist provenance and therefore require reconciliation before further action, not
automatic code repetition. The main roadmap now contains the registry and the rule that roadmap ordering never
replaces a linked detailed checklist.

The factual matrix is no longer blanket-green: UI-0/2/9/UI-P and the patient mood residual are repository-complete;
UI-1, UI-3, UI-4, UI-6 and UI-8 are partial (`#191` remains inside UI-8); UI-5 and UI-7 are not implemented. Exact
residual taskdb cards are `#960`–`#964`, while `#958` was corrected to the preview + full-workspace routing behavior. Stale hardening, S4,
outbound-alerting, dependency/editor and initiative-registry statuses were reconciled without rewriting historical
log entries. No source code, DB, environment, deploy or CI action was performed in this docs-only stage.

## 2026-07-21 — appointment detail UI owner delta queued (`UI-1c`, `#951`)

Owner supplied a focused correction for the appointment card opened from Schedule/Today. The delta is now bound to
OWNER_REVIEW §16a, the Doctor UI execution artifact and the main roadmap as a separate presentation/interaction
sibling of completed C1 `#851`; no code worker was launched in this docs-only pass.

Acceptance covers one close control, larger FIO with existing chat/phone actions, emphasized current date/time with
semantic status badge, labelled branch/service/specialist with a solo-only omission, removal of duplicate status,
patient-card and Rubitime UI, original time only after an actual reschedule, a centered create-visit action and a
blank-disabled comment submit. Current `BookingStaffPaymentPanel` is diagnostic-only and does not provide the full
provider-readiness/cash/invoice/pay-link/QR contract, so UI-1c hides it without deleting its domain; any future money
implementation remains a separate high-risk stage. Taskdb `#951` is `todo`, `auto_ok=true`, with the canonical doc
pointers. No source, DB, DEV/TEST/PROD, deploy or CI action was performed.

## 2026-07-21 — Hardening C2 and Phase 0 milestone closed (`#940`)

Integrated `693c10d98` + `7055287ba`. The existing `@bersoncare/db-principal` AsyncLocalStorage and existing pino
loggers now carry one bounded UUID correlation identity plus trusted organization context across webapp ingress,
webapp→integrator transports, Fastify, outgoing-delivery persistence/worker processing, long polling and media jobs.
No second context/logger, inbound organization header, per-request database call or synchronous network hop was
added.

The first independent audit failed `0/2/0`: some bootstrap routes regenerated the id after proxy validation, and a
raw legacy auth header could override the safe pino field. One coherent correction made all current bootstrap and
integrator ingress request-bound, removed the raw field and added a recursive route census. Terminal re-audit passed
`0/0/0`. The accumulated milestone then found only integration mechanics: shared-package typecheck ordering and
stale partial test mocks (`564e26b9f`, `40904546a`), U9A fallback-key generator drift (`e08481969`) and a static
principal-census marker for the already-secure notification-template route (`56be482e1`).

The complete command-equivalent Phase 0 CI gate passed after resuming from each failed command: lint/static guards,
all workspace typechecks, HLS sync, integrator tests (`1319` passed), the full webapp suite plus all exact resumed
failures (`76/76`), media-worker (`61` passed), backend and production webapp builds, SaaS/hard-migration/isolation/
smoke audits and registry audit. Dependency audit initially read a stale local install; offline frozen synchronization
confirmed the already-integrated patched lock (`650ae57f4`) and the final audit reported no known vulnerabilities.
Migration `0224` remained fail-closed against the working DEV database (`42501`); no schema apply, deploy, TEST or
PROD action was performed.

## 2026-07-21 — Hardening F1 dependency automation integrated (`#942`)

Integrated `03c1dfac1`. A single bounded GitHub Dependabot updater now covers the root pnpm workspace weekly with a
five-PR cap and no auto-merge or deploy behavior. `shadcn@4.7.0` moved from webapp production dependencies to
devDependencies without version or lock-resolution drift; the recursive production graph for all workspaces no
longer contains it, while build-time CLI/CSS usage remains available.

The one independent mechanical/security audit passed `0 P0 / 0 P1 / 0 P2`. Offline lock/frozen install, config and
manifest proofs, prod/dev dependency trees, CLI version and diff-check passed. GitHub scheduling can only be observed
after the config reaches the default branch; no PR, merge, deploy, registry mutation or full CI was triggered here.

## 2026-07-21 — Hardening D3 production dev-bypass guard integrated (`#941`)

Integrated `a70b7ce4a`. `ALLOW_DEV_AUTH_BYPASS` now accepts only exact optional boolean text and production with the
flag enabled fails at typed config/startup boundaries. Both development-auth routes remain independently
fail-closed in production. Clinic invitations no longer let the flag reclassify production: raw invitation URLs
are never returned there and delivery failure remains a `503`.

The single independent security audit passed `0 P0 / 0 P1 / 0 P2`. Focused tests, webapp typecheck, scoped lint,
diff-check and a real production config-import refusal all passed. No database, server, environment, deploy or
external delivery was touched; full CI remains the accumulated Phase 0 milestone gate.

## 2026-07-21 — Hardening A1 real-PostgreSQL tenant gate integrated (`#937`)

Integrated `296ec6e33` + `14c9b7ca7`. The dedicated serialized CI gate restores the versioned A0 baseline into a
private ephemeral PostgreSQL, applies the current migrations and verifies two synthetic organizations through the
canonical non-owner staff and patient runtime roles. It proves own-organization access, cross-organization denial,
controlled principal-full access and literal FORCE-RLS denial when no signed principal context exists.

The initial audit found that missing-principal behavior was only indirectly covered. One coherent correction added
fresh direct database sessions for both base logins; the full independent re-audit passed `0 P0 / 0 P1 / 0 P2`.
The verifier passed on the integrated feature SHA (`5/5` static checks plus real PostgreSQL). No working database,
DEV server, TEST/PROD environment or deploy was touched. Full CI remains serialized at the accumulated Phase 0
milestone.

## 2026-07-21 — Live list-row reference replaces literal padding (`#925`)

Owner selected the actual «На сопровождении» list on «Сегодня» as the visual reference for doctor list rows.
Its inset hairline dividers, text/icon alignment and larger lighter primary text take precedence over copying a
literal padding number to every screen. The same shared presentation behavior now applies to «Клиенты» and the
messages/conversations lists; selected chat state stays clear but does not turn the row into a separate card.
No sorting, filtering, message or patient data behavior changes in this correction.

## 2026-07-21 — Clients/messages list rhythm integrated (`#925`)

The bounded presentation implementation is integrated and pushed as `5285e1843`. Clients and the conversation list
now reuse the shared doctor flat-row vocabulary and the inset divider rhythm of Today «На сопровождении»; the client
indicator rail remains fixed and the selected conversation uses a subtle marker without per-row card chrome.

Targeted component evidence (`39` assertions), webapp typecheck, scoped lint and diff-check passed. The sole
independent presentation audit passed `0 P0 / 0 P1 / 0 P2`; no serial correction round was opened. The temporary
worker branch/worktree was removed. Taskdb `#925` remains `doing`: accumulated full CI and serialized DEV
desktop/mobile acceptance are still required, and owner acceptance was not inferred from the audit.

## 2026-07-21 — Platform defaults for clinic-location colors (`#932`)

Owner added a later platform setting for an ordered palette of default colors for newly created physical locations
and a separate default for the built-in `Online` location. The clinic receives a default only at creation and can
override it afterward; existing colors are preserved. If there are more physical locations than palette entries,
the palette repeats cyclically; `Online` keeps its separate default and is excluded from that sequence. Current code still hardcodes `#2563eb` for the solo-location
form and `#7c3aed` for lazy Online creation, while the branch model and clinic UI already persist/edit a color.

The bounded implementation will reuse global DB-backed platform settings and the existing branch color field. It
may use the native color input or an already-installed lightweight accessible picker, but will not add a heavy
dependency or a second palette store. This addition is tracked as `#932` and does not expand active auth task `#929`.

## 2026-07-21 — U9A platform-settings prerequisite integrated (`#929`)

The bounded global-settings spine is integrated as `7c9d94bea` + `f48c4b8af`: dedicated platform API guard and
least-privilege principal, canonical system-settings service/audit/mirror writes, and a closed SECURITY DEFINER
mirror fallback which derives the payload from the exact global DB row and cannot enqueue arbitrary work.

The initial security audit found missing Drizzle role translation/cleanup, guard negatives and root gate wiring.
One coherent correction closed them; the terminal independent re-audit passed `0 P0 / 0 P1 / 0 P2`. Targeted
tests, typecheck/lint/static checks and the disposable real-role PostgreSQL matrix passed. The role SQL was not
applied anywhere; no working DB, TEST/PROD, deploy, provider or real send was touched. The four auth-channel flags
and their runtime enforcement remain the active N1A part of `#929`.

## 2026-07-21 — Tiptap checklist accepted as independent UI work; N1B boundary corrected (`#931/#930`)

Owner provenance for `#931` is recorded in taskdb: replace every current markdown write-editor with one Tiptap
WYSIWYG while preserving markdown storage and patient rendering. The new document is a subordinate task checklist,
not a second product roadmap, and it does not block or supply the N1B template editor. Completion now requires a
saved discovery-manifest, compatibility/golden roundtrip evidence and live verification of every discovered screen,
not only the three currently known surfaces.

N1B remains on the existing notification-template engine. Its email presentation uses a fixed server-owned
email-safe envelope with typed branding fields and synthetic preview. Organizations never submit arbitrary HTML/CSS.
This replaces the intermediate raw-HTML-editor wording and preserves the already chosen safe-layout default.

## 2026-07-21 — U9A bounded platform-settings spine required by N1A (`#929`)

The current clinic settings API cannot be reused as a platform writer: it resolves one organization membership and
must stay scoped to that organization. The existing global-admin page capability has no corresponding API/DB writer
principal. N1A will therefore land the smallest U9 foundation needed by the owner-approved channel controls: a
dedicated platform API guard, a least-privilege global-settings DB principal/role and a whitelisted platform settings
endpoint which still delegates to the canonical system-settings service, atomic audit and integrator mirror.

This is not the U9 admin-console/support implementation and does not complete `#808`. It cannot borrow a clinic,
map the operator to broad null-org staff access, weaken tenant RLS or create a parallel settings/audit path. The same
sanctioned spine is later reused by platform-owned notification template defaults in `#930`.

## 2026-07-21 — Owner additions: auth-channel controls and editable branded templates (`#929/#930`)

Platform admin must independently allow Email OTP, SMS OTP, Telegram auth/link and MAX auth/link. Existing SMTP,
SMSC and bot configuration is retained; configured provider readiness is not an enable policy. The flags govern
authentication/binding only and cannot activate product fallback or platform-funded SMS broadcasts.

The repository already contains `notifTemplatesService`, admin/doctor notification-template routes and the schedule
notification editor for created/cancelled/rescheduled events. This mechanism is the mandatory reuse base. It will be
extended with platform defaults, organization owner/admin overrides, per-event/channel safe variables, email
HTML+plain rendering and Telegram/MAX formatting. Branding presentation is entitlement-gated. Individual specialist
overrides remain an explicit later owner decision and are not inferred into the first implementation.

## 2026-07-21 — Owner ruling: notification channel and safe-copy matrix

Appointment reminders may use email through an exact transactional template containing appointment date/time,
specialist, location/online mode and a safe authenticated-app link, but no diagnosis, complaint or arbitrary
clinical text. Exercise reminders are app-push events with generic copy; details stay behind authenticated fetch.
Message/comment events use neutral push and, when email is enabled, a neutral email without message body, patient
name or clinical data. This is a subtype/template allowlist, not generic email permission. Platform SMS remains no
fallback; a later specialist-funded provider integration requires its own explicit templates and gate. Reminder
timing still follows the specialist-default plus client per-appointment override ruling below.

## 2026-07-21 — Owner correction: reminder preset ownership (`#190` / NTF booking)

The fixed `24h/2h` booking reminders are legacy defaults, not the target model. Each specialist configures which
reminder choices/default are proposed for their appointments; after confirmation the client may override or disable
them for that concrete appointment, and the client selection wins. This replaces the earlier §15 statement that
appointment reminder timing was configured once at organization level. Shared templates/transport are not duplicated
per specialist. Current NTF N1 changes only the channel guard; scheduling belongs to the later booking-reminder slice.
Current code already renders `AppointmentReminderSettingsSection`, but exposes raw numeric minute offsets such as
`1440/120` and stores them through a `per_org` system-setting key. The existing screen is reused; the remaining work
is a human-readable selector plus truthful per-specialist defaults and per-appointment client override, not a second
reminder settings mechanism.

## 2026-07-20 — U5A organization-context convergence integrated (`#796`)

**DEV runtime closure and live correction.** The prepared DEV database was advanced in place through the audited
exact-DEV `migrate-dev.sh`; migrations through `0219`, the C4D online index, mandatory privilege cleanup, runtime
overlay and both ledger checks passed. No dump, reset, restore, TEST/PROD access or deploy occurred. The patient
entitlement read now uses a no-argument exact-current-patient capability: active patient and organization come only
from the signed DB principal, `app_patient` receives no direct tariff/organization table grants, and foreign,
missing or revoked context fails closed. Independent critical audit passed `P0=0, P1=0, P2=0`.

Focused live DEV then passed `/app/patient`, one-organization resolution, preference persistence and refresh without
the former `42501`/HTTP 5xx. A final live defect was corrected by emitting same-origin relative redirects from the
trusted opener: neutral recovery now remains on `127.0.0.1`, preserves the authenticated session and cannot consume
an external Host/`next`. Its independent audit and browser recheck passed. Evidence:
`.claude/screenshots/U5A-DEV-LIVE/2026-07-20T20-20-HEAD-300d99f14`.

**Honest remaining live seal.** The current sanctioned DEV writer can create only an `invited` relationship; it does
not prove portal identity or promote `org_enrollments` to `active`. A proposed privileged fixture was stopped without
code or DB changes. Therefore two-active-organization switching and revoked-previous-selection remain for the
existing canonical TEST walkthrough fixture, or for a repeat after U3B introduces the sanctioned invite/proof
activation transition. The U5A resolver, isolation and recovery implementation is integrated and audited; no
privileged DEV-only enrollment backdoor will be added to satisfy a screenshot.

U5A теперь использует один server-authorized контекст организации для zero/one/many relationships. Единственная
активная организация запоминается как повторно проверяемая подсказка; ручное переключение сразу скрывает прежние
clinical данные и заменяет URL на безопасный Patient Today, поэтому старый object route не может вернуть прежнюю
организацию. Добавлен канонический экран организаций пациента и recovery для отозванного/недоступного назначения.

Reminder continuation в webapp и integrator несёт exact organization конкретного occurrence. После unauthenticated
login этот target сохраняется в `next`, затем повторно проверяется сервером; missing/invalid/foreign/revoked target
остаётся neutral и не перезаписывает preference. Видимое MOR-04 уведомление больше не доверяет query-параметру:
его один раз выдаёт только verified opener через short-lived exact-org HttpOnly receipt, который context API снова
авторизует и поглощает. Обычный manual switch receipt очищает и такого уведомления не создаёт.

После одного correction-pass финальный high-risk re-audit прошёл с `P0=0, P1=0, P2=0`. Targeted webapp/integrator
tests, оба typecheck, scoped lint и diff checks зелёные; миграций, БД, сервера, deploy, full CI и real sends не было.
Этап остаётся `doing` до сериализованной live DEV desktop/mobile/PWA проверки двух организаций, точного reminder после
повторного входа, revoked recovery и отсутствия повторного notice. После этого U5A может закрыться и открыть U3B/U4.

## 2026-07-20 — U3S current-contract validation convergence (`#919`)

U3S product/security implementation was already present and audited, but its executable closeout evidence had drifted:
the old phase3 smoke still created a specialist during organization provisioning, while the accepted contract creates
exactly one organization + owner membership first and performs the clinical specialist binding only after the secure
first-run gate. The obsolete TEST-writing `demo-register-clinic2` helper was removed; it is not a registration path.

The replacement proof always starts a private PostgreSQL cluster under `/tmp`, applies the canonical principal,
provisioning and security artifacts, calls `app.provision_specialist_owner(uuid)` and the production
`pgOrganizationProvisioning` binding port, then removes the cluster. It proves sequential/concurrent convergence,
one organization and owner, no specialist before binding, denial of a foreign challenge and second organization,
exact-org/actor binding, idempotency and one audit event. Direct Account security component tests cover the truthful
first-run, recovery and binding states; organization settings remain **«Настройки»**, personal security/profile remains
**«Аккаунт»**, and the rejected label «Практика» is absent.

Independent high-risk audit passed with `P0=0, P1=0, P2=0`; the full disposable smoke, targeted U3S tests,
typecheck, scoped lint and diff checks passed. No TEST/PROD DB, deploy, real send or full CI was touched. The full
desktop/mobile DEV registration → security/recovery → authorized binding → first clinical workspace journey then
passed on the existing `:5200`; `#917` separately owns the later TEST/Neo handoff.

**Live DEV result and bounded correction.** На существующем `:5200`, без второго сервера и без прямых действий с
БД, прошли public registration, non-delivery email challenge, exactly-one organization+owner, confirm replay/retry,
TOTP, recovery acknowledgement, owner→specialist binding, Today, desktop/mobile, password+TOTP login, session revoke
и recovery replacement. Проверка нашла один acceptance blocker: bare `/app/settings` сохранял старую default-семантику
персональной вкладки и отправлял bindingless owner в Account. Исправление делает `/app/settings` каноническими
organization **«Настройками»** для capability `organization.management`; `/app/account` остаётся личным
**«Аккаунтом»**, restricted security и non-manager staff остаются fail-closed. Independent audit:
`P0=0, P1=0, P2=0`; `110` targeted tests зелёные. Короткий live recheck исправленной точки также прошёл: после
настройки TOTP, но до specialist binding, `/app/settings` возвращает organization «Настройки», `/app/account` —
личный «Аккаунт», отклонённого названия «Практика» нет. Evidence:
`.claude/screenshots/U3S-DEV-LIVE/2026-07-20T19-20-34Z`. U3S закрыт; пройденный security journey повторно не гонялся.

## 2026-07-20 — C4D ownership correction: platform writes wait for U9 (`#724`)

C4D keeps the explicit `organization | platform` ownership tags, exact child-owner checks, platform-row read
composition and the `exercise_catalog` entitlement default-OFF gate. It does not pre-empt U9's sanctioned platform
principal: the premature global-admin page, navigation entry, mutation port/service/repository and broad
`SECURITY DEFINER`/`app_staff` function surface were removed. Until U9 defines the platform governance/write path,
platform catalog writes therefore remain fail-closed; no clinic content is promoted or copied automatically.

The downgrade path now preserves only already-assigned platform exercise media under the current organization,
including the valid organization-owned-template → platform-exercise case, while requiring the template membership
row and treatment-program instance to match the exact organization. The observed assignment snapshot path now
writes and updates `patient_lfk_assignments`, `lfk_complexes` and `lfk_complex_exercises` with the trusted current
`organization_id`, and fails closed if an existing assignment cannot be updated inside that organization. No DB,
TEST, PROD, deploy or store-commerce action is part of this correction.

The terminal correction also replaces the historical global active-assignment unique key with
`organization_id + patient_user_id + template_id`: one platform patient may therefore receive the same platform
template independently in two organizations, while a duplicate inside one organization remains rejected. Merge
and merge-preview conflict guards now use the same exact-organization contract. The hot `media_files` owner index
was removed from the transactional Drizzle body and moved to a versioned, transaction-free concurrent operator
artifact. Future owner-authorized fresh TEST rehearsals and the production cutover chain execute that artifact;
this code-only correction did not run it and did not access any database or environment.

## 2026-07-20 — UI-0 live DEV closure after strict-policy rehydrate (`#923`)

UI-0 закрыт на существующем DEV-сервере без второго Next instance и без dump/restore/reset. После кода атомарного
создания пациента старая DEV-политика `user_phone_history` всё ещё использовала raw-GUC и отклоняла запись в locked
principal mode. DEV-only rehydrate wrapper теперь в каноническом порядке применяет P2-B, P0.5b, strict helper-based
phase4 policies с `phase4_enforce_locked_context=1`, затем specialized overlays и D3.4. Он не запускает FORCE RLS,
не касается TEST/PROD и не является частью обычного code-only deploy. Критический аудит сначала нашёл один stale
passage в hard-migration protocol; passage и checker были исправлены одним bounded correction, финальный re-audit PASS.

После audited non-destructive DEV apply новая синтетическая запись из календаря сохранилась HTTP 200, появилась в
недельном календаре, получила exact organization-owned patient projection и каноническую ссылку карточки пациента;
карточка открывается с той же clinic-admin ролью. Живая evidence сохранена в ignored
`.claude/screenshots/UI0-LIVE-DEV/2026-07-20T18-52-final/`. В том же кадре подтверждена owner-коррекция меню:
**«Настройки»** и **«Аккаунт»**, без видимого «Управление практикой».

## 2026-07-20 — owner correction: «Настройки» и «Аккаунт», без product label «Практика» (`U2`, `#918`)

Владелец прямо исправил ложную атрибуцию: пара «Практика» / «Настройки практики» никогда им не утверждалась.
Целевая навигация использует **«Настройки»** для кабинета/организации и **«Аккаунт»** для личного профиля, входа и
безопасности; отдельной страницы «Управление практикой» нет. `/app/manage` сохраняется только как compatibility
redirect на `/app/settings?tab=organization`. Канон owner-review и decision packet исправлены; исторические записи
ниже о старом UI считаются superseded этим решением.

## 2026-07-20 — owner public profile, slug and booking widget direction (`U6B`, `#926`)

Владелец назначил следующим product-development stage собственную публичную страницу организации/специалиста.
Slug выбирается владельцем при первом setup и формирует platform-origin routes `/<slug>`, `/<slug>/booking` и
`/<slug>/booking/widget`; старый `/book/<slug>` сохраняется compatibility redirect. Публичная страница получает
published logo/avatar, название, информацию/контакты, специалистов, услуги/локации и booking CTA. Виджет строится не
как копия формы в чужом JS, а как один canonical booking iframe с общим loader script в inline и modal режимах;
slug повторно связывается с exact organization server-side. Existing `#805/#817` не дублируются, U6B собран в
taskdb `#926`; directory всех организаций остаётся deferred.

### U6B-0 dormant slug foundation — integrated, public surfaces still gated

В `feat/doctor-ui-rebuild` интегрирован только независимый data/security-фундамент U6B: единое глобальное
пространство slug, durable `reservation/current/alias`, сохранение старого адреса как прямого alias, append-only
audit переименований и узкий published+active resolver. Slug остаётся lookup/presentation key и не становится
источником tenant authority. Миграция не публикует организации и не добавляет `/<slug>`, booking/widget UI или
signup-экран.

Два correction-pass закрыли реальные findings: phase4 overlay больше не может вернуть missing-context-open policy;
directory slug не может разойтись с canonical current claim; автор операции берётся из trusted staff principal;
одновременные reserve/claim/rename не создают same-org или cross-org deadlock. Финальный критический re-audit:
`P0=0, P1=0, P2=0`; targeted `27/27`, typecheck, scoped lint, RLS/resolver/D3.4/journal checkers и disposable scratch
smoke прошли. Рабочие DEV/TEST базы, deploy и full CI не затрагивались. Миграция `0218` лишь стоит после
интегрированной `0217` и будет применена только каноническим отдельно разрешённым migration flow. Публичная страница,
новый booking route и widgets остаются зависимы от завершения `U5A/U3S → U3B → U4` и не запускаются раньше.

## 2026-07-20 — owner Doctor UI chrome correction (`UI-P`, `#925`)

Владелец зафиксировал единый presentation-token delta для doctor workspace: фон промежутков `#faf9f4`, белая
page header, радиусы page block/KPI/control `12/8/24px`, белый фон input, единый порядок KPI label сверху/value
снизу, padding основных блоков `18px` и более крупный/лёгкий основной текст строк списков. Строки списков разделяет
серая линия `1px`, horizontal padding равен `18px` для выравнивания с header. На «Клиентах» поиск переносится из отдельной полосы под
шапкой в правую половину самой шапки на одну линию с title. Решение записано в owner-review §16a, roadmap §7.3 и
детальный UI plan как `UI-P`; taskdb `#925` создан без дублирования. Реализация должна идти через существующие
doctor shared primitives вместе с обновлением style guide/rule, не затрагивая patient/public UI и data semantics.

**Implementation closure.** Shared doctor primitives and scoped doctor tokens now implement the complete delta,
including the exact owner primary `#406ca7`; patient/public themes and destructive/warning semantics were not changed.
The one permitted independent presentation audit passed with no findings: `19/19` targeted tests, scoped lint,
typecheck and diff-check were green. After integration, the same `19/19` tests passed again and live DEV screenshots
at `1480x1024` and `390x844` confirmed the Patients header/search composition, gap/background/radii/padding/KPI/list
rules and mobile wrapping on the single existing `:5200` server. Evidence is stored in ignored
`.claude/screenshots/UI-P-LIVE-DEV/2026-07-20T19-02-final/`.

## 2026-07-20 — code-only TEST checkpoint, C1 closure and UI-0 live residual

TEST был обновлён только кодом до `27c19a275`; dump, restore и reset не выполнялись. Code-only wrapper получил
узкое временное членство runtime DB role в protected `app_owner` только на остановленном migration window, затем
отозвал его вместе с временными migrator/BYPASS правами и доказал отсутствие residue. Drizzle прошёл текущий
journal, пять TEST units активны, health/nginx gates зелёные, locked product smoke прошёл `22/22`, а отдельный
global-admin clinical-write negative вернул ожидаемый `403`. Diagnostic E1 warning остался TEST-soft наблюдением;
FORCE wall и closure checks прошли hard.

Живая desktop/mobile приёмка закрыла C1 `#850/#851/#852`: на «Сегодня» одна строка ФИО, deferred appointment KPI
скрыт и календарь поднят; «Клиенты» показывают всех людей по умолчанию, одну строку ФИО, 50/50 desktop, сортировку,
фактические KPI с единым selected-state и `4/4` live hover tooltips; «Расписание» открывает неделю и не показывает
Rubitime; Chats/Broadcasts используют актуальные 45/55, empty prompt корректен, журнал не перекрывает редактор.
Скриншоты находятся только в runtime `.claude/screenshots/OWNER-TEST-CHECKPOINT/` и не коммитятся.

Тот же проход доказал вход в specialist/clinic registration и первые два шага public booking, но нашёл точный
остаток UI-0 `#923`: после допустимой clinic-wide услуги slots API отвечал `branch_service_mapping_missing`.
Причина — no-specialist flow произвольно подставлял первого активного специалиста вместо поиска active SSA по
точным `organization + branch + service`. Исправление `dda02bafa` убрало эту single-doctor assumption; explicit
`branchServiceId` сохранил конкретного специалиста. Targeted `3` файла / `11` тестов и webapp typecheck прошли,
независимый high-risk audit дал PASS. Повторный live TEST slots check остаётся обязательным после следующего
отдельно разрешённого code-only deploy; U3S `#919` всё ещё ждёт реального создания новой организации, входа и
первого workspace.

## 2026-07-20 — P1/UI milestone CI and security-inventory closure

The accumulated milestone is green through lint, typecheck, HLS synchronization, integrator/webapp/media tests and
both builds. The final audit was resumed from its failed phase instead of rerunning the full pipeline. Three stale
test expectations and two stale structural guards were aligned with already-approved behavior: current Drizzle
organization predicates, specialist-assignment booking semantics, the protected current-patient organization helper,
and D3.4's four-accessor/two-public-resolver topology. No production behavior was weakened to satisfy a checker.

The one genuine audit failure was closed in Foundation: the U3S staff MFA/recovery vault now has an exact BOOTSTRAP
inventory entry while remaining excluded from both generic-role grant generators. Its canonical overlay revokes
effective table and column privileges from both runtime roles and permits only self-scoped functions. Independent
critical audit passed with no findings. No DB reset/restore/migration or TEST/PROD action was performed. The next
checkpoint is a code-only TEST deploy and live proof of public clinic booking plus organization signup/workspace.

## 2026-07-20 — DEV restore closure live-proven (`#920`, `#921`; supersedes the earlier same-day claim)

The earlier entry below recorded green rehydrate scripts before authenticated runtime evidence and was therefore
premature. The closure is now terminally proven on the existing `bcb_webapp_dev`: there was no new dump, reset,
restore, migration run, deploy, TEST or PROD access. Locked dev bypass resolves pre-created synthetic identities
read-only, validates preset phones and never repairs phone, role or workspace data during login. The one-time
fresh-DEV preparation sequence is recorded in `LOCAL_DEV_AND_AGENT_TESTING.md` and is explicitly not part of an
ordinary code deploy or restart.

Live testing exposed one post-migration-chain defect: the owner of staff-security `SECURITY DEFINER` functions
could not resolve a sibling helper in schema `app`. The canonical specialist-signup overlay now grants only this
derived owner effective schema `USAGE`, checks it fail-closed and leaves runtime/base-login memberships and
table/function grants unchanged. An independent critical audit passed. The current DEV database received only that
single owner-only grant through the existing local PostgreSQL admin path; the first lower-authority attempt failed
without mutation. Final evidence: `dev:admin`, `dev:clinic-admin`, `dev:doctor` and `dev:client` each issue a session
cookie and return `200` from `/api/me` with the expected role. Tasks `#920` and `#921` are sealed `done` at
`59b830c7c`.

## 2026-07-20 — DEV restore closure completed without reset (`#920`, `#921`)

Текущая подготовленная DEV-база исправлена без нового dump, restore, full reset или переноса application data.
Одноразовая ручная cluster-role подготовка отделена от обязательного per-restore шага в долговечной документации.
Guarded DEV rehydrate теперь атомарно восстанавливает P2-B owner/context и точные ACL, передаёт владельца только
существующим exact protected-overlay функциям с разрешённым исходным owner, безопасно раскрывает канонические E1
`\ir`-включения до stdin-передачи и затем доказывает runtime grants/helpers/E1 capability closure. Финальный live
`--preflight` и `--execute` завершились `PASS`; TEST и PROD не затрагивались, обычный code-only deploy эту цепочку
не вызывает.

## 2026-07-20 — UI-0 service visibility owner ruling

Владелец закрыл единственный неоднозначный booking gate. При выбранном специалисте пациент видит только услуги,
включённые у этого специалиста. При записи в клинику без выбранного специалиста видны только услуги, назначенные
хотя бы одному специалисту той же организации. В solo-режиме видны только услуги текущего специалиста. Привязка
услуги только к месту приёма не делает её доступной для записи. Это решение заменяет временный safe default
`location assignment OR specialist assignment`; UI-0 `#923` разблокирован и продолжен одним цельным correction-pass.

## 2026-07-20 — Doctor UI plan authority convergence (docs-only)

**Result and provenance.** Claude planning material `ef501ed41` plus later owner-resolution series through final
planning commit `f48f35a56` was reconciled into the current authority chain without wholesale merging the stale
planning-branch base. `OWNER_REVIEW_2026-07-18.md` §16a remains product authority;
`DOCTOR_UI_REWORK_2026-07-20/PLAN.md` is its execution artifact, not a second roadmap. Repo safeguards remain:
no TEST journal/DB/deploy authority and no new online schema by assumption. **Superseded later the same day:** the
temporary service-assignment `OR` safe default in this planning checkpoint was replaced by the owner ruling recorded
above.

**Owner decisions and DAG.** G1–G5 are closed: individual exercises `#564` are approved after C4D exact-org
isolation; voice/STT is post-production `#922`; feature toggles are organization/clinic-only; Communications uses
45/55 with 50/50 fallback; online already exists and UI-2 adds only a built-in toggleable «Онлайн» location that
gates existing service checkboxes. UI-8 must reuse accepted S4 engine `#888`, never fork registry/resolver/polarity.
SCH-G5 remains the separate open `#848`. Schedule owner delta requires location color on every template day and
time+city once in the weekday header.

**Execution order and current baseline.** UI-0 is the first owner-declared P0 stage for four booking-funnel symptoms
(SSR after service selection, service/location filtering, client from calendar, clickable FIO), without asserting a
shared root cause. After it, UI-1/UI-3/UI-4/UI-6 run on disjoint file scopes in parallel at ≤3; already integrated
and audited UI-4a/UI-6a baseline slices are not rerun, only current owner deltas/residuals are scheduled. UI-5 then
follows its U5A/record-policy dependencies; UI-2/UI-7/UI-8/UI-9 follow their own gates. Existing cards remain
authoritative: C1 `#850/#851/#852`, manual patient/walk-in `#801`, extended online flow `#215`, mechanics/reminders
C4D/C5 + `#191`, `#564/#565`, `#888`, `#922`, and cancelled Doctor DNA `#885`. **Superseded later the same day:**
UI-0 is mapped to `#923`, entered execution and was integrated through `24643d032`; its live DEV acceptance remains
the completion gate. No TEST/PROD deploy or production action followed from this earlier docs-only checkpoint.

## 2026-07-20 — U5A patient organization context launch (`#796`)

**Base and authority.** U5A launches from clean/pushed `feat/doctor-ui-rebuild` at `9601c71c6` after terminal U1 and
C4C. The owner-visible TEST checkpoint remains `4a889093d`; this stage has no TEST/PROD/deploy/reset/dump authority.
Authority is roadmap U5A, owner ruling UX08-05 and taskdb `#796` (expanded from the confirmed Today symptom to the
whole canonical resolver stage rather than creating a duplicate card).

**Scope and evidence plan.** The worker owns patient-organization enrollment/preference resolution, chooser/switcher,
patient shell/context, Today root fix, patient deep-link/booking context and focused tests. Required synthetic/live
states are zero, one and two active organizations; valid/invalid/revoked remembered context; foreign object/link;
concurrent switch; back/forward/refresh; no stale previous-organization data; desktop `1440×900`, mobile `390×844`
and PWA-shaped entry. Preference is only a non-authoritative hint and every selection/object is revalidated on the
server. No merged clinical overview, query/Host authority, staff-style membership or patient invite/activation.

U3S `#919` runs concurrently only in signup/provisioning/staff-security/account. U5A must not edit those paths.
Shared `buildAppDeps`, auth/session types, migration journal and roadmap/LOG are integration hotspots: changes may be
prepared only minimally in the isolated worktree and must be called out for lead-owned semantic integration; U5A
does not allocate a migration unless the preference contract proves persistence is required. Targeted state-graph,
DB-role negatives, typecheck/scoped lint/build and serialized live DEV evidence precede one independent high-risk
audit; no full CI runs before the next accumulated milestone. More than two correction rounds or a finding without
owner/roadmap authority stops as an owner question.

## 2026-07-20 — U3S `#919` final scoped security correction candidate

The full-stage re-audit found three remaining U3S deltas; this final correction keeps them in the approved stage.
Specialist provisioning retry now requires `factor_verified` and rejects pending-enrollment, recovery and
recovery-confirmation sessions before reading the intent. A password + TOTP login derives recovery acknowledgement
from the stored security profile: logout/relogin before acknowledgement remains `recovery_confirmation`, so all
management and clinical guards stay closed. Signup-intent creation and owner provisioning accept no target user id;
both resolve the signed identity-self principal, retain challenge binding/idempotent replay, and provisioning locks
the canonical identity and rejects an existing active staff membership before inserting a second organization.

Focused runtime/source validation is green; the lead-owned live apply gate remains explicit. The existing Phase 3
signup scratch smoke is synthetic and runs as its owning disposable role rather than the real locked `app_patient`
capability, so it was not misreported as real-role evidence and no persistent DEV/TEST database was touched. A later
authorized disposable locked-role apply must still prove that a foreign challenge/UUID cannot target another user
and that self-provisioning with an existing active membership returns the rejection without another organization.
OAuth/Telegram continuation remains the documented P2 residual and is not added to U3S. Correction checks: focused
U3S suite `20` files / `157` tests PASS; webapp typecheck and scoped lint PASS; hard-migration protocol, Drizzle
journal, frozen-migration and diff checks PASS; the D3.4 overlay checker parses and its self-test passes. Its direct
repo run still stops on the unchanged pre-existing `deploy/postgres/p0-5b-grants.sql` forbidden
`public.app_runtime_settings` finding, outside this U3S diff; it is not reported green.

## 2026-07-20 — U3S `#919` independent-audit correction candidate

The first security audit did not accept the worker candidate. Its three in-scope findings are corrected as one
whole-stage pass, still without a completion claim: staff-security and authenticated signup-resend DB functions no
longer accept a target user id and resolve only the signed identity-self principal; recovery and intermediate
recovery-confirmation sessions are replacement-only and cannot enter general account, organization, clinical or
unrelated doctor APIs; TOTP envelopes plus recovery/login hashes now use a dedicated versioned infrastructure
keyring with retained read keys instead of `SESSION_COOKIE_SECRET`. The canonical bootstrap overlay grants these
self functions only to the protected identity role, not to `app_staff`. OAuth/Telegram continuation remains the
already documented P2 follow-up and is not pulled into U3S. Correction validation: focused U3S/DI suite `18` files /
`145` tests PASS; webapp typecheck and scoped source lint PASS; Drizzle journal sync, frozen-migration guard, hard-
migration protocol check and `git diff --check` PASS. Independent re-audit and live evidence remain gates.

## 2026-07-20 — U3S `#919` worker candidate ready for independent audit

The isolated U3S branch now contains one coherent implementation candidate, not a completion claim. Specialist
signup resends rotate the existing pending intent; consumed challenge UUIDs cannot reissue a session; partial
provisioning resumes only from the verified user's restricted session. Provisioning remains organization + owner
membership exactly once, while the clinical specialist is created later by an owner-only, server-scoped,
idempotent binding action with an audit event. Before binding, the account has management/account destinations only.

New self-signup owners receive a mandatory TOTP first run with encrypted factor secret, acknowledged one-time
recovery codes, five-attempt cooldown, recovery-only replacement mode and server-side session generations. Password
reset and the account action revoke protected staff sessions; staff session refresh fails closed when security state
cannot be loaded. Factor replacement keeps the active secret and remaining recovery codes intact until the new
factor is verified. Legacy staff is not silently opted in by opening the security tab, and a patient-email collision
still fails closed rather than overwriting that persona. The first-run screen reports profile, timezone,
organization, security, binding and later booking/invite readiness without claiming unfinished steps complete.

Persistence is migration `0215` (reserved after parallel C4C `0214`) plus narrow SECURITY DEFINER accessors; the
canonical specialist bootstrap overlay reasserts exact owners/grants and has paired DOWN behavior. No DEV/TEST/PROD
DB, deploy, dump, external delivery or full CI was used in the worker pass. Worker validation so far: webapp
typecheck PASS, scoped source lint PASS, consolidated targeted validation `14` files / `107` tests PASS, Drizzle
journal sync and diff checks PASS. Independent high-risk audit, authorized migration postcondition and live DEV
evidence remain required. Roadmap completion boxes deliberately remain unticked until those gates pass.

## 2026-07-20 — C4C terminal closure (`#26`)

**Result.** The parked course capability slice was semantically rebased onto integrated U1/U2 base `9874ddd98`.
The shared management/account shell and trusted capability/workspace model remain authoritative; the Courses menu
now requires both `clinical.workspace` and the server-resolved organization entitlement. Migration `0214` retains
its canonical-owner provenance and remains the unique Drizzle journal tail.

The terminal commerce residual is closed in one coherent pass. Course products are hidden/inert when `courses` is
OFF or the linked course is outside the exact organization; doctor/admin authoring and pay-link creation reject the
same states before mutation. Authenticated purchase derives organization from the patient's active enrollment and
only accepts a product in that organization. Public purchase derives organization from the stored pay link, ignores
caller-supplied identity, and uses lookup-only phone resolution for course buyers, so denial cannot create a new
identity. Purchase creation and fulfillment both recheck current entitlement, exact course ownership and active
patient enrollment. Patient content/section projections and the doctor CMS course picker have executable ON/OFF and
no-enrollment evidence; entitlement isolation now proves organization A ON and B default-OFF.

**Validation.** Consolidated focused C4C run: `20` files / `192` tests PASS. `pnpm --dir apps/webapp run typecheck`,
scoped ESLint, `pnpm --dir apps/webapp run check:s4-entitlement-coverage`, checker self-test,
`bash apps/webapp/scripts/check-drizzle-journal-sync.sh` and `git diff --check` pass. The coverage checker now treats
the DI composition root as the explicit lazy resolver-injection boundary; a pre-existing management-shell direct
assertion was routed through the canonical action adapter, leaving the checker green. No full CI was repeated, and
no DB, DEV server, TEST/PROD, deploy, production payment or external send was touched.

**Independent audit.** The single full-stage audit `c4c_independent_audit` inspected audit HEAD `0e14c0a32` against
the owner/roadmap checklist and passed with no P0/P1/P2 findings. Its own safe rerun covered `6` files / `42` tests;
S4 coverage (`35` mappings), checker self-test, journal sync and diff check also passed. It made no changes and added
no requirements.

**Integrated live and milestone gate.** The audited chain landed on `feat/doctor-ui-rebuild` as `adb1198a4`,
`ddf4dc8f8` and `6988f05ac`; the bounded stale-fixture correction is `6bfb4050d`. Migration `0214` was applied only
to the explicitly verified local database `bcb_webapp_dev` through the canonical migration command; there was no
dump, reset, TEST or PROD access. A Drizzle-port postcondition resolved `courses=true` for canonical owner org A and
`courses=false` for independent DEV org B. Live authenticated rendering then proved org A has the Courses navigation
and receives `200` on `/app/doctor/courses`, while org B has no Courses navigation and receives `404` on the same
direct route.

The one milestone CI was resumed from failures rather than restarted. Lint and static invariants passed; the first
typecheck saw stale `.next` route metadata from the lead-owned DEV server, so that server was stopped, its cache was
moved aside, and typecheck passed. Integrator tests passed `1271/1271`; the first webapp run passed `1429` files /
`8179` tests and exposed only two stale entitlement mocks. The bounded test-only correction passed `2` files / `5`
tests; resumed webapp passed `1431` files / `8181` tests, media-worker `60/60`, root build, webapp production build and
the full repository audit all passed. The existing Next NFT tracing warning remains non-blocking. Course redesign,
template removal, store expansion and C4D remain outside this completed slice.

## 2026-07-20 — parallel launch checkpoint: C4C `#26` + U3S `#919`

**Base and environment.** Both high-risk stages launch from `feat/doctor-ui-rebuild` at `55c8e2999`; U0/U1/U2 are
integrated, U1/U2 evidence is sealed, and origin matches the feature branch. The last owner-visible TEST checkpoint
recorded by the roadmap remains `4a889093d`; neither stage is authorized to deploy, refresh/reset a database, use a
production dump, touch PROD, or send through a real external channel. The only preserved unrelated worktree file is
the owner's untracked `SESSION_HANDOFF_2026-07-17.md`.

**C4C / `#26`.** Authority is roadmap C4 and owner-review §§P1/P4/11–13/15. The parked checkpoint `93f881a96` is
useful but cannot be merged mechanically after U1/U2: the worker must semantically rebase it, preserve the trusted
workspace/capability and shared management/account shell, and finish the one owner-mapped commerce bypass class.
Acceptance is courses default-OFF, exact-organization OFF/ON/list/direct/count/picker/update behavior, inert course
products when unavailable, active-enrollment + exact-org + current-entitlement checks before purchase/fulfilment,
and org-safe product authoring. Synthetic proof uses owner org A with courses ON, org B OFF, a patient with and
without active enrollment, and foreign course/product IDs. No course redesign, store expansion, RLS, TEST/PROD or
real payment. The isolated C4C branch owns course/product/nav/entitlement paths and migration `0214`; U3S may touch
the shared DI composition only in its own worktree, with final semantic integration owned by the lead. Targeted
matrix, journal/checker, typecheck/lint and DEV two-org evidence precede one independent high-risk audit; one full CI
runs only at the final C4C integration gate. More than two correction rounds or any finding without roadmap authority
stops as an owner question.

**U3S / `#919`.** Authority is roadmap U3S and `ENTRY_AND_INVITE_JOURNEYS.md` J1. Scope is one coherent identity/
tenant stage: server-trusted signup retry/receipt, denial of UUID replay, exactly-one organization + owner membership,
authorized idempotent specialist binding, truthful clinical destination, recoverable first-run checklist, and real
staff factor/recovery/session-revocation mechanics under a reviewed security contract. Synthetic proof covers fresh,
duplicate, expired/resend, replay/concurrent-confirm, partial retry, owner before/after binding, patient-persona
collision and two-organization negatives on desktop `1440×900` and mobile `390×844`. DEV delivery stays mocked;
TEST handoff `#917` occurs only after a separately authorized code-only deploy and live proof. U3A staff invites,
U3B patient activation, U6A public landing, PR-02 legal consent and production FIO are excluded. U3S owns signup,
provisioning, staff-auth/session/security, first-run and their persistence/UI paths. It does not edit C4C course/
product/nav files; any unavoidable DI or migration-journal overlap stays isolated until lead integration. Targeted
state-graph/typecheck/lint/build and live DEV evidence precede one full independent identity/security audit and, if
needed, one integrated correction + full re-audit; no intermediate full CI.

## 2026-07-19 — owner addendum integrated: C4/C5, S4 `#888` and FIO `#855`

Documentation-only provenance checkpoint on base `feat/doctor-ui-rebuild` at `d34f17def`. The owner addendum was
placed in the existing 2026-07-18 review; the packet now preserves its questions as history while C4C5-01…07 are
resolved, and C4C5-08 remains deferred. No application code, taskdb, DB, TEST/PROD, deploy, CI, commit or push was
performed by the documentation worker. The lead separately recorded the owner decisions in the existing taskdb
cards through the canonical taskdb port; no task was accepted or marked complete by this checkpoint.

- Client SMS is organization-paid and provider-neutral: SMSC is an initial adapter; SMS.ru is only a possible later/
  additional adapter, not a launch commitment. The old platform-subsidized SMS/monthly-quota recommendation is
  superseded. Email can initially serve staff/specialist and patient registration; Telegram/MAX can confirm a
  patient. Exact one-time phone-verification channel remains explicitly deferred and non-blocking.
- Hardcoded `14+7` trial/grace is superseded: global admin configures tariff, duration, grace and post-trial behavior;
  one trial per organization, audited overrides/extensions. YooKassa is a candidate only until merchant/legal/
  receipt/retry/proration operations are specified and proven for real activation.
- Accepted packet outcomes: 80% warning, 100% block only new growth/consumption, no deletion/unpriced overage,
  downgrade blocks growth; accepted seat policy; aggregate analytics without patient drill-down or hours-worked.
  The then-recorded solo label «Практика» / «Настройки практики» was later invalidated by the owner correction above.
- `#888` is unblocked as an owner-policy gate but not completed: entitlement-off `patient_card`/`files` must block all
  mutations/writes while preserving read/export/recovery/safe offboarding and existing data. `#855` is likewise
  unblocked but not completed: separate new-patient structured registration collects required last/first name and
  optional patronymic, derives `display_name`; «Войти по коду» is existing-account login, without FIO on every OTP.

Validation for this documentation checkpoint: changed-document relative links and `git diff --check` are required;
no execution authority is implied.

## 2026-07-18 — owner-review normalization and execution-readiness cycle (`#838`)

- Consolidated the complete owner dictation into one requirements authority:
  `OWNER_REVIEW_2026-07-18.md`; implementation order lives only in `IMPLEMENTATION_ROADMAP.md`.
- Added correction stages C0-C7 and residual structured-identity stage C2F; mapped unique implementation cards and
  marked historical plans subordinate/superseded instead of creating a parallel roadmap.
- Added mandatory stage-launch manifest: branch/HEAD/TEST SHA, tasks/authority, prerequisite handoff, sanctioned
  contracts, synthetic scenario/viewports, PII/send-safe constraints, file scope/no-overlap, audit cycle and stop gate.
- Resolved Clients/Subscribers/Support semantics by matching the owner's request to the existing typed category
  contract; no new relation/classifier is introduced.
- Verified FIO core commits are already ancestors of `feat/doctor-ui-rebuild`. TEST owner-review evidence remains
  `#849`; residual execution is `#855`-`#858`. Four uncommitted old-worktree helpers were rejected as unsafe and not
  integrated; production remains a separate exact-preview owner gate.
- Reconciled tariff/trial/store plans: arbitrary admin-created tariffs, trial policy references a selected tariff,
  existing NULL-org mapping is owner-gated, C4D own/base has an autonomous checklist, C5D store is deferred, and C5C
  seat commerce has a dormant post-owner-gate checklist.
- Independent agent-port runs used in this cycle:
  - `bcb-838-owner-trace-20260718` — owner-decision trace;
  - `bcb-838-doc-conflicts-20260718` — stale/conflicting plan scan;
  - `bcb-838-plan-architecture-20260718` — stage architecture;
  - `bcb-fio-integration-audit-20260718b` — FIO worktree/script safety;
  - `bcb-838-fio-final-audit-20260718` — combined audit, initially BLOCKED on four stale contracts;
  - `bcb-plan-executor-sim-a-20260718` and `bcb-plan-executor-sim-b-20260718` — executor simulations; their actionable
    plan gaps were corrected before final re-audit.
- Open owner decisions remain explicit branch-local gates (quota behavior, trial/post-trial, PSP/legal operations,
  clinic-seat pricing/downgrade, future store commerce/licensing, analytics formulas, solo settings label). They do
  not authorize guesses and do not block independent registry/ownership/UI/foundation slices.

No application code, DB, TEST runtime or production data was changed by this planning cycle.

## 2026-07-15 — discovery setup

- Создан изолированный worktree `/home/dev/dev-projects/BersonCareBot-work3`.
- Создана ветка `feat/saas-interface-work3` от `feat/doctor-ui-rebuild` commit `32709c940`.
- Основной worktree и его незакоммиченные orchestration docs не изменялись.
- Создана taskdb-задача `#787`, `status=doing`, `auto_ok=false`.
- Прочитаны базовые repository docs, SaaS owner rulings/sequence, product overview, screen/layout inventory, identity и notification contracts, orchestration canon.
- Через code-search и точечное чтение подтверждены текущие patient/doctor navigation, clinic members/invites и clinic settings.
- Субагенты не запускались: сначала зафиксированы цель, scope и этапность по прямому запросу владельца.

### Подтверждённые стартовые факты

- Текущий `/` ориентирован прежде всего на пациента и PWA install.
- Staff roles и server-derived organization context существуют.
- UI приглашения staff создаёт invite URL; автоматическая email delivery в найденном flow не подтверждена.
- Patient invite/join/install SaaS flow не найден.
- Branding/custom-domain UI не найден; roadmap contract существует.
- Patient и doctor IA уже достаточно развиты, поэтому целевой план должен строиться через reuse/move/merge, а не новый параллельный интерфейс.

### Проверки

- `git status --short --branch` в обоих worktree;
- `git worktree list`;
- code-search до точечного чтения кода;
- taskdb только через `/home/dev/brain/tools/taskdb.mjs`.

## 2026-07-16 — correction: model routing

- Удалена устаревшая модель из roadmap и repository-specific subagent binding.
- Все новые назначения инициативы приведены к актуальной лестнице `Sol / Terra / Luna`.
- Базовое распределение: planning и критические tenant/identity reviews — Sol; research, UX synthesis, implementation и обычный review — Terra; формализованные повторяемые операции — Luna.
- Исторические audit/log записи других инициатив не переписывались.

## 2026-07-15 — UX-01 started

- Владелец разрешил следующий этап без дополнительных вопросов.
- Запущены два независимых bounded audit-потока: specialist/clinic/global-admin и patient/public/auth/booking/install.
- Один dev-сервер `127.0.0.1:5200` запущен из интеграционного worktree на том же code HEAD; отдельные серверы аудиторам запрещены.
- Зафиксирован baseline universe и independent acceptance gate в `UX01_ACCEPTANCE.md`.
- На этапе разрешены только inventory docs и screenshots; application code, DB и delivery state вне scope.

## 2026-07-15 — UX-01 role-matrix reconciliation

- DEV ранее обновлена из TEST, миграции применены; прежний missing `staff_user_has_password_credentials` blocker снят.
- Reconciled run: `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/`, commit `a537e74df6e5e38d589dd7dc0ec8549dcf848756`.
- Public: clean login desktop/mobile и landing mobile подтверждены.
- Registration: через стандартный DEV admin settings API контролируемо установлен `specialist_signup_enabled=true`; desktop/mobile показывают email, password, specialist name и organization title. Form submit не выполнялся.
- Regular doctor: отдельный shell/nav boundary подтверждён; clinic/global links отсутствуют. Communications capture удалён из-за real-looking restored names/messages.
- Clinic admin: clinic management links и отсутствие global sections подтверждены.
- Global admin: shell, analytics, system health, audit log и promo подтверждены; sensitive settings attempts удалены после privacy review.
- Patient: auth succeeds, но full shell BLOCKED maintenance replacement. `patient_app_maintenance_enabled=true`; TEST-only `system_settings_test_lock`, скопированный в DEV, не даёт изменить setting через стандартный `updateSetting`/API path. Сохранены только desktop/mobile guard frames. Taskdb `#795`.
- Три TEST walkthrough manifests подключены как готовое evidence; superseded Today/legacy appointments/KPI findings не считаются повторно.
- Current selected totals: 64 safe referenced PNG, 59 valid product/role states, 5 finding-only; 14 superseded TEST PNG excluded.
- `UX01_INDEPENDENT_AUDIT.md` оставлен историческим FAIL. Для закрытия UX-01 нужен новый independent audit.

### Fresh independent audit

- Вердикт: **FAIL / UX-01 completion BLOCKED**.
- Подтверждено: allocation `150/150`, все manifests/PNG существуют, counts `64 = 59 valid + 5 finding-only`,
  14 superseded TEST frames исключены, desktop role boundaries корректны, privacy omissions сохранены.
- Единственный обязательный completion blocker: полный patient slice отсутствует из-за maintenance + скопированного
  TEST lock (`#795`). После исправления повторить patient matrix и fresh audit.
- Аудит зафиксирован в `UX01_FRESH_AUDIT_2026-07-15.md`.

## 2026-07-15 — owner addendum: solo vs clinic specialist

- Владелец требует различать UI solo specialist и специалиста клиники.
- Для clinic-mode в discovery добавлены patient handoff/transfer и просмотр истории по всем визитам.
- Открытый продуктовый выбор: отдельные карточки пациента по специалистам или одна organization-scoped карточка
  с фильтрами `мои визиты / вся история / конкретный специалист`.
- Фильтрация не считается authorization: права доступа, attribution и audit trail должны быть определены отдельно
  на UX-03 до screen composition.

## 2026-07-15 — UX-02 external patterns

- Product track: SimplePractice, Jane, Healthie, Practice Better и Cliniko; solo/clinic onboarding, roles,
  invitations, patient record/history, handoff, multi-practice context, branding и platform lifecycle.
- Technical track: trusted invite lifecycle, SMS boundary, PWA/install/push, branding, custom domains/TLS/DNS,
  sender identity и security invariants.
- Owner addendum включён: единая clinic card остаётся preferred candidate для UX-03 comparison, не решением;
  transfer разделён на primary assignment, care team, work-item reassignment и cross-org transfer.
- Independent audit сначала потребовал 3 точечных исправления источников/формулировок; после исправлений — **PASS**.
- Audit record: `UX02_RESEARCH_AUDIT.md`.

## 2026-07-15 — UX-01 patient replay after DEV unblock

- По прямому разрешению владельца в current DEV database-name-guarded операцией удалены скопированные из TEST
  `system_settings_test_lock` trigger/function; стандартный admin API установил
  `patient_app_maintenance_enabled=false`. TEST и PROD не менялись.
- Для synthetic `dev:client` восстановлен active enrollment в organization `a000...0001`; это контролируемая
  мутация свободной DEV UX-песочницы. Application code и внешняя доставка не менялись.
- Replay: `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T17-51-35Z/patient/manifest.md`.
- 7 valid кадров подтверждают booking, treatment/program, profile, notification settings и mobile navigation.
- Desktop/mobile Today — finding-only: после enrollment restoration остаётся
  `organization_principal_required`, самостоятельный RSC/product defect.
- Current selected totals: `71 = 66 valid + 5 finding-only`. Исключены 14 superseded TEST frames и 2
  исторических maintenance frames. Route allocation остаётся `150/150`.
- Исторический `UX01_FRESH_AUDIT_2026-07-15.md` не переписывался; нужен новый independent acceptance audit.

### Fresh patient-replay independent audit

- Вердикт: **PASS — UX-01 factual current-state audit complete**.
- Независимо подтверждены allocation `150/150`, все canonical manifests/files, DEV SHA-256 и dimensions, арифметика
  `71 = 66 valid + 5 finding-only`, исключение 14 superseded TEST и 2 historical maintenance frames.
- Role/privacy boundaries и controlled DEV mutations подтверждены; TEST/PROD, application code и delivery state не
  менялись.
- Patient Today остаётся finding-only product defect `organization_principal_required`. Acceptance требует честно
  сохранять error как finding, а не исправлять продукт внутри factual audit, поэтому defect не блокирует PASS UX-01.
- Новый audit record: `UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md`; прежние FAIL records сохранены историческими.

## 2026-07-15 — UX-03 operating-model synthesis

- Рабочий draft и независимый architecture/security review синтезированы в `OPERATING_MODEL.md` и
  `ROLE_CAPABILITY_MATRIX.md`; исходные файлы не переписывались.
- Канонические identity/tenant/security invariants отделены от recommended candidates и owner decisions.
- Solo и clinic используют одну Organization/account model, но получают разную capability-driven композицию;
  owner/admin+specialist работает в одном login с предложенным явным management/clinical mode.
- Preferred patient-card candidate: одна organization-scoped карточка, authored immutable events, permission before
  filter; решение о модели карточки и clinic-wide history остаётся за владельцем.
- Primary assignment, care team, work-item reassignment и cross-org transfer разведены по state/audit semantics.
- Owner decision packet приоритизирован по блокерам UX-04/05/06. UX-03 не закрыт: требуется independent plan-critic.

### Independent plan-critic

- Initial audit нашёл пять исправимых gaps: неполный row-level ownership/enforcement/provenance contract,
  отсутствующий data/API gap list, неоднозначность owner rulings по clinic-wide wall и global-admin authority,
  несогласованные status/safe defaults и неполные handoff deactivation states.
- `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md` усилены без выбора открытых owner decisions.
- Подтверждены solo/clinic composition, staff one-org vs patient multi-org, permission-before-filter,
  list/direct/count/search/export parity, четыре независимых handoff primitive и entitlement denial semantics.
- Mermaid проверен концептуально; `git diff --check` — PASS.
- Вердикт: **PASS after fixes**. UX-03 закрыт как decision-ready discovery candidate; owner P0/P1 rulings остаются
  downstream gates. Audit record: `UX03_INDEPENDENT_AUDIT.md`.

## 2026-07-15 — UX-04 entry/invite journey draft

- Подготовлены `ENTRY_AND_INVITE_JOURNEYS.md` и `UX04_SCREEN_STATE_LIST.md` для семи обязательных journey: solo
  signup, clinic staff invite, patient email invite, SMS fallback, public booking, returning multi-org patient и
  terminal/wrong-recipient invite recovery.
- Для каждого flow зафиксированы trigger, actor, channel, token/trust, auth, trusted organization source,
  relationship records/state, UI, delivery outcome, recovery и privacy/security.
- Current implementation отделён от target: specialist signup и staff invite имеют reuse points; patient invite не
  найден; public booking ещё не гарантирует atomic enrollment; 2FA отсутствует; patient context switcher не завершён.
- Сохранены owner gates OM-2/OM-3, enrollment timing, 2FA policy, SMS-only activation, role collision, booking
  activation channel и TTL/resend. До решений указаны fail-closed defaults.
- Application/DB/delivery state не менялись. UX-04 остаётся pending до независимого identity/security audit.

## 2026-07-15 — UX-05 branding/domain contract draft

- Добавлены `BRANDING_DOMAIN_CONTRACT.md` и `BRANDING_CAPABILITY_MATRIX.md`; application code, schema, DB и тарифы
  не менялись.
- Для platform landing, org public/profile, booking, join/auth, patient/staff shells, PWA, email/SMS/push,
  legal/support и domain settings описаны уровни platform-only / organization identity / true white-label,
  fallback, ownership, entitlement/readiness и security boundary.
- Host/domain закреплён только как server-verified entry candidate, не authorization. Canonical platform fallback
  однонаправленный и loop-safe; raw invite token/open redirect не переносятся между origins.
- `branding`, `custom_domain`, custom sender и per-origin PWA разведены как независимые capability/readiness axes;
  текущие два entitlement mechanics недостаточны для честной отдельной упаковки sender/PWA.
- Custom sender failure оставлен pending gate BD-3: explicit platform fallback versus hold/reject. Safe default:
  transactional mail через disclosed platform sender, custom-only marketing held. На момент draft provenance label
  был неточным; integrated correction ниже явно фиксирует `owner ruling=none`.
- Статус draft на этом checkpoint был **pending independent product/architecture audit**; он не считался contract freeze.

## 2026-07-15 — UX-05 integrated correction after independent audit

- Один целостный correction pass обновил существующие `BRANDING_DOMAIN_CONTRACT.md` и
  `BRANDING_CAPABILITY_MATRIX.md`; новый конкурирующий contract не создавался, audit record не изменялся.
- Разделены `HostnameBase` (ownership/TLS/routing/base health/decommission/quarantine) и независимые
  `HostnameSurfaceBinding` для public profile, booking, join, auth, patient PWA и staff PWA. Failure одного binding
  не выключает готовые sibling surfaces; management UI показывает base health и отдельную таблицу bindings.
- Core organization context (trusted display name/minimum attribution/platform disclosure) отделён от paid brand
  presentation на public, booking, join/auth, patient/staff, email/SMS/push, legal/support и domain management.
  Отключение `branding` возвращает platform visuals, но не скрывает организацию в valid invite/booking/shell или
  transactional delivery.
- Добавлен server-owned `PlatformAlias` lifecycle: normalization/reserved names/uniqueness, immutable organization
  target, versioned rename redirect, hidden/suspended/closed behavior, quarantine и no silent reuse.
- Email sender `active` теперь требует согласованную identity: visible From, envelope/Return-Path, DKIM selector,
  SPF, DMARC alignment, provider verification, validated Reply-To, bounce/complaint routing и template eligibility;
  per-attempt audit фиксирует effective identity/fallback без body/raw token.
- BD-1…BD-6 переименованы в pending owner decision requests: `status=pending`, `owner ruling=none`, planner
  recommendation, safe default и downstream impact. Собственные рекомендации агента не атрибутированы владельцу.
- Повторно сохранены исходные инварианты: Host/alias/brand не авторизуют, fallback custom→platform однонаправленный,
  platform manifests стабильны, legal/support/recovery достижимы, patient multi-org не мутирует installed identity.
- Статус UX-05: **integrated correction complete; awaiting full independent re-audit**. UX-05 пока не closed.

## 2026-07-15 — UX-05 full independent re-audit

- Повторный аудитор перечитал всю фазу, corrected contracts, requirements/roadmap, operating/role model, UX-02
  evidence, owner rulings и исходный полный audit; проверка не ограничивалась changed lines.
- Все шесть re-audit gates закрыты: независимые hostname bindings, core context vs paid brand, stable platform alias,
  authenticated email identity, корректный provenance BD-1…BD-6 и отсутствие регрессий исходных инвариантов.
- Повторно подтверждены complete surface coverage, Host/alias non-authorization, one-way loop-safe fallback, stable
  platform manifests, W PWA origin gates, patient multi-org behavior, sender anti-spoofing, entitlement separation и
  постоянная достижимость legal/support/recovery.
- Вердикт: **PASS**. UX-05 закрыт как decision-ready discovery contract. BD-1…BD-6 остаются pending owner requests с
  `owner ruling=none`; implementation gaps остаются входами UX-06/UX-09, а не скрыто готовым backend.
- Audit record обновлён на месте: `UX05_INDEPENDENT_AUDIT.md`; новый audit-файл не создавался. Application code, DB и
  тарифы не менялись.

## 2026-07-15 — UX-04 integrated correction after independent audit

- Один цельный correction pass обновил существующие `ENTRY_AND_INVITE_JOURNEYS.md` и
  `UX04_SCREEN_STATE_LIST.md`; parallel state/journey documents не создавались, audit record не редактировался.
- Patient target приведён к owner ruling passwordless OTP; staff — email + password. Зафиксированы additive
  patient/staff persona или fail-closed linking, а также полные 2FA setup/recovery/replacement/session-revocation
  mechanics при открытой политике factor/roles/grace/step-up.
- Invite relationship, immutable delivery attempts и auth/recipient proof разведены; завершены raw-token exchange,
  URL scrub, narrow continuation, accepted-user replay match и exactly-once concurrency/idempotency contracts.
- Current-state gaps сверены с реализацией: deferred specialist bindings, `challengeId` session reissue, отсутствие
  other-active-org enforcement, full-email pre-auth leak, public booking internal `userId`, неполные lifecycle и
  delivery states.
- Добавлены browser→installed PWA first launch, session/passwordless re-auth, exact authorized org restoration,
  push subscription rotation/revocation и deep-link recovery. UX-04 ожидает один полный независимый re-audit; этап
  не помечен completed.

### Full independent re-audit

- Повторно проверены orchestration canon, полный UX-04, REQUIREMENTS/ROADMAP, operating/role model, owner rulings,
  UX-02 evidence, current code и исходный audit; проверка не ограничивалась changed lines.
- Все F1-F5 закрыты: auth/persona/2FA, current-vs-target honesty, независимые lifecycle axes/token exchange,
  installed-PWA first launch/push recovery и полная parity screen/state list.
- Все семь journeys заново трассированы по trigger/channel/trust, identity/auth, organization context,
  relationship transaction, delivery, privacy и recovery. OM-2/OM-3 и остальные product choices остаются pending,
  architecture/security invariants не переатрибутированы владельцу.
- Вердикт: **PASS**. UX-04 закрыт как decision-ready journey contract; это не закрывает перечисленные implementation
  defects. Audit record `UX04_INDEPENDENT_AUDIT.md` обновлён на месте, новый audit-файл не создан.
- `git diff --check` — PASS; app tests/DB smoke не запускались, application/schema/runtime state не менялись.

## 2026-07-15 — UX-06 full IA and screen-composition synthesis

- Созданы только три заранее объявленных phase output: `TARGET_IA.md`, `SCREEN_COMPOSITION.md` и
  `ROUTE_MIGRATION_MAP.md`; ad hoc contract/audit-файлы не создавались.
- Целевая IA разделяет platform public, published organization, global platform admin, organization management,
  clinical work, assistant operations, staff account и patient app. Owner/admin + specialist использует один login
  и organization context; safe candidate — явный management↔clinical switch. Staff остаётся one-org, patient —
  multi-org с server-verified enrollment context.
- Solo/clinic используют общие компоненты и route contracts, но capability-driven composition скрывает team/
  handoff chrome у solo и показывает clinic filters/actions только после authorization. Карточка пациента оставлена
  как decision-safe shell: recommended one-org-card candidate, permission-before-filter, own/assigned safe default;
  OM-4/5 не превращены в owner ruling.
- Четыре handoff semantics сохранены раздельно. UI размещает primary/care-team/work-item actions у конкретных
  объектов и recovery queue; generic patient transfer и cross-org re-parent не спроектированы как launch action.
- UX-04 journeys перенесены в acquisition/signup/staff invite/patient join/public booking/install compositions;
  UX-05 P/O/W, hostname base/bindings, sender, canonical fallback и degraded states встроены в public/management/
  patient screens. BD-1…BD-6 остаются pending owner requests.
- Desktop/mobile navigation определена для platform, management, clinical, assistant и patient shells; общие
  loading/empty/permission/entitlement/context/degraded/suspended/error states закреплены отдельно от доступа.
- `ROUTE_MIGRATION_MAP.md` распределяет все текущие page files ровно один раз: `20 + 81 + 49 = 150/150` по
  `keep / merge / move / split / retire / needs-decision`, с reuse и зависимостями.
- Выполнены локальные механические проверки allocation/cross-artifact/link/table/diff; результат должен быть
  повторён независимым full-coverage аудитором. Application code, DB и runtime не менялись. UX-06 пока не closed.

## 2026-07-15 — UX-06 integrated correction after full-coverage audit

- Первый полный аудит подтвердил actor/security/role/solo-clinic/patient/handoff/branding boundaries и exact
  allocation `150/150`, но выдал **FAIL** по четырём связанным причинам: не было единого screen-ID registry;
  `/app?view=registration` и другие multi-state surfaces не имели полной migration trace; отсутствовал явный
  responsive contract для platform/organization public; UX-07 handoff потерял SMS и public-booking journeys.
- Один correction owner перечитал UX-01…05, все три UX-06 output и полный audit, затем исправил существующие
  `TARGET_IA.md`, `SCREEN_COMPOSITION.md` и `ROUTE_MIGRATION_MAP.md` in place. Новых contract-документов и нового
  audit record не создавалось; исходный audit history не редактировался.
- `TARGET_IA.md` теперь является master registry canonical UX-06 IDs, включая ACC-01…04. `OPS-05`,
  `ORG-PUB-04`, `MGMT-SETUP/TEAM/INVITE`, `CLIN-PAT-INVITE`, `ACC-FIRST`, `PAT-INSTALL` и все UX-04 ID families
  явно классифицированы как shared destination, state/flow alias или journey/state reference, а не вторые экраны.
- PUB-06 имеет deferred-by-BD-6 composition без safe-launch navigation; unavailable organization projection
  оформлена как state ORG-PUB-01/02/03. Все launch/conditional IDs имеют composition или точный gated reason.
- Exact file allocation сохранена `20 + 81 + 49 = 150/150`. Отдельная multi-state trace связывает
  `/app?view=registration` с PUB-03/ACQ-01…05 и проверяет auth/role entry, patient-card tabs, schedule/
  communications/analytics query tabs, mixed settings/content/booking pages, redirects и deep-link resolvers без
  превращения aliases в navigation screens.
- Добавлен desktop/mobile navigation contract для specialist-first platform public и published organization public:
  приоритет signup/demo, вторичный patient entry, profile→booking/join hierarchy, mobile CTA, legal/support и
  one-way canonical fallback сохраняют одинаковые trust/recovery правила на обоих breakpoints.
- UX-07 handoff восстановлен из UX-04: ACQ-01…05, STF-01…08, PIN-01…09, SMS-01…03, PBK-01…08 и MOR-01…05
  сопоставлены с canonical UX-06 screens и обязательными recovery branches. SMS остаётся transport-only без auth
  elevation; booking доходит до exact appointment/enrollment/portal state before install.
- Все ранее проходившие safe defaults сохранены: authorization before filter, staff one-org/patient multi-org,
  bounded assistant, one-card candidate without owner freeze, four handoff primitives, stable platform fallback,
  sender/domain/PWA readiness и OM/BD gates without attributed owner rulings.
- Статус UX-06: **integrated correction complete; awaiting one full independent re-audit**. Application code, DB и
  runtime не менялись; commit/push не выполнялись этим correction pass.

## 2026-07-15 — UX-06 full independent re-audit

- Повторный аудитор перечитал весь orchestration/product canon, UX-01…05, три UX-06 output и исходный FAIL audit;
  проверка не ограничивалась diff или четырьмя прежними findings.
- Exact current allocation подтверждена независимо: `150 actual = 150 refs = 150 unique`, duplicate/missing/stale
  `0`; multi-state trace отдельно покрывает registration, query tabs, mixed pages, redirects и deep links.
- Master registry и compositions совпадают точно `57/57`; extra/missing/duplicate/unknown target IDs `0`. Flow,
  journey и obsolete aliases классифицированы и не образуют parallel IA.
- Responsive navigation подтверждена для platform/organization public, platform admin, staff management/clinical,
  assistant и patient desktop/mobile. UX-04→UX-06→UX-07 trace включает ACQ/STF/PIN/SMS/PBK/MOR и recovery branches.
- Ранее проходившие one-org staff/multi-org patient, permission-before-filter, one-card candidate, four handoff
  primitives, bounded assistant, branding/domain/sender/PWA fallback и owner-ruling provenance не регрессировали.
- Финальный вердикт: **PASS**. UX-06 закрыт как decision-safe target IA/screen-composition contract; OM/BD choices
  остаются pending gates, а current implementation gaps — входами UX-09, не скрыто готовыми возможностями.
- `git diff --check` и structural scripts — PASS. App tests/DB smoke не запускались; application/schema/runtime не
  менялись. Audit record `UX06_INDEPENDENT_AUDIT.md` обновлён in place, новый audit-файл не создавался.

## 2026-07-15 — UX-07 complete executor prototype pass

- `ROADMAP.md` сначала уточнён на месте: UX-07 получил полный canonical flow scope, три заранее предусмотренных
  phase output, executor checklist и обязательный full visual/usability audit gate.
- Созданы ровно contract outputs фазы: `UX07_PROTOTYPE_INDEX.md`, `UX07_USABILITY_FINDINGS.md` и self-contained
  `ux07-prototype/index.html`; findings явно являются наблюдениями исполнителя, не audit verdict.
- Навигируемый low-fidelity prototype содержит девять цельных сценариев: ACQ, STF, PIN, SMS, PBK, MOR, dual
  management/clinical, branding/domain и decision-safe clinic patient card/history/handoff. UX-04 IDs используются
  как state references, UX-06 canonical IDs — как destinations; parallel route registry не создан.
- В prototype сохранены staff one-org / patient multi-org, first value before install, SMS transport without auth
  elevation, permission-before-filter, exact booking appointment/enrollment, explicit deep-link context change,
  HostnameBase vs independent bindings, sender/PWA separation и OM/BD candidate provenance.
- Один visual direction использует текущий BersonCare white/gray/blue workbench language; staff desktop, public и
  patient mobile отличаются композицией, но используют общие tokens. CRUD surfaces не перерисовывались.
- 12 representative desktop/mobile renders собраны в
  `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T19-36-23Z/`; manifest содержит viewport, hash/state и SHA-256.
  Временный static server использовал `127.0.0.1:8767`; `:5200`, application, DB и delivery не затрагивались.
- Validation: inline JS syntax PASS; 72 prototype screen references resolve only to UX-06 canonical IDs; every
  `ACQ-01…05`, `STF-01…08`, `PIN-01…09`, `SMS-01…03`, `PBK-01…08` and `MOR-01…05` ID is present; nine flows
  present; Markdown local links PASS; 12 manifest hashes match and renders have expected 1440×1000 / 430×932
  dimensions; CDP interaction smoke verified next, flow-map step, viewport/hash and mobile map behavior with zero
  page console exceptions/errors; visual spot-check PASS after mobile map correction; final `git diff --check` PASS.
- Статус UX-07: **executor prototype complete; pending full independent visual/usability audit**. Никакой executor
  finding или safe candidate не записан как owner ruling.

## 2026-07-15 — UX-07 integrated correction after two independent FAIL reviews

- Оба независимых pre-correction reviewer section в `UX07_INDEPENDENT_AUDIT.md` прочитаны как единый phase audit.
  Они независимо подтвердили связанные root causes F1…F5: linear deck transitions, несинхронный URL/history,
  смешение product/diagnostic copy, context/capability-insensitive shell, fake controls и stale evidence. Ни один
  visual seal не был выдан; audit record не редактировался correction owner.
- Один цельный correction pass обновил существующие `ux07-prototype/index.html`, `UX07_PROTOTYPE_INDEX.md`,
  `UX07_USABILITY_FINDINGS.md`, `ROADMAP.md` и `LOG.md` in place. Новых contract/ad hoc docs не создано.
- Все девять сценариев и 73 состояния сохранены, но продуктовые действия теперь образуют explicit labelled graph:
  happy, recovery, terminal и object actions имеют точные destinations; reviewer previous/next/map отделены и явно
  подписаны. `pushState` + `popstate/hashchange` синхронизируют direct hash, back/forward и видимое состояние.
- Primary copy переведён на понятный task/outcome/recovery язык. IDs, canonical screen, lifecycle status,
  authorization order и pending OM/BD gates перенесены в закрытый по умолчанию reviewer disclosure. Собственные
  safe defaults/candidates не переатрибутированы владельцу.
- Shell теперь выводится из state context: neutral patient chooser не предвыбирает организацию и не показывает
  organization navigation; authorized patient показывает активный org; staff mobile сохраняет `Клиника Север` и
  semantic drawer; dual mode виден только при specialist binding; active nav соответствует MGMT/CLIN/PAT screen.
  `Все доступные`, specialist history и generic/cross-org handoff отсутствуют без capability/ruling.
- Поля стали labelled `input/select`; product actions, public links, staff/patient navigation и mobile menu —
  semantic button/link/nav controls с keyboard focus и `aria-current`. Decorative chevrons/fake actionable div/span
  удалены.
- Новый batch `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T20-16-39Z/` содержит 16 desktop/mobile вариантов,
  включая corrected recovery, neutral chooser, public/mobile recovery, mobile staff org/drawer, owner without
  clinical switch, domain fallback и capability-withheld clinic states. Manifest фиксирует source SHA-256
  `c4903ff11452053367d7be4174ff188620a512371eebf726211b440a20de0c3d`, git base, dimensions, hashes и state traces.
  Batch `2026-07-15T19-36-23Z` сохранён, но явно помечен historical/superseded.
- Полный automated gate текущего source: `73 × 2 = 146` renders, `284` labelled action transitions, `134`
  back/forward pairs, `146` external hash re-renders, `146` keyboard-entry checks и `28` mobile staff menu checks;
  assertion/overflow/console/runtime/network failures — `0`. Representative screenshots открыты в original
  resolution. Temporary server `127.0.0.1:8791`; `:5200`, application, API, DB и delivery не использовались.
- Статус UX-07: **integrated correction complete; awaiting full two-reviewer re-audit**. Correction evidence не
  является visual seal или phase acceptance.

## 2026-07-15 — UX-07 full interaction/context-graph convergence after re-audit §§8–10

- Re-audit §§8–10 перечитан полностью. Оба reviewer сохранили PASS для product/diagnostic separation, trusted shell,
  core semantic controls и source-bound evidence, но отказали в seal из-за общего interaction/context-graph класса:
  18 inert same-state actions, неверные public Support/Documents и anonymous invite recovery destinations,
  `handoffAllowed:false` рядом с видимой collaboration CTA и drawer без focus/Escape/return-focus contract.
- Один correction owner проверил весь visible graph: 9 scenarios / 73 states / 142 actions, а не только 18 residual
  buttons. Prototype, index, findings, roadmap и log обновлены in place; audit record не редактировался, новых
  contract/ad hoc docs не создано.
- Resend/retry/status actions теперь показывают idempotent result. Support/recovery/calendar/preparation/nearest
  visit/settings/visit-assignment/install/push actions имеют truthful represented result или destination. Inert
  same-state target actions: `0`.
- Public Support/Documents, expired invite, seat block, wrong-recipient и SMS fresh-invite recovery остаются в
  public-safe composition и не открывают MGMT/CLIN/PAT chrome. Anonymous→authenticated edges ограничены
  provision/login/confirmation continuations; SMS «только email» возвращает к delivery state, а не к recipient view.
- Каждая product action несёт actor/trusted-context/capability/outcome metadata. Patient card с collaboration CTA
  согласован как `handoffAllowed:true`; capability-withheld handoff state по-прежнему не показывает transfer action.
- Shared mobile drawer сохраняет один toggle, переводит focus на navigation или drawer, закрывается Escape,
  возвращает focus на toggle и не теряет organization/navigation text.
- Полный semantic gate разбит на три параллельных bounded группы без урезания coverage: `146` renders, `284` action
  clicks (`66` results + `218` navigations), `284` actor/context/capability contracts, `284` back/forward pairs,
  `146` external hash, `146` keyboard activation, `42` drawer и `124` public Support/Documents checks. Overflow,
  assertion, console, runtime и network failures: `0`; `git diff --check`: PASS.
- Новый current evidence batch:
  `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T21-03-18Z/` — 18 inspected desktop/mobile PNGs + manifest,
  source SHA-256 `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`. Batches
  `2026-07-15T19-36-23Z` и `2026-07-15T20-16-39Z` superseded. Temporary server `127.0.0.1:8796`; `:5200`, app,
  API, DB и delivery не использовались.
- Статус UX-07: **interaction/context-graph convergence complete; awaiting full two-reviewer re-audit**. Ни seal,
  ни phase acceptance correction owner не выдаёт.

## 2026-07-16 — UX-07 final two-reviewer acceptance

- Два независимых reviewer выполнили полный final re-audit exact source
  `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657` и batch
  `.claude/screenshots/SAAS-UX07-PROTOTYPE/2026-07-15T21-03-18Z/`; spot acceptance не использовался.
- Reviewer #2 сначала сформировал собственный PASS, только затем прочитал §11 reviewer #1. False acceptance и false
  rejection не обнаружены; оба reviewer независимо выдали visual/usability seals #1 и #2.
- Повторно пройдены 9 scenarios / 73 states × desktop/mobile = `146` renders, `284` declared-action instances и
  `124` generated public Support/Documents instances. Reviewer #2 проверил combined `408` visible actions,
  actor/context/capability/outcome contracts и history pairs; `146` external hashes, `146` keyboard activations и
  все `42` authenticated mobile drawers.
- Public recovery не открыл authenticated chrome; six represented anonymous→authenticated continuations остались
  единственными; handoff action/capability и visit-scoped result согласованы; same-state targets, semantic/focus,
  console/network/overflow и diagnostic leaks: `0` failures.
- Все 18 PNG SHA-256 и source SHA совпали с manifest. `UX07_INDEPENDENT_AUDIT.md` §§11–13 содержит оба независимых
  review и consolidated verdict.
- Статус UX-07: **completed; PASS; seals #1 and #2 granted**. Остаточные ограничения относятся к production
  implementation/accessibility gates; pending OM/BD owner rulings не изменялись.

## 2026-07-16 — UX-08 owner decision packet candidate

- Перечитаны owner rulings, `REQUIREMENTS`, UX-03 operating/capability model, UX-04/05 pending gates, UX-06 IA/
  composition/route map и финальный UX-07 prototype/audit.
- Создан только предусмотренный планом `OWNER_DECISION_PACKET.md`; новый параллельный contract или ad hoc ruling
  file не создавался.
- OM/BD вопросы консолидированы в десять продуктовых развилок. Удалены вопросы про DB/schema/RLS/token/TTL/2FA
  mechanics, current defects, обязательные security invariants, индустриально стандартные implementation choices и
  уже зафиксированные решения владельца.
- Каждый пункт имеет stable ID, `status=pending`, `owner ruling/source=none`, понятные альтернативы, явно
  planner-owned recommendation, safe default, последствия, downstream blocks и границу условного UX-09.
- Статус UX-08: **candidate complete; awaiting full independent critic**. Candidate не является owner ruling и ещё
  не готов к переносу в dated rulings file.

## 2026-07-16 — UX-08 full independent plan-critic

- **Метод:** перечитаны `ORCHESTRATION_BINDINGS.md`, canonical owner rulings/review/schema decisions, literal
  `REQUIREMENTS.md`, все UX-03…07 contracts и independent audits, текущие `ROADMAP.md`, `LOG.md` и полный
  `OWNER_DECISION_PACKET.md`. Проверка велась по всему packet, не по последнему diff.
- **До correction — FAIL:** у нескольких вопросов поле `Источник: none` скрывало реальное основание в owner
  addendum/ruling; recommendation и safe default местами совпадали как одна policy; OM/BD consolidation не была
  трассируема; packet не объяснял, почему OM-8 и owner/admin permission details не эскалируются; future public scope
  можно было спутать с текущим TEST-only execution.
- Выполнена одна integrated correction всего существующего `OWNER_DECISION_PACKET.md`: отдельно введены `owner
ruling` и `основание`, добавлены exact OM/BD mappings, отличные временные безопасные границы, affected
  screens/epics и conditional UX-09 paths. Зафиксировано, что brand depth и origin/PWA scope — разные решения, а
  card/history/`Мои` намеренно согласуются одним решением.
- Подтверждена минимальность: остаются десять реальных продуктовых choices. Уже ruled identity/auth/tenant/filter/
  tariff facts, current defects, RLS/schema/token/TTL/2FA/DNS/TLS/idempotency и стандартные least-privilege/
  per-mechanic lifecycle задачи владельцу не переадресуются. Custom-sender item сохранён только как коммерческая
  fallback/hold policy, а не вопрос о DNS/security implementation.
- **Проверки:** `10/10` stable IDs; по три взаимоисключающих product alternatives; все обязательные поля присутствуют;
  OM-1…7 и BD-1…6 покрыты без второго вопроса на тот же выбор; OM-8 имеет явный non-escalation path; target screen
  IDs/epics и UX-09 branch указаны для каждого item; stale `source=none` provenance patterns отсутствуют;
  `git diff --check` PASS.
- **Финальный вердикт:** **PASS. UX-08 complete; packet ready for owner review.** Все items остаются `pending`; PASS
  подтверждает качество и sufficiency пакета, но не является owner ruling и не разрешает deploy/implementation.

## 2026-07-16 — UX-09 implementation roadmap candidate

- Перечитаны обязательный `ORCHESTRATION_BINDINGS.md`, UX-03…08 contracts/audits, final owner decision packet,
  `SAAS_FOUNDATION/SEQUENCE.md`, enforcement/readiness roadmaps, current route allocation and documented data/API
  gaps. Текущий SaaS TEST-first order сохранён отдельным authoritative workstream.
- Создан только предусмотренный планом `IMPLEMENTATION_ROADMAP.md`; параллельные contract/ruling документы не
  создавались. Application, DB, runtime, deploy, commit и push не выполнялись.
- Roadmap разбит на meaningful stages U0…U10: contracts/ownership; capability spine; management/operations/account
  shells; staff and patient invite/activation; patient context/card/history/handoff; platform and organization
  public surfaces; branding; independently gated domain/PWA/sender capabilities; platform admin; route/visual final
  convergence.
- Для каждого stage зафиксированы outcome, canonical screens/flows, reuse/gaps, scope/forbidden scope,
  tenant/identity boundaries, owner-decision gate и safe default, dependencies, data/API/UI workstreams,
  migration/backfill/compat boundary без придуманной schema, risk-proportional validation, rollback/degradation,
  completion checklist и merge dependency.
- `UX08-01…10` остаются `pending` с `owner ruling=none`. Safe prerequisites разрешены, но shared history, handoff,
  assistant grants, dual-mode composition, multi-org default, public bundle, W branding, custom origins/W-PWA,
  sender fallback и patient-level support не выданы за выбранную policy.
- Execution protocol взят из repo binding: один цельный worker stage → full independent audit → одна integrated
  correction связанного класса → full re-audit; после каждого второго stage — process audit. Микрослайсы, короткие
  timeout/retry и повторный full CI после мелких правок прямо запрещены.
- **Candidate validation:** master registry `57 rows / 57 unique`; `SCREEN_COMPOSITION` parity `57/57`, missing/extra
  `0`; current filesystem и route map `150/150`, duplicate/missing/stale `0`; UX-09 unknown canonical screen refs `0`;
  `UX08-01…10` coverage `10/10`; `ACQ/STF/PIN/SMS/PBK/MOR/ERR` coverage complete; leaf stages
  `U0, U1, U2, U3A, U3B, U4, U5A…C, U6A…B, U7, U8A…C, U9, U10` имеют все обязательные поля/checklists;
  dependency refs неизвестных stage IDs `0`; `git diff --check` PASS. App/DB/runtime tests не запускались, потому
  что изменён только planning documentation.
- Статус UX-09: **candidate complete; awaiting full independent audit**. Аудит должен проверить ID/dependency/
  decision/screen/flow/checklist consistency и отсутствие вмешательства в foundation sequence.

## 2026-07-16 — UX-08/09 integrated convergence after full audit FAIL

- Полный `UX09_INDEPENDENT_AUDIT.md` принят как один consolidated correction brief. Предыдущие UX-08 PASS и UX-09
  candidate-validation записи выше сохранены как исторические pre-audit checkpoints; они не являются текущим
  acceptance после findings F1–F4.
- `OWNER_DECISION_PACKET.md` обновлён на месте без нового decision/ruling файла. Два literal upstream выбора,
  потерянные при прежней консолидации, получили pending gates `UX08-11` (enrollment creation timing при staff patient
  invite) и `UX08-12` (organization/specialist/thread communication topology). Все 12 остаются `owner ruling=none`.
- В packet добавлен единый provenance reconciliation для каждого explicit open item `REQUIREMENTS.md` и UX-03…05:
  existing ruling + source, architecture/security invariant + source, planner recommendation + safe default или
  pending owner gate. Signup composition, SMS-only activation и booking-channel choice не переатрибутированы
  владельцу; security mechanics не превращены в optional product choices.
- `IMPLEMENTATION_ROADMAP.md` получил отдельный meaningful stage `U3S`, который полностью владеет J1/
  `ACQ-01…05`: secure signup retry/session, exactly-once organization+owner membership, authorized
  membership→specialist binding, truthful clinical actor and complete first-run password/2FA/recovery lifecycle.
- Patient resolver `U5A` теперь ранний независимый stage с zero/one/many/chooser/switch/object authorization и без
  invite dependency. Направление стало только `U5A -> U3B -> U4`; обратная final-merge зависимость удалена.
  `U4` интегрирует уже прошедшие U3S/U3A/U3B/U5A outputs.
- Добавлен meaningful `U5D` для decision-safe communication attribution/parity and conditional target topology.
  Core `U9` PLAT shell/configuration/reliability/org operations теперь идёт до optional `U8A/B/C`; каждый U8
  подключается к единому U9 adapter path, а невыбранная ветка физически отсутствует и ничего core не блокирует.
- Нормативный direct-dependency registry содержит 19 leaf stages и один ацикличный graph. Text dependencies, merge
  dependencies, phase order и diagram приведены к одному направлению. Full CI назначен после последнего реально
  включённого stage каждой фазы, без повторов после микроправок; docs-only U0 и absent optional U8 не создают
  искусственный CI gate.
- `ROADMAP.md` синхронизирован на месте. Сохранены `57/57`, `150/150`, J1…J7/flow contracts, tenant/security/
  foundation/no-dup, migration/compat/rollback, proportional validation и TEST/deploy boundaries. Application, DB,
  runtime, TEST, deploy, commit и push не выполнялись.
- Статус UX-08/09: **integrated correction complete; awaiting one full independent re-audit**. Correction owner не
  выдаёт себе PASS и не редактирует audit record.
- **Correction validation:** 19/19 stage registry rows; all 19 stages contain all 14 required fields; normative DAG
  has no cycle/unknown dependency and document section order is topological; `UX08-01…12` = 12/12 complete packet
  sections with three alternatives and required provenance/safe-boundary fields; 22 upstream choice classes
  reconciled; J1…J7 and ACQ/STF/PIN/SMS/PBK/MOR/ERR present; canonical target/composition `57/57`; current route
  allocation `150 actual = 150 references = 150 unique`, missing/stale/duplicate `0`; stale cycle/U8-core inversion
  patterns `0`; `git diff --check` PASS. App tests, lint, typecheck, build and DB smoke were not run because this pass
  changes planning documentation only.

## 2026-07-16 — Coordination stop acknowledged before UX-09 continuation

- Текущие UX-08/09 изменения сохранены отдельным checkpoint-коммитом `54a7abcc0` и запушены в
  `origin/feat/saas-interface-work3` до интеграции.
- `origin/feat/doctor-ui-rebuild` влит в рабочую ветку merge-коммитом `302571f5f`; обязательный интеграционный
  коммит `d8c197a5d` проверен как его ancestor.
- Для `AGENTS.md`, `CLAUDE.md`, `docs/AGENT_AUTORUN_SCHEME.md` и `docs/ORCHESTRATION_BINDINGS.md` сохранены более
  полные версии интеграционной ветки. Все четыре файла перечитаны после merge.
- Явное подтверждение оркестратора: эти четыре файла являются действующим каноном дальнейшей работы в этой ветке;
  UX-09 и финальный gate инициативы продолжаются только по их правилам полного stage scope, независимого полного
  аудита, интегрированной коррекции, достаточного времени агентам и честного разделения owner rulings от
  рекомендаций агентов.
- На coordination checkpoint application, DB, runtime, TEST и PROD не изменялись.

## 2026-07-16 — UX-09 full independent re-audit PASS after provenance source-fix

- **Run ID:** `UX09-REAUDIT-20260716-U3B-FULL-01`.
- Выполнен новый полный независимый re-audit всего UX-09, а не spot-check исправленной строки: повторно прочитаны
  orchestration canon, requirements/roadmap, UX-03…08 contracts/audits, весь owner packet, implementation roadmap и
  предыдущий UX-09 audit record.
- F1–F4 повторно подтверждены закрытыми. Остаточный F5 закрыт механическим source-fix: booking activation
  provenance теперь указывает на существующий stage owner `U3B`; unknown leaf-stage references `0`.
- Механически повторены: target/composition `57/57`, missing/extra/duplicate `0`; current routes
  `150 actual = 150 references = 150 unique`, missing/stale/duplicate `0`; `19 × 14` complete stage contracts;
  normative DAG `19/19`, cycles/unknown dependencies `0`; `UX08-01…12 = 12/12`, по три alternatives и все
  обязательные поля; `24` upstream provenance choices; J1…J7 и ACQ/STF/PIN/SMS/PBK/MOR/ERR coverage.
- Полностью повторены role/capability, solo/clinic, patient card/history/handoff, multi-org, tenant/security,
  foundation/no-dup, branding/domain/PWA/sender, migration/backfill/compat, rollback/degradation, proportional
  validation, phase full-CI и final acceptance checks — новых findings нет.
- **Финальный UX-09 verdict: PASS.** `IMPLEMENTATION_ROADMAP.md` принят как decision-safe execution plan. Все
  `UX08-01…12` остаются pending owner gates; PASS не является owner ruling и не разрешает app/DB/runtime, TEST,
  deploy, `main`/`test`, commit или push.
- Audit record обновлён на месте: `UX09_INDEPENDENT_AUDIT.md` §8. `ROADMAP.md` синхронизирован; новый документ не
  создавался. App tests, lint, typecheck, build и DB smoke не запускались, потому что re-audit меняет только
  planning/audit documentation.

## 2026-07-16 — Final initiative completion audit

- **Run ID:** `SAAS-UX-FINAL-AUDIT-20260716-A8417-01`.
- **Проверенный HEAD:** `a8417ef333f517ecf3dafa2c5c025bb4524d3d3f` на
  `feat/saas-interface-work3`; worktree был clean и совпадал с `origin/feat/saas-interface-work3` до этой audit-записи.
- **Финальный verdict:** **FAIL — формальная цель инициативы пока не может быть отмечена независимо завершённой.**
  Содержательная спецификация UX-01…09 собрана и её phase-аудиты воспроизводятся, но current-source статусы
  противоречат этим аудитам. При правиле «неясное или противоречивое evidence = не достигнуто» это блокирует final
  completion seal. `README.md` и `ROADMAP.md` намеренно не переведены в independently audited complete.

### Requirement-by-requirement result

| Требование                                                           | Результат                               | Evidence                                                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current screens / factual baseline                                   | **PASS по содержанию**                  | UX-01 inventories и route allocation `150/150`; retained evidence arithmetic `71 = 66 valid + 5 finding-only`; DEV-хэши `23/23` совпали.                                                         |
| Roles, contexts and screen composition                               | **PASS**                                | UX-03 operating model и role-capability matrix; UX-06 target registry ↔ composition `57/57`, missing/extra/duplicate `0`.                                                                        |
| Solo specialist vs clinic doctor modes                               | **PASS**                                | Единая tenant/component model с capability/composition variants; team, handoff и clinic-wide filters не превращены в параллельное solo-приложение.                                               |
| Patient card, full clinic history, specialist filtering and handoff  | **PASS как decision-safe contract**     | Один organization card shell; authorization precedes filter; own/assigned safe subset; shared/private history и handoff остаются за явными `UX08-01/02` owner gates.                             |
| Public landing, signup, invite, email-first install and optional SMS | **PASS**                                | UX-04 J1…J7 и `ACQ/STF/PIN/SMS/PBK/MOR/ERR`; email proof remains primary, SMS is transport-only and cannot elevate auth.                                                                         |
| Branding, domain, PWA and sender identity                            | **PASS**                                | UX-05 contract/matrix separates core platform/organization identity from owner-gated white-label, custom-origin, W-PWA and sender branches; Host is not authorization.                           |
| Patient multi-organization use                                       | **PASS**                                | Zero/one/many enrollment resolver, explicit chooser/switch and no silent context substitution are assigned to U5A.                                                                               |
| Research basis and recommendation/owner-decision separation          | **PASS**                                | UX-02 uses official vendor/help sources and primary technical/security sources; facts, planner recommendations and owner rulings are distinct.                                                   |
| Interactive prototype and visual evidence                            | **PASS with portability risk**          | Nine prototype flows, 73 states and 142 actions; deep-link/mobile DOM smoke passed; 18/18 UX-07 PNG hashes matched and contact sheet was visually inspected.                                     |
| Owner decision packet                                                | **PASS / decisions intentionally open** | `UX08-01…12 = 12/12`, unique, three alternatives and required provenance/recommendation/safe-boundary fields; every ruling remains `none/pending`.                                               |
| Implementation roadmap                                               | **PASS**                                | 19 stages × 14 mandatory fields; normative DAG covers `19/19`, cycles and unknown direct dependencies `0`; proportional validation, rollback, migration and merge gates present.                 |
| Foundation, tenant, privacy and workstream isolation                 | **PASS**                                | No second principal/settings/membership path, ad hoc RLS, implementation/deploy permission or overlap with the authoritative SaaS Foundation sequence was introduced. Branch delta is docs-only. |
| Canonical documentation consistency                                  | **FAIL**                                | Current artifact headers/acceptance sections still claim audits are pending after the matching independent PASS records.                                                                         |

### Blocking finding F-FINAL-01 — stale current-source status

Один связанный класс status drift должен быть исправлен согласованно, после чего нужен один full completion
re-audit, а не серия узких audit/fix циклов:

- `CURRENT_STATE_BASELINE.md` всё ещё говорит, что visual audit ждёт fresh independent acceptance;
- `UX01_EVIDENCE_MANIFEST.md` всё ещё требует fresh independent replay audit, хотя последующий UX-01 PASS существует;
- `BRANDING_DOMAIN_CONTRACT.md` и `BRANDING_CAPABILITY_MATRIX.md` всё ещё ожидают UX-05 re-audit;
- `TARGET_IA.md`, `SCREEN_COMPOSITION.md` и `ROUTE_MIGRATION_MAP.md` всё ещё ожидают UX-06 re-audit;
- `UX07_PROTOTYPE_INDEX.md` всё ещё ожидает two-reviewer re-audit, хотя source-bound functional и visual seals PASS.

Исторические FAIL/checkpoint записи в audit-файлах и `LOG.md` сами по себе не являются finding: они сохраняют
хронологию. Finding относится только к текущим статусам действующих deliverables.

### Reproduced checks and residual risks

- Markdown local links: `38` files scanned, `30` local links, missing `0`; `git diff --check` PASS до audit-записи.
- Current route allocation: `150 actual = 150 referenced = 150 unique`, missing/stale/duplicate `0`.
- Prototype source SHA-256:
  `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`; evidence PNG hashes `18/18`.
- UX-01 source manifests: `9/9` exist in the integration worktree named by the owner handoff; referenced PNG files
  `85`, missing `0`; DEV declared hashes `23/23`.
- Screenshot evidence is runtime-only under gitignored `.claude/screenshots/` and split between the integration
  worktree (UX-01) and work3 (UX-07). It is valid on the current server but not portable from Git alone.
- Patient Today `organization_principal_required`, unexercised registration submit/verification/first-run and the
  absent privacy-safe regular-doctor communications screenshot remain explicitly documented UX-01 findings, not
  silently treated as implemented behavior.
- App tests, lint, typecheck, build, DB smoke and full CI were not run: this was a docs/evidence completion audit and
  application, DB, runtime, TEST and PROD were not changed.

**НАШЁЛ:** substantive UX-01…09 coverage passes; one consolidated blocking class of stale current-source statuses.

**ИЗМЕНИЛ:** only this existing `LOG.md` audit record; no new document, app/DB/runtime change, commit or push.

## 2026-07-16 — F-FINAL-01 integrated status convergence

- **Run ID:** `SAAS-UX-FINAL-CORRECTION-20260716-FINAL01-01`.
- Один integrated correction stage согласованно обновил текущие status/acceptance формулировки во всех восьми
  артефактах из F-FINAL-01: UX-01 baseline/evidence, оба UX-05 branding outputs, три UX-06 outputs и UX-07
  prototype index.
- Текущие deliverables теперь прямо ссылаются на фактические phase verdicts: UX-01 patient-replay **PASS**,
  UX-05 full re-audit **PASS**, UX-06 full re-audit **PASS** и UX-07 two-reviewer **PASS** с seals #1/#2 на
  source `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657` / batch
  `2026-07-15T21-03-18Z`.
- Исторические FAIL/checkpoint ledger записи не переписывались. Pending OM/BD/UX08 owner gates не стали rulings;
  prototype/source-bound и runtime-evidence ограничения сохранены.
- Статус correction stage: **complete; awaiting one full independent final completion re-audit**. README/ROADMAP
  final status не менялся; application, DB, runtime, TEST и PROD не затрагивались; commit/push не выполнялись.

## 2026-07-16 — Full final completion re-audit after F-FINAL-01 correction

- **Run ID:** `SAAS-UX-FINAL-REAUDIT-20260716-FINAL01-01`.
- **Проверенный UX HEAD:** `a8417ef333f517ecf3dafa2c5c025bb4524d3d3f` на
  `feat/saas-interface-work3`, включая uncommitted integrated correction
  `SAAS-UX-FINAL-CORRECTION-20260716-FINAL01-01` только в initiative docs.
- **Вердикт:** **FAIL — F-FINAL-01 закрыт, но полный coordination/canon gate обнаружил новый blocker
  F-FINAL-02.** `README.md` и `ROADMAP.md` намеренно не переведены в independently audited complete.

Это был полный повтор owner requirement checklist и authoritative evidence, а не spot-check status-строк. Заново
проверены UX-01…09, current/target registries, phase audits, prototype source/manifests/seals, owner decisions,
implementation DAG, Foundation separation, model routing, branch/worktree coordination и отсутствие ложных
implementation claims.

### Requirement-by-requirement verdict

| Требование                                          | Итог полного re-audit                                                                                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01 current-state screens/evidence                | **PASS:** `150/150`; 9/9 manifests; 85/85 referenced PNG exist; 23/23 declared DEV hashes match; `71 = 66 valid + 5 finding-only`.                                                                                    |
| UX-02 external research                             | **PASS:** official product/help and primary technical/security sources; facts, recommendations and owner rulings remain separated.                                                                                    |
| Roles and capability boundaries                     | **PASS:** global admin, owner/admin with and without specialist binding, specialist, assistant-safe, patient, onboarding and public have bounded surfaces; permission precedes filters/entitlements.                  |
| Solo specialist vs clinic doctor                    | **PASS:** one tenant/account/component family with capability-driven composition; team/history/handoff chrome is absent in solo and conditional in clinic, without parallel route trees.                              |
| Patient card/history/handoff                        | **PASS as decision-safe contract:** one organization card candidate, own/assigned safe subset, authorization-before-filter, private-entry protection and named handoff primitives; final policy remains `UX08-01/02`. |
| Multi-organization patient context                  | **PASS:** zero/one/many resolver, explicit chooser/switch, verified deep-link/object context, cache isolation and no silent organization substitution.                                                                |
| Specialist landing, signup and first run            | **PASS:** specialist-oriented platform landing, solo/clinic composition within one onboarding, exactly-once owner workspace path and explicit first-run/security states.                                              |
| Staff/patient invite, email/SMS, activation/install | **PASS:** J1…J7 and `ACQ/STF/PIN/SMS/PBK/MOR/ERR`; email proof is primary, SMS transport cannot elevate auth, first value precedes install/push.                                                                      |
| Branding, domains, PWA and sender identity          | **PASS:** core P/O context is independent from W presentation; Host is not authz; base/binding lifecycle, canonical fallback, per-origin isolation and truthful sender readiness remain gated.                        |
| UX-06 IA/composition/routes                         | **PASS:** canonical registry `57/57`, composition missing `0`; current routes `150 actual = 150 refs = 150 unique`, missing/stale/duplicate `0`.                                                                      |
| UX-07 prototype and visual evidence                 | **PASS:** unchanged source SHA `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`; 9 flows, 73 states, 142 actions; 18/18 evidence hashes; both source-bound seals PASS; contact sheet re-inspected.  |
| UX-08 owner decision packet/provenance              | **PASS:** `UX08-01…12 = 12/12`, each has three alternatives, provenance, recommendation, distinct safe boundary and execution consequence; all rulings remain `pending/none`.                                         |
| UX-09 implementation roadmap                        | **PASS:** 19 unique stages × 14 mandatory fields; 19/19 dependency registry, unknown dependencies `0`, cycles `0`, full topological coverage; migration/rollback/validation/no-dup gates intact.                      |
| Foundation and implementation honesty               | **PASS:** no second principal/settings/membership path, ad hoc RLS, invented schema, TEST/deploy permission or overlap with `SAAS_FOUNDATION/SEQUENCE.md`; docs explicitly state implementation has not begun.        |
| Model tiers                                         | **PASS in initiative roadmap:** only `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` are referenced, matching the latest integration policy.                                                                           |
| F-FINAL-01 status convergence                       | **PASS:** all eight current artifacts now cite the applicable independent PASS; no new pending-audit wording exists in current deliverables. Historical FAIL/checkpoint records remain correctly historical.          |
| Canon/coordination sync                             | **FAIL:** work3 `docs/ORCHESTRATION_BINDINGS.md` is one integration commit behind and retains a superseded model-override line.                                                                                       |

### F-FINAL-01 closure

The integrated correction is coherent across all eight artifacts:

- UX-01 baseline/evidence now points to `UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` PASS while retaining factual gaps;
- both UX-05 outputs point to `UX05_INDEPENDENT_AUDIT.md` §5 PASS and keep BD-1…6 pending;
- all three UX-06 outputs point to `UX06_INDEPENDENT_AUDIT.md` §7 PASS and preserve `57/57`/`150/150` invariants;
- UX-07 index points to both PASS seals on the exact unchanged source/evidence batch and still says any source change
  invalidates them.

### Blocking finding F-FINAL-02 — integration canon not synced back

`origin/feat/doctor-ui-rebuild` now contains `2da21d045 docs(agents): standardize BersonCare on 5.6 models`.
Comparison of the four coordination-canon files shows only one difference: work3 still permits `gpt-5.5` and
`gpt-5.4` in `docs/ORCHESTRATION_BINDINGS.md`, while integration canon permits only `gpt-5.6-sol`,
`gpt-5.6-terra`, `gpt-5.6-luna`. `AGENTS.md`, `CLAUDE.md` and `docs/AGENT_AUTORUN_SCHEME.md` match.

The initiative roadmap itself already uses only the three current 5.6 models, so no phase output needs redesign.
Nevertheless, the explicit coordination rule forbids retaining a branch-local canon fork and required the
integration-approved line to be synced back. This auditor does not merge/fix its own finding. Required correction:
sync integration commit `2da21d045` (or its exact approved bindings line) into work3 without overwriting the current
initiative-doc correction, reread the four canon files, record acknowledgement, then perform one final full
completion re-audit.

### Reproduced commands/evidence

- Node registry/link checks: 38 Markdown + 1 HTML; 39 local links, missing `0`; target IDs `57/57`; routes
  `150/150`; decisions `12/12`; stages `19 × 14`; DAG cycles/unknown `0`.
- Node evidence checks: UX-01 manifests `9`, PNG refs `85`, missing `0`, declared hashes `23`, mismatches `0`; UX-07
  PNG refs `18`, mismatches `0`; prototype source SHA exact.
- Prototype object evaluation: 9 flows, 73 states, 142 actions = 33 result actions + 109 navigations; malformed
  actions `0`.
- Visual evidence: all 18 current UX-07 PNGs rebuilt into one contact sheet and re-inspected without visible stale
  context, substitution or clipping.
- `git diff --check`: PASS before this audit record. `git merge-base --is-ancestor` for `d8c197a5d`, `302571f5f`
  and `cebc0790c`: all PASS. Current worktree changes remain initiative documentation only.
- `git diff origin/feat/doctor-ui-rebuild -- AGENTS.md CLAUDE.md docs/AGENT_AUTORUN_SCHEME.md
docs/ORCHESTRATION_BINDINGS.md`: exactly one changed file/one line, caused by missing `2da21d045` sync.
- App tests, lint, typecheck, build, DB smoke and full CI were not run: application/schema/runtime did not change.

### Residual risks

- All 12 product rulings remain pending; PASS phase contracts do not choose them.
- UX-01 retains the Patient Today defect and explicitly unexercised/private evidence states.
- Screenshot evidence is server-local and gitignored, split between integration worktree (UX-01) and work3
  (UX-07); all paths exist now, but Git checkout alone is not portable evidence.
- UX-07 proves a low-fidelity represented interaction contract, not live auth/delivery/domain/install behavior or
  final production accessibility/visual acceptance.

**НАШЁЛ:** F-FINAL-01 fully closed and every substantive UX/evidence requirement still passes; one new blocking
coordination drift, F-FINAL-02, caused by unsynced integration commit `2da21d045`.

**ИЗМЕНИЛ:** only this existing `LOG.md` re-audit record; README/ROADMAP, canon, app, DB and runtime were not changed;
no commit or push.

## 2026-07-16 — Integration canon `2da21d045` synchronized before final re-audit

- Текущая UX status-convergence и оба final-audit records сохранены checkpoint-коммитом `1e0f46988` и запушены
  до нового integration merge.
- `origin/feat/doctor-ui-rebuild` с каноническим коммитом `2da21d045` влит merge-коммитом `0edc83372`;
  `2da21d045` проверен как ancestor текущего HEAD.
- Дельта четырёх обязательных orchestration-файлов относительно предыдущего подтверждённого merge проверена:
  `AGENTS.md`, `CLAUDE.md` и `docs/AGENT_AUTORUN_SCHEME.md` не изменялись; полностью перечитан изменённый
  `docs/ORCHESTRATION_BINDINGS.md`. Действующий допустимый набор overrides — только `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`; UX roadmap ему соответствует.
- F-FINAL-02 устранён синхронизацией с integration canon. Это coordination correction, не продуктовый ruling и не
  изменение app/DB/runtime/TEST/PROD. Итоговый PASS по-прежнему требует полного независимого completion re-audit.

## 2026-07-16 — Final initiative completion re-audit PASS

- **Run ID:** `SAAS-UX-FINAL-REAUDIT-20260716-AF864C-01`.
- **Проверенный clean HEAD:** `af864c2d98bd89421f60c4ed04af0f2499b5b06c` на
  `feat/saas-interface-work3`, синхронный с `origin/feat/saas-interface-work3` до этой audit-записи.
- **Финальный verdict:** **PASS — SaaS Product UX discovery/planning independently audited complete; awaiting all
  12 owner decisions.** PASS не означает, что future UI/API/data contracts реализованы, не выбирает conditional
  branches и не разрешает TEST/deploy/app/DB/runtime operations.

Audit полностью повторил original owner requirement/evidence checklist после закрытия F-FINAL-01 и F-FINAL-02, а
не ограничился проверкой merge/status diff.

### Requirement-by-requirement verdict

| Requirement                                         | Result                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01 factual current screens                       | **PASS:** route inventory `150/150`; 9/9 canonical manifests; 85/85 referenced PNG exist; 23/23 declared DEV hashes match; evidence arithmetic `71 = 66 valid + 5 finding-only`.                                                            |
| UX-02 external research                             | **PASS:** official practice-product/help sources and primary technical/security sources; external facts, BersonCare recommendations and owner rulings remain separated.                                                                     |
| Roles and contexts                                  | **PASS:** global admin, owner, delegated admin, bound specialist, assistant-safe, patient, onboarding and public surfaces have distinct capability/context boundaries.                                                                      |
| Solo specialist vs clinic doctor                    | **PASS:** one tenant/account/component model with capability-driven composition; team/history/handoff/filter chrome is absent in solo and conditional in clinic, without parallel route trees.                                              |
| Patient card/history/handoff                        | **PASS as decision-safe contract:** one organization-card candidate, authorization-before-filter, own/assigned safe subset, private-entry protection and named handoff primitives; exact policy remains UX08-01/02.                         |
| Multi-organization patient                          | **PASS:** zero/one/many enrollment resolver, explicit chooser/switch, trusted deep-link/object verification, no cached data flash or silent organization substitution.                                                                      |
| Specialist landing/signup/first run                 | **PASS:** specialist-oriented platform landing, solo/clinic composition within one onboarding, secure owner provisioning/binding and truthful first-run/recovery states.                                                                    |
| Staff/patient invite, email/SMS, activation/install | **PASS:** J1…J7 and ACQ/STF/PIN/SMS/PBK/MOR/ERR coverage; email proof remains primary, SMS is transport-only, first useful value precedes install and push consent.                                                                         |
| Branding/domain/PWA/senders                         | **PASS:** core platform/organization identity is distinct from paid W presentation; Host is not authz; base/binding, canonical fallback, per-origin and authenticated-sender readiness contracts are explicit.                              |
| Target IA/composition/migration                     | **PASS:** `57` unique canonical IDs and `57/57` compositions, missing `0`; current routes `150 actual = 150 refs = 150 unique`, missing/stale/duplicate `0`.                                                                                |
| UX-07 prototype/seals                               | **PASS:** exact SHA `929a6613929251ff5a86ddb82e4a57969d9bc1a2240ae446cabc5abf0de13657`; 9 flows, 73 states, 142 actions; 18/18 evidence hashes; seals #1/#2 remain source-bound and valid; contact sheet re-inspected.                      |
| Owner decisions/provenance                          | **PASS:** UX08-01…12 = 12/12 unique, each with three alternatives, provenance, planner recommendation, distinct safe boundary and execution consequence; all are still `pending/none`.                                                      |
| Implementation roadmap                              | **PASS:** 19 unique stages × 14 mandatory fields; dependency rows 19/19, cycles `0`, unknown dependencies `0`, topological coverage 19/19; migration, rollback, validation and merge gates present.                                         |
| Foundation/no-dup/security                          | **PASS:** current Foundation files equal integration branch; no second principal/settings/membership path, ad hoc RLS, invented schema, parallel solo/clinic/per-specialist/account/booking/white-label trees or permission-by-filter/Host. |
| Implementation honesty                              | **PASS:** target/current gaps remain explicit; `IMPLEMENTATION_ROADMAP.md` states implementation has not begun; no initiative output claims absent API/schema/runtime/UI behavior exists.                                                   |
| Model tiers and coordination                        | **PASS:** roadmap names only `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`; integration canon `2da21d045` is ancestor through merge `0edc83372`; ACK `af864c2d9`; all four coordination-canon files match integration.                     |
| F-FINAL-01/F-FINAL-02 and status consistency        | **PASS:** all eight phase artifacts cite current independent PASS records; no new pending-audit wording; branch-local orchestration canon drift is absent.                                                                                  |
| Links/evidence/branch isolation                     | **PASS with recorded portability risk:** 38 Markdown + 1 HTML, 39 local links missing `0`; initiative delta relative to integration is docs-only; worktree was clean; screenshot paths exist on this server.                                |

### Reproduced evidence and commands

- Node full-registry script: local links `39/39`; target registry/composition `57/57`; current route allocation
  `150/150`; owner decisions `12/12`; stage fields `19 × 14`; DAG rows/coverage `19/19`, cycle/unknown `0`.
- Node evidence script: UX-01 9 manifests / 85 unique PNG refs / missing `0` / 23 declared hash checks / mismatch
  `0`; UX-07 18 PNG hash checks / mismatch `0`; exact prototype SHA.
- Prototype object evaluation: 9 flows, 73 states, 142 declared actions = 33 result actions + 109 navigations;
  malformed actions `0`. Manifest doubles these across desktop/mobile to 66 result + 218 navigation checks.
- All 18 current UX-07 screenshots were rebuilt into a single contact sheet and visually re-inspected without stale
  context, cross-role substitution or visible clipping.
- `git diff --check` PASS. Ancestor checks PASS for `d8c197a5d`, `302571f5f`, `cebc0790c`, `2da21d045` and
  `0edc83372`. The four coordination files and all `SAAS_FOUNDATION` files have no delta from integration branch.
- `git diff --name-only origin/feat/doctor-ui-rebuild...HEAD` contains only initiative documentation plus its
  existing `docs/README.md` index entry; no initiative app/schema/runtime implementation delta.
- App tests, lint, typecheck, build, DB smoke and full CI were not run because this completion audit changes only
  documentation and does not validate or alter application runtime.

### Residual risks, not completion failures

- All 12 product decisions remain pending; conditional UI/access/launch branches must remain absent or use their
  documented safe boundary until a dated owner ruling exists.
- UX-01 retains `organization_principal_required` on Patient Today plus explicitly unexercised registration,
  communications, expanded mobile and write/delivery states. These are implementation inputs, not hidden PASSes.
- Screenshot evidence is runtime-only/gitignored and split between integration worktree (UX-01) and work3 (UX-07).
  It is present and hash-valid on this server but not portable from Git checkout alone.
- UX-07 validates a low-fidelity represented interaction contract, not live auth, delivery, DNS/domain, install/push,
  final component accessibility or production visual acceptance.
- Integration Foundation advanced substantially through `0edc83372`; each future UX implementation stage must run
  its required U0/current-state handoff rather than relying on this discovery-time snapshot.

**НАШЁЛ:** no remaining completion blocker; F-FINAL-01 and F-FINAL-02 remain closed and the complete UX-01…09
specification/evidence chain passes without new drift.

**ИЗМЕНИЛ:** existing `LOG.md`, `README.md` status and `ROADMAP.md` final initiative gate/checklist only; no new
audit file, app/DB/runtime change, commit or push.

## 2026-07-16 — UX08 owner rulings integrated; awaiting independent audit

- **Run ID:** `SAAS-UX-OWNER-RULINGS-INTEGRATION-20260716-01`.
- **Источник решений:** ответ владельца в текущем чате на `UX08-01…12`; каноническая запись:
  [`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md).
- **Статус:** owner rulings integrated into the existing UX canon and implementation roadmap; **awaiting one full
  independent audit**. Все предыдущие UX-03…09 PASS/seals являются historical pre-ruling evidence и не считаются
  проверкой новых решений.
- **Классификация `12/12`:** resolved launch `7` (`01`, `03`, `04`, `05`, `06`, `09`, `12`); resolved future
  deferred `1` (`08`); explicitly deferred `1` (`07`); rejected premise `3` (`02`, `10`, `11`).
- **Главная launch-граница:** solo-specialist first. Multi-specialist clinic, assistant/reception и сложная
  маршрутизация clinic messages остаются future-compatible, но отсутствуют в initial release и не задерживают его.
- **Patient implementation scope:** specialist/staff создаёт patient card и scheduled appointment либо immediate
  walk-in visit без предварительной регистрации пациента; portal identity по verified email/phone связывается с
  существующей карточкой позже и не создаёт duplicate card.
- **Clinical model:** одна organization-scoped patient card; patient появляется у specialist через его actual или
  scheduled visit; own events по умолчанию, authorized available history и specialist filter по запросу. Primary
  specialist, care team, accept/reject, generic handoff и cross-org transfer отвергнуты.
- **Context/branding:** platform app открывает last-used organization и показывает switcher; future paid org-specific
  app pinned to one organization. Platform launch precedes custom-domain/app work. Branding depth and PWA/APK/native
  technology remain explicit unresolved feasibility items.
- **Delivery/support:** configured custom provider never falls back to platform sender for user messages; retry only
  within TTL, then expiry, with account-owner alerts. Global admin has aggregate/org/platform diagnostics only and
  no patient browsing/repair workflow.
- **Registry preservation:** canonical target registry/composition remains `57/57`; current route allocation remains
  `150/150`. No canonical screen ID or route-allocation row was added or removed.
- **Changed in place:** `README.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `OPERATING_MODEL.md`,
  `ROLE_CAPABILITY_MATRIX.md`, `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md`,
  `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`, `TARGET_IA.md`, `SCREEN_COMPOSITION.md`,
  `ROUTE_MIGRATION_MAP.md`, `OWNER_DECISION_PACKET.md`, `IMPLEMENTATION_ROADMAP.md`, this `LOG.md`, plus the planned
  dated rulings artifact. No competing roadmap/operating-model document was created.
- **Runtime boundary:** documentation only. No app code, DB, migration, runtime, DEV/TEST/PROD, delivery, deploy,
  commit or push was performed by this stage.

**НАШЁЛ:** старый decision-safe канон всё ещё содержал handoff/primary/care-team lifecycle, assistant launch paths,
invite-first patient creation, global-admin patient support и sender/platform-fallback assumptions, которые после
ответа владельца стали ложными или только историческими.

**ИЗМЕНИЛ:** сохранил исходные 12 развилок как историю, но сделал dated owner outcome текущей нормой во всех
канонических UX-документах. Точный retry/TTL, понятная глубина paid branding, custom-domain/app effort и technology,
будущие права assistant/reception и clinic communication topology оставлены открытыми, а не выданы за решения.

## 2026-07-16 — Full independent audit of UX08 owner-ruling integration: FAIL

- **Run ID:** `SAAS-UX-OWNER-RULINGS-AUDIT-20260716-799-FULL-01`.
- **Task:** taskdb `#799`.
- **Verdict:** **FAIL — требуется одна цельная reconciliation-correction существующих UX-документов.** Решения
  владельца в dated artifact переданы в основном точно, но current normative/executable слой всё ещё содержит
  старые gates, clinic/handoff workstreams и термины, которые противоречат solo-first границе. Поэтому этот audit
  не меняет статусы `OWNER_RULINGS`, packet, `README`, `ROADMAP` или `IMPLEMENTATION_ROADMAP`.
- **Runtime boundary:** независимый docs-only audit. App/schema/DB/runtime/DEV/TEST/PROD не менялись и не
  запускались; commit/push не выполнялись.

### Requirement-by-requirement verdict

| Owner decision / requirement                                                                                                 | Verdict                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX08-01 — one organization patient card, visibility through actual/scheduled visit, own-first history                        | **FAIL по полной интеграции:** dated ruling, matrix and core CLIN card rows are correct, but `TARGET_IA.md` still shows `care-team attribution` / `Care team`, and roadmap still says the policy is pending.                                                                                |
| UX08-02 — no primary/care-team/handoff lifecycle; another specialist means an ordinary visit                                 | **FAIL по execution:** rejected model is stated correctly, but U5C remains an included P3 implementation stage with collaboration queue/recovery and deactivation work, while U5D retains handoff language.                                                                                 |
| UX08-03 — no assistant at initial release; future compatibility only, exact grants open                                      | **FAIL:** launch absence is stated, but the capability supplement still assigns a concrete delegated object set; U2 still owns OPS screens/ports and assistant validation. This freezes/implements more than the owner approved.                                                            |
| UX08-04 — one login; simple management destination/menu first; exact switch UX open                                          | **PASS:** no second account/persona and no forced navigation mechanism were found.                                                                                                                                                                                                          |
| UX08-05 — platform app restores last organization plus visible switcher; branded org app pinned                              | **PASS:** platform and future pinned-app contexts are separated and no client-side selection is treated as authorization.                                                                                                                                                                   |
| UX08-06 — landing + organization profile + booking + join; directory later                                                   | **FAIL по execution:** content rows defer `PUB-06`, but canonical ownership/gap/U6 text still says it waits for or is conditional on UX08-06, as if the decision were unresolved.                                                                                                           |
| UX08-07 — paid branding depth unresolved in plain language                                                                   | **FAIL:** the gate is marked unresolved, but branding contracts still normatively present `W — True white-label` surface/tier behavior without an immediate candidate-only disclaimer; dated owner wording did not select that product promise.                                             |
| UX08-08 — custom domain/org-specific auth/app is future paid scope; initial platform product first; technology/effort open   | **PASS:** U8A/B are explicitly post-launch/optional and PWA/APK/native choice is not frozen.                                                                                                                                                                                                |
| UX08-09 — custom provider has no platform sender fallback; retry within TTL, expire, alert owner                             | **PASS:** direction is captured without inventing exact TTL/retry values or enabling a provider.                                                                                                                                                                                            |
| UX08-10 — global admin has no patient browse/session/record repair workflow                                                  | **FAIL по execution:** PLAT content is corrected, but U9 merge dependency still says the PLAT-09 branch is blocked by UX08-10, even though the premise was rejected and the allowed diagnostics/report path is resolved.                                                                    |
| UX08-11 — staff can create patient card plus scheduled/walk-in visit before portal activation; verified identity links later | **PASS:** journey/state documents separate business relationship, delivery, identity proof and portal access; no registration-first prerequisite remains.                                                                                                                                   |
| UX08-12 — current solo chat unchanged; clinic topology future/configurable and not launch work                               | **FAIL по execution:** owner boundary is stated, but U5D still includes conditional OPS-04, multi-specialist/assistant validation, migration and handoff-continuity work as the last included P3 stage.                                                                                     |
| Solo-first release must not wait for clinic/assistant/custom-app work                                                        | **FAIL:** P3 explicitly includes U5C and U5D; U5C is not classified as an absent optional node, and U10 depends on every included audited stage. U2/U5D also retain future OPS work.                                                                                                        |
| Historical audits may not validate the new rulings                                                                           | **FAIL:** top-level files call earlier PASS records historical, but the UX03/04/05/06/07/09 audit artifacts themselves still open with active PASS language and no dated supersession banner. Direct readers can mistake pre-ruling conclusions for validation of the 2026-07-16 decisions. |
| Registry/route/link integrity                                                                                                | **PASS:** 12/12 ruling IDs and 12/12 packet questions; 57 canonical target IDs plus two explicitly non-canonical aliases; composition 57/57; current routes 150 actual = 150 refs = 150 unique; local links 39, missing 0; normative stage registry 19 rows and acyclic.                    |

### Consolidated findings

#### F1 — Owner authority is below derived UX documents

`IMPLEMENTATION_ROADMAP.md` conflict order puts `OWNER_RULINGS_2026-07-16.md` at position 7, below requirements,
operating model, journeys, branding and IA artifacts derived from it. That reverses the intended authority and makes
the stale text below executable. The dated owner ruling must outrank all derived initiative documents while remaining
subordinate to repository/foundation canon in its proper scope.

#### F2 — Future clinic work can still block the solo-first release

The phase table includes U5C/U5D in P3 and U10 waits for every included stage. U5C says clinic UI may be deferred,
but it remains a normal DAG node and still requires a collaboration queue/recovery and deactivation preflight. U2
still lists OPS-01…04 plus ops ports/assistant smoke; U5D still carries OPS-04, assistant/two-specialist and migration
work as its phase checkpoint. This is incompatible with the explicit rule that multi-specialist clinic,
assistant/reception and configurable clinic communications are future design capacity, not initial implementation or
launch gates. Mark those branches genuinely absent/optional and remove their workstreams from solo-stage completion.

#### F3 — Rejected or unresolved product models remain normative

- `TARGET_IA.md` PAT-02/PAT-09 and `ROUTE_MIGRATION_MAP.md` C20 still use care-team semantics although there is no
  care team in the approved model.
- U5D still describes handoff continuity/history behavior after the handoff lifecycle was rejected.
- `ROLE_CAPABILITY_MATRIX.md` assigns assistant schedule/intake/contact/invite objects although exact future grants
  are unresolved.
- `ENTRY_AND_INVITE_JOURNEYS.md` still routes Assistant to `OM-2 bounded operations home` instead of marking the
  initial-release destination not applicable/future.
- The branding contract/matrix present a detailed true-white-label tier as normative surface behavior while UX08-07
  is explicitly unresolved. It may remain only as clearly labelled candidate analysis, not as a selected target.

#### F4 — Resolved decisions still appear as pending execution gates

Roadmap rows still say `PUB-06 waits for UX08-06`, card/history policy is pending UX08-01, multiple U5/U9 branches
remain conditional, and PLAT-09 is blocked by UX08-10. These are not harmless history: they control stage ownership,
merge and completion. Reconcile every `UX08-01…12` reference to one of exactly four current states: resolved launch,
resolved future-deferred, explicitly unresolved/deferred, or rejected premise.

#### F5 — Pre-ruling audit artifacts are ambiguous when opened directly

Current README/roadmap notices are not enough to make every retained historical PASS self-describing. Add a concise
top banner to the affected existing UX03/04/05/06/07/09 audit files stating that their PASS predates
`OWNER_RULINGS_2026-07-16.md`, remains evidence only for the unchanged pre-ruling scope and does not validate the
integrated rulings. Do not create another audit document.

### Reproduced evidence and commands

- Full reads: `OWNER_RULINGS_2026-07-16.md`, `OWNER_DECISION_PACKET.md`, `README.md`, `REQUIREMENTS.md`,
  `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, `ENTRY_AND_INVITE_JOURNEYS.md`,
  `UX04_SCREEN_STATE_LIST.md`, both branding contracts, all three UX-06 artifacts, `ROADMAP.md`,
  `IMPLEMENTATION_ROADMAP.md`, UX03/04/05/06/07/09 independent audits, initiative `LOG.md`, Foundation owner
  rulings, and repository/orchestration canon.
- Focused `rg` over care-team/handoff/assistant/OPS/white-label and all UX08 stage/gate references reproduced every
  finding above.
- Read-only Node registry checks: owner rulings `12/12`; packet headings `12/12`; canonical target/composition
  `57/57`; route allocation `150/150`; local Markdown links `39`, missing `0`; stage registry `19`, cycle `0`.
- `git diff --check`: PASS before this audit record.
- Current branch HEAD before this audit record: `223ff8b9a`; initiative worktree changes are documentation-only.
  `origin/feat/doctor-ui-rebuild` is five commits ahead of the shared merge-base `9a0d5da41`; the four orchestration
  canon files have no delta, while newer Foundation/runtime evidence must be consumed by the normal U0 handoff before
  any implementation.
- App tests, lint, typecheck, build, DB smoke and full CI were not run because this is a documentation audit and no
  application/runtime behavior was changed.

### Residual risks

- Exact assistant grants, clinic communication topology, paid branding depth, custom-domain/app technology and
  sender retry/TTL values remain intentionally unresolved; correction must not invent them.
- The canonical registry intentionally retains future IDs (OPS and custom capabilities) for architecture planning;
  retaining an ID must not make its implementation a solo-launch dependency.
- Foundation has advanced after the last work3 merge; this does not change the owner-ruling verdict, but every future
  implementation stage still needs the documented current-state integration handoff.

**НАШЁЛ:** dated owner artifact is substantially faithful, but five connected reconciliation failures leave old
authority, clinic/handoff work, assistant grants, white-label promises and resolved-as-pending gates active.

**ИЗМЕНИЛ:** only this new audit section in existing `LOG.md`. Per FAIL protocol, no initiative status, ruling,
packet, roadmap, application, DB/runtime state, commit or push was changed.

## 2026-07-16 — Integrated convergence after owner-ruling audit FAIL

- **Run ID:** `SAAS-UX-OWNER-RULINGS-CONVERGENCE-20260716-799-01`.
- **Input audit:** `SAAS-UX-OWNER-RULINGS-AUDIT-20260716-799-FULL-01` above. Its FAIL history was not edited.
- **Status:** all consolidated F1–F5 findings corrected in one pass; current UX canon still **awaits one full
  independent re-audit**. No previous PASS/seal is treated as acceptance of the 2026-07-16 rulings.

### Integrated corrections

1. **Authority order:** `OWNER_RULINGS_2026-07-16.md` now explicitly outranks every derivative UX requirement,
   operating model, journey, branding candidate, IA, prototype, roadmap and prior UX audit. Foundation owner rulings
   retain priority only in foundation/tenant/enforcement scope. The same order is repeated at derivative entrypoints.
2. **Solo launch DAG:** clinic-only `U3A`, `U5C`, `U5D` and optional `U8A/B/C` are `absent optional node`s and are
   excluded from U10 launch dependencies. P2 no longer depends on J2/staff invite; U3B/U4/public launch run without
   U3A. P3 contains only launch-ready U5B. `MGMT-02`, `CLIN-05`, `OPS-01…04`, J2/STF and clinic communication are
   registry/history reservations, not launch implementation or acceptance.
3. **Rejected/candidate semantics:** active contracts no longer specify transfer queues, receiver approval,
   deactivation recovery, concrete assistant grants or a selected deep-brand tier. Historical options remain only in
   explicitly labelled superseded/pre-ruling sections. Current solo chat is unchanged without a stage.
4. **Decision registry:** resolved/rejected outcomes are no longer pending blockers. Only five deferred product
   sub-decisions remain: paid-brand depth; future org-app technology/feasibility/timing; exact sender retry/TTL values;
   future assistant grants; future clinic communication topology. Record-class, entitlement, security-factor,
   identity-matching and lifecycle details are labelled implementation/security/commercial policy, not new owner
   gates.
5. **Historical audits/prototype:** `UX03/04/05/06/07/09_INDEPENDENT_AUDIT.md` each has an internal top banner:
   historical pre-ruling evidence, superseded for current normative acceptance, awaiting re-audit. UX07 prototype
   index/findings are marked the same without rewriting their evidence history.
6. **Sender truthfulness:** every configured-custom-provider intermediate/degraded state holds/retries within TTL and
   expires without platform sender fallback; exact timing remains deferred.

### Verification

- dated decisions/classifications: `12/12`;
- target registry/composition: `57/57`;
- current route allocation: `150 actual = 150 references = 150 unique`;
- implementation contracts: `19 × 14`; dependency registry `19/19`, unknown `0`, cycles `0`;
- absent launch nodes: `U3A`, `U5C`, `U5D`, `U8A`, `U8B`, `U8C`; U10 depends only on launch-included stages;
- pre-ruling audit banners: `6/6`;
- initiative local Markdown links: `47/47`, missing `0`;
- `git diff --check`: PASS;
- documentation-only worktree; no app/schema/DB/runtime/DEV/TEST/PROD/delivery/deploy action; no commit/push.

**НАШЁЛ:** removing only U5C/U5D was insufficient: clinic staff invite `U3A/J2/MGMT-02` still sat on the U3B→U4→
U6B launch path. It was also removed from the initial DAG so the stated solo-first boundary is executable rather than
copy-only.

**ИЗМЕНИЛ:** converged authority, product contracts, screen/route reservations, journey scope, branding candidate
language, the 19-stage DAG and historical-audit self-description without changing ruling history or registry
denominators. Remaining risks are intentionally deferred product/engineering details, not hidden launch blockers.

## 2026-07-16 — Full independent owner-ruling convergence re-audit: FAIL

- **Run ID:** `SAAS-UX-OWNER-RULINGS-REAUDIT-20260716-799-FULL-02`.
- **Task:** taskdb `#799`.
- **Input convergence:** `SAAS-UX-OWNER-RULINGS-CONVERGENCE-20260716-799-01`.
- **Verdict:** **FAIL — original F1–F5 are closed, but a full non-spot re-audit found four additional active
  reconciliation defects outside that correction brief.** No current status is promoted to independently audited.
- **Runtime boundary:** docs-only audit. No app/schema/DB/runtime/DEV/TEST/PROD/delivery/deploy action, commit or
  push was performed.

The audit re-read the owner message and all 24 changed files, then checked current normative semantics rather than
assuming the previous five findings were the complete defect set.

### Requirement-by-requirement verdict

| Owner decision / contract                                                                                    | Verdict                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UX08-01 — one organization card; actual/scheduled visit visibility; own-first authorized history             | **PASS:** one card, visit relation, own-events default, record-class policy and permission-before-filter are consistently separated.                                                                                                                                                             |
| UX08-02 — reject primary/care-team/accept-reject/cross-org transfer lifecycle                                | **PASS:** no active launch lifecycle or state machine remains; U5C is an absent future placeholder for an ordinary clinic appointment concept only.                                                                                                                                              |
| UX08-03 — no assistant/receptionist launch role or grants                                                    | **FAIL по IA clarity:** roadmap and capability matrix correctly assign no grants, but `TARGET_IA.md` still presents Operations in the main authenticated workspace tree, Team in normal desktop staff navigation and an Assistant drawer rule without marking those navigation rows future-only. |
| UX08-04 — one login and distinct management/clinical destination; exact menu/switch is implementation choice | **PASS.**                                                                                                                                                                                                                                                                                        |
| UX08-05 — last-used organization + visible platform switcher; future org app pinned                          | **PASS.**                                                                                                                                                                                                                                                                                        |
| UX08-06 — landing/profile/booking/join; directory later                                                      | **FAIL по canonical requirements:** execution/IA correctly defer PUB-06, but `REQUIREMENTS.md` §3.1 still lists the directory conditionally “if it enters selected launch scope”, leaving a resolved choice looking pending.                                                                     |
| UX08-07 — paid-brand depth unresolved; no promise to hide BersonCare                                         | **FAIL:** launch tables now use P/O/F correctly, but `BRANDING_CAPABILITY_MATRIX.md` still exposes active resolver result `white_label_ready`; the owner explicitly did not select or understand that product tier.                                                                              |
| UX08-08 — custom domain/auth/org-specific app future-deferred; technology/effort/timing open                 | **PASS:** U8A/B are absent optional nodes and platform origin/app remains first.                                                                                                                                                                                                                 |
| UX08-09 — configured custom provider never falls back to platform sender; retry within TTL then expire/alert | **PASS:** email, SMS and U8C all preserve this direction without inventing numeric values.                                                                                                                                                                                                       |
| UX08-10 — no global-admin patient browsing or patient-record repair                                          | **FAIL:** PLAT-08 and U9 still place booking-account merge/name-match review and identity repair in the platform-admin shell; route map S26 moves two patient-profile merge tools there. This is patient data repair, not aggregate/org/platform diagnostics or code repair.                     |
| UX08-11 — manual patient + scheduled/walk-in visit before portal activation; verified identity links later   | **PASS:** U3B, PIN and booking flows preserve card/visit independently from delivery/proof/access and prevent duplicate linking.                                                                                                                                                                 |
| UX08-12 — current solo chat unchanged; future clinic topology configurable and absent from launch            | **FAIL по IA clarity:** U5D and composition are correctly absent/deferred, but `TARGET_IA.md` still states clinic `CLIN-07` uses “Organization queues and send scope”, selecting part of a topology the owner left open.                                                                         |
| Solo-first critical path                                                                                     | **PASS:** U3A/U5C/U5D/U8A/U8B/U8C are absent optional nodes; U3B/U4/U6B/U10 contain no reverse dependency on them. P3 contains only U5B.                                                                                                                                                         |
| Architecture compatibility                                                                                   | **PASS:** deferred screen/state IDs and future stage placeholders are retained without schema/API/UI work or launch completion boxes.                                                                                                                                                            |
| Historical evidence/status                                                                                   | **PASS:** six old audit files have internal pre-ruling supersession banners; prototype index/findings are historical; current canonical statuses still correctly await this audit.                                                                                                               |
| Open decisions                                                                                               | **PASS:** exactly five product areas remain open: brand depth; org-app feasibility/technology/timing; sender retry/TTL values; future assistant grants; future clinic communication topology. Other gaps are labelled engineering/security/data/commercial policy.                               |

### Consolidated findings

#### R1 — PLAT-08 still authorizes the rejected patient-data repair product

`TARGET_IA.md` PLAT-08, `SCREEN_COMPOSITION.md` PLAT-08, `ROUTE_MIGRATION_MAP.md` S26 and U9 still converge
`booking-merge` and `clients/name-match-hints` into platform `Identity and repair`. Source verification confirms these
are manual merge/name-overlap tools over patient platform profiles and links back to the patient list. The owner
explicitly rejected global-admin patient-record correction and required correctable patient data to be handled by
authorized patient/doctor product surfaces. Reclassify existing tools by actual actor/object ownership or retire the
platform destination; PLAT support may retain aggregate diagnostics/reports and code/system remediation only.

#### R2 — Deferred clinic/assistant topology still leaks into active target navigation

The implementation DAG is now correct, but `TARGET_IA.md` still has three active-looking navigation statements:

- the top product tree lists `Operations — assistant/delegated operational capability` without a future-only label;
- desktop staff navigation lists `Team` although MGMT-02/U3A are absent from initial release;
- mobile staff specifies an Assistant drawer as though the actor exists at launch.

The CLIN-07 clinic cell additionally selects `Organization queues`, while future clinic communication topology is
one of the five unresolved areas. Keep these as clearly labelled future placeholders and make the launch navigation
explicitly exclude them; do not remove the reserved IDs or future compatibility.

#### R3 — One selected white-label state remains in the current capability contract

`BRANDING_CAPABILITY_MATRIX.md` correctly replaced the old W tier with candidate-only F analysis everywhere except
the effective resolver result `organization_ready / white_label_ready`. This is current normative resolver language,
not a historical option. Rename it to neutral organization-presentation/readiness terminology or explicitly move it
under candidate-only future analysis. UX08-07 cannot expose a selected deep-brand state before the owner receives
and answers a plain-language question.

#### R4 — Resolved public-directory scope remains conditional in REQUIREMENTS

`REQUIREMENTS.md` §3.1 still says the public organization directory is included “if it enters the selected launch
scope”. UX08-06 already decided that it does not: landing/profile/booking/join are launch scope and directory is
later. Update the canonical requirement to the dated result so no downstream reader can reopen the resolved gate.

### Original convergence findings and full-scope checks

- **F1 authority:** closed. Dated UX ruling now follows repository/Foundation canon and outranks every derivative UX
  artifact.
- **F2 solo DAG:** closed. U3A/U5C/U5D/U8 are absent optional nodes and cannot block U10.
- **F3 rejected/candidate semantics:** closed for transfer hierarchy and concrete assistant grants; R2/R3 above are
  newly found IA/readiness wording residues.
- **F4 resolved-as-pending execution gates:** closed in the implementation roadmap; R4 is a remaining canonical
  requirements residue outside the prior roadmap-focused fix.
- **F5 audit history:** closed; banners are present 6/6 and prototype artifacts self-identify as pre-ruling.
- Manual patient creation, scheduled appointment, walk-in, optional invite, verified portal linking, multi-org
  context, sender failure, domain/app future scope and solo chat were re-read end-to-end and otherwise match the
  dated owner outcomes.

### Mechanical and repository evidence

- Owner decisions: `12/12` dated headings; packet questions `12/12` unique with dated classifications.
- Target registry/composition: `57/57`, missing/extra/duplicate `0`.
- Current route allocation: `150 actual = 150 references = 150 unique`, missing/stale/duplicate `0`.
- Implementation roadmap: `19` stages, each `14/14` required fields; direct dependency registry `19/19`, cycle
  `0`, unknown dependency `0`, topological coverage `19/19`.
- Absent optional launch nodes confirmed: `U3A`, `U5C`, `U5D`, `U8A`, `U8B`, `U8C`; U10 explicitly excludes them.
- Initiative local Markdown links: `47`, missing `0`.
- Historical audit banners: `6/6`.
- `git diff --check`: PASS before this audit record.
- Pre-audit HEAD: `223ff8b9a`; shared merge-base with `origin/feat/doctor-ui-rebuild` is `9a0d5da41`.
  Integration is eight commits ahead, but the four orchestration-canon files have no delta. All current worktree
  changes remain under `docs/`; future implementation must consume newer Foundation/runtime evidence through U0.
- Code-search plus focused source/doc read confirmed that `booking-merge` and `name-match-hints` perform manual
  platform-user/profile merge and expose patient-list navigation; this supports R1 rather than inferring it from a
  route name alone.
- App tests, lint, typecheck, build, DB smoke and full CI were not run because the audit changed no application or
  runtime behavior.

### Residual open decisions

Exactly five remain intentionally unresolved and must not be filled during correction:

1. plain-language paid organization-brand depth and BersonCare visibility;
2. organization-specific app feasibility, PWA/APK/native technology, order and timing;
3. custom-provider retry cadence, TTL, attempts and retention values;
4. future assistant/receptionist grants;
5. future clinic communication topology.

**НАШЁЛ:** the convergence made the solo launch graph executable and closed F1–F5, but a full fresh audit found four
additional active inconsistencies: patient-profile repair in PLAT, future clinic UI in current navigation, one
`white_label_ready` result and a conditional directory requirement.

**ИЗМЕНИЛ:** only this re-audit section in existing `LOG.md`. Per FAIL protocol, no status, ruling, packet, roadmap,
application, DB/runtime state, commit or push was changed.

## 2026-07-16 — Integrated correction after owner-ruling full re-audit FAIL-02

- **Run ID:** `SAAS-UX-OWNER-RULINGS-CONVERGENCE-20260716-799-02`.
- **Task:** taskdb `#799`.
- **Input audit:** `SAAS-UX-OWNER-RULINGS-REAUDIT-20260716-799-FULL-02`.
- **Status:** integrated correction complete; **awaiting a new full independent re-audit**. This correction does not
  promote any UX stage or initiative status.
- **Runtime boundary:** documentation only. No app/schema/DB/runtime/DEV/TEST/PROD/delivery/deploy action, commit or
  push was performed.

### Integrated corrections

1. **Global-admin boundary:** `PLAT-08` is now aggregate identity-integrity/system-failure diagnostics only.
   Existing booking-profile merge and name-match pages are explicitly retired/reclassified instead of moved into
   platform administration. No patient browse, profile lookup, merge mutation or schema was invented. A future
   correction flow, if needed, requires a separately reviewed patient/specialist authorization contract.
2. **Launch topology:** Operations, Team, clinic coordination and assistant destinations remain reserved IDs but are
   explicitly absent from initial desktop/mobile navigation and U10 implementation acceptance. `CLIN-07` preserves
   the current solo-specialist chat; no organization queue or clinic routing topology is selected.
3. **Brand wording:** the active `white_label_ready` resolver result was removed. The neutral
   `organization_presentation_ready` result covers only approved organization identity/assets and explicitly makes
   no promise to hide BersonCare or deliver a selected deep-brand tier.
4. **Public launch scope:** canonical requirements now state the resolved bundle: specialist-first platform landing,
   published organization profiles, booking and trusted join. Directory/search is later and absent from launch.
5. **Open-decision register:** the dated ruling now exposes exactly five areas: brand depth; organization-specific
   app/custom-origin feasibility, technology, order and timing; custom-sender retry/TTL values; future assistant
   grants; future clinic communication topology.

### Files changed by this correction

- `TARGET_IA.md`
- `SCREEN_COMPOSITION.md`
- `ROLE_CAPABILITY_MATRIX.md` (rechecked; no additional edit required)
- `ROUTE_MIGRATION_MAP.md`
- `IMPLEMENTATION_ROADMAP.md`
- `REQUIREMENTS.md`
- `BRANDING_CAPABILITY_MATRIX.md`
- `BRANDING_DOMAIN_CONTRACT.md`
- `OWNER_RULINGS_2026-07-16.md`
- `LOG.md`

### Validation

- Owner packet/rulings: `12/12` unique UX08 decisions in each source.
- Target registry/composition: `57/57`, missing/extra/duplicate `0`.
- Current route allocation: `150 actual = 150 references = 150 unique`, missing/stale/duplicate `0`.
- Implementation roadmap: `19` stages; `19 × 14` required fields present (including singular `Decision gate` in
  U7); direct dependency registry `19/19`, cycle `0`, unknown dependency `0`, topological coverage `19/19`.
- Absent optional launch nodes remain `U3A`, `U5C`, `U5D`, `U8A`, `U8B`, `U8C`; U10 additionally names deferred
  `MGMT-02` among registry-only launch-absence surfaces.
- Residual product areas: exactly `5`, matching the list above.
- Initiative local Markdown links: `47`, missing `0`.
- Focused adjacent contradiction search found no active `white_label_ready`, conditional directory requirement,
  launch organization queue/assistant drawer, or PLAT patient-repair destination outside preserved audit history and
  current-state inventory evidence.
- `git diff --check`: PASS before this log record; rerun required after it.
- App tests, lint, typecheck, build, DB smoke and full CI were not run because this is a docs-only correction.

### Residuals carried to full re-audit

- The five product areas above intentionally remain unresolved; correction must not fill them.
- Existing current-state inventory still documents the rejected merge/name-match pages as evidence of what must be
  retired/reclassified. It is not target authorization.
- No UX stage is accepted or independently PASS until the next full re-audit checks the whole corrected canon.

**НАШЁЛ:** all four FAIL-02 blockers were active wording/topology residues, not a need for another patient-repair
product, clinic role implementation, directory branch or brand tier.

**ИЗМЕНИЛ:** corrected the existing canonical sources in one integrated pass, preserved the `57/57` and `150/150`
denominators and the solo-first DAG, and left the initiative waiting for a full independent re-audit.

## 2026-07-16 — Full independent owner-rulings re-audit after convergence-02

- **Run ID:** `SAAS-UX-OWNER-RULINGS-REAUDIT-20260716-799-FULL-03`.
- **Input correction:** `SAAS-UX-OWNER-RULINGS-CONVERGENCE-20260716-799-02`.
- **Scope:** owner message → dated rulings → requirements/operating model/journeys/branding → role matrix/IA/screen
  composition/routes → all 19 implementation stages, DAG, final acceptance and historical-audit banners.
- **Verdict:** **PASS**. The corrected canon traces all twelve owner outcomes without adding clinic-only launch work,
  patient-level global-admin intervention or an unapproved branding/app promise.
- **Runtime boundary:** documentation only. No application/schema/DB/runtime/DEV/TEST/PROD/delivery/deploy action,
  commit or push was performed.

### Full 12/12 semantic trace

| Owner outcome                                                                                                                            | Full re-audit result                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX08-01 — one organization card; visit-based visibility; own events by default; authorized all/specialist filters; no primary specialist | **PASS:** requirements, operating model, role matrix, CLIN-02/03/04 and U5B preserve permission-before-filter and record-class boundaries.                      |
| UX08-02 — no handoff/care-team/accept-reject/cross-org lifecycle; another specialist becomes related through an ordinary visit           | **PASS:** no launch state machine or navigation exists; CLIN-05/U5C are absent future reservations and do not block U10.                                        |
| UX08-03 — no assistant/receptionist at launch; future grants open                                                                        | **PASS:** OPS IDs remain registry-only; no launch principal, route, drawer, Team flow or acceptance dependency is introduced.                                   |
| UX08-04 — one login, distinct management/clinical surfaces; menu page or switch is implementation choice                                 | **PASS:** MGMT/CLIN capability separation is explicit and no-binding owner/admin cannot enter clinical work.                                                    |
| UX08-05 — platform app last active org + visible switcher/chooser; future org app pinned                                                 | **PASS:** resolver, journeys, PAT-01/02 and U5A agree; PWA/APK/native remains unselected.                                                                       |
| UX08-06 — landing + published organization profile + booking + join; directory later                                                     | **PASS:** PUB-06 is absent from launch navigation and U6A/U6B/U10; no conditional directory blocker remains.                                                    |
| UX08-07 — branding depth/platform visibility unresolved; no deep-rebrand promise                                                         | **PASS:** active resolver uses neutral `organization_presentation_ready`; no `white_label_ready` or promise to hide BersonCare remains.                         |
| UX08-08 — future organization-specific domain/auth/app direction, not initial release                                                    | **PASS:** U8A/U8B are absent optional stages; feasibility, technology, order and timing remain open.                                                            |
| UX08-09 — configured custom provider never falls back to platform sender; retry only within TTL, then expire; owner alert                | **PASS:** email/SMS sender contracts and U8C preserve no-fallback/TTL/alert behavior; exact values remain open.                                                 |
| UX08-10 — global admin gets aggregate/org/platform diagnostics only, never patient browse/merge/repair                                   | **PASS:** PLAT-08/09 and U9 exclude patient lists, profile lookup, merge, name-match review, session and record mutation; old pages are retire/reclassify only. |
| UX08-11 — staff creates card + scheduled/walk-in visit before optional portal activation                                                 | **PASS:** J3/PIN, CLIN-02/03 and U3B separate relationship, delivery, verified identity and portal linking.                                                     |
| UX08-12 — current solo chat unchanged; future clinic topology configurable and deferred                                                  | **PASS:** PAT-05/CLIN-07 preserve current solo behavior; U5D/OPS-04 are absent future reservations with no queue/routing model selected.                        |

### Cross-contract and mechanical evidence

- Owner ruling headings: `12/12`, unique. Residual product areas: exactly `5`.
- Canonical target registry/composition: `57/57`; the only additional IA references are explicitly non-canonical
  `OPS-05` and `ORG-PUB-04` aliases; missing/extra canonical compositions `0`.
- Current route allocation: `150 actual = 150 references = 150 unique`; missing/stale/duplicate `0`.
- Implementation roadmap: `19` stages × `14` required contract fields = `266/266`; normative DAG `19/19`, unknown
  dependencies `0`, cycle `0`, topological coverage `19/19`.
- Initial-release DAG excludes optional `U3A`, `U5C`, `U5D`, `U8A`, `U8B`, `U8C`; U10 explicitly accepts deferred
  `PUB-06`, `MGMT-02`, `CLIN-05`, `OPS-01…04` and U8 surfaces by absence, not implementation.
- Initiative Markdown local links: `47`, missing `0`.
- Focused contradiction search found no active patient-repair PLAT destination, assistant/team launch destination,
  clinic message queue, conditional directory launch gate or `white_label_ready`. Matches in dated alternatives,
  current-state inventories and pre-ruling audit/prototype records are explicitly historical/superseded.
- Post-edit validation rerun: `git diff --check` PASS; `12/12`, `57/57`, `150/150`, `19 × 14`, DAG `19/19`
  acyclic, and `47` local links with missing `0` all remained green after status/log edits.
- Merge base with `origin/feat/doctor-ui-rebuild`: `9a0d5da413fba50cdbbe9243081badc32a4618bd`; integration branch is
  eight commits ahead. `AGENTS.md`, `CLAUDE.md`, `docs/AGENT_AUTORUN_SCHEME.md` and
  `docs/ORCHESTRATION_BINDINGS.md` have no work3 delta from the shared merge base.
- App tests, lint, typecheck, build, DB smoke and full CI were not run because this pass is documentation-only.

### Status updates made after PASS

Only the existing status surfaces were updated:

- `OWNER_RULINGS_2026-07-16.md`
- `OWNER_DECISION_PACKET.md`
- `README.md`
- `ROADMAP.md`
- `IMPLEMENTATION_ROADMAP.md`
- `LOG.md`

Historical UX-03…07/09 audit and prototype records remain source-bound/superseded; their old PASS bodies were not
rewritten into current evidence. Implementation remains not started.

### Intentionally open — exactly five areas

1. plain-language paid organization-brand depth and BersonCare visibility;
2. organization-specific app/custom-origin feasibility, PWA/APK/native technology, order and timing;
3. custom-provider retry cadence, TTL, attempt and retention values;
4. future assistant/receptionist grants;
5. future clinic communication topology.

**НАШЁЛ:** convergence-02 closed all four FAIL-02 blockers across the full current contract. No new blocker or
adjacent semantic drift was found; the five unresolved areas remain correctly deferred and do not block solo launch.

**ИЗМЕНИЛ:** appended this full independent PASS record and promoted only the five existing current-status documents
listed above from `awaiting audit` to independently audited. No product semantics, application/runtime state,
historical audit verdict, commit or push was changed.

## 2026-07-16 — taskdb #802: remaining launch gates closed; integrated clarification pass awaiting audit

**Run ID:** `SAAS-UX-OWNER-CLARIFICATION-INTEGRATED-20260716-802-01`

**Роль:** integrated documentation correction owner.
**Статус:** correction complete; **awaiting one full independent audit**. Historical
`SAAS-UX-OWNER-RULINGS-REAUDIT-20260716-799-FULL-03` PASS and every earlier audit banner remain unchanged evidence
for the versions they inspected; they are not a seal for this clarification pass.

### Owner clarification integrated

1. **Launch gate register:** solo-first roadmap now has `0` pending owner product decisions. The previous “exactly
   five open areas” record immediately above is historical and superseded by this dated clarification; it was not
   rewritten because audit/history records remain immutable.
2. **Paid full branding:** future branded organization surface uses either the organization's own domain or a
   platform subdomain. Organization name/logo replace product-facing platform branding on that surface. The common
   application layout/theme/design is retained; per-clinic design customization is not planned. BersonCare remains
   the platform/personal brand outside a paid fully branded org surface, and legal/support/security disclosure stays
   where required without inventing exact legal copy.
3. **Generated organization PWA:** initial clinic/staff product is the platform web app and may be installable as a
   desktop PWA. A later branded/business tier may automatically generate a pinned organization PWA manifest/name/
   icons from verified domain or subdomain plus org name/logo settings. A separate organization-branded native app
   is outside current scope; store publication, developer-account ownership, cost/time and the broader native-client
   direction are non-blocking research backlog.
4. **Custom sender engineering policy:** no patient/user message falls back to the platform sender after a custom
   provider is configured. SMTP enhanced `4xx` is transient and `5xx` permanent; HTTP/SMS retries timeout, `429`
   with `Retry-After`, and `500/502/503/504`. Defaults are bounded `1m/5m/15m` submission retries with jitter, stable
   `delivery_id`/dedupe, unhealthy circuit after three systemic failures (or immediately for permanent
   config/auth failure), one owner alert, at most daily reminder and recovery notice. Every attempt is bounded by
   class-specific `expires_at`; expired never sends. Defaults: OTP 10m one-use, magic link 30m, invite email delivery
   24h/token 7d, appointment/reminder no later than the relevant slot or appointment, marketing 24h/campaign window,
   delivery metadata without clinical content 90d subject to legal/contract override. Standards versus product
   defaults are explicitly separated in `BRANDING_DOMAIN_CONTRACT.md` §7.1 with official RFC/NIST/Twilio/AWS/Azure
   sources.
5. **Excluded future clinic design:** assistant/receptionist grants and clinic communication topology are only
   architecture reservations/backlog. They are not current questions, current development scope or launch gates.

### Existing files changed in one integrated pass

- `OWNER_RULINGS_2026-07-16.md`, `OWNER_DECISION_PACKET.md`, `README.md`, `REQUIREMENTS.md`, `ROADMAP.md`,
  `IMPLEMENTATION_ROADMAP.md`;
- `OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md`;
- `BRANDING_DOMAIN_CONTRACT.md`, `BRANDING_CAPABILITY_MATRIX.md`;
- `TARGET_IA.md`, `SCREEN_COMPOSITION.md`, `SCREEN_INVENTORY_PATIENT_PUBLIC.md`, `ROUTE_MIGRATION_MAP.md`;
- this existing `LOG.md`.

No new document, application code, schema, DB, runtime, TEST/prod, commit or push action was created by this pass.

### Mechanical validation before independent audit

- owner rulings/packet: `12/12` dated decisions, launch pending owner gates `0`;
- canonical target registry/composition: `57/57`, missing `0`;
- current route allocation: `150 actual = 150 references = 150 unique`, missing/stale `0`;
- implementation stages: `19 × 14 = 266/266` required fields;
- normative dependency registry: `19/19`, unknown dependencies `0`, cycle `0`;
- initiative local Markdown links: `47`, missing `0`;
- focused active-contract search: no current “five owner decisions open”, unresolved paid-brand depth,
  PWA/APK/native choice, assistant grant gate or clinic-communications gate; historical audit/research text remains
  intentionally source-bound;
- `git diff --check`: PASS.

App tests, lint, typecheck, build, DB smoke and full CI were not run: this is documentation-only product/engineering
policy reconciliation. The next valid action is one independent full cross-contract re-audit, not implementation.

### Residual non-blocking future research

- separate organization-branded native app feasibility: stores, publisher/developer-account ownership, cost/time and
  public distribution;
- future clinic assistant/receptionist role and permissions, only when clinic product scope is activated;
- future multi-specialist clinic communication topology, only when that product scope is activated.

These items do not block the solo-first roadmap and are not waiting for an owner answer now. Their future product
design is deliberately not claimed complete.

**НАШЁЛ:** the previous final response incorrectly presented five non-launch items as questions still requiring
owner answers. Three are now resolved contracts/policies (brand boundary, generated PWA direction, sender
engineering defaults), while assistant/clinic communications and native-org-app details are explicitly out of
current scope.

**ИЗМЕНИЛ:** removed that false current gate register across the existing canon, preserved 12-ruling history and
prior audit evidence, kept all numeric registries/DAG intact, and set the current initiative status to awaiting a
new independent audit.

## 2026-07-16 — taskdb #802: full independent clarification audit

**Run ID:** `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-01`

**Input correction:** `SAAS-UX-OWNER-CLARIFICATION-INTEGRATED-20260716-802-01`.

**Role:** independent full cross-contract auditor; not the author of the integrated correction.

**Verdict:** **FAIL**. The clarification pass correctly closes the false five-question launch register and preserves
the original discovery deliverables, but the current contract still contains three related semantic drifts and one
stale provenance wording cluster. Current status surfaces must remain `awaiting full independent audit`; this run is
not an implementation seal and authorizes no application, schema, DB, runtime, DEV/TEST/PROD, delivery, deploy,
commit or push action.

### Full acceptance result

| Requirement                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original planning objective and runtime boundary | **PASS:** UX-04…09 outputs, owner packet and implementation roadmap remain complete as planning artifacts; every current status surface still says implementation has not started.                                                                                                                                                                                                                                                                                                    |
| Solo-first owner gate register                   | **PASS:** `UX08-01…12` remain 12 unique dated outcomes and current launch pending owner product gates are `0`. Assistant grants, clinic communications and native-org-app details are non-launch backlog, not launch acceptance dependencies.                                                                                                                                                                                                                                         |
| Paid organization branding — selected scope      | **PARTIAL / FAIL:** own domain **or** platform subdomain, org name/logo replacing product-facing branding and shared layout/design are consistent. However several current contracts additionally freeze visible platform/operator/legal/support/security disclosure on the fully branded surface although the owner did not rule that presentation; see F1.                                                                                                                          |
| Generated organization PWA                       | **PARTIAL / FAIL:** future paid generated manifest/name/icons, organization pinning, platform-web-first launch and native-org-app research-only scope are present. Three active phrases still describe the approved web capability as awaiting feasibility/separate approval; see F2.                                                                                                                                                                                                 |
| Custom-sender failure policy                     | **PARTIAL / FAIL:** no platform fallback, expiry terminality, SMTP/HTTP classification, bounded jitter/idempotency, `1m/5m/15m`, circuit threshold `3`, class TTLs and 90-day metadata default are present and standards are distinguished from configurable product defaults. Cross-surface fallback/alert wording and the direct-SMTP retry layer remain ambiguous; see F3.                                                                                                         |
| Earlier 12 outcomes                              | **PASS:** one org card, visit-based specialist visibility, own-first authorized history, no primary/care-team/handoff lifecycle, one-login management, last-org switcher, landing/profile/booking/join, no patient-level global-admin repair, manual patient+scheduled/walk-in visit, later identity linking and unchanged solo chat are preserved.                                                                                                                                   |
| Historical audit/status discipline               | **PASS with F4 wording correction required:** `FULL-03` remains clearly historical and current surfaces await this audit. Historical options/audits are retained, but several packet provenance lines still use present-tense `pending/open` labels for decisions now ruled.                                                                                                                                                                                                          |
| Roadmap independence from future backlog         | **PASS:** U10 depends only on launch-included audited stages; `U3A`, `U5C`, `U5D`, `U8A`, `U8B`, `U8C` are absent optional nodes and cannot block initial acceptance.                                                                                                                                                                                                                                                                                                                 |
| Mechanical registries and repository relation    | **PASS:** `12/12`; canonical composition `57/57`; current pages `150 actual = 150 referenced = 150 unique`, missing/stale/duplicate `0`; 19 unique stages with the established 14-field synonym contract; dependency registry `19/19`, unknown/cycle `0`; 47 local Markdown links, missing `0`; `git diff --check` PASS. Integration and work3 both currently enumerate the same 150 page paths; the four orchestration canon files have no work3 delta from their shared merge base. |

### Consolidated correction brief

#### F1 — invented visible platform/legal disclosure freeze on a fully branded organization surface

The owner selected complete replacement of **product-facing** brand identity on the paid org surface and explicitly
said not to customize layout/design. The clarification did not decide which operator name/logo must be visibly shown
inside legal, support or security UI. Current text promotes an auditor/planner assumption into the owner ruling:

- `OWNER_RULINGS_2026-07-16.md` UX08-07 says legal/support/security disclosure is preserved;
- `OWNER_DECISION_PACKET.md` UX08-07 and its upstream registry repeat required disclosure as the selected result;
- `BRANDING_DOMAIN_CONTRACT.md` §§2, 5, 5.1, 8 and its surface tables require platform attribution/identity/operator
  disclosure on the full branded origin;
- `BRANDING_CAPABILITY_MATRIX.md` full-brand rows promise legal/platform identity disclosure;
- `REQUIREMENTS.md`, `TARGET_IA.md`, `SCREEN_COMPOSITION.md` and `ROUTE_MIGRATION_MAP.md` inherit that visible-brand
  constraint.

**Required integrated correction:** preserve reachable account recovery, technical support and legally required
information as functions/invariants, but do not claim an owner ruling that BersonCare/platform branding must be
visibly retained on the paid fully branded surface. Mark controller/operator wording and exact disclosure/presentation
as later legal/compliance implementation work. Do not weaken security/recovery availability and do not invent exact
legal copy.

#### F2 — approved generated PWA is still phrased as unresolved feasibility/separate approval

The owner approved a future paid organization PWA that may be generated from verified domain/subdomain, org name,
logo and manifest settings; it is post-launch work, not an unresolved product feasibility question. Active text still
says otherwise:

- `TARGET_IA.md` published-organization section says custom-domain app depth “waits for feasibility”;
- `ROUTE_MIGRATION_MAP.md` migration order says to defer custom-domain app depth “pending feasibility”;
- `BRANDING_DOMAIN_CONTRACT.md` §5.5 says the future org-specific patient app applies “if separately approved”.

**Required integrated correction:** replace those phrases with `approved future capability; absent until future
commercial/implementation activation and readiness`. Keep separate organization-native mobile application feasibility
(stores, publisher accounts, publication, cost/time) as research-only and outside the roadmap.

#### F3 — sender policy is not yet one unambiguous cross-surface contract

The central email/SMS sections correctly prohibit user-message platform fallback after custom-provider configuration,
but adjacent active text is weaker or ambiguous:

1. `BRANDING_DOMAIN_CONTRACT.md` §5 SMS surface still gives canonical fallback as `Platform sender or no-send per
policy`; it must explicitly say platform sender is unavailable once the organization custom provider is
   configured. The capability matrix should use the same conditional wording.
2. Operational incident routing is explicit only for registered owner/solo account email. The management UI exposes
   status/remediation, but the contract does not explicitly require the corresponding in-app incident/status alert.
   State both account-email and in-app management notification, with one initial alert, at most daily reminder and
   recovery notice.
3. `1m/5m/15m` is called a submission default immediately after SMTP `4xx` classification. RFC 5321 recommends a
   materially longer MTA destination retry cadence. Clarify that `1m/5m/15m` is the BersonCare application→provider
   **pre-acceptance/API submission** schedule. A direct SMTP `4xx`/MTA queue must use the configured SMTP/provider
   cadence (RFC guidance by default), still capped by the business `expires_at`. Provider-accepted delivery is never
   resubmitted; the existing stable delivery id/provider-id dedupe rule remains.

The source audit supports the remaining mechanics: RFC 3463 classifies `4.x.x` as persistent transient and `5.x.x`
as permanent; RFC 5321 §4.5.4.1 distinguishes configurable SMTP queue retry/give-up timing; Twilio documents retryable
`429` with backoff/`Retry-After`, `500/502/503/504`, and terminal queued-message validity; AWS supports bounded
backoff+jitter/idempotency; Azure supports thresholded circuit states; NIST supports one-use authentication within
10 minutes. The numeric `1m/5m/15m`, threshold `3`, non-OTP TTLs and 90-day metadata retention remain explicitly
configurable product defaults, not standards mandates.

#### F4 — present-tense historical provenance can look like a reopened gate

`OWNER_DECISION_PACKET.md` correctly preserves all original questions/options, but UX08-07/08 still cite `pending
BD-*` and UX08-09 says the fallback policy “осталась открытой” without an immediate historical qualifier. These
phrases conflict with the current zero-gate result when read outside the surrounding chronology.

**Required integrated correction:** keep the 12 alternatives intact, but label those source lines explicitly
`historical pre-ruling basis (superseded)`. Do not rewrite or delete historical audit bodies in `LOG.md` or the prior
independent audit files.

### Files and evidence inspected

All 17 changed files were read against the latest owner clarification and the previous `FULL-03`/correction history:

- `BRANDING_CAPABILITY_MATRIX.md`, `BRANDING_DOMAIN_CONTRACT.md`, `ENTRY_AND_INVITE_JOURNEYS.md`,
  `IMPLEMENTATION_ROADMAP.md`, `LOG.md`, `OPERATING_MODEL.md`, `OWNER_DECISION_PACKET.md`,
  `OWNER_RULINGS_2026-07-16.md`, `README.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `ROLE_CAPABILITY_MATRIX.md`,
  `ROUTE_MIGRATION_MAP.md`, `SCREEN_COMPOSITION.md`, `SCREEN_INVENTORY_PATIENT_PUBLIC.md`, `TARGET_IA.md`,
  `UX04_SCREEN_STATE_LIST.md`.

Primary-source verification: RFC 3463, RFC 5321 §4.5.4.1, Twilio REST retry/error and Message
`validity_period` documentation, AWS Well-Architected retry guidance, Azure Circuit Breaker and NIST SP 800-63B.
Commands/checks: current `git diff`/`git diff --check`; focused contradiction searches; independent Node registry,
route, stage and local-link checks; integration/work3 page-path comparison and orchestration-canon diff check.

App tests, lint, typecheck, build, DB smoke and full CI were not run because this is a documentation-only audit.

### Residual non-blocking backlog after correction

- separate organization-branded native application feasibility: stores, publisher/developer-account ownership,
  publication model, cost and time;
- future assistant/receptionist role and grants only when clinic product scope is activated;
- future multi-specialist clinic communication topology only when that product scope is activated.

These are neither current owner questions nor initial-launch dependencies. No application/runtime work should begin
from this audit; first perform one integrated documentation correction for F1–F4, then one full independent re-audit
of the whole current contract.

**НАШЁЛ:** three connected contract drifts plus one stale provenance cluster; no registry/DAG/route/link regression
and no loss of the earlier 12 owner outcomes.

**ИЗМЕНИЛ:** appended this FAIL record to the existing log only. No current PASS/awaiting status surface, product
contract, application/runtime file, task state, commit or remote branch was changed.

## 2026-07-16 — taskdb #802: integrated correction after full clarification audit

**Run ID:** `SAAS-UX-OWNER-CLARIFICATION-CORRECTION-20260716-802-02`.

**Input audit:** `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-01` (**FAIL**).

**Status:** F1–F4 correction complete; the initiative remains `awaiting full independent audit`. This correction is
not a PASS seal and authorizes no implementation, schema, DB, runtime, DEV/TEST/PROD, delivery, deploy, commit or
push action.

### Integrated corrections

- **F1 — fully branded presentation:** removed the invented requirement to keep visible BersonCare/platform brand
  inside a paid fully branded organization surface. Account recovery, support and legally/security-required
  information remain reachable functions; exact controller/operator identity, copy and visible presentation are
  deferred to applicable legal, contract and security review.
- **F2 — generated organization PWA:** recorded it consistently as an approved post-launch capability generated
  from verified organization domain/subdomain, name, logo and manifest settings after commercial activation and
  technical readiness. Only a separate organization-branded native application remains research-only.
- **F3 — custom sender:** made the no-fallback rule channel-exact: configured custom email forbids platform email,
  and configured custom SMS forbids platform SMS, for patient/user delivery. The contract now separates
  application-to-provider pre-acceptance `1m/5m/15m` retries from direct SMTP/MTA cadence, caps both with business
  `expires_at`, forbids resubmitting provider-accepted delivery, records ambiguous post-`DATA` SMTP outcome as
  `unknown`, deduplicates callbacks/provider IDs, and requires an in-app plus platform service-email owner incident
  without patient content, with at most daily reminder and recovery notice.
- **F4 — provenance:** retained every original question, option and prior audit, but labeled old `pending/open` and
  `UX-09 до ответа` wording as historical pre-ruling material (`superseded`) so it cannot be read as a current gate.

### Existing files reconciled

The correction stays within the same 17 initiative files: `BRANDING_CAPABILITY_MATRIX.md`,
`BRANDING_DOMAIN_CONTRACT.md`, `ENTRY_AND_INVITE_JOURNEYS.md`, `IMPLEMENTATION_ROADMAP.md`, this `LOG.md`,
`OPERATING_MODEL.md`, `OWNER_DECISION_PACKET.md`, `OWNER_RULINGS_2026-07-16.md`, `README.md`, `REQUIREMENTS.md`,
`ROADMAP.md`, `ROLE_CAPABILITY_MATRIX.md`, `ROUTE_MIGRATION_MAP.md`, `SCREEN_COMPOSITION.md`,
`SCREEN_INVENTORY_PATIENT_PUBLIC.md`, `TARGET_IA.md` and `UX04_SCREEN_STATE_LIST.md`. No new document was created.

### Validation before independent re-audit

- owner decision packet: `12/12` unique outcomes, duplicates `0`, current launch owner gates `0`;
- canonical screen composition: `57/57`, duplicates `0`;
- current route allocation: `150 actual = 150 references`, missing/stale `0`;
- implementation roadmap: `19/19` stages and `266/266` required fields;
- dependency registry: `19/19`, unknown dependencies `0`, cycle `0`;
- initiative local Markdown links: `47`, missing `0`;
- focused current-contract searches found no active unresolved generated-PWA feasibility wording, no mandatory
  visible platform brand on a fully branded surface, no unqualified reopened `pending/open` owner gate and no
  ambiguous generic custom-sender fallback phrase; historical FAIL/audit wording remains preserved in this log;
- `git diff --check`: PASS.

Application tests, lint, typecheck, build, DB smoke and full CI were not run because this is a documentation-only
contract correction. The next valid action is one independent full cross-contract re-audit of the entire current
package.

**НАШЁЛ:** the failed audit identified four real cross-document consistency defects, not missing owner answers or an
application defect.

**ИЗМЕНИЛ:** reconciled F1–F4 across the existing product, IA, journey, branding and implementation contracts while
preserving the audit trail and all numeric registries. Current status remains awaiting independent re-audit.

## 2026-07-16 — taskdb #802: full independent re-audit after clarification correction

**Run ID:** `SAAS-UX-OWNER-CLARIFICATION-REAUDIT-20260716-802-FULL-02`.

**Input correction:** `SAAS-UX-OWNER-CLARIFICATION-CORRECTION-20260716-802-02`.

**Verdict:** **PASS**. The complete current owner message, all 17 changed initiative documents, the dated ruling
registry, implementation roadmap, sender policy and previous FAIL/correction trail were re-read as one contract.
F1–F4 are closed without adding a new owner decision. Solo-first launch has `0` pending owner product decisions.
This is a documentation/planning seal only: implementation has not started, and this run authorizes no application,
schema, DB, runtime, DEV/TEST/PROD, delivery, deploy, commit or push action.

### Closure of the previous findings

| Finding                                               | Independent result                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 — visible platform/legal disclosure freeze         | **CLOSED:** fully branded organization surfaces no longer promise mandatory visible BersonCare/platform branding. Recovery/support and legally/security-required information remain reachable functions; exact parties, copy and presentation are left to later applicable legal/contract/security review.                                                                                                                   |
| F2 — generated organization PWA treated as unresolved | **CLOSED:** generated organization PWA is consistently an approved post-launch capability activated after future commercial/implementation readiness. Only the separate organization-branded native application remains research-only.                                                                                                                                                                                       |
| F3 — custom-sender ambiguity                          | **CLOSED:** custom email and custom SMS each prohibit same-channel platform fallback for patient/user delivery; owner incident is in-app plus platform service email without patient content; application-to-provider pre-acceptance retry is separated from direct SMTP/MTA cadence; `expires_at`, provider-acceptance non-resubmission, post-`DATA` `unknown` reconciliation and callback/provider-ID dedupe are explicit. |
| F4 — historical `pending/open` wording                | **CLOSED:** original questions/options remain intact, but their pre-ruling `pending/open` and `UX-09 до ответа` labels are explicitly historical and `superseded`, so they cannot reopen a current gate.                                                                                                                                                                                                                     |

### Full contract acceptance

- `UX08-01…12`: `12/12` unique dated outcomes; duplicates `0`; current launch owner gates `0`.
- Earlier product decisions remain intact: one organization card, visit-based specialist visibility, own-events
  default with authorized history filters, no primary/care-team/handoff lifecycle, one-login management, last-used
  organization plus switcher, landing/profile/booking/join, no global-admin patient browsing/repair, manual
  patient/card plus scheduled or walk-in visit before optional portal activation, and unchanged solo chat.
- Solo-first boundary is explicit. Assistant/receptionist, multi-specialist clinic coordination and clinic
  communication topology are future-only reservations, not launch UI, implementation scope or owner gates.
- Paid branding is consistently own domain or platform subdomain plus organization name/logo on a shared product
  layout. Platform web comes first; generated organization PWA is post-launch; native organization app is outside
  the roadmap.
- Sender transport rules remain engineering configuration rather than invented owner decisions. RFC 3463 supports
  transient `4.x.x` versus permanent `5.x.x`; RFC 5321 §4.5.4.1 supports a separately configurable SMTP queue
  cadence; Twilio supports bounded retry for `429`/`Retry-After` and selected `5xx` plus terminal validity; AWS and
  Azure support bounded backoff/idempotency and circuit-breaker patterns; NIST supports one-use authentication
  within ten minutes. Numeric `1m/5m/15m`, threshold `3`, non-OTP TTLs and 90-day delivery-metadata retention remain
  explicitly labelled configurable BersonCare defaults, not standards mandates.
- Roadmap execution remains independent of deferred nodes: `U3A`, `U5C`, `U5D`, `U8A`, `U8B` and `U8C` are absent
  optional nodes and are not U10 dependencies.

### Mechanical and repository evidence

| Check                              | Result                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner decisions                    | `12/12`, unique `12`, duplicate `0`                                                                                                                                                                                             |
| Target screen registry/composition | `57/57`, missing `0`                                                                                                                                                                                                            |
| Current route allocation           | `150 actual = 150 referenced = 150 unique`; missing/stale/duplicate `0`                                                                                                                                                         |
| Implementation stage contract      | `19 × 14 = 266/266`; missing fields `0`                                                                                                                                                                                         |
| Normative dependency registry      | `19/19`; unknown dependencies `0`; cycles `0`                                                                                                                                                                                   |
| Initiative-local Markdown links    | `47`; missing `0`                                                                                                                                                                                                               |
| Whitespace/patch integrity         | `git diff --check` PASS                                                                                                                                                                                                         |
| Scope                              | exactly 17 changed files, all under this initiative; no application, migration, DB, runtime or orchestration-canon delta                                                                                                        |
| Integration relation               | work3 and `origin/feat/doctor-ui-rebuild` enumerate the same 150 `page.tsx` paths; `AGENTS.md`, `CLAUDE.md`, `docs/AGENT_AUTORUN_SCHEME.md` and `docs/ORCHESTRATION_BINDINGS.md` have no work3 delta from the shared merge base |

Application tests, lint, typecheck, build, DB smoke and full CI were not run because this was a documentation-only
independent audit. The relevant validation is the complete contract/registry/link/DAG/diff suite above.

### Status surfaces updated after PASS

- `OWNER_RULINGS_2026-07-16.md`;
- `OWNER_DECISION_PACKET.md`;
- `README.md`;
- `ROADMAP.md` for UX-03/04/05/06/08/09 and the final initiative gate;
- `IMPLEMENTATION_ROADMAP.md`.

No new document was created. Existing historical audit records were not rewritten.

### Residual non-blocking backlog

- separate organization-branded native application research: stores, publisher/developer-account ownership,
  publication model, cost and time;
- future assistant/receptionist grants only after a separate clinic product scope is activated;
- future multi-specialist clinic communication topology only after that separate product scope is activated.

These items are neither unanswered launch questions nor dependencies of the current solo-first implementation plan.

**НАШЁЛ:** F1–F4 are fully closed; no new contradiction, missing decision, route/screen/stage/link regression or
integration-canon drift remains.

**ИЗМЕНИЛ:** appended this independent PASS record and promoted only the agreed current status surfaces to PASS.
No code, DB, runtime, task state, commit or remote branch was changed.

## 2026-07-18 — C0 launch manifest: canonical booking without Rubitime (`#839`)

**Integration base:** `feat/doctor-ui-rebuild` at `66ff00174f84b612dbccc5fd092d1d52977cd0c9`, exactly aligned with
`origin/feat/doctor-ui-rebuild` at launch. The only main-worktree delta is the owner's untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md`; it is protected and excluded from this stage.

**Repository consolidation:** stale agent worktrees and branches were audited before launch. FIO implementation
commits `75e9621c2`, `95b6b29e0`, `af13e86ad`, `be10ad4ca`, `64a3684f6` and `1cc376d48` are already ancestors of
the integration base. Four untracked FIO production-helper drafts were deliberately not integrated: they lacked
the canonical exact-target, hash-bound manifest, expected-before drift guard, durable pre-commit rollback and
PII-free evidence contract. The remaining unique docs-only branch was superseded by the normalized owner roadmap.
After cleanup the only local branches are `feat/doctor-ui-rebuild` and `main`, and the only registered worktree is
the integration worktree.

**Selected stage:** roadmap C0 / taskdb `#839`; owner-review §10 in full. It is an independent incident stage and
does not wait for C1 UI polish, S4 or U0. R1-R4 historical proof is provenance only because the owner reproduced the
runtime regression on TEST after those passes.

**Grounded root cause before delegation:** doctor/admin manual create reads the migrated
`booking_rubitime_bridge_enabled` setting, resolves legacy mappings, calls `staffRubitimeManualBooking` after the
canonical insert and hard-deletes/cancels that appointment when external sync fails. Manual reschedule calls
Rubitime before the canonical lifecycle mutation and can block it; cancel still attempts a best-effort Rubitime
mirror. The calendar's new-patient control calls `POST /api/doctor/clients` before the appointment request, so the
appointment rollback leaves the newly created patient behind. R5 documentation says outbound was hardcoded off,
but Git history and current code show that the policy has always read the legacy bridge setting. This proof/runtime
contradiction is part of C0.

**Acceptance and ownership path:**

- staff/admin create, reschedule and cancel are canonical-only and make no Rubitime runtime call, even when a
  migrated legacy setting remains enabled;
- a new patient plus appointment succeeds without Rubitime; the flow is atomic or compensates its own partial
  patient creation so an appointment failure does not leave a newly created patient because of this flow;
- the appointment is visible through canonical calendar and patient-card projections;
- normal booking settings expose no Rubitime tab, mapping editor, read-source selector or bridge control;
- provider-neutral canonical lifecycle events, GCal/reminders/notifications/payments/packages remain intact;
- CSV/history import remains offline/provider-neutral and is not mounted into the daily lifecycle;
- existing uniqueness constraints and current settings/profile readers are investigated; no ad hoc cleanup or
  migration is introduced without an existing runbook and an owner gate.

The ownership path is the existing organization-scoped canonical appointment with its specialist/patient links.
No new table, raw SQL, unscoped data or product model is authorized.

**Worker scope:** doctor/admin manual create and manual reschedule routes; shared staff Rubitime runtime policy and
related cancel/delete paths only as required to prove zero runtime calls; calendar new-patient/create flow;
ordinary schedule/booking settings navigation and its focused tests. Historical data, Rubitime import/export,
integrator raw tables/routes, migrations, production helpers and unrelated C1 schedule polish are protected.

**Validation:** focused route/app-layer/component tests for create/reschedule/cancel, migrated-setting immunity,
new-patient failure handling and Rubitime-tab absence; affected-file ESLint; webapp typecheck; diff check. Runtime UI
acceptance uses the existing single dev server at `http://127.0.0.1:5200`, `dev:admin` and `dev:doctor`, the calendar
create flow, synthetic DEV data and desktop/mobile viewports. No real channel send is allowed. TEST deploy or DB
mutation is not authorized; the owner-observed TEST scenario remains pending until a separately authorized TEST
deployment.

**Agent sequence and stop gates:** one isolated worker (`worker-hard`, high) because lifecycle files overlap, then
one independent full-stage reviewer (`reviewer`, high), correction owner if and only if findings map to the owner
checklist or repository rules, and a complete re-audit. Stop for owner authority before TEST/PROD, destructive
Rubitime actions, archive/drop, backfill or any product/architecture expansion. The temporary stage branch/worktree
must be integrated into `feat/doctor-ui-rebuild` after PASS and then removed; accepted agent branches may not remain.

## 2026-07-18 — C0 completion: staff booking lifecycle is canonical-only (`#839`)

**Status:** implementation and independent audit complete on `feat/doctor-ui-rebuild`. The integrated runtime head
before this closeout record is `30cad2a9d0a5644ac36b63bedb67695d55bc9b1c`. No TEST/PROD deployment, DB apply,
Rubitime mutation, real external delivery or owner-gated retirement action was performed.

### Implemented contract

- doctor/admin manual create no longer reads the legacy Rubitime bridge setting, resolves Rubitime mappings, calls
  Rubitime or deletes/cancels the canonical appointment after an external failure;
- doctor/admin manual reschedule no longer calls Rubitime before the canonical lifecycle mutation, and staff cancel
  and purge no longer attempt an outbound Rubitime mirror;
- the staff outbound policy is hard-disabled, so a migrated `booking_rubitime_bridge_enabled` value cannot reactivate
  daily lifecycle calls;
- ordinary booking setup and admin navigation no longer expose the Rubitime tab, direct integrations page, bridge
  status, mapping/read-source controls or Rubitime overview warnings; the old direct URL redirects to canonical
  booking settings;
- canonical appointment, calendar/patient projections and provider-neutral GCal, reminder, notification, payment
  and package paths remain in place. Historical CSV/import and retirement tooling were not changed.

The exact external-failure path that created a patient, created an appointment and then removed only the appointment
has been eliminated: staff create now commits the canonical appointment without a Rubitime post-write rollback.
No broad patient deletion or speculative cross-request transaction was added. Existing booking-profile uniqueness
remains enforced by the current `(booking_type, category_code, COALESCE(city_code, ''))` uniqueness contract; stale
Rubitime bridge values can remain as historical configuration but are no longer staff-runtime inputs.

### Worker, audit and corrections

- implementation: `bcb-c0-839-worker-20260718`, integrated commit `b2eeb1eb7`;
- first independent audit: `bcb-c0-839-reviewer-20260718` — **FAIL** because the direct integrations page still
  exposed the retired surface and one focused tab test retained the old count;
- first correction: `bcb-c0-839-correction-20260718`, integrated commit `93e032312`;
- full re-audit: `bcb-c0-839-reaudit-20260718` — **FAIL** because the normal booking overview still displayed
  Rubitime mapping/read-source warnings;
- second correction: `bcb-c0-839-correction2-20260718`, integrated commit `30cad2a9d`;
- final full re-audit: `bcb-c0-839-reaudit2-20260718` / audited run
  `c0-839-final-reaudit-20260718-30cad2a9d` — **PASS**, with no owner-checklist or repository-rule finding.

The reviewer left one non-blocking documentation recommendation: the historical schedule implementation note still
describes the retired integrations section. It is recorded as a recommendation, not promoted into owner scope or a
new architecture requirement.

### Verification evidence

| Gate                                       | Result                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Focused Vitest                             | **PASS** — 15 files, 55 tests                                                               |
| Webapp typecheck                           | **PASS**                                                                                    |
| ESLint for 30 changed TypeScript/TSX files | **PASS**                                                                                    |
| Stage diff/whitespace check                | **PASS**                                                                                    |
| Independent full-stage audit               | **PASS**                                                                                    |
| Live UI, `dev:admin`, desktop `1480x1024`  | **PASS** — `/app/doctor/schedule?tab=setup`; no Rubitime surface                            |
| Live UI, `dev:admin`, mobile `390x844`     | **PASS** — same setup surface and fallback behavior                                         |
| Retired direct URL                         | **PASS** — `/app/doctor/admin/booking/integrations` redirects to canonical booking settings |

Runtime screenshots are retained outside Git at
`/home/dev/brain/runs/c0-839-ui/schedule-setup-desktop.png` and
`/home/dev/brain/runs/c0-839-ui/schedule-setup-mobile.png`. A full mutating DEV lifecycle smoke was not claimed:
the supported `dev:admin` fixture has no active branch/service catalog, and alternative role/catalog access was not
reliably established. No synthetic patient or appointment was created, so no DEV residue remains. The canonical
lifecycle branches and migrated-setting immunity are covered by the focused tests above.

The owner-observed TEST scenario still requires a separately authorized TEST deployment and owner scenario. It is
not a reason to keep C0 implementation open, and it must not be inferred as permission to deploy or mutate TEST.

### Integration hygiene

All accepted worker/correction commits were fast-forwarded into `feat/doctor-ui-rebuild`. The temporary C0 branch
and worktree were removed after the final PASS. FIO work remains only in the canonical integrated commits and tasks
`#855–#858`; unsafe untracked production-helper drafts were not imported. The owner's untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md` remains untouched and excluded.

**НАШЁЛ:** the TEST regression was caused by live staff Rubitime coupling that survived the historical retirement
proof, plus ordinary UI surfaces that could still expose the retired provider.

**ИЗМЕНИЛ:** removed Rubitime from the staff appointment lifecycle and ordinary booking UI, independently audited
the whole C0 checklist to PASS, preserved provider-neutral canonical side effects and integrated the accepted work
without leaving an agent branch or worktree.

## 2026-07-18 — C1 launch checkpoint: Today + Clients (`#850`)

**Integration base:** `feat/doctor-ui-rebuild` at
`308cecb3bbcea2981c6121e6856e3f58b8e0e1e9`, aligned with `origin/feat/doctor-ui-rebuild`. C0 is `done` with
test/audit seals. The only main-worktree delta is the owner's protected untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md`.

**Environment checkpoint:** current remote TEST ref is `a130741b0b028fc1f3d4de17db24d66b08fce645`; no TEST deployment or
mutation is authorized. The existing single DEV webapp at `http://127.0.0.1:5200` is alive and remains owned by the
main integration worktree; no second Next server may be started.

**Dedup and readiness:** task `#846` and the BCB2 punch-list are subordinate evidence, not the current product
authority. No live process, agent-port run, branch or worktree exists for `#846`, so its stale `doing` status was
returned to `todo`; owner-review §§1–2 are owned only by `#850`. Read-only explorer
`bcb-c1-850-explorer-20260718` confirmed that the current organization-scoped `ClientListItem`,
`getClientCategory` and repository projection already implement the approved client/subscriber semantics. No new
relation, ownership path or backend classifier is needed.

**Selected slice:** roadmap C1.1 / taskdb `#850`, owner-review §§1–2 in full. It is independent of C1 schedule and
communications slices. One worker owns the whole slice because Today and Clients share doctor KPI presentation
contracts and must be auditable as one visual result.

**Acceptance:** Today KPI cards keep one label-above-value hierarchy and equal row height for both single and split
values; separate total/future actions and their existing modal semantics remain. Clients removes the left filter
rail, keeps the Clients/Subscribers segment in the right control area with Clients as default, preserves mutually
exclusive organization-scoped classification, shows a calendar count only for future active appointments, keeps
membership/support indicators, and shows the program dumbbell only without active support. Past appointment history
alone remains client evidence but is not a row indicator. Desktop and mobile must both preserve semantic order and
usable segment access.

**File/ownership scope:** presentation and focused tests in `DoctorTodayRightKpiRow.tsx`, shared doctor KPI shell
only if required (`DoctorStatCard.tsx` / existing doctor visual tokens), `DoctorTodayDashboard.test.tsx`,
`PatientsPageClient.tsx` and `PatientsPageClient.test.tsx`. The organization-scoped clients port/repository,
`patients/page.tsx`, DB/migrations, C1 schedule/communications, patient UI, integrations and infrastructure are
protected unless a concrete acceptance blocker is returned to the lead.

**Checks and live evidence:** focused Today/Clients tests including history-only, future-only, support-only,
program-only, program+support, membership and subscriber cases; affected-file ESLint; webapp typecheck; diff check.
Live DEV acceptance uses `dev:doctor` (or `dev:admin` only where the fixture requires it), exact URLs
`/app/doctor` and `/app/doctor/patients`, desktop `1480x1024` and mobile `390x844`, with source-bound screenshots and
explicit KPI/segment/indicator states. Shared KPI consumers receive a targeted regression check.

**Risks and gates:** the current Clients right panel is hidden below `lg`, so mobile segment access is a known
responsive risk, not permission for a broader IA redesign. Shared KPI token changes can affect analytics consumers
and therefore require minimal scope plus regression evidence. No product inference beyond §§1–2, TEST/PROD action,
real delivery, deploy, schema/data change or owner-gated FIO/Rubitime work is authorized. Accepted worker work must
be integrated into this feature branch and its temporary branch/worktree removed after independent PASS.

### Owner clarification during C1 execution

The owner clarified the Clients contract after the first audit: the left list area has no interactive filter rail;
it contains search and sorting, with the default ordered by recent interactions/appointments. Remaining row icons
are informational only. Filters continue to belong to the right control area and are not row actions. The owner
also ruled that an acquired active/awaiting-payment membership is itself client evidence, even without appointment,
support or program evidence. This later ruling supersedes the four-evidence wording in the original launch
checkpoint and must be reflected in classification tests, sorting evidence and the final full-stage re-audit.

A later clarification in the same owner conversation simplified the page further and supersedes the mandatory
Clients/Subscribers segment/default from the launch checkpoint: the initial list shows every person in the current
organization, ordered by recent occurred canonical appointments with no-interaction rows below. Search handles a
known person; right-side factual filters handle appointments, memberships and other selections. The exact future
extension across upcoming appointments/messages is deferred. Membership remains client evidence wherever that term
is still used, but client/subscriber classification no longer filters this page by default or requires a segment.
The owner then chose the reversible variant: keep the existing typed category mechanism dormant, update membership
evidence, hide its UI and do not apply it to the default list. This avoids destructive removal while the final
long-term need for the segment remains undecided.

### C1 Today + Clients closeout (`#850`)

The accepted implementation is `9957bd71c` (stage range `0b73236e2..9957bd71c`). Today now keeps all three
appointment KPI cards equal-height and renders split-card labels above their values without changing shared doctor
visual tokens. Clients shows all organization people by default, keeps the typed client/subscriber classifier
dormant and reversible, adds membership as client evidence, and hides the category UI. The left pane contains only
search plus the initial `Недавние приёмы` / `ФИО А–Я` sorting control. Recent sorting uses the last occurred,
non-deleted, non-cancelled canonical appointment in the current organization, puts null interaction dates last and
uses stable FIO/display-name/user-id tie-breaks. The right desktop panel retains factual filters. Row indicators are
non-interactive and limited to future appointment count, membership, support and program without duplicate support.

Independent full-stage re-audit `bcb-c1-850-reaudit-20260718`, audit id
`bcb-c1-850-final-reaudit-20260718-9957bd71c`, returned **PASS** with no A/B findings. Its D-only notes were
pre-existing visual-guide drift and dormant legacy-filter cleanup recommendations; neither expands this stage.

Lead validation on the integrated commit:

- focused Vitest: 3 files, 43 tests passed;
- affected-file ESLint: passed;
- clean detached-worktree webapp `tsc --noEmit`: passed;
- `git diff --check`: passed;
- live DEV `dev:doctor`: `/app/doctor` and `/app/doctor/patients` returned HTTP 200 and were visually inspected at
  `1480x1024` and `390x844`;
- evidence: `/home/dev/brain/runs/c1-850-ui/today-desktop.png`, `today-mobile.png`,
  `clients-desktop.png`, `clients-mobile.png`.

The live DEV doctor fixture had zero clients, so default layout, sorting control, hidden category UI, right-panel
placement and responsive behavior were verified live; populated row-indicator and ordering states are covered by
the focused component/repository tests rather than synthetic DEV data. The first in-place typecheck attempt was
invalidated by stale `.next/dev/types` from the running Next server; the server and its cache were left intact and
the same commit passed a clean detached-worktree typecheck instead.

Both worker commits were fast-forwarded into `feat/doctor-ui-rebuild`. The stage branch, stage worktree, detached
validation worktree and their temporary dependency links were removed. The persistent DEV server was not stopped,
no TEST/PROD/deploy/data action occurred, and the owner's untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md` remains untouched.

## 2026-07-18 — remaining C1 parallel launch: Schedule `#851` + Communications `#852`

**Binding mode:** owner reinforcement in roadmap §7.3 applies: these presentation/mechanical slices run in
parallel, each with one worker and exactly one independent audit. Serial correction rounds are forbidden. An audit
delta without a matching owner-review line is an owner question, not new scope. Live DEV screenshots serialize on
the single existing `127.0.0.1:5200` server. After both slices land, C1 receives one full CI gate and a code-only
TEST acceptance checkpoint before C2 starts.

**Base/environment:** `feat/doctor-ui-rebuild` at `b02c32ef5a9609dc6c6eebb59077a7168f269529`, aligned with
origin. Current TEST ref is `a130741b0b028fc1f3d4de17db24d66b08fce645`; no TEST deploy occurs inside either
worker. The integration worktree is the only registered worktree at launch and its sole delta is the owner's
protected untracked `docs/_TODO/SESSION_HANDOFF_2026-07-17.md`.

**Schedule `#851`, owner-review §§3–4:** clean desktop entry/reload defaults to week while explicit user/deep-link
choice remains stable; the existing booking-settings area exposes service create/edit/deactivate and a distinct
calendar-specialist management surface; location create and edit both include short name; Rubitime remains absent
from normal UI. Notification copy and cancellation/reschedule policy are protected. Backend/data retirement,
settings relocation, TEST/prod operations and unrelated schedule behavior are out of scope. Primary file ownership
is `doctor/schedule/**` plus existing booking-settings components/routes/tests only where the checklist requires.

**Communications `#852`, owner-review §§5–8:** reuse the existing equal `CatalogSplitLayout`; comments have correct
unselected/selected states and independent unread/on-support toggles; intake rows are left-aligned and status is a
mutually exclusive single-select segmented control; broadcast audit rows contain both collapsed and expanded
content without overlay. The accepted Open-card link, routing/deep links, data contracts and delivery behavior are
protected. Primary file ownership is `doctor/communications/**`, `doctor/comments/DoctorCommentsTab*`,
`doctor/online-intake/DoctorOnlineIntakeClient*` and `doctor/broadcasts/BroadcastAuditLog*` with their existing tests.

**No overlap and acceptance:** neither worker edits this initiative log, shared route trees, patient UI, DB schema,
migrations or the other worker's files. Each runs focused component tests, affected ESLint, webapp typecheck and
diff-check, then returns exact files/commit/results/risks. Lead performs one independent static/UI audit per slice,
fast-forwards accepted commits into the feature branch, deletes both temporary branches/worktrees, serially checks
named desktop/mobile states on live DEV where fixtures make them reachable, then runs the single accumulated C1
full CI and prepares the owner-authorized code-only TEST checkpoint.

### C1 Schedule + Communications closeout (`#851`, `#852`)

Both parallel slices are integrated into `feat/doctor-ui-rebuild`: Schedule commit `f7c10e7bf`, Communications
commit `78e331a9a`, and accumulated stale-contract test correction `b35524674`. Schedule now defaults to the week
view without overriding explicit deep links; booking settings expose canonical services, calendar specialists and
location short name while Rubitime remains absent. Communications uses the shared equal split; comments have two
independent filters and a real no-client empty state; intake has one mutually exclusive status; broadcasts keep the
composer and journal in equal non-overlapping panels.

Risk-sized audit evidence under roadmap §7.3:

- `bcb-c1-851-audit-20260718` — **PASS**, no A/B findings;
- `bcb-c1-852-audit-20260718` — one exact owner-review §6 finding: the unselected comments pane still rendered the
  old background feed. The lead removed that retired feed/render/pagination path, added the required empty-state
  assertion and reran the focused gate. Because the requirement was explicit rather than ambiguous, it was closed
  directly; no serial correction agent or second audit was started.

Validation:

- Schedule focused Vitest: 3 files, 88 tests passed; scoped ESLint, webapp typecheck and diff-check passed;
- Communications focused Vitest after the audit delta: 3 files, 61 tests passed; scoped ESLint, webapp typecheck and
  diff-check passed;
- live DEV `dev:admin`, desktop `1440x1000` and comments mobile `390x844`: week selection, services, specialists,
  comments empty state/toggles, intake single-select and broadcast layout visually passed;
- screenshots: `/home/dev/brain/runs/c1-final-ui/schedule-week.png`, `schedule-services.png`,
  `schedule-specialists.png`, `comments-desktop.png`, `comments-mobile.png`, `intake-desktop.png`,
  `broadcasts-desktop.png`;
- accumulated `pnpm run ci`: **PASS** from lint through registry audit. Integrator: 1270 passed; webapp: 7989 passed;
  media-worker: 56 passed; production builds and all SaaS/static audit contracts passed. The first milestone run
  exposed two stale assertions left behind by C0 Rubitime retirement; both were corrected as tests (no runtime
  behavior change), passed 26/26 targeted tests, and the required milestone full run then passed end to end.

Both temporary branches and worktrees were removed after integration. The single DEV server stayed in place. No
PROD action, prod dump, external delivery or push/merge to `main`/`test` occurred. The owner's untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md` remains untouched. C1 is ready for the owner-authorized code-only TEST
deployment and live click-through checkpoint; C2 must not start before that owner acceptance.

### C1 code-only TEST checkpoint

The canonical `deploy/host/deploy-test.sh feat/doctor-ui-rebuild` code-only path deployed exact commit
`9886320881f259d7eeeda70e07f5f865496e16ff` to TEST without a prod dump or any PROD access. The TEST checkout was
force-aligned to that SHA; all five TEST services (API, worker, scheduler, webapp and media worker) are active.
Both the local TEST API health endpoint and `https://test.bersoncare.ru/api/health` returned `ok=true` with the DB
up. C2 remains stopped pending the owner's live C1 click-through; taskdb acceptance remains owner-only.

### C1 owner-gate process audit

While C1 waits for live owner acceptance, the lead re-read `docs/ORCHESTRATION_BINDINGS.md` and the complete current
roadmap. Execution remains aligned with §7.3: no C2 work started, no repeated CI/audit loop was opened, and the
integration worktree has no agent branches or extra worktrees. One stale C1 roadmap phrase still required the old
`Клиенты / Подписчики` default segment; it was reconciled in place to the later owner-review §2 decision (all
organization people by default, left search/sort, dormant hidden classifier, factual right-side filters/indicators).
Taskdb `#850` note records the same superseding owner decision. This documentation-only reconciliation used
`git diff --check`; application CI was intentionally not repeated.

## 2026-07-18 — C1 live TEST correction after owner review (`#850`, `#852`)

**Owner result:** C1 was not accepted on the first live TEST pass. Schedule `#851` is acceptable for this stage;
Today/Clients `#850` and Communications `#852` returned to `doing`. Four owner screenshots at TEST SHA
`9886320881f259d7eeeda70e07f5f865496e16ff` prove the remaining visual deltas: unequal Today KPI geometry, duplicate
client names/misaligned search and indicator rail, old narrow Chats master pane, default Intake `Новые` filter and a
compressed/overlapping Broadcast journal. The exact later decisions are reconciled in owner-review §§1-2 and §§5-8.

**Launch checkpoint:** integration branch/HEAD before the correction manifest is `feat/doctor-ui-rebuild` at
`39e465a0807781b867c80550620ed8d299199852`, aligned with origin. The parallel universal execution-mode rules were
cleanly integrated by their owner in that commit; the only protected worktree delta is
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md`, which correction commits must not include or overwrite. No agent branch
or extra worktree exists at launch. TEST remains healthy on the earlier C1 code SHA above; no production access,
real delivery, data change or second Next server is allowed.

**Parallel file ownership:** worker A owns only Today/Clients presentation and existing focused tests:
`DoctorTodayDashboard*`, `DoctorTodayLeftKpiRow*`, `DoctorTodayRightKpiRow*`, `patients/PatientsPageClient*` and the
existing doctor catalog primitives only if reuse proves a missing sanctioned prop. Worker B owns only
`messages/DoctorSupportInbox*`, `comments/DoctorCommentsTab*`, `online-intake/DoctorOnlineIntakeClient*`,
`communications/tabs/*`, `broadcasts/BroadcastAuditLog*` and their focused tests. Neither worker edits docs, API,
modules, repositories, schema/migrations, patient UI, booking/schedule or the other worker's files. Shared
`CatalogSplitLayout` is reuse-first and should not require modification.

**Acceptance/evidence:** desktop `1440x900` and mobile `390x844`, role `dev:admin`, URLs `/app/doctor`,
`/app/doctor/patients` and all four `/app/doctor/communications` tabs. Targeted component tests, scoped ESLint,
webapp typecheck and diff-check run per worker. After integration the lead performs the full live screenshot matrix
first, including client sorting in both directions, selected/unselected master-detail, clearable intake statuses and
collapsed/expanded long/error broadcast rows. Then one independent full C1-correction visual audit runs against the
owner checklist. No serial cosmetic correction/audit rounds are permitted; any unmatched requirement becomes an
owner question. One accumulated full CI runs only at the corrected C1 TEST checkpoint, followed by the already
authorized code-only TEST deploy and a new owner click-through; C2 remains stopped until acceptance.

### Corrected C1 pre-deploy closeout

The two non-overlapping correction slices were integrated as `bc10645fe` (Communications) and `98cb5455f`
(Today/Clients), with the lead's mobile KPI readability correction in `cba12a08d`. All temporary worker branches
and worktrees were removed immediately after integration. The protected untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md` remains untouched.

Lead live DEV acceptance on `127.0.0.1:5200` covered Today, Clients and all four Communications tabs at desktop
`1480x1024` and mobile `390x844`. Evidence is under
`/home/dev/brain/runs/c1-owner-correction-live/{desktop,mobile}`; the final mobile Today geometry after the
canonical two-column wrap is `mobile/today-canonical.png`. The populated Clients indicator/order cases remain
component-test evidence because the DEV clinic fixture has zero clients. The combined focused gate passed 7 files
and 140 tests; the final Today delta passed 21/21 plus scoped ESLint and diff-check.

The single independent corrected-C1 audit returned **PASS** on `cba12a08d`. Its only interim finding was the lead's
too-small mobile KPI label; before terminal verdict the lead removed the non-canonical font override, changed the
mobile row to a semantic 2x2 wrap (four columns from `sm` upward), added the layout assertion and supplied the
fresh live screenshot above. No serial correction agent or second audit was opened.

The accumulated milestone CI gate is green. Lint passed in the integration checkout. Typecheck initially read
mixed `.next/types` and `.next/dev/types` while the required persistent DEV server was running, so the gate resumed
at typecheck in a clean detached worktree on the same SHA. Typecheck, HLS helper check, webapp tests (7995 passed),
media-worker tests (56 passed), integrator tests, both production builds and the complete SaaS/security audit
passed. The integrator suite first exposed a pre-existing non-hermetic empty `src/content/rubitime` directory that
Git cannot carry into a clean worktree; after recreating that empty canonical directory, its focused registry suite
passed 15/15 and the gate resumed after the completed integrator step. No tracked fix or C1 scope growth was made.

C1 is ready for the authorized code-only TEST redeploy and owner live click-through. Taskdb `accepted` remains
owner-only, and C2 must not start before that owner checkpoint.

### Corrected C1 code-only TEST checkpoint

`deploy/host/deploy-test.sh feat/doctor-ui-rebuild` deployed exact commit
`1aa5690e3c92dc838d3362f0c0e3ea91047fd4d1` to the existing TEST environment without a prod dump or any PROD
access. All five TEST units are active; internal `127.0.0.1:6300/api/health` and public
`https://test.bersoncare.ru/api/health` both returned `ok=true` with the DB up. The mandatory locked product smoke
passed 22/22 positive/role scenarios plus the global-admin clinical-write denial. The deploy did not push or merge
`main`/`test`, perform external delivery or start another DEV server.

Tasks `#850` and `#852` are implementation-complete, tested and independently audited; taskdb acceptance remains
unset for the owner. C2 is deliberately paused until the owner completes this corrected TEST click-through.

## 2026-07-18 — C1 повторная owner-коррекция «Сегодня / Клиенты» (`#850`)

Повторная живая TEST-приёмка не приняла `#850`. Новый scope остаётся presentation-only: на «Сегодня» в списках
людей должна остаться одна строка structured ФИО; правый appointment KPI row временно скрывается без удаления
компонента, а мини-календарь поднимается вверх. Это явно отложенное решение владельца, а не retirement метрик.

На «Клиентах» фактическая семантика зафиксирована без новой модели данных: `С записями` включает человека с
любой будущей активной либо прошедшей неотменённой canonical appointment; вместо `Новые` показывается
`С визитами` для истории прошедших визитов; `Бывшие` переименовывается в понятное `Без будущих` (визиты были,
будущей активной записи нет). Все видимые KPI получают короткие hover/focus-подсказки, а выбранный KPI-фильтр —
общий primary active-state doctor UI вместо warning/destructive-окраски.

Task `#850` снова в `doing`. Из-за одновременно выполняемой identity-задачи `#860` и её незакоммиченных файлов в
интеграционном worktree весь UI-срез изолирован в `agent/c1-owner-round3-today-clients` от commit `57aa704a0`.
Режим §7.3 не меняется: один worker, один независимый audit, targeted checks и live desktop/mobile; новый full CI
только на TEST milestone, без повторных прогонов уже зелёных шагов.

**Обнаруженный data gate:** owner сравнил экран с PROD: при почти одинаковом roster (`228` против `227`) PROD
legacy UI показывал `139` людей с записями и `114` без будущей записи, тогда как текущий TEST canonical UI — около
`48` и `24`. Трассировка подтвердила: лимита строк в `listClients` нет; production branch на снимке агрегирует
`appointment_records`, feature branch — `be_appointments`. Последний C1 deploy был намеренно code-only, поэтому
текущая TEST DB не доказывает полноту canonical backfill. Возвращать legacy fallback запрещено R2. Визуальная
коррекция продолжается, но live acceptance счётчиков заблокирована до существующего `#757` C0/R1 TEST
fresh-restore/backfill flow; сброс TEST-данных требует отдельного owner gate.

Presentation worker commit `1c52de23f` закрыл кодовый scope одним проходом. Focused Vitest прошёл `55/55`,
scoped ESLint, webapp typecheck и `git diff --check` — PASS. Единственный независимый presentation audit вернул
PASS без P0/P1: full structured ФИО и облегчённый вес подтверждены; appointment KPI row отключён только на уровне
composition, а компонент и его поведенческие тесты сохранены; календарь первый справа; tooltips доступны по
hover/focus; клиентские предикаты/primary active-state соответствуют owner contract. Повторный audit/correction
loop не открывался. Live screenshot и count acceptance выполняются после интеграции и разрешённого TEST data gate.

Lead интегрировал worker/docs как `636a4ec00` и `cd70c7db3` поверх параллельно завершённого auth commit
`3912ea7ac`. На единственном существующем DEV-сервере сняты source-bound desktop `1480x1024` и mobile `390x844`
экраны «Сегодня / Клиенты» в `/home/dev/brain/runs/c1-round3-live/`: appointment KPI row отсутствует, календарь
первый справа на desktop, mobile сохраняет последовательный layout, клиентские KPI имеют primary selected-state и
новые понятные подписи. DEV fixture пуст, поэтому он не доказывает populated ФИО/counts; эти состояния закрыты
focused tests, а live data acceptance остаётся за owner-gated TEST refresh/backfill. Временный worktree и ветка
удалены после patch-equivalence proof; integration worktree снова единственный, protected
`SESSION_HANDOFF_2026-07-17.md` не затронут.

## 2026-07-19 — clean-dump migration chain made explicit (`#757`, FIO `#849` evidence)

- Confirmed two separate TEST operations: `deploy-test.sh` is code-only and never restores the database;
  `deploy-test-full-reset.sh` is the only public owner-authorized destructive migration rehearsal entrypoint.
  `deploy-test-saas.sh` remains an internal shared closure engine and rejects direct destructive invocation.
- Full reset now fails before writers stop unless `--confirm-full-reset` and protected hash-bound Rubitime CSV/FIO
  manifest inputs are supplied. The CSV is copied into a root-owned hash-verified snapshot for the whole run.
  Routine UI deploys cannot reference or accidentally select the destructive path.
- Bound the existing doctor/admin fix, Drizzle migrations, complete Rubitime cleanup/import sequence (including the
  second non-confirmed cleanup after import), current specialist identity, and reviewed FIO manifest apply into one
  stopped-writers chain before fixtures/service restart.
- Unified the current specialist canonical ID across TEST, Rubitime one-pass and #667. Historical `518…` disposable
  results remain documented as historical evidence; the current chain converges on `c951…` and repoints membership.
- Added TEST-only FIO apply/rollback via the shared Drizzle port: exact reviewed exceptions, live DB attestation,
  conditional transaction, unique durable mode `0600` rollback artifacts, aggregate PII-free output. The prior 165
  TEST updates are historical because the 2026-07-18 fresh restore replaced that snapshot; production was untouched.
- No DB, deployment, environment, production, external delivery, or PII artifact read occurred in this repository
  integration step. Full-reset runtime proof remains a separate explicit owner-authorized operation.

### Owner-authorized TEST rehearsal and corrected C1 data checkpoint — PASS

The owner-authorized one-time TEST rehearsal completed against a protected local fresh dump; it did not pull a new
production dump and did not touch production. The run proved the complete stopped-writers order: restore, owner
doctor/admin data-fix, Drizzle migrations, TEST settings, placeholder cleanup, specialist consolidation, complete
Rubitime cleanup/import with repeat non-confirmed cleanup, aggregate retirement gates, exact reviewed FIO apply,
strict SaaS/FORCE closure, fixtures, restart, health and locked product smoke.

Runtime evidence is aggregate-only:

- Rubitime one-pass converged idempotently: its resume pass found zero new placeholder, duplicate-specialist,
  unmapped, stale, non-confirmed or duplicate-cluster work; live state is `315` legacy rows and `313` canonical
  Rubitime projections;
- before synthetic TEST fixtures, the owner organization had exactly one active canonical specialist and no
  appointment on a null/inactive specialist; after closure the owner organization still has one active specialist;
- the exact owner-reviewed FIO manifest produced `165` updates, `3` already-matched rows, `1` expected missing row
  and `1` preserved-current row, with zero unexpected missing/drift; a unique private mode `0600` rollback artifact
  was fsynced before mutation;
- B1 doctor/admin identity assertion passed; all five TEST units are active, health reports DB up, the locked product
  smoke passed `22/22` plus the global-admin clinical-write denial, and the post-runtime tenant-isolation gate is
  complete/clean;
- the owner organization now exposes `228` active client rows; `98` have a non-cancelled canonical appointment and
  `19` have a future appointment. This closes the missing-canonical-history cause behind the abnormally short C1
  client list/counts without restoring a legacy read fallback.

Live TEST desktop captures for Today, Clients, Chats and Broadcasts at `1440x900` confirm the C1 presentation state:
one-line names, Today calendar at the top with the deferred appointment KPI row hidden, Clients `40/60` with compact
search/sort and factual KPI cards, and Communications `40/60` without broadcast journal overlap. The synthetic
doctor session intentionally contains five clinic-A clients; the `228/98/19` owner-organization population is proven
by the post-migration aggregate gate and remains available for the owner's ordinary TEST login.

No full reset is needed for subsequent UI/code deploys. From this point the prepared TEST database is persistent and
ordinary deployments use only `deploy/host/deploy-test.sh`; another dump restore requires a new explicit owner gate.

## 2026-07-19 — C2 identity/invite + C3 settings parallel launch checkpoint

**Base and milestone:** `feat/doctor-ui-rebuild` / origin are aligned at `68faf5b63`; the accumulated C1 milestone
CI passed once on this exact SHA (lint, typecheck, `9335` tests, builds and all SaaS/security audits). TEST runs code
`c6804e913` plus the prepared persistent database from the successful full-chain rehearsal; all five units and locked
smoke are green. The only integration-worktree delta remains the protected untracked
`docs/_TODO/SESSION_HANDOFF_2026-07-17.md`.

**C2 — taskdb `#840` + `#841`, owner-review §14:** one coherent identity/invite stage. Aggregate TEST evidence shows
the owner organization has two active membership rows for two distinct platform identities: one `owner` with the
canonical specialist link and one unlinked platform-global `admin`; there is no duplicate
`(organization_id, platform_user_id)` row. Therefore this is not a name-based merge. The worker must remove the
historical global-admin organization membership at its seeded/migration source while preserving the separate secure
global-admin identity, keep owner management capability on the owner membership, and prevent recurrence. It must
then prove the existing seven-day invite journey end-to-end for new/existing email, single-use/replay,
expiry/revoke/reinvite, doctor first-login specialist provisioning and admin-without-specialist. Allowed primary
scope: organization membership/invite modules and ports, their PostgreSQL repositories/DI, clinic invite/member APIs
and UI, existing provisioning helpers/overlays/migrations and focused tests. Forbidden: merge by display name,
patient data, billing/entitlement/settings IA, PROD, real delivery and live TEST mutation/deploy by the worker.

**C3 — taskdb `#842`, owner-review §15:** a separate coherent settings-hub stage in a non-overlapping worktree.
Deliver one stable `Настройки` navigation entry whose tabs are membership/capability-driven rather than route-driven;
reconcile organization/practice, specialist and install-app surfaces; eliminate the duplicate Client/Patient setting;
make appointment reminders organization-owned through their existing sanctioned write path; remove the retired daily
bot reminder UI/scheduler/delivery path; and remove owner-only patient-home controls from shared settings. Team and
billing tab bodies remain gated on C4/C5 entitlement/commercial work. The canceled request to move the entire current
schedule settings area is explicit non-scope. Allowed primary scope: doctor nav/menu tests, existing settings layouts,
pages/components/routes, system-settings services/accessors and notification jobs only where the checklist requires.
Forbidden: a second settings tree/write path, team/billing implementation, booking-settings relocation, patient UI,
PROD/TEST operations or real delivery.

**Parallelism and gates:** C2 and C3 have separate file ownership; any shared navigation/guard file discovered by
both belongs to C3 unless C2 requires an exact clinic-member route guard test, in which case the lead coordinates the
single edit. Each worker gets the full owner checklist and returns exact files/tests/risks. C2 uses the full
worker -> independent high-risk audit -> correction/re-audit cycle if necessary; C3 gets the risk-sized stage audit,
with findings constrained to owner-review §15. Targeted tests/typecheck/lint run per stage; no new full CI until the
next milestone. Live TEST deployment remains code-only and serial after integration; no second Next server.

## 2026-07-19 — C2/C3 integration closeout before the TEST milestone

### C3 settings hub (`#842`)

C3 was implemented as one settings stage (`bcb-c3-settings-hub-20260719`) and received one independent
scope-bound audit (`bcb-c3-settings-hub-audit-20260719`). The audit identified owner-review §15 deltas rather than
new product scope; one coherent correction (`bcb-c3-settings-hub-correction-20260719`) plus one low-effort mechanical
test-mock repair (`bcb-c3-settings-hub-mechanic-20260719`) closed them. No serial cosmetic re-audit loop was opened.

Commit `277f1ac55` is integrated and pushed. The result keeps one stable `Настройки` entry and one tabbed hub;
practice owns the client/patient term and appointment-reminder writer; schedule lifecycle notifications stay in
schedule settings; the retired daily bot reminder is removed from UI/scheduler/executor/repository/settings keys;
patient-home target/warmup controls are owner-only; repeat cooldown remains specialist-accessible per the explicit
owner line; Team is fail-closed until C4; billing is a non-interactive owner/global-admin shell until C5. Focused
webapp tests passed `164/164`, the integrator scheduler test passed, both app typechecks and scoped ESLint passed.
The C3 worktree and branch were removed after integration.

### C2 organization identity and invite journey (`#840`, `#841`)

C2 was intentionally treated as a high-risk identity stage. The whole-stage worker
`bcb-c2-identity-invite-20260719` was audited by `bcb-c2-identity-invite-audit-20260719` (**FAIL**), then received one
coherent correction. Re-audit `bcb-c2-identity-invite-reaudit-20260719` found three remaining items that map directly
to owner-review §14/roadmap C2: management-only admin still reached the shared clinical API guard; the real invite
page did not truthfully handle all lookup/start/confirm and OTP failure states; the private PostgreSQL proof did not
execute the new-email identity branch. One final whole-stage correction
`bcb-c2-identity-invite-correction2-20260719` closed all three. The independent cross-model final re-audit
`bcb-c2-identity-invite-final-reaudit-20260719` returned **PASS**. The two-correction hard cap was respected; no third
correction was opened.

The integrated commits are `8821b5722` plus the mechanical C2/C3 settings-test alignment `e1e5fc6cd`, both pushed
to `feat/doctor-ui-rebuild`. The stage now provides the real link/OTP acceptance page; new and existing email
identity reuse; unique membership; deterministic replacement under a transaction advisory lock; replay, expiry,
revoke/reinvite handling; exactly-one specialist on concurrent first doctor login; management-only admin without a
specialist or clinical doctor access; bounded, idempotent migration `0207` which removes only the historical seeded
global-admin membership while preserving the platform identity. The private environment-free PostgreSQL smoke
passed on the worker and integration checkouts. Integration-targeted checks passed `78/78` C2/guard/nav tests and
`9/9` settings tests; webapp typecheck, scoped ESLint, Drizzle journal/frozen-migration checks and diff checks passed.
The C2 worktree and branch were deleted immediately after push.

The unresolved simultaneous patient+staff persona is an owner question, not an audit-created task: the current
coarse `platform_users.role` promotion reuses the identity but does not yet model two concurrent personas. C2 does
not silently introduce that architecture. Live-only acceptance remains: apply `0207` through the ordinary
code-only TEST deploy, prove the preserved global-admin identity and single owner membership, exercise safe TEST
invite/OTP for new/existing emails without real external delivery, confirm management-only admin gets clinical
`403`, and inspect the team projection/badges. `accepted` remains owner-only.

### Process and next gate

Hourly/post-result orchestration audits `bcb-process-audit-20260719-0314` and
`bcb-process-audit-post-c2-20260719` both returned **PASS**: C2 audit depth was proportionate to identity risk, C3
used the single-audit mode, no micro-slicing/audit churn or worktree sprawl remains, and already-green CI phases were
not rerun between small corrections. The next accumulated gate is exactly one full CI on the integrated C2/C3 code,
then one `deploy/host/deploy-test.sh` code-only TEST deployment against the prepared persistent database. A database
reset/dump restore remains separately owner-gated and is not part of this checkpoint.

The accumulated C2/C3 milestone CI was then completed without restarting already-green phases. The first run had
already passed lint, both typechecks, the HLS helper and root tests before its terminal wrapper lost the child at
`test:webapp`; continuation `bcb-c2-c3-milestone-ci-resume-webapp-20260719` resumed from that exact phase. Four stale
organization-context mocks were aligned with the C2 `canAccessClinicalWorkspace` contract and the doctor install
redirect was made an async server component. The continuation passed focused `53/53`, full `test:webapp`,
`test:media-worker`, root build, webapp build and dependency audit. No second full CI was started.

Repository hygiene was also reconciled before TEST delivery. The separately completed owner tooling decision commit
`7a3b0a840` and the clean one-commit Doctor DNA plan branch `preview/doctor-dna` (`963f2e698`) were fast-forwarded into
`feat/doctor-ui-rebuild`; the now-integrated preview worktree and branch were removed. Only the integration worktree
remains. The Doctor DNA S0 implementation has not been claimed complete by this merge; it stays a later plan stage.

## 2026-07-19 — C2/C3 code-only TEST acceptance

`deploy/host/deploy-test.sh feat/doctor-ui-rebuild` delivered exact SHA `4a889093d` to the persistent prepared TEST
database. The run did not call the fresh-reset wrapper or restore a dump. It applied the ordinary pending migrations
(Drizzle count `208`), completed the shared strict/FORCE closure, left all five TEST units active, returned green
health, passed locked product smoke `22/22` plus the separate global-admin clinical-write denial `1/1`, and recorded
complete E1 coverage with zero unexplained signals.

A separate secret-free live Chromium check used the protected fixture values only in process memory. The clinic
owner saw `Специалист / Практика / Тариф и биллинг / Установить приложение`; the organization tab showed the single
client terminology owner and appointment-reminder controls; billing was the intentional non-interactive shell; the
legacy Team route redirected to the hub. An ordinary clinic doctor saw only `Специалист / Установить приложение`,
and a direct billing URL returned to the permitted settings root. The public invite page rendered the truthful
invalid-link state. Runtime screenshots and the temporary script were inspected and deleted, not committed. The C2
scratch PostgreSQL proof remains the mutation-safe evidence for successful new/existing email OTP acceptance,
replay, replacement and concurrency; TEST was not polluted with synthetic pending invitations merely to duplicate
that proof.

Taskdb `#840`, `#841`, and `#842` were moved to `done` with `seal_test=true`, `seal_audit=true`, and commit
`4a889093d`. The taskdb port printed its legacy `авто-приёмка по коммиту` transition while setting `done`; no agent
explicitly set `accepted`. This conflicts with the current repo rule that only the owner sets acceptance and is
retained as a process/tooling finding rather than silently treating the automated flag as a new owner decision.
The non-roadmap process regression is tracked separately as taskdb `#886` (`auto_ok=false`); it does not block C2F.

## 2026-07-19 — C2F launch checkpoint: structured registrations (`#855`)

Stage C2F starts from clean integrated branch `feat/doctor-ui-rebuild` at `cc9238fe6`; origin is equal, the only
untracked path is the protected owner file `docs/_TODO/SESSION_HANDOFF_2026-07-17.md`, and there is one integration
worktree. The current live TEST code is the previously accepted code-only deployment `4a889093d`; this stage does
not reset or mutate TEST and does not touch PROD.

Task `#855` implements only owner-review §19 steps 1–2 / FIO Phase 6: patient email registration requires structured
surname and given name with optional patronymic; specialist/clinic registration uses the same structured specialist
identity while keeping organization title separate and preserving the current invite/provisioning/membership flow.
Compatibility `display_name` and specialist full-name labels are derived deterministically from those submitted
parts. Dependencies already present are the canonical `platform_users.last_name/first_name/patronymic` fields, the
existing FIO normalization/formatting helpers, the C2 identity and specialist-provisioning contracts, and the single
SECURITY DEFINER `app.email_password_register_pending` write path. No second registration writer or table is allowed.

The traced primary file scope is the existing patient auth flow and pending-session contract, the two registration
API routes and tests, the password-credential port/repository and repository tests, the existing specialist signup
intent/provisioning port/repository/schema and tests, their additive Drizzle migration and existing bootstrap
function/grant/check/smoke artifacts. `#856` provider writers and display surfaces, historical backfill artifacts,
parser retirement, billing/settings/Rubitime and notification templates are protected adjacent scope. No PII may be
printed or committed; no real send, TEST/PROD DB operation, deploy, main/test push or destructive action is allowed.

Acceptance is API/UI required last+first and optional patronymic for both journeys; deterministic compatibility
display; structured columns written through the sanctioned function; resend/reload preserves all fields; specialist
FIO never aliases organization title; provisioning, duplicate-email rollback, OTP confirmation, retry and
membership idempotency remain green. The stage uses one whole-stage high-risk worker, independent audit, at most two
coherent correction rounds with full re-audit, then targeted auth/provisioning/SQL-contract tests, typecheck and
scoped lint. Full CI waits for the next accumulated milestone. An unresolved product interpretation or any finding
without an owner-review §19 line stops as an owner question rather than expanding scope. `#856` is intentionally
serialized after `#855` because it touches the same identity writers and displays.

The read-only launch trace then found a material current-code conflict that the older FIO plan did not resolve. Since
commit `f6193b324`, the live patient surface is passwordless email OTP: its start path creates an unknown provisional
client immediately with an email-local compatibility name, while the old email/password registration API remains
only in stale restore/resend compatibility code and has no initial UI. Phase 6 simultaneously requires every owned
identity-creation path to write structured FIO and the initiative's journey canon keeps patient launch passwordless.
Changing only the legacy route would therefore produce a false PASS; asking every returning patient for FIO would
degrade login; adding a new post-create transition would create an ambiguous identity before the gate.

Task `#855` is consequently `blocked`, `owner_waiting=true`, with one product question: restore a separate structured
patient registration and make `Войти по коду` existing-account login only (recommended), or collect FIO from every
email entrant before OTP. The unambiguous specialist and shared protected-writer work may continue in the isolated
branch, but the patient acceptance and task cannot be closed without that ruling. The first worker was interrupted
before a completed pass when its draft began adding structured columns to `specialist_signup_intents`, contradicting
the explicit Phase 6 `existing columns only` rule. Those uncommitted draft edits are being corrected in the same
worktree; no commit, DB mutation, deploy or external send occurred.

The corrected owner-unambiguous pass `bcb-c2f-855-unambiguous-20260719` then removed all intent schema/port/service
draft changes and delivered the common safe foundation: structured specialist signup UI/API/resend; the structured
legacy patient email/password API; one six-argument protected credential writer that atomically fills the existing
platform-user FIO columns and derives `display_name`; function-only migration `0208`; and aligned overlay,
REVOKE/GRANT and foundation checks. The unchanged intent stores only its derived specialist full-name label and the
separate organization title. It reported `65` focused tests plus webapp typecheck, scoped ESLint, Drizzle
journal/frozen and D3.4/hard-migration checks green.

Independent cross-model audit `bcb-c2f-855-unambiguous-audit-20260719` returned **PASS** for exactly that bounded
subset and reconfirmed that live email-OTP/invite behavior was not changed or falsely claimed complete. Its sandbox
reported unreadable `.env*` mounts; the lead independently inspected the real worktree status/diff and proved that
zero env files were changed. Commit `a9d70dc85` is integrated and pushed to `feat/doctor-ui-rebuild`; patch identity
was verified with `git cherry`, then the temporary worktree and branch were deleted. Task `#855` remains blocked on
the single patient passwordless-flow ruling and has no completion seals.

Process audit `bcb-process-audit-20260719-0544-opus` (Claude Opus, high, read-only) returned **PASS**: no
micro-fix/audit churn, the first worker stop mapped to the existing-columns canon, the single corrected pass plus one
cross-model audit was proportional to C2F risk, and deferred full CI/TEST deployment is correct while `#855` is
incomplete. Its only actionable next step is the already-recorded patient passwordless-registration ruling; `#856`
must not overlap the unresolved writer path. Recommendation-only notes were to attach live hygiene evidence and keep
the eventual C2F milestone full CI explicit.

The lead then supplied the command evidence the read-only Opus sandbox could not obtain: at `05:48 MSK`, HEAD and
`origin/feat/doctor-ui-rebuild` were both `bf9fb0487`; exactly one worktree and only feature/main branches existed;
the sole dirty path was the protected untracked `SESSION_HANDOFF_2026-07-17.md`; `git ls-files -m` found zero env
paths; taskdb showed `#855 blocked + owner_waiting`, `#856-#858 todo`; and no C2F/process-audit agent process remained.
The auditor's apparent `.env.example` dirt was therefore a sandbox mount artifact, not repository state. The next
two-hour process audit is due no later than `07:50 MSK` while the autonomous goal remains active.

## 2026-07-19 — C4/C5 owner-decision sheet launch checkpoint (`#887`)

The mandatory pre-C4/C5 decision gate from roadmap §7.3 is being prepared as a docs-only stage against the existing
`OWNER_DECISION_PACKET.md`; no new roadmap or parallel decision document will be created. Baseline is clean pushed
feature HEAD `9664cd34d`, one integration worktree and only the protected untracked owner handoff file. This stage
does not start C4/C5 implementation and does not touch application code, DB, TEST, deploy or infrastructure.

The packet must preserve UX08-01…12 and the already ruled/rejected/deferred OM/BD outcomes, replace the stale
16.07 `0 pending` framing with the later 18.07 commercial gates, and consolidate only genuinely open decisions:
quota policy, trial lifecycle, first SaaS PSP and supported legal/payment operations, clinic included/extra seats,
future store commerce, final platform-analytics formulas/layout, and the solo organization-section label. Every
question gets one plain-language recommendation, a safe dormant/fail-closed default and the exact dependent branch
it blocks. Resolved launch/future decisions are summarized rather than re-asked.

One whole-document worker owns the existing packet plus this canonical log, followed by one independent
scope-bound docs audit. There will be no serial correction/audit churn and no full CI for this documentation-only
gate; validation is exact source/link/status consistency. Taskdb `#887` is `doing`; `#751/#843/#844/#845/#854`
remain untouched and no commercial code proceeds from recommendations before owner answers.

## 2026-07-19 — C4/C5 owner-decision packet completed (`#887`)

One coherent docs-only presentation pass updated the existing
[`OWNER_DECISION_PACKET.md`](./OWNER_DECISION_PACKET.md), without creating a second packet or roadmap and without
starting C4/C5 code. Sources read for the exact current delta: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/README.md`,
`AGENT_AUTORUN_SCHEME.md`, `ORCHESTRATION_BINDINGS.md` (including Universal execution mode and one-audit discipline),
`OWNER_REVIEW_2026-07-18.md` §§P1–P5,15, `IMPLEMENTATION_ROADMAP.md` §7.3 and execution-mode reinforcement,
`OWNER_RULINGS_2026-07-16.md`, `OPERATING_MODEL.md` §§8–9, `BRANDING_DOMAIN_CONTRACT.md` §12,
`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §13, the current delta/scope of
`TARIFFS_PAYMENTS_ADMIN_PLAN.md`, and this log tail.

The packet now has exactly one consolidated current-gates section before historical UX08 details. It preserves
UX08-01…12 (`0 pending` only for that historical scope), reconciles OM-1…8 and BD-1…6, and replaces the stale
blanket current `0 pending` claim with eight stable plain-language IDs: tariff/SMS boundary, quota, trial, PSP,
clinic seats, analytics, solo label and explicitly deferred store commerce. Each records a direct owner question,
recommendation (not a ruling), safe default and the exact blocked branch. It states that C4 isolation is not
globally blocked and provider-neutral C5B contracts may proceed, while no real PSP activation/legal acceptance may.
The numeric values 14 days, 7 days, 30 days, 80% and three retries remain recommendations pending an owner answer.

Validation for this docs-only pass: internal relative links in the packet were checked for existing targets;
`rg` confirmed one consolidated current-gates heading and no remaining unqualified current claim of `0 pending owner
product decisions`; `git diff --check` passed; real worktree status/diff confirmed only this packet and this log were
changed. The worker sandbox's apparent env-example paths were read-only mount artifacts; live Git reports zero such
changes. No CI/lint/build, DB, TEST, deploy, infra or protected handoff file was touched. Taskdb was updated only by
the lead through the sanctioned port for `#887` stage state/run evidence.

Recommendation-only task-mapping risk is recorded, not changed: task `#751` currently spans constructor/billing
while roadmap splits C5A from `#844/#845`; task `#843` spans C4A enforcement and C5C commerce. No roadmap or taskdb
rewrite occurs at this gate. No owner decision is claimed until the owner explicitly answers the IDs in the packet.

The worker sandbox could not write shared Git metadata, so the lead owns the exact-path commit after live diff
inspection. This is a sandbox boundary rather than a repository defect; no unrelated file was staged.

### Independent gate and integration

The single permitted cross-model audit `bcb-c4-c5-owner-decision-audit-20260719` (Claude Sonnet, high, read-only)
returned **PASS** against all ten packet criteria: one document/one current section; complete UX08/OM/BD
reconciliation; eight stable current IDs; explicit recommendation/default/blocking branch for each; no unqualified
`0 pending`; no false execution authority; and no audit-driven scope growth. The auditor added no product
requirements and confirmed that presentation/docs one-audit discipline was respected. Its only disclosed limitation
was lack of shell access for Git commands; this was not a finding.

The lead independently ran the missing live checks on the exact commit: only `OWNER_DECISION_PACKET.md` and this
`LOG.md` changed, `git diff --check` passed, both relative links resolve, and no tracked env path is modified. The
audited patch was integrated as `66c95c0bb`. No CI, build, DB, TEST or deploy is warranted for this docs-only gate.
Task `#887` can therefore be sealed `done`; owner answers to C4C5-01…07 remain separate branch-local gates, while
C4C5-08 stays explicitly deferred. `accepted` remains owner-only.

## 2026-07-19 — C4 readiness and shared S4-0/S4-1 launch (`#888`)

Two independent read-only traces checked C4B/C4C and C4D against current code, taskdb and the roadmap. C2 identity
dependencies are closed by `#840/#841`; blocked C2F `#855` is downstream identity cleanup and does not block C4.
Future store decisions do not block C4D. No active C4/S4 agent process, branch or worktree was found, and the
integration worktree was clean except for the protected owner handoff file.

The genuine shared blocker is S4-0/S4-1: the current 14-key entitlement foundation is still dormant/default-on,
`requireEntitlement(mechanic)` repeats doctor-workspace auth, and only course creation is partially gated. CMS,
courses and library cannot honestly close list/direct/action/nav isolation by adding local checks around that old
boundary. C4B also overlaps the separate active Doctor DNA task `#885` in master-detail UI files, so it must not run
in parallel before file ownership is reconciled.

Task `#888` therefore starts as one complete high-risk shared-foundation stage covering S4 §§5-6, not a courses/CMS
micro-slice. `#751` remains only C5A constructor/quotas/trial, while billing remains `#844/#845`; the taskdb notes
record this split so the old broad `#751` title cannot create duplicate implementation. Full stage scope, protected
files, acceptance and execution mode are recorded in the required S4 execution log. After integration the intended
order is bounded C4C hide/deny, C4B tenant cutover/master-detail after DNA reconciliation, then C4D own/base library.

## 2026-07-19 — U0 contract, ownership and data-gap readiness (`#889`)

**Run ID:** `U0-889-20260719-BE30065F`. **Base:**
`be30065f24810a49a46a2aa3b5ef5095f3a27309` (`feat/doctor-ui-rebuild`). This was one docs-only current-source
handoff: no application/schema/migration/script/DB/service/deploy/environment/taskdb write, commit or push.
Changed files are this `LOG.md`, `IMPLEMENTATION_ROADMAP.md`, and the directly proven stale existing
`ROUTE_MIGRATION_MAP.md`; the latter was corrected in place because the U0 route denominator is acceptance-critical.
The lead current-state consistency pass also updated only the active denominator notices in `TARGET_IA.md`,
`CURRENT_STATE_BASELINE.md`, and `ROADMAP.md`; dated inventories and historical audit results remain unchanged.
The live worktree has no tracked environment-file changes; provider-sandbox hash warnings were not treated as
repository state.

### Canonical basis and current facts

Read authority: `AGENTS.md`, `CLAUDE.md`, repository/docs READMEs, `AGENT_AUTORUN_SCHEME.md`,
`ORCHESTRATION_BINDINGS.md`, owner review, roadmap §§1–7.3/U0/dependency registry, initiative README/log,
Foundation `SEQUENCE.md`, `SAAS_ENFORCE_ROADMAP.md`, `R2_READINESS_CLOSURE.md`, T0.4 and P0.11, plus current
membership/principal/settings/entitlement, provisioning, patient-organization, booking and route/screen/journey
sources. Historical P0/R2 material was read as provenance only; no historical checklist was run as live work.

The roadmap §6.2a is the integration handoff: Foundation basis; direct/scoped ownership paths; sanctioned
membership/principal/settings/entitlement accessors; present versus missing migration/API contracts; every §6 gap's
stage/task gate and safe fail-closed behavior. It records the material current limitations rather than inferring
readiness: P0.11's webapp settings write chokepoint is present, but TEST integrator mirror sync lacks locked-mode
principal stamping; `requireEntitlement` exists but its resolver remains default-on/dormant; public booking's exact
organization path does not yet prove atomic enrollment or safe portal continuation; patient context still has the
recorded Today principal defect.

### Reconciliation and boundary

The current target/composition mapping remains `57/57` canonical screen IDs. Re-running the route census found
`152` current `page.tsx`, not the historical `150`: the map lacked public `book/[slug]`, clinic invite acceptance,
and the global-admin system-health alias. They are now exactly once in the existing map, so its current denominator
is `152/152`; the former `150/150` evidence is explicitly historical. J1–J7 and
ACQ/STF/PIN/SMS/PBK/MOR/ERR are traced in the existing journey registry and reattached in §6.2a to their current
mechanics, downstream stages and defaults. All owner outcomes are classified: resolved-future and absent nodes remain
absent; C4/C5 commercial questions and the already recorded #855 patient passwordless-registration policy are
explicit named owner-gated branches, not unclassified decisions. No new owner question was created.

No overlap: #888 S4 registry/chokepoint remains blocked in isolated commits and was neither copied nor assumed to be
in this base. C2/C3 are evidence-only (verified, not reimplemented); #855's integrated `a9d70dc85` subset is not
misreported as its blocked patient-flow completion. U0 does not alter Foundation/S4/FIO owned files.

### Validation and remaining gate

- Mechanical checks used read-only Node/shell: target ↔ composition is `57/57` with missing/extra/duplicate `0`;
  `find apps/webapp/src/app -name page.tsx` is `152`; route-map allocation is now `21 + 82 + 49 = 152`.
  The normative direct-dependency table has `19` rows. Its U8 family is deliberately a deferred family with three
  level-4 stages, so the document has `16` level-3 U-stage headings rather than pretending the two counts are the
  same check.
- Initiative-local link scan found one pre-existing historical missing screenshot manifest referenced by
  `UX07_PROTOTYPE_INDEX.md`; it is outside U0's allowed factual-correction scope and does not alter the current
  route/screen/DAG result. No new link was introduced by U0.
- Focused code-search followed by targeted source reads confirmed the sanctioned accessors and the stated current
  gaps; names/tables were not treated as proof without a call-path/checklist trace.
- Scoped `git diff --check -- docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/{IMPLEMENTATION_ROADMAP.md,ROUTE_MIGRATION_MAP.md,TARGET_IA.md,CURRENT_STATE_BASELINE.md,ROADMAP.md,LOG.md}`
  passed. The lead repeated unscoped `git diff --check` in the live worktree and it passed; the worker sandbox's
  `.env.example` hash warning was a mount artifact, not a tracked diff.

**Result:** U0 worker evidence is complete and later U-stages have one sanctioned handoff in the existing roadmap.
The worker did not claim its own audit gate.

### Independent U0 audit and closure

- **Audit run:** `bcb-u0-contract-readiness-audit-20260719`; Claude Sonnet 5, high, read-only, cross-model to the
  Terra worker. Verdict: **PASS** against every U0 roadmap requirement; no owner question and no valid finding.
- The auditor independently counted `57` target/composition IDs, `152` current page files, all `19` DAG rows and
  the complete J1–J7/alias ownership. Its shell-less sandbox could not reproduce the exact commands, so the lead
  repeated them in the live worktree: `57/57`, `152 actual = 152 refs = 152 unique`, missing/stale/duplicate `0`,
  DAG unknown/cycle `0`, changed-doc broken links `0`, and unscoped `git diff --check` PASS.
- Live `git status` confirms no environment file changed; the auditor's `.env.example` rows were the known read-only
  mount artifact. No correction or second audit round was opened.
- **Closure:** all U0 completion boxes are checked. No app tests, typecheck, build, DB, DEV/TEST/PROD, deploy or full
  CI was run because the complete stage is documentation/current-state reconciliation only.

## 2026-07-19 — C4B CMS tenant boundary and master-detail launch (`#853`)

**Checkpoint.** Integration branch `feat/doctor-ui-rebuild` is at `2718fe68b`; origin is aligned. The latest live
TEST code remains `4a889093d` on the prepared persistent TEST database. This stage does not deploy or reset TEST and
does not touch production. Task `#853` maps only to owner-review §§11-12 and roadmap C4B. Prerequisites are closed:
C2 identity/membership, U0 current-contract handoff, and S4-0/S4-1 entitlement registry/chokepoint `#888`.

**Current facts and gap.** Existing CMS writes already reuse doctor-workspace principal stamping, Drizzle repositories,
the existing `cms_pages` entitlement, and `content_sections.organization_id` / `content_pages.organization_id`.
Migration `0153_p0_4_p8_catalog_content_audit_org.sql` assigned legacy NULL content rows to the canonical owner
organization, so C4B does not invent a migration or NULL-row policy. Read paths and direct doctor pages are not yet
consistently organization-scoped or entitlement-gated. The current shell also renders the selected section's
materials/actions below navigation in the left pane, keeps a duplicate `Разделы` row, and sends create-section to a
full page instead of opening the form on the right.

**One-stage acceptance.** Owner organization with `cms_pages`: the left pane contains only available system/user
sections and create-section; choosing `Разминки` or a user section shows its materials/actions on the right; choosing
a material opens the editor there; create-section opens on the right and the saved row appears on the left. A second
organization without the entitlement sees no CMS shell and cannot obtain owner sections/pages/media through list,
direct doctor routes, counts, search or picker. `_cms_unassigned`, duplicate service rows, and a CMS `Медиа` nav row
remain absent; `Файлы и медиа` stays the canonical media-management surface. No blog/CMS product expansion.

**Ownership and file scope.** Reuse `requireDoctorWorkspaceContext`, `withDoctorWorkspacePrincipal`,
`requireEntitlementForAction(..., "cms_pages")`, the existing organization columns, Drizzle ports/repos, and existing
media/files authorization. Allowed implementation scope is the current doctor content page/shell/nav and direct
new/edit/section pages/actions, `modules/content-sections` ports only where contract scoping requires it,
`pgContentSections.ts`, `pgContentPages.ts`, their focused tests, and a compact existing-principal patient read guard
only if needed to prevent an authenticated cross-organization leak without changing anonymous legacy behavior.
Schema/migrations, a new entitlement/resolver/route tree, courses, tariff/billing, FIO, privacy/legal docs, shared
Doctor DNA primitives/theme files, and `docs/_TODO/SESSION_HANDOFF_2026-07-17.md` are protected. Current Doctor DNA
S0 owns shell/theme plus Today/Clients/Settings; C4B changes no shared DNA file, so file ownership is reconciled.

**Validation and live scenario.** Focused CMS and repository tests must include organization A/B list/direct/count/
picker negatives and entitlement OFF/ON; webapp typecheck and scoped lint follow. Full CI runs once at the completed
C4B integration milestone, not during correction iterations. Live DEV uses the single existing `127.0.0.1:5200`
server: `dev:admin` at `/app/doctor/content?section=warmups` and `dev:clinic-admin` for entitlement-off denial,
desktop `1440x900` and mobile `390x844`. No real send, second Next server, DB reset, TEST/PROD action or PII output.

**Execution mode.** One Terra high `worker-hard` owns the coherent data/API/UI/test slice in an isolated worktree;
one independent critical tenant audit checks the whole C4B checklist. If it fails, one integrated correction owner
gets the full report followed by one full re-audit. Findings outside owner-review §§11-12 are owner questions, never
automatic scope. Census evidence: `bcb-c4b-853-census-20260719`.

### Worker handoff — C4B `#853` (codex/c4b-853-cms-tenant)

- Scoped content-section/page Drizzle reads now constrain an established patient or doctor organization principal,
  including direct IDs, slugs, counts, metadata and section-slug history; the no-principal anonymous public path
  deliberately keeps its legacy behavior.
- Doctor content entry, direct edit/new/section pages, inline editor and formerly ungated auth/reorder/visibility
  actions now require the current workspace plus `cms_pages`. The existing media/files authorization surface was
  reused unchanged.
- Content hub is a navigation-only left pane. Selected-section materials, inline page creation, inline section
  creation and the editor render in the right workspace; mobile returns from materials/editor to sections.
- Focused Vitest, webapp typecheck and lint were requested but could not start because this isolated worktree has no
  dependencies: the mandatory `operator-db-schema` pre-step cannot resolve `drizzle-orm`; `pnpm install
--frozen-lockfile` is blocked by the workspace's read-only pnpm project-store mount (`EROFS`).

### Integrated audit correction (candidate `5a03275a4`)

- Media list/search/count, item/direct reads, previews and playback now run under the existing staff or patient
  organization principal; normal media is exact-organization scoped, while the established program-submission ACL
  remains its separate contract. Doctor proxy, presign and multipart uploads stamp the already-present
  `media_files.organization_id`; no schema, migration, resolver or new media surface was added.
- Patient Home now requires the existing `cms_pages` entitlement and workspace principal for its CMS reads and
  server actions. Content inline creation is wired at the public list component boundary; mobile Back follows
  editor → materials → sections. The direct-new page no longer recreates a Media/service sidebar; the hub keeps
  Patient Home and Help in its system area and refreshes section navigation after a successful inline save.
- The lead reused the integration worktree dependencies through temporary local symlinks without installing packages
  or starting a dev server. Focused CMS/media/Patient Home tests pass (`95/95` across the correction matrix), and
  scoped ESLint plus `git diff --check` pass. Candidate typecheck exposed and fixed two route syntax errors and two
  Patient Home narrowing errors; its remaining failures are dependency-resolution artifacts of the isolated
  worktree, so the authoritative typecheck and milestone CI run once after integration.

### Final C4B submission tenant correction

- The critical re-audit reproduced a cross-organization path for `program_item_submission`: the patient insert did
  not stamp `organization_id`, and read predicates treated the usage type as an organization bypass. The final
  correction stamps the active principal organization on submission insert and requires exact `organization_id` on
  list/search/count/picker, direct metadata/URL, access, playback, redirect and preview reads. The existing uploader
  or doctor/admin submission ACL now runs only after the repository returns a same-organization row. Migration
  `0152` remains the legacy-row authority; no resolver, schema or migration was added.
- A deterministic fake SQL/Drizzle adapter evaluates the real query predicate against normal and submission rows
  belonging to organizations A and B. It proves A/B list totals, search, picker-shaped video selection and direct
  reads; the vulnerable `usage_purpose OR organization_id` query exposes the B submission and fails the matrix.
  The corrected query denies doctor B the org A submission, while uploader A and staff A remain allowed inside org A.
- PASS focused C4B/security matrix: `14` files / `126` tests. This includes behavioral `cms_pages` denial/success for
  content actions and direct auth mutation. The complete entitlement ON/OFF shell click-through remains the declared
  post-integration live DEV gate at desktop `1440x900` and mobile `390x844`; it is not replaced by source-string tests.
  PASS scoped ESLint and `git diff --check`.
- Candidate typecheck found and fixed the C4B Patient Home narrowing call at `actions.ts:311`; its remaining output
  is limited to known isolated-worktree dependency-resolution artifacts (`luxon` through missing integrator
  dependencies and stale linked `@bersoncare/db-principal` exports). Full typecheck and milestone CI remain mandatory
  after integration. No DB, DEV/TEST/PROD, deploy, external send or PII action was performed.

### Final confirm/rollback organization closure

- Confirm pre-read, ready mutation and pending rollback deletion now require the exact active `organization_id` in
  addition to media ID/uploader/status. Existing doctor presign, confirm and multipart init/complete paths enter the
  canonical workspace principal around these calls, preserving same-organization uploads without an overload or
  bypass. A stateful A/B adapter proves that the same uploader in org B cannot receive ready/pending rows from org A,
  confirm them or delete them after invalid S3 metadata; org A can still confirm and delete its own pending rows.
- PASS focused confirm/security matrix: `7` files / `57` tests; PASS scoped ESLint and `git diff --check`. No schema,
  migration, resolver, DB write, DEV/TEST/PROD, deploy, external send or PII action.

## 2026-07-19 — C4A clinic boundary: entitlement, seats, invite limit (`#843`)

**Checkpoint.** Base `feat/doctor-ui-rebuild` at `f082e6e01` in worktree `codex/c4a-clinic-boundary-843`
(`/home/dev/dev-projects/bcb-c4a-clinic-boundary-843`); not pushed or merged. Prerequisites closed: S4-0/S4-1
registry/chokepoint `#888` (`requireEntitlement`, `MECHANIC_REGISTRY`, `protectedActionRegistry.ts`), C2 identity/
invite (`organization_member_invites`, `app.accept_org_invite`), C3 settings shell (Team was a fail-closed redirect
stub pending this stage). Scope matches roadmap C4A and `OWNER_REVIEW_2026-07-18.md` §§P1 (clinic mode as tariff
mechanic), 14 (invite journey), 15 (settings IA/Team tab), and the 2026-07-19 addendum C4C5-05 (seat policy: active
`owner`/`doctor` membership consumes a seat, non-clinical `admin` does not, pending `doctor` invite reserves a seat,
included count/price are tariff data, downgrade preserves memberships and blocks only new growth). Add-on seat
price/purchase (C5C) and billing/constructor UI (C5A/C5B) are explicitly out of scope.

**Registry/schema.** Added the 15th mechanic key `clinic_team` (`org-entitlements/types.ts`). Added nullable
`saas_tariffs.included_seats` and `saas_org_entitlement_overrides.seat_limit_override` via hand-authored
`0212_clinic_team_seat_limit.sql` (+ `_journal.json` entry), matching the existing dormant-table convention used by
`0180_store_entitlements.sql` (this pair of tables is intentionally outside `drizzle.config.ts`'s auto-diffed schema
list). `resolveClinicSeatLimit()` in `org-entitlements/service.ts` reuses the exact override > tariff > default
precedence already proven for boolean mechanics; no second entitlement/seat mechanism was created. No migration was
applied to any live database.

**Seat usage.** New module `modules/clinic-seats/service.ts` composes the existing `OrganizationMembershipPort`,
`OrganizationInvitesPort` and `OrgEntitlementsPort` (no new infra/repo) to compute `{limit, used, available}`:
active `owner`/`doctor` memberships plus pending `doctor` invites count against the effective limit; pending/active
`admin` never consumes or is blocked. Wired into `buildAppDeps.ts` as `deps.clinicSeats`.

**Server-side gate.** `requireEntitlement(gate.ctx, "clinic_team")` now guards every export in
`GET/POST /api/clinic/invites`, `DELETE /api/clinic/invites/[id]` and `GET /api/clinic/members` — entitlement OFF
denies the whole capability (not just writes), matching "hides/forbids Team UI and direct API." `POST` additionally
calls `clinicSeats.assertSeatAvailableForInvite(organizationId, role)` before `createInvite`; an admin invite is
always allowed, a doctor invite is denied `409 seat_limit_reached` at/over the effective limit. All four exports are
mapped in `protectedActionRegistry.ts`; `check:s4-entitlement-coverage` passes (`29` protected actions, self-test
green).

**UI.** Settings hub gains a `"team"` tab (`SettingsHubTabs.tsx`, `settings/page.tsx`), visible only to
`canManageOrganization` with `clinic_team` enabled (checked via `requireEntitlementForAction`, the sanctioned
non-route entry point — calling `assertMechanicEnabled` directly from a page would trip the checker's static bypass
scan, so the page uses the same wrapper routes use). An unentitled or unauthorized direct `?tab=team` link redirects
to `/app/settings`, same as the existing `organization`/`billing` guards. New `TeamSection.tsx` (client) renders
members, seat status, an invite form (email + admin/doctor role) and pending-invite revoke, calling the existing
`/api/clinic/invites` and `/api/clinic/members` routes and `router.refresh()` after mutations — no new API surface
beyond the three route changes above. The legacy `doctor/clinic/members` redirect stub now points at
`/app/settings?tab=team` instead of the bare hub.

**Validation.** Targeted Vitest: `org-entitlements/service.test.ts` (override/tariff/default precedence for
`resolveClinicSeatLimit`, A/B non-leak), `clinic-seats/service.test.ts` (seat counting incl. disabled-membership
exclusion, downgrade-below-usage, unlimited, admin-always-allowed), `api/clinic/invites/route.test.ts` +
`route.entitlement.test.ts` (auth → entitlement → seat-check → service ordering, forged-org body ignored, admin
bypasses seat check), `api/clinic/invites/[id]/route.test.ts` (new — entitlement gate + revoke/not-found/invalid-id),
`api/clinic/members/route.test.ts` (entitlement gate + `seatConsuming` projection), `settings/page.test.tsx` (tab
visibility for owner vs ordinary specialist, fail-closed direct-tab redirect, rendered Team content), new
`settings/TeamSection.test.tsx` (invite submit, seat-limit error surfaced, revoke). Result: `12` files / `60` tests
pass. `pnpm --dir apps/webapp run typecheck` and full `pnpm --dir apps/webapp run lint` (ESLint + all repo invariant
checkers incl. `check-drizzle-journal-sync`) pass. No full root CI, DB, DEV/TEST/PROD, deploy or external send.

**Residual risk (recorded, not fixed in this stage).** The seat check and the invite insert are two separate
service calls, not one transaction; the existing concurrency primitive (`pgOrganizationInvites.createReplacingPending`'s
advisory lock) is keyed per `(organizationId, email)`, not per organization, so two _different_ emails invited for
the same organization at the same instant could both pass the JS-level seat check before either commits. This is a
soft business-limit race (occasional one-seat overshoot), not a tenant-isolation or security gap, and building a new
org-wide seat-reservation lock was judged out of the minimal scope for this stage; flagging for owner/lead awareness
rather than inventing a second concurrency mechanism. Live DEV click-through (entitlement OFF hides the tab/denies
the API; ON shows it; at-limit denial toast) was not performed by this docs+code worker and remains open for the
separate audit/visual-acceptance pass.

**Commit blocker (environment, not code).** This worktree's shared `.git/worktrees/bcb-c4a-clinic-boundary-843/`
admin directory sits on the sandbox's read-only root filesystem (`/`, `ro`); only this worktree's working-tree files
are on a writable bind mount. `git add`/`git commit` fail with `Unable to create .../index.lock: Read-only file
system` — the same class of blocker the `#888` worker recorded in its evidence log. All files listed above are
written and verified on disk; no commit exists yet. The lead/owner needs to run the commit from a writable context
(e.g. the live/main worktree, pulling this branch's working tree) before this stage can be pushed or merged.

### C4A audit correction (`#843`)

The critical re-audit found five issues in the initial submission (commit `0c437a970`), all closed in this
correction:

- **Seat consumption was keyed on role, not clinical capacity.** `owner`/`doctor` role was used as the seat-consuming
  signal; an `owner`/`admin` with no specialist binding does not treat patients and must not consume a seat, while an
  `admin` bound to a specialist profile does. `isSeatConsumingMember()` (`modules/clinic-seats/service.ts`) now keys
  strictly on `status === "active" && specialistId != null`, independent of role; `api/clinic/members/route.ts` and
  `settings/page.tsx` both call it instead of re-deriving the old role check.
- **`clinic_team` silently defaulted to enabled/unlimited.** The compatibility resolver's `override ?? tariff ?? true`
  gave every org with no tariff/override an enabled mechanic and a `null` (unlimited) seat limit. `clinic_team` is a
  new capability with no legacy fleet depending on default-on, so `MECHANIC_DEFAULT_ENABLED` (`org-entitlements/types.ts`)
  makes it the one fail-closed (default-OFF) exception, and `resolveClinicSeatLimit` returns `0` whenever the
  mechanic itself is off.
- **No finite fallback when enabled without an explicit seat count.** Owner ruling (C4C5-05: "solo includes one
  seat") is now encoded as `CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE = 1`; `resolveClinicSeatLimit` and both SQL-side
  re-checks use it in place of the removed unlimited (`null`) state. `ClinicSeatStatus.limit`/`available` are now
  `number`, not `number | null`.
- **The seat check and invite insert were not atomic.** The advisory lock in
  `pgOrganizationInvites.createReplacingPending` was keyed per `(organizationId, email)`, so two different-email
  doctor invites at the same instant could both pass the JS-level pre-check before either committed (the residual
  risk flagged in the original submission). The lock is now organization-wide
  (`pg_advisory_xact_lock(hashtextextended('clinic_invite_seats:' || organizationId, 0))`), and the authoritative
  `clinic_team` enabled + seat-capacity check is duplicated as SQL inside that same locked transaction, both in
  `createReplacingPending` and in `app.accept_org_invite` (so an invite created before a downgrade or exhaustion
  re-checks current capacity at accept time, not creation time, and is left pending — not accepted — on denial).
  Acceptance takes the same organization-wide lock before its invite-row lock. An accepted doctor invite remains a
  reservation while its new membership is waiting for first-session specialist provisioning; once the binding is
  created, the reservation is replaced by the active specialist-binding count without a temporary free-seat gap.
  `accept_org_invite`'s `SECURITY DEFINER` owner grants `SELECT` on `saas_tariffs` and
  `saas_org_entitlement_overrides` to read them.
- **Seat columns had no data-level nonnegative guarantee.** New additive migration `0213_clinic_team_seat_nonnegative.sql`
  adds `CHECK (... IS NULL OR ... >= 0)` on `saas_tariffs.included_seats` and
  `saas_org_entitlement_overrides.seat_limit_override`, mirrored in the Drizzle schema
  (`db/schema/saasEntitlements.ts`) so `check-drizzle-journal-sync` stays green. No migration was applied to any live
  database.

**Validation.** Targeted Vitest re-run across the ten touched files: `10` files / `69` tests pass, including the new
race-condition (org-wide lock, atomic SQL re-check exclusion of the invite's own reservation) and nonnegative-check
coverage. Full `org-entitlements`/`app-layer` sweep: `64` files / `321` tests pass (`2` pre-existing unrelated
skips). `pnpm --dir apps/webapp run typecheck` passes. Scoped `eslint` on the 16 changed TS/TSX files passes.
`check-drizzle-journal-sync` passes. `check:s4-entitlement-coverage` passes (`29` protected actions, unchanged).
`git diff --check` is clean on all task-related paths. No DB, DEV/TEST/PROD, deploy or external send.

**Lead pre-commit closure.** Before committing, the orchestrator caught that the accept path also had to acquire
the organization-wide lock before its invite-row lock, and that an accepted doctor invite must keep reserving its
seat until first-session specialist provisioning creates the binding. The shared invites port now counts this
transitional reservation; PostgreSQL create/accept capacity queries count it atomically. Focused post-change tests
covered clinic-seat service, organization-invite service/in-memory port and the PostgreSQL SQL contract (`28`
tests; one new source-order assertion was corrected and only its `9`-test file rerun). Webapp typecheck, scoped
ESLint, journal sync, S4 coverage (`29` actions) and `git diff --check` all pass after the closure.

**Environment note.** The sandbox could not write the linked-worktree Git admin directory, so the lead performs the
exact-path commit after reviewing the diff. Host-side `git status` contains only the task paths listed above.

### Second correction (`#843`) — same-email route bypass, admin accept-after-OFF, executable concurrency proof

The second critical re-audit (`bcb-c4a-843-critical-reaudit-20260719.md`, base `f082e6e01`, candidate `0c437a970` +
`b676d8073`, verdict FAIL) found three remaining plan-aligned blockers on top of the first correction above, all
closed in this pass. Scope stayed inside the same three files/areas the audit named; no DB mutation, deploy, server
start, taskdb change or full CI was performed.

- **P1 — same-email replacement still failed through the real route at the limit.** `POST /api/clinic/invites`
  called a route-level best-effort pre-check (`clinicSeats.assertSeatAvailableForInvite`) that only received
  `(organizationId, role)` — it could not know a same-email request replaces (not adds to) that email's own pending
  reservation, so at limit=used it always returned `seat_limit_reached` before the authoritative, replacement-aware
  `createReplacingPending` transaction ever ran. Fix: removed the pre-check call from
  `api/clinic/invites/route.ts` entirely; the route now relies solely on `createInvite`'s atomic, org-locked result
  (already mapped to `409` for both `already_member` and `seat_limit_reached`). Deleted the now-dead
  `assertSeatAvailableForInvite` from `clinic-seats/service.ts` (no other caller existed) and its tests; updated
  `route.test.ts` (new same-email-at-limit regression), `route.entitlement.test.ts` (re-authored the entitlement/
  ordering suite without the removed seat pre-check step) and `protectedActionRegistry.ts`'s descriptive
  `serviceBoundary` text for `clinic-team.invites.create`.
- **P1 — an admin invite could still activate membership after `clinic_team` was switched OFF.** Inside
  `app.accept_org_invite` (`deploy/postgres/organization-member-invites-rls.sql`), the current-entitlement re-check
  was scoped inside `IF v_invite.invited_role = 'doctor' THEN`, so an `admin` invite skipped it and could still
  insert/activate a membership after downgrade/OFF (admin invites never consume a numeric seat, but acceptance is
  still growth through the paid `clinic_team` capability). Fix: hoisted the `clinic_team` enabled check out of the
  doctor-only block so it runs, and can fail closed, for **every** invited role before any
  `platform_users`/membership/invite mutation; added a new terminal code `entitlement_disabled` (function now
  returns it and stops before mutation when disabled). Numeric seat-capacity computation stays doctor-only,
  unchanged in shape. Propagated the new code through `organization-invites/ports.ts`
  (`AcceptOrganizationInviteResult`), `pgOrganizationInvites.ts`'s `mapAcceptFailureCode`, and
  `accept/confirm/route.ts`'s `acceptErrorStatus` (`entitlement_disabled` → `403`, `seat_limit_reached` stays `409`).
  Added a negative regression in `accept/confirm/route.test.ts` (admin invite denied `403` after OFF, no session
  established) and re-authored the two SQL contract assertions in `pgOrganizationInvites.test.ts` to check the
  entitlement gate runs before, and independently of, the doctor-only capacity block. The client-facing
  `inviteAcceptState.ts` copy map has no dedicated case for the new code (falls through to the existing generic
  "service unavailable" default) — the same fallback the pre-existing `seat_limit_reached` code already uses; left
  as-is to avoid unrelated UI scope.
- **P1 validation gap — concurrency was asserted structurally, not executed.** Added
  `apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` (new package script
  `check:c4a-843-clinic-invite-concurrency`), following the private `/tmp` PostgreSQL 16 pattern from
  `smoke-s5-1-runtime-settings-contract.mjs`: owns a disposable cluster/socket/database, reads no application env
  and never touches DEV/TEST/PROD, aggregate-only output, guaranteed stop+cleanup in `finally`. It applies the
  `app.accept_org_invite` function **verbatim** (string-sliced straight out of the overlay SQL, not retyped) into a
  minimal synthetic schema, and replays `createReplacingPending`'s five SQL statements — also extracted verbatim
  from `pgOrganizationInvites.ts` by stripping `//` comments and slicing template literals, not hand-duplicated —
  through real concurrent `pg` client connections (control-flow glue between statements is hand-written but mirrors
  the source 1:1, checked by `--self-test`). Four scenarios pass against a real PostgreSQL 16 server in this
  sandbox: (1) two concurrent different-email doctor creates at the final seat → exactly one succeeds, the other
  denied `seat_limit_reached`; (2) same-email replacement at the exact limit run concurrently against a
  different-email contender → replacement succeeds, contender denied, exactly one pending reservation remains; (3)
  concurrent create-vs-accept for the last seat (two separate connections, `Promise.all`) → accept succeeds (its own
  reservation excluded), the concurrent different-email create is denied regardless of which side the advisory lock
  favors, no oversubscription; (4) after accept, the membership is an active, unbound reservation
  (`countSeatReservationsByOrganization` = 1); binding a specialist correctly drops that reservation-only count to 0
  while the seat stays consumed via the bound-member clause (verified both by direct count and by a further
  different-email create attempt still being denied `seat_limit_reached` post-binding). `apps/webapp/src/infra/
repos/pgOrganizationInvites.test.ts` keeps its static SQL-shape contract role; it does not replace it.
  Deadlock note for future maintainers: each concurrent branch commits its own transaction the instant its own
  work finishes (`runInTransaction` helper), not after `Promise.all` settles every branch — committing late would
  hold the org-wide advisory lock open past the point of real work, deadlocking a sibling that's genuinely blocked
  waiting on that same lock.

**Validation.** `node apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs --self-test` and the full run
(private PostgreSQL 16 cluster) both pass, all four scenarios above green. Targeted Vitest re-run across the nine
affected files: `9` files / `49` tests pass (`route.test.ts`, `route.entitlement.test.ts`, `accept/confirm/
route.test.ts`, `pgOrganizationInvites.test.ts`, `organization-invites/service.test.ts`, `clinic-seats/
service.test.ts`, `invites/[id]/route.test.ts`, `clinic/members/route.test.ts`, `accept/start/route.test.ts`).
`pnpm --dir apps/webapp run typecheck` passes. Scoped `eslint` on all 12 changed TS files plus the new `.mjs` script
passes with no findings. `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` passes (no schema/migration touched
this round). `pnpm --dir apps/webapp run check:s4-entitlement-coverage` passes (`29` protected actions, self-test
green, unchanged count — only the descriptive `serviceBoundary` string changed). `git diff --check` is clean on all
task-related paths (repo-wide `git diff --check` errors on pre-existing unrelated `.env.example` files present in
`git status` before this session started; not part of this task's diff). No full root CI, DB, DEV/TEST/PROD, deploy,
server start or taskdb write.

## 2026-07-20 — U1 bounded post-fix audit seal (`#916`)

**Verdict: PASS.** This is the single bounded independent check of the only residual from
`bcb-u1-916-sol-final-reaudit-20260720`; it did not reopen the U1 checklist or search for new requirements. Audited
feature HEAD: `70d042e4f` (the U1 correction itself is `367f64ca9`, detector hardening `10616885d`).

- `patientHomeDoctorSettingsActions.ts` uses only the canonical `requireDoctorWorkspaceContext` entry: practice-target
  and warmup-rotation writes additionally require `membershipRole === "owner"`; specialist-configurable cooldown and
  mood writes still require the bound clinical workspace; the focused negative proves that a platform admin without
  that workspace is denied and no setting is written.
- `doctorLaunchCensus.test.ts` keeps an exact doctor Server Action manifest, rejects raw
  `getCurrentSession`/`canAccessDoctor` authorization, and its executable directive cases cover leading whitespace,
  block comments, line comments, single quotes and the false-positive non-directive case.
- Final focused command:
  `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patient-home/patientHomeDoctorSettingsActions.test.ts src/app-layer/guards/doctorLaunchCensus.test.ts --reporter=dot`
  — **2 files / 11 tests PASS**. The first attempt did not execute tests because `apps/webapp/node_modules/vitest`
  still pointed at the already-removed U2 worktree; `pnpm install --offline --frozen-lockfile` repaired only the local
  dependency links, after which the unchanged focused command passed. No application code, DB, DEV/TEST/PROD,
  deploy, external send or full CI was touched.

This PASS closes only the previously identified Server Action residual and supplies the missing independent
post-fix audit evidence; it is not another whole-stage audit or a source of follow-up scope.

## 2026-07-20 — U2 management/account shell terminal closure (`#918`)

**Result.** Added one capability-driven management landing and one shared personal account area. A management-only
owner lands on `/app/manage` and receives no clinical links; a bound owner can move explicitly between management and
clinical work; a specialist can use `/app/account` but cannot open management; explicit platform mode remains in the
platform shell. Personal email, timezone, notification and PWA-install components/writers are reused, not copied.
The existing organization/reminder writer, entitled Team surface and owner-only billing placeholder remain single
guarded compatibility destinations. Booking setup, U3S security/registration, U3A team behavior, C4C courses, C5
billing behavior, SMS/support ownership and OPS/assistant surfaces were not implemented here.

**Audit and correction.** The one-pass independent U2 audit passed the role, direct-route, shell, legacy and OPS
matrix and found one plan-mapped navigation delta: entitled Team and the owner billing placeholder were safe but not
discoverable from management. The management overview now exposes those destinations under their existing entitlement
and owner guards. Live rendering then caught a server/client module-boundary error in link styling; the page now imports
the server-safe button-variant module and an executable source assertion prevents recurrence. No serial audit loop was
opened.

**Milestone verification.** Focused integration tests passed `74/74`, with `3/3` navigation-correction and `4/4`
server-render regression checks. The single full-CI attempt reached `test:webapp` after green lint/typecheck/HLS and
integrator (`1271/1271`) but its linked worktree dependencies resolved stale packages from the feature worktree. After
an isolated frozen offline install, execution resumed from the failed step only: webapp `8134` passed (`51` skipped),
media-worker `60/60`, root build, webapp build and audit all passed. Stale U1 fixtures were updated to exact organization
guards; no runtime authorization was weakened. DEV role/direct-route checks passed for clinic owner, specialist and
platform admin. Desktop `1480×1024` and mobile `390×844` management/account screenshots passed after an additive DEV
migration; no reset, dump, TEST/PROD or deploy action occurred.

**Keyboard evidence closure (historical; labels superseded 2026-07-20).** A live clinic-owner pass on `/app/manage` at feature HEAD `70d042e4f` used the same
single DEV server and a persisted `dev:clinic-admin` session. Sequential `Tab` navigation reached the visible shell
destinations, `Управление практикой`, `Аккаунт`, `Выйти`, then every management action in document order:
`Настройки практики`, `Личный аккаунт`, `Тариф и биллинг`, `Рабочий кабинет`, `Настройки записи`. Each focus target
was a visible native link or button with the expected destination; focus then returned to the document and cycled
without a keyboard trap. This historical check remains evidence for keyboard behavior only; its product labels and
`/app/manage` destination are superseded by the owner correction at the top of this log.

**Deferred boundary.** There is no sanctioned platform DB principal yet. Per U0/U9 ownership, global platform settings
and legacy global catalog mutation remain fail-closed until U9 defines the platform API/principal and audit contract;
U2 neither borrows a clinic membership nor uses bootstrap as operator authority. The in-memory support-communication
test double still cannot seed a positive organization-owned conversation, so current tests prove legacy NULL-org rows
are excluded while the PostgreSQL port supplies the positive exact-org contract.

## 2026-07-20 — U1 terminal closure (`#916`)

**Result.** U1 is complete. The initial implementation and consolidated corrections established one conservative
capability vocabulary, removed global-admin clinical shortcuts, enforced exact organization ownership on the audited
data paths, separated platform and clinical route trees, and made unsupported global patient repair/create paths fail
closed until U3B supplies the ownership contract. C4C entitlement behavior and later U2/U3/U5/C6 product work were
not pulled into this stage.

**Final audit closure.** The terminal audit's runtime findings were corrected in the data and surface passes. Its last
Server Action residual was closed by routing patient-home actions through `requireDoctorWorkspaceContext`: owner-only
practice/rotation writes require owner membership, specialist-configurable repeat/mood writes require a bound clinical
workspace, and a platform admin without that workspace is denied. The finite Server Action census now discovers the
exact action-module set even with leading whitespace/comments or single-quoted directives, so a new action cannot be
silently omitted from the manifest.

**Evidence.** Consolidated data tests passed `97/97`; consolidated route/surface tests passed `134/134`; final
Server Action/guard tests passed `10/10`. Webapp typecheck, scoped ESLint and `git diff --check` passed after the final
type-safety cleanup. Independent high-risk audit/re-audit covered the whole stage; the final bounded spot-check
confirmed the authorization and organization fixes and identified only the detector variant above, which was fixed
and proven by executable cases. Full CI is intentionally deferred to the accumulated U2/P1 milestone as required by
§7.3. No DB, DEV/TEST/PROD, deploy or external send was performed.

## 2026-07-20 — U1 consolidated audit correction (`#916`, superseded by terminal closure above)

**Corrected audit delta.** The clinical `/app/doctor` layout now sends an explicit `platform.operations` principal
to the existing URL-preserving `(global-admin)/doctor` branch and its real landing
`/app/doctor/system-health`; platform pages no longer compose beneath the clinical layout. Bindingless staff and
management-only staff redirect to `/app/settings`, outside the clinical loop. No platform principal can fall through
into the clinical shell.

**API parity.** Migrated the raw `getCurrentSession` + `canAccessDoctor` clinical/PII reads and write identified by
the independent audit: messages conversation/unread endpoints, promo refresh, material ratings, content stats,
pending-program-test summary, and the mixed catalog GETs (clinical tests, courses, measure kinds, recommendations,
tasks, test sets and treatment-program templates). The unread-by-patient/count routes now resolve the patient through
the guard's organization. The legacy `/api/admin/users/[userId]/archive` alias now requires organization management;
it is not a global-admin patient-repair surface. The doctor health-archive compatibility endpoint is explicit
platform-admin-mode only.

**Executable evidence.** `doctorLaunchCensus` now rejects any doctor API route outside its finite guard/wrapper
registry, verifies booking wrappers resolve to the canonical workspace/management guards, rejects raw session-role
clinical pairs, asserts the exact platform-page registry and verifies the separate platform layout is tenantless.
Targeted safe-mock validation: `12` files / `99` tests pass; `pnpm --dir apps/webapp typecheck` passes. No DB,
dev server, deploy, taskdb write, commit or push was performed.

**Honest residual.** This closes the owner-mapped P0/P1 correction delta but does not mark U1 complete: independent
acceptance and the broader two-org/two-patient role-harness evidence remain required; P2 401/403 semantics were left
for owner decision. C4C course entitlement/nav/layout work was not touched; later integration must preserve
capability-before-entitlement ordering.

**Terminal re-audit correction.** Platform analytics routes now expose no clinical analytics, patient names, phones,
cards or `/api/doctor/*` calls: they are neutral PII-free placeholders until C6 defines aggregate formulas and an
approved projection. Conversation list and unread paths pass the trusted organization through service and repository
filters; the nullable SQL predicate was removed. Multipart `part-url` and `abort` use the clinical workspace guard and
require the session's joined media object to belong to the same organization. The mutable media route family is an
exact finite manifest in `doctorLaunchCensus`, so a new or deleted route fails the structural test. Because no existing
organization-enrollment writer or per-enrollment archive contract exists, client-create and archive compatibility
routes are truthful 409 fail-closed paths until U3B; no global patient identity is created or mutated. Promo refresh
and pending-program-test summary receive the authenticated organization id. U1 is still not complete: representative
catalog/rating ownership needs the remaining dedicated two-org repository proof, and 401-versus-403 stays an owner
decision; U2, U3B and C4C/C6 product behavior were not implemented.

## 2026-07-19 — U1 guard/capability spine worker pass (`#916`, pending independent audit)

**Scope delivered.** Added one trusted-facts capability vocabulary (`platform.operations`,
`organization.management`, `clinical.workspace`, `account.self`, patient/public reservations) and made the
existing membership resolver its single staff mapping input. Explicit global-admin mode now projects only platform
operations: it cannot enter clinical APIs, organization-management APIs or the legacy organization-scoped repair
guard. Bound owner/doctor remains clinical; bindingless owner/admin remains management-only; assistant receives no
management or clinical workspace capability.

**Guard and entry evidence.** `requireDoctorAccess` is now a compatibility clinical adapter over
`requireDoctorWorkspaceContext`; `requireDoctorWorkspaceApiContext` no longer has the `adminMode` bypass. The
doctor layout no longer invokes `ensureOwnBookableSpecialist`; a missing clinical binding redirects to `/app/settings`
without writing data. The direct client-create and client-search APIs now enter the same clinical adapter before
parsing/service access; search additionally executes under the resolved organization principal.

**Census / navigation.** Added an executable focused census over all current doctor/admin API routes and doctor RSC
pages, with explicit clinical / management / platform / account-self classes and representative direct, list, count,
search, export and write checks. Doctor navigation consumes the same conservative capability result and no longer
uses `canAccessClinicalWorkspace !== false`, broad role grants or route-dependent visibility.

**Audit policy boundary.** The bounded launch census found no existing policy-defined sensitive-denial persistence
class. Existing operational `writeAuditLog` paths are not a generic authorization-denial seam, so no denial logger,
payload field or LOG-01 file was added.

**Not done / still required.** No U1 completion is claimed. Independent high-risk guard audit and live role evidence
remain mandatory. U2 shell/settings composition, U3S binding/provisioning, U3A team/invites, U3B/U5B patient flows,
U5A patient resolver, C4C courses, LOG-01, schema/migrations/RLS, DBs and deployment are out of scope.

### C4A handoff notes (preceding entry; preserved for its owner)

**Residual risk / owner note.** The in-memory `OrganizationInvitesPort` test double
(`infra/repos/inMemoryOrganizationInvites.ts`) never implemented the doctor-only seat/entitlement re-check at all
(pre-existing gap, unrelated to and not widened by this correction) — it is not exercised by production RLS/route
paths, only by lighter-weight unit tests that don't need it. Left untouched per bounded scope.

**Environment note.** Same as the first correction above: this worktree's shared
`.git/worktrees/bcb-c4a-clinic-boundary-843/` admin directory is still on the sandbox's read-only root filesystem, so
`git add`/`git commit` cannot run from here. Exact paths for the lead to commit on this branch
(`codex/c4a-clinic-boundary-843`):
`apps/webapp/package.json`, `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts`,
`apps/webapp/src/app/api/clinic/invites/accept/confirm/route.ts`,
`apps/webapp/src/app/api/clinic/invites/accept/confirm/route.test.ts`,
`apps/webapp/src/app/api/clinic/invites/route.ts`, `apps/webapp/src/app/api/clinic/invites/route.test.ts`,
`apps/webapp/src/app/api/clinic/invites/route.entitlement.test.ts`,
`apps/webapp/src/infra/repos/pgOrganizationInvites.ts`, `apps/webapp/src/infra/repos/pgOrganizationInvites.test.ts`,
`apps/webapp/src/modules/clinic-seats/service.ts`, `apps/webapp/src/modules/clinic-seats/service.test.ts`,
`apps/webapp/src/modules/organization-invites/ports.ts`, `deploy/postgres/organization-member-invites-rls.sql`,
`apps/webapp/scripts/check-c4a-843-clinic-invite-concurrency.mjs` (new, untracked),
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/LOG.md`.

## 2026-07-21 — U3B manual patient + walk-in closure (`#801`)

**Integrated outcome.** Commits `1cbc16702`, `bc9ff30db` and `7c6537236` add one atomic staff command for a
structured patient identity, exact-organization enrollment and either a scheduled canonical appointment or a
standalone walk-in `clinical_visit`. Walk-in no longer fabricates a one-minute booking. Future visit time is denied
with an explicit two-minute clock tolerance. A required command UUID converges same-kind replay, rejects changed
scheduled payload and cross-kind reuse, and suppresses duplicate contact/booking side effects. Exact enrollment row
locking preserves first/repeat classification; client metrics include only standalone visits and do not double-count
visits already linked to an appointment.

**Audit and checks.** The first full audit found two P1 causes and one presentation P2; the first correction closed
future/fake-booking truth, idempotency/locking and the header layout. Full re-audit found one remaining cross-kind
command collision, closed by the final two-file correction. Terminal re-audit passed `0 P0 / 0 P1 / 0 landing P2`.
Worker evidence: `62/62` targeted tests, final focused `23/23`, webapp typecheck, scoped ESLint and diff checks pass.
Full CI was not rerun; the real two-connection PostgreSQL race proof remains an explicit U3B milestone check.

**Authenticated DEV acceptance.** On the existing single `127.0.0.1:5200` server, `dev:doctor` desktop
`1480x1024` and mobile `390x844` proved full-width header search, list-toolbar action, usable dialog and no horizontal
overflow. A safe synthetic walk-in produced one patient and one standalone primary visit, `appointment = null` and
`portalStatus = not_activated`; exact API replay returned the same visit and the clinical read confirmed count `1`.
A separate future command returned `400 visit_in_future` and created no client. Direct card rendering showed the
visit. A non-mutating intercepted-success diagnostic then proved dialog close and client redirect with zero console
or page errors; the earlier real-submit timeout was DEV first-compile latency, not a reproduced routing defect.
PII-free ignored evidence is under `.shots/u3b-801/`. No TEST/PROD/deploy/reset/migration or external send occurred.

## 2026-07-21 — UI-2 live boundary (`#197`)

The already integrated Online-location implementation (`838253c72`, correction `fd298043a`) did not need another
worker or audit. Authenticated `dev:clinic-admin` acceptance proved the dedicated switch, OFF/ON column visibility,
default-OFF service mapping and preservation across OFF→ON. Cleanup restored the functional state to Online OFF with
zero active mappings; the intentionally immutable lazy-provisioned inactive row remains. Public `/book/{slug}`
acceptance is still unproven because the same DEV organization has no sanctioned published slug and known fixture
slugs return `404`. No privileged fixture or direct DB mutation was invented; this live seal is carried to U6B slug
readiness. Evidence: `.claude/screenshots/UI-2-197/20260720T213556Z/`. Advanced online-payment/selection flow remains
the separate blocked `#215` scope.

## 2026-07-21 — U3B patient invite launch manifest (`#806`)

**Base and environment boundary.** Integration and `origin/feat/doctor-ui-rebuild` are both `b588262ae`; the isolated
worker branch contains the same docs closeout as `c1734f0f8` and has no implementation edits at launch. The local
remote-tracking `origin/test` ref is `a130741b0`; this is not asserted to be the deployed TEST SHA and no TEST action
is part of this stage. DEV remains the existing single `127.0.0.1:5200` server and working database; implementation
does not apply migrations or send messages. PROD, deploy, dump/reset/refresh and real external delivery are forbidden.

**Owner/checklist authority.** Scope is task `#806`, owner ruling UX08-11, U3B `PIN-01…09`/`ERR-*`, the shared
`ORG-PUB-03` join surface and `PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md`. Staff-created card/relationship and
scheduled or standalone walk-in visit from closed `#801` precede portal activation; delivery is neither identity
proof nor access. This slice implements durable exact-org issue/revoke/supersede, a hashed short-lived single-use
exchange, pre-auth public-summary-only lookup, email-first verified proof and atomic exactly-once link to the existing
patient/enrollment. SMS/PBK/PWA/install/push, real provider activation and staff membership semantics are excluded.

**Prerequisites and ownership.** U1 guard/capability `#916`, U3S staff auth/security `#919`, U5A organization resolver
code and #801 manual relationship/visit are integrated. The remaining U5A two-org/revoked live seals become
post-#806 integration acceptance, not a reason to invent a privileged fixture now. Canonical patient identity is
global; invite, enrollment and every care object are exact-organization. The trusted invite supplies organization;
neither URL/client payload nor internal `userId` may grant authority.

**Allowed/protected scope.** Allowed implementation families are a single patient-invite module/ports/DI and exact
repository, the existing Drizzle schema plus one additive journaled migration/rollback proof if required, narrow
doctor issue/revoke/status APIs and patient-card UI, shared `/join/[exchange]` lookup/proof/redeem dispatch, and tests
beside those paths. Existing organization-invite, email proof/setup, notification-delivery and U5A context code are
reuse authorities; modification requires a demonstrated contract gap, not copying. Protected: #801 manual visit
command and Clients-page layout, U6B public slug/profile/booking/widget routes, staff membership invites, SMS/PBK/PWA,
C4/C5 entitlements/commerce, TEST/PROD/deploy scripts and unrelated migrations. The concurrent U6B lane is read-only
until this no-overlap census is reconfirmed.

**Synthetic acceptance and validation.** Roles: `dev:doctor` issuer, `dev:client` verified recipient, independent
organization/clinic-admin negatives; data must be synthetic and PII-free. Email delivery is mocked/disabled and no
real channel credential is used. Required evidence: issue/revoke/supersede and plaintext-token non-persistence;
pre-auth no-clinical/no-internal-ID response and no-referrer/log leakage; wrong recipient/org, expiry, replay,
already-linked and conflicting identity fail closed; exact one enrollment/card/visit graph after concurrent redeem;
truthful not-activated/invited/linked UI; migration/rollback disposable proof if schema changes; targeted tests,
typecheck, scoped lint/diff-check and one independent high-risk audit. Full CI and real two-connection integration
proof are accumulated at the U3B milestone unless the new persistence transaction itself requires an earlier
disposable proof.

**Stop gates.** Stop and return an owner question only if the owner canon cannot choose between materially different
identity outcomes. Stop implementation (without broadening grants or adding fallback senders) on ambiguous identity,
missing exact-org ownership, inability to keep pre-auth data non-clinical, or a migration/role requirement outside the
documented app owner/Drizzle path. No audit recommendation becomes product scope automatically.

## 2026-07-21 — U5B-0 record visibility contract launch manifest (`#928`)

**Why this stage is ready.** The normative DAG gives U5B only U1 + U5A dependencies. U1 is complete; U5A code,
independent audit and one-organization/invalid-target DEV checks pass, while its two-organization switch and revoked
selection live seals remain explicitly deferred until a sanctioned activation path or TEST fixture. Those missing
runtime seals block U5B application code, but not this required design-first policy contract. Active U3B `#806` and
U4 are not U5B dependencies. No owner decision is open: one organization card, visit relation and own-events default
are fixed; record-class visibility/export parity is an engineering and security contract.

**Scope and ownership.** Task `#928` defines one docs-only high-risk stage: enumerate every patient-card section and
record class; record organization ownership, immutable author and attributed specialist; define solo, specialist A/B
and owner/admin-without-specialist behavior; require parity across list/direct/count/search/export/write; hide
private/restricted facts even through counts and search; fail closed for an unclassified class; separate deterministic
legacy backfill from ambiguous review; preserve amendment history. Authority is U5B in this roadmap, the current
`OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md` and owner-review patient-card decisions.

**Allowed/protected paths and checks.** Writable files are limited to `OPERATING_MODEL.md`,
`ROLE_CAPABILITY_MATRIX.md`, this roadmap for a pointer/status only without DAG changes, and this `LOG.md`. All
`apps/webapp/**`, schema, migrations, APIs, DB/runtime, patient-card UI and active `#806` files are protected. Evidence
is contract completeness, cross-document consistency, `git diff --check`, task mapping and one independent high-risk
audit. No full CI, server, DB, TEST/PROD, deploy or external delivery action belongs to U5B-0. If current evidence
cannot classify a record without changing the owner's product model, record the exact owner question rather than
inventing access.

## 2026-07-21 — U6A-A public acquisition and browser-entry launch manifest (`#807`)

**Base, authority and dependencies.** Integration/origin base is `ab5876fe4`; no TEST/deploy/data action is part of
this stage. U1 `#916` and U3S `#919` are integrated, audited and satisfy U6A's direct dependencies. The pending U3S
TEST/Neo handoff `#917` is a rollout checkpoint, not a code dependency. Owner authority is U6A, PUB-01/ACQ entry in
the roadmap and the dated specialist-first, secondary-patient-entry and browser-complete PWA rulings. Task `#807` is
the existing mapping; no duplicate task is created.

**Coherent outcome.** U6A-A replaces the current patient/PWA-first `/` composition with a truthful specialist-first
landing: supported solo workflow and product value first; clinic only as demo/contact without unfinished capability
claims; patient-care proof remains supporting content; install is optional content below value. Primary «Создать
кабинет» opens the existing U3S specialist signup through a rendering hint only; ordinary patient/invite login remains
visible and secondary, while authority and post-auth routing stay server-derived. Legal/privacy/guest support remain
reachable, PUB-06 directory stays absent, and an unavailable pricing backend degrades to an honest teaser/contact
instead of fabricated plans or prices. Ordinary browser patient access no longer redirects the entire cabinet to
`/#install`; existing in-context install/push education and installed-PWA root behavior remain.

**Allowed/protected scope.** Writable paths are the current root landing page/style and `components/landing/**`, one
focused landing acquisition contract test, the narrow `AuthBootstrap` intent rendering adapter/test, and existing
patient PWA access-policy/gate/layout files and tests. Landing metadata/install URLs must reuse DB-backed
`app_base_url`; no setting/env key is added. Protected are `/join/**` and all active `#806` invite/schema/card paths,
U6B slug/profile/booking/widget and `/book/**`, auth service/redirect policy and existing signup engine, DB/migrations,
analytics storage, tariffs/entitlements, `StandaloneRootRedirect`, TEST/PROD/deploy/data. Any overlap on
`AuthBootstrap` is serialized with `#806` before edits.

**Acceptance and validation.** Focused landing, intent and inverted PWA-policy tests; typecheck, scoped ESLint and an
affected webapp build, without full CI. One independent presentation/behavior audit only; no serial cosmetic churn.
Anonymous live DEV uses the existing single `127.0.0.1:5200`: desktop `1440x900`, mobile `390x844`, primary CTA opens
specialist registration, secondary entry opens ordinary login, privacy/terms/support work, no directory link or
overflow/console/network error. A `dev:client` in an ordinary browser stays in `/app/patient`, and rendered metadata
uses current `app_base_url`. Signup-disabled fallback is a mocked test state, never a DB mutation. Configured pricing,
acquisition analytics, public status, ICS host cleanup and all U6B surfaces remain explicitly deferred.

## 2026-07-21 — `#806` migration-security scope checkpoint

The first implementation diff proved a narrow repository-rule exception to the launch manifest's protected deploy
families. Migration `0220` introduces a tenant-scoped table and pre-session `SECURITY DEFINER` functions. The canonical
runtime roles are discovered and rehydrated after migrations; leaving the new objects only in the Drizzle migration
would make ordinary non-reset migration windows either unusable or dependent on stale owner/ACL/policy state.

The permitted exception is limited to one `patient-invites-rls.sql` overlay, its inclusion/order in the existing
strict finalizer and non-destructive runtime-overlay rehydrate chain, the file-packaging reference in
`deploy-test-saas.sh`, the SCOPED/direct-org/custom-overlay foundation registries, and static checkers that prevent a
generic policy or direct `app_patient` table grants. This is mandatory security/migration closure, not a new product
feature. No script may be executed, no DB may be migrated/restored/reset, and no TEST/PROD/deploy action is authorized.
The overlay must FORCE exact-org RLS, deny direct patient table access, hand narrow functions to existing `app_owner`,
and remain compatible with the ordinary code-deploy versus explicit migration/reset separation already documented.

## 2026-07-21 — U5B-0 worker handoff draft (`#928`)

**Delivered contract.** `OPERATING_MODEL.md` §6 now separates server-resolved organization ownership, finite record
class, visibility, immutable provenance and actor relation. Its registry covers profile/contact/portal access,
appointments, visits and notes, tasks, symptoms, programs/progress, care communications, files, memberships/benefits,
payments and amendments. It defines exact solo, specialist A/B and owner/admin with/without binding outcomes;
permission-before-filter parity for list/direct/count/search/export/write/amend paths; restricted/private
non-disclosure; unknown fail-closed behavior; parent inheritance; immutable authorship; and deterministic legacy
backfill versus a PII-free ambiguous queue and reversible classification mapping.

`ROLE_CAPABILITY_MATRIX.md` §§2.3–2.5 projects the same registry into actor and operation matrices. The U5B roadmap
entry links this candidate contract without changing the normative DAG or marking application completion. All
application, schema, migration, API, DB/runtime, UI and `#806` paths remained untouched.

**Initial worker checks (superseded by audit correction below).** The first registry contained fifteen classes and
all five usable visibility values, but the independent audit correctly found that its live-source census was not
exhaustive. Cross-document registry/parity search, exact four-file scope check and `git diff --check` had passed;
those mechanical checks did not constitute audit acceptance.

**Residual gates.** This is a worker handoff, not an audit PASS. One independent high-risk audit must verify that no
class, actor or parity path can broaden access and that the contract does not invent owner scope. U5B schema/API/UI
implementation remains gated on that review and the remaining U5A two-organization/revoked-selection runtime seals.

## 2026-07-21 — U5B-0 audit correction handoff (`#928`)

**Audit findings closed in the candidate.** P1-1 is addressed by an explicit current standalone-card source/API
census. The registry now separately covers non-visit anamnesis, comorbidity lifecycle, persistent complaints and
diagnoses with their status/update paths, global height/weight and derived card signals. The census maps all current
standalone tabs, SSR projections, program detail and their live API families to exact ownership/provenance,
visibility and amendment behavior. Current gaps are stated rather than normalized: global `platform_users`
height/weight is `unknown`; complaint/diagnosis/comorbidity in-place or actor-incomplete mutation paths require an
amendment closure; mixed aggregates authorize per class.

P1-2 is addressed by making `care_communication` independent from inherited progress/files. Chat or program
discussion content, existence, unread count, ensure/send/read and export require an explicit verified
participant/recipient grant. Visit relation, assigned/responsible specialist, visible program or parent visibility
never grant communication. The census records that current `admin_scope`/`sender_role='admin'` does not identify a
staff participant, recipient or immutable sender, so those current shapes cannot silently satisfy the launch rule.
Assignment-based clinic routing and shared-inbox topology remain deferred U5D.

**Correction boundaries and residual gate.** Only the same four U5B-0 canonical documents changed; application,
schema, migration, API, DB/runtime, UI and `#806` files remain protected. This handoff still requires the same
independent auditor's full terminal re-audit; it does not mark U5B implementation or the policy merge gate complete.

## 2026-07-21 — U5B-0 terminal independent re-audit PASS (`#928`)

The full high-risk checklist passed `0 P0 / 0 P1 / 0 P2` after correction `8ef0721c8`. The auditor reconfirmed all
21 record classes across both policy documents, the current standalone-card/API census, deterministic actor outcomes,
all seven operation families, metadata/count/search/export non-disclosure, legacy ambiguity, immutable authorship,
amendments and rollback. Communication now requires an explicit verified participant/recipient; visit relation,
assignment, visible parent, `admin_scope`, `sender_role` and management role do not grant it, so U5D remains deferred.
The cumulative scope is exactly these four documents, the normative DAG is byte-identical, links and diff-check pass.

The reviewed record-policy prerequisite is complete. U5B application/schema/API/UI work remains closed only on the
two outstanding U5A live seals: switching between two active organizations and recovery after the previously selected
organization is revoked. No CI, server, DB, TEST/PROD, deploy or external delivery action occurred in U5B-0.

## 2026-07-21 — `#806` independent critical audit FAIL and correction scope

The first invite implementation commit `a6da2559f` failed the full security/tenant/data audit with
`0 P0 / 8 P1 / 1 P2`. The owner-mapped correction is one coherent pass over the invite slice: distinguish legacy
relationship-active rows from proven portal activation; repair reissue ordering under the immediate self-FK; consume
the raw bearer only once; narrow the DB boundary to a verified proof receipt before atomic redeem; add the canonical
trusted-IP/continuation rate limit without letting invite challenges invalidate unrelated auth challenges; re-check
organization activity inside the locked redeem; and wire the already reviewed RLS overlay into both ordinary
production migration-closure scripts. Terminal join states must keep their truthful expired/revoked/superseded/
already-linked recovery copy, and an email-only screen must not label a phone hint as an email address.

The production-script change is code-only migration safety: no production connection, migration, deploy or script
execution is authorized. After correction, a guarded disposable PostgreSQL scratch harness must prove forward and
rollback syntax, role/ACL/RLS matrix, reissue, single-use exchange, cross-organization denial and two-connection redeem
convergence before any working database or live UI action. Full CI remains a U3B/U4 milestone gate.

The audit also confirmed a separate unresolved owner-required capability: creating the patient/card relationship with
neither phone nor email. The current `#801` manual command and routes still require phone and were protected by this
slice's launch manifest. They are not silently widened in the correction. Task `#806` remains open after the invite
commit and receives a separately manifested no-contact substage with its own ownership/deduplication acceptance.

## 2026-07-21 — U6A-A specialist acquisition live closure (`#807`)

Worker `4abc2e08e` rebuilt the public root as a truthful specialist-first acquisition surface and removed the
whole-cabinet PWA browser gate; correction `6f16b43e` closed the audit's only P1 by giving disabled specialist signup
a neutral demo/support recovery and separate existing-account login. Integration commits are `b38036f76` and
`d34a2a611`. The single independent presentation/behavior audit otherwise passed the full bounded checklist; focused
tests, webapp typecheck, scoped ESLint and production build pass. Full CI was not repeated.

On the existing single DEV server, anonymous desktop `1440x900` and mobile `390x844` renders show the specialist CTA,
secondary patient/invite entry and no overflow. `/app?intent=specialist` renders the existing specialist/organization
form without changing auth authority. A `dev:client` session at mobile `390x844` remains on `/app/patient` in an
ordinary browser instead of redirecting to install. Root, specialist entry, privacy, terms and guest support return
`200`; no `/organizations` link is rendered, and OpenGraph URL resolves to the current DB-backed
`http://127.0.0.1:5200`. Ignored evidence is under `.shots/u6a-807/`.

U6A-A is complete, but parent `#807` remains `doing`: configured pricing projection, privacy-safe acquisition
analytics and public status are not fabricated by this presentation checkpoint. No DB, TEST/PROD, deploy, external
send, U6B profile/booking/widget or `/join` action occurred.

## 2026-07-21 — orchestration process audit after U5B-0 and U6A-A

The required two-stage process audit returned **CONDITIONAL PASS**. U5B-0 used one coherent high-risk correction and
one terminal full re-audit for owner-mapped policy/tenant gaps. U6A-A used one presentation audit and one bounded
correction, without a serial presentation re-audit. No audit-driven product scope or repeated full CI was added.

The current `#806` invite correction remains proportionate to identity/auth/tenant/migration risk, but is capped at
this coherent correction, one terminal full re-audit and one disposable-PostgreSQL proof. The separately required
no-contact patient-creation capability remains a manifested follow-on inside `#806`; it is not folded into audit
findings. U6A's temporary branch/worktree was removed after patch-equivalence and integration were verified, leaving
only active worktrees.

UI-9 / `#564` may run in parallel: C4D `#724` is complete, `#565` provides the design evidence, its file scope is
independent from `#806`, and migration lanes are reserved as `0220` for invite activation and `0221` for the
individual-exercise stage. Heavy CI and live DEV remain serialized. After U3B, invite activation supplies the honest
path for the remaining U5A two-organization/revoked-selection seals; U5B/UI-5 follows only after those seals.

## 2026-07-21 — `#806` email-first invite slice integrated

The initial invite implementation and coherent security correction were rebased onto the current feature branch and
integrated as `e74ee8b82` and `08a0449e2`. The full terminal re-audit found no remaining P0/P1 issue. It confirmed
explicit portal activation instead of legacy relationship inference, FK-safe reissue, single-use bearer exchange,
purpose-scoped signed OTP proof, no internal identity disclosure, signed canonical-principal redeem, trusted-IP plus
artifact rate limits, organization re-check under lock, exact-org FORCE RLS/ACL and both ordinary production
migration-overlay closures. No production script was executed.

The re-audit's only P2 was an owner-mapped recovery-copy mismatch: inline start/confirm errors collapsed terminal
revoked/superseded/expired/already-linked/organization states, and PostgreSQL returned a generic code for a mistyped
recipient email. The bounded local correction `fd0ac2166` reuses the existing lifecycle copy, preserves an editable
wrong-recipient recovery and aligns PostgreSQL with the in-memory contract. The focused contract test passed `11/11`,
webapp typecheck and scoped ESLint passed, and the guarded disposable PostgreSQL proof again passed forward/rollback,
reissue, wrong-recipient, single-use, cross-org, concurrent one-winner redeem and ACL/FORCE; scratch state was removed.
No new audit round or full CI was added.

This closes only the email-first invite/activation slice. Task `#806` remains `doing` for the separately manifested
owner-required patient/card creation without phone or email. U3B also retains its named SMS/PBK/PWA/install/push and
milestone acceptance work; no DEV/TEST/PROD database, deploy or external delivery action occurred.

## 2026-07-21 — UI-9 individual exercises integrated (`#564`)

UI-9 is integrated as `b3ef8fdf7` with the bounded correction `2675c1ebe`. A doctor can create a personal exercise
inside an existing patient program, optionally attach a ready video from that exact organization's exact-patient
`client_patient` folder, and explicitly choose whether to save a separate organization-owned catalog copy. The
default remains personal/instance-only; assigned media is immutable while the personal title and prescription remain
editable. Patient rendering reuses the existing snapshot and `/api/media/:id` playback path; no second catalog,
folder, upload or playback engine was introduced. Migration `0221` adds only the personal/catalog discriminator and
its hot ownership index.

The first independent high-risk audit found three owner-mapped P1 gaps: generic media usage counted personal items,
tampered batch payloads could target system groups, and tenant/media negatives were source-level rather than
behavioral. One coherent correction excluded personal rows from catalog usage, enforced the existing system-group
contract in batch plus both ports, and added executable exact-org, wrong-patient/folder/status, system-group and
media-usage negatives. The terminal full re-audit passed `0 P0 / 0 P1 / 0 P2`. Worker evidence was `102/102`
targeted tests plus typecheck, scoped ESLint, journal/frozen-migration/C4D/media checkers and diff-check; auditor
evidence was `91/91` focused tests and the same structural gates. Rebase range-diff proved both reviewed commits
patch-equivalent before fast-forward integration. No DB migration/apply, live DEV, TEST/PROD, deploy, external send
or full CI occurred; runtime/live and full-CI evidence remains accumulated for the next authorized milestone.

## 2026-07-21 — U3B no-contact identity readiness (`#806`)

The remaining owner-required no-phone/no-email path has a bounded engineering design and no open owner question.
Manual creation must create one real canonical client anchor with structured FIO, null contacts and an exact
organization enrollment; FIO is never a deduplication key and no fake phone/email is generated. An unbound invite
then lets a newly verified email claim that same placeholder identity atomically. If the email already belongs to a
different canonical user, activation and contact mutation fail closed and one organization-attributed merge
candidate is recorded; automatic merge/rebind is forbidden because the current merge engine does not cover invite
and enrollment identity safely.

This follow-on reserves migration `0222` after UI-9's integrated `0221`: make invite email nullable only behind an
explicit bound/unbound discriminator, preserve all existing bound-email invitations, and add one narrow atomic
claim/redeem capability to the existing patient-invite RLS overlay. The stage must reuse the current manual-visit
transaction, invite bearer/OTP/throttling/lifecycle, exact enrollment and session paths. Phone/OAuth, SMS/PBK/PWA,
conflict-resolution UI, production and real delivery remain outside this slice. Required proof includes no-contact
card/scheduled/walk-in idempotency, exact-placeholder claim, existing-email conflict with zero partial activation,
two-organization negatives, concurrent registration-versus-claim convergence, rollback-safe pending-invite handling,
targeted tests, disposable PostgreSQL proof, typecheck/lint/build, milestone full CI and one independent high-risk
audit. No file, database, server or provider action was performed by the readiness pass.

## 2026-07-21 — U3B no-contact invite closure integrated (`#806`)

Commits `20b454200`, `f9e4c9534` and `dc21e1905` close the separately manifested no-phone/no-email patient identity
path. Standalone card, scheduled appointment and walk-in creation now accept structured FIO with null contacts and
create one exact-organization enrollment without fabricated phone/email, contact trust or FIO deduplication. All
three entry points share one durable command ledger, so exact retries and two-connection concurrency return the same
patient/enrollment while changed organization, command kind or semantic payload fails closed.

An explicitly unbound portal invite can be claimed by a newly verified email and atomically attaches that proof to
the exact placeholder identity. If the email already belongs to another canonical user, activation and contact
mutation remain zero-partial and one organization-attributed merge candidate is recorded; no automatic merge or
rebind was introduced. Existing bound-email invites, including legacy local values, retain their previous contract.
Migration `0222`, rollback, FORCE RLS/ACL, session-loss recovery and registration/claim/redeem races passed the
guarded disposable PostgreSQL proof.

The first two high-risk audits produced owner-mapped retry/idempotency findings, closed in the two bounded
corrections above. The final full independent audit passed `0 P0 / 0 P1 / 0 P2`. Worker evidence was `83/83`
targeted tests, scoped lint, migration journal/frozen-history, D3.4 and strict-finalizer checks; the auditor repeated
the structural gates and exact constraint parity. No working database, DEV/TEST/PROD, deploy, real delivery or full
CI was used. Task `#806` is technically complete; broader U3B SMS/PBK/PWA/install/push and its milestone acceptance
remain open and are not represented as closed by this entry.

## 2026-07-21 — U5A live-seal readiness and exact owner gate (`#796`)

A read-only current-state pass at `241367fde` produced the exact desktop/mobile manifest for the two remaining U5A
seals without changing code, task data, databases or servers. Switching one patient between two active organizations
is conditionally ready only on the canonical TEST shared-patient fixture: it provides ordinary patient login and
exact Clinic A/B enrollments, whereas current DEV/dev-bypass has one prepared context and the TEST seeder explicitly
refuses `bcb_webapp_dev`. The walkthrough must therefore be separately owner-authorized on the deployed TEST SHA;
neither a privileged DEV enrollment writer nor a database reset is acceptable evidence.

Recovery after the remembered organization is revoked is not yet executable through a sanctioned lifecycle path.
The resolver, route and UI already have strong stale-preference, two-org, revoked-target and neutral-recovery tests,
but the application has no port/API to move one active organization enrollment to `discharged`/`archived` and back.
The doctor archive command explicitly returns `patient_archive_not_available`; deleting an invite revokes only a
pending invite. Taskdb `#796` is therefore `blocked`, `owner_waiting=true`, on one precise choice: implement a product
per-enrollment discharge/reactivate flow or authorize a narrow reversible TEST-only lifecycle harness. U5B/UI-5
remains gated on these seals, while independent roadmap stages continue.

## 2026-07-21 — milestone typecheck debt integrated

Commit `7d35332d2` restores strict typing in three treatment-program files: the shared slider now supplies its
required field name, the individual-exercise repository fixture uses the existing port type, and Drizzle's
`systemKind` value is narrowed to the two values already enforced by the database CHECK. Independent audit passed
`0 P0 / 0 P1 / 0 P2`; focused tests were `17/17` and scoped lint/narrow typecheck were green. The root typecheck later
reached only conflicting generated `.next/dev` and `.next/types` route declarations, so the running single DEV server
and its cache were left intact rather than killed or deleted. The commit is integrated and pushed; its temporary
worktree/branch were removed.

## 2026-07-21 — C5A terminal audit hard stop (`#751`)

The three-commit C5A constructor/trial candidate was rebased after U3B so the migration journal is exact
`0222 → 0223`; one integration-only checker parity commit reconciled the final 168 Phase4 targets. The resulting
isolated candidate is `e4b71cc34`. It keeps numeric/unlimited tariff configuration, removes the false pre-reservation
counter, adds an INSERT-bound courses/items quota, isolates commercial DML behind the platform-operations principal,
projects trial/lifecycle/override state and uses no hardcoded trial duration. Worker validation and the independent
terminal audit both found the structural/security gates green.

The terminal full-stage audit nevertheless failed `0 P0 / 2 P1 / 2 P2`. `no_trial` is recorded explicitly but the
resolver then falls through to compatibility defaults, enabling 12 of 15 mechanics for a new organization with no
tariff. Separately, lifecycle denial depends on an optional mutation intent and several actual CMS/patient-home
write paths omit it, so `read_only`/`blocked` is not a complete write wall. The audit also found no executable
two-connection last-slot quota proof or consumable 80% warning projection, and inconsistent commercial UI controls
for starting/extending trials and saving/deleting overrides. These findings map directly to owner-review P1/P2 and
are not audit-driven scope growth.

Evidence passed: 24 changed Vitest files / 249 tests, operational DB-principal `5/5`, scoped changed-file ESLint,
journal/frozen migration, RLS descriptors, P0.8.3, Phase4 artifact, strict-finalizer, D3.4 and diff-check. No full CI,
working database, TEST/PROD, deploy or provider action occurred. Under the declared hard cap, the candidate is not
merged or pushed and no further correction starts automatically. Taskdb `#751` is `blocked`, `owner_waiting=true`,
on permission for one additional coherent correction pass versus freezing the unmerged candidate. Downstream C5B/
C5C/C6 and configured-pricing U6A residual remain dependency-blocked.

## 2026-07-21 — C5A correction resumed after owner process clarification (`#751`)

The previous terminal-audit stop was too mechanical. The owner's later process ruling limits a hard stop to a real
non-converging loop in which repeated fixes recreate the same or new defects; it does not block a coherent pass over
clear findings that map directly to the approved C5 checklist. Task `#751` returned to `doing` with no product
decision invented. One correction owner receives the whole stage and all four findings together, followed by one
independent critical full-stage re-audit. C5B/C5C/C6/U6A still do not consume the candidate before that gate passes.

### Critical re-audit of `b8d00a6ca` and final convergence boundary

The coherent correction closed two former P1/P2 classes completely: explicit `no_trial` no longer inherits legacy
compatibility mechanics, and courses quota now has a self-cleaning private PostgreSQL two-connection final-slot proof
plus a typed `below_warning` / `warning` / `reached` projection. The full independent audit nevertheless failed
`0 P0 / 3 P1 / 0 P2`. It found one CMS mutation missing from the declared inventory while a legitimate patient-home
read reused the mutation-only helper; a manual tariff assignment could end an active trial whose time-expired row was
still labelled active in UI; and the full changed-test census exposed six stale mocks (`14` failing tests) after the
new mutation adapters were introduced.

These are concrete same-class C5 findings, not new product scope, and the stage made measurable progress. Under the
owner's process correction, one final convergence owner receives all three together. It must make read versus write
intent explicit at the public guard boundary, close the inventory hole, make trial assignment/status truthful and
run every changed test file rather than a selected subset. This is the last correction pass: another terminal audit
failure stops C5A and is reported without another implementation loop. No full CI, working database, TEST/PROD,
deploy, dump/reset or provider action belongs to this pass.

## 2026-07-21 — C5A terminal hard stop after final convergence (`#751`)

The final convergence commit `469341c2c` closed the prior three P1s: the public guard surface now requires explicit
read or mutation adapters, the known CMS/patient-home callsites are correctly split, trial/manual tariff projection
and time-effective statuses are truthful, and all changed tests pass (`57` test files, `426/426`). The independent
terminal audit `bcb-c5a-751-terminal-final-audit-20260721` nevertheless failed `0 P0 / 2 P1 / 0 P2` on the complete
range `46241bfcb..469341c2c`.

The first finding is a regression introduced by the final pass: the mutating built-in Online-location `PUT` now uses
the read entitlement adapter and therefore can write during commercial `read_only`/`blocked`. The second finding is
a non-closed mandatory S4 gate: the production checker exits with twelve direct-resolver findings already present on
the pre-C5A base, while its new declared-action census still misses valid async `export const` actions. The named
CMS mutation and patient-home recovery read are fixed, and no_trial, quota warning/race proof, platform operations,
trial conversion/audit and no-second-system checks passed.

The twelve direct-resolver findings predate C5A and are tracked as separate S4 debt; only the new census's failure to
recognize async `export const` belongs to this candidate's convergence scope. Per the explicitly declared terminal
boundary, no fourth correction, milestone CI, integration or push was started. Task `#751` is `blocked`,
`owner_waiting=true`, asking whether to authorize one bounded repair of the two C5A-introduced regressions
(Online-location mutation boundary and async-export census) while keeping the pre-base debt separate, or freeze the
isolated candidate. The worktree and branch remain as evidence; no DB, DEV/TEST/PROD, deploy, dump/reset or provider
action occurred.

### Owner sequencing: close the twelve pre-C5A S4 bypass findings after C5A

The owner asked when and how the twelve pre-existing direct-resolver findings will be removed. They are now mapped
to one non-duplicating task `#939`, not twelve microtasks and not an expansion of the bounded C5A correction. The
current checker names eleven doctor/LFK page-action callsites plus
`src/app-layer/media/resolvePlatformLfkMediaAccess.ts`. After C5A is integrated, one coherent high-risk stage moves
all twelve behind the canonical entitlement boundary, preserves read/composition versus mutation semantics and
exact-organization ownership, makes the production checker green without a broad suppression allowlist, and proves
the affected role/org/action matrix. It can run alongside Hardening A1, must close before C5B/C7, and joins the next
accumulated milestone CI. No DB apply, TEST/PROD, deploy or host action is authorized by this mapping.

## 2026-07-21 — Hardening A0 greenfield baseline closed (`#938`)

The versioned PII-free greenfield package landed as integration commits `dd4241f65` and `b6222cd40`. It contains a
schema-only/no-owner/no-privileges/no-comments baseline, repo-bound 63-integrator/224-Drizzle ledger manifest and a
minimal non-deliverable `.test` seed. The disposable verifier restored 242 empty tables, applied the current pending
chain, proved exact ledgers and closed migration BYPASS; append-only mutation proof applied one new migration in
each chain. The correction made source-tree/commit binding, six-position policy-role normalization and privileged
PostgreSQL binary resolution fail closed, and added executable SIGTERM-during-migration cleanup evidence.

The full independent re-audit returned PASS with no residual findings. Integration static gate and six tests pass.
A0 intentionally proves DDL/migration reproducibility only: A1/#937 must provision canonical ACL/runtime roles and
exercise locked/FORCE isolation with non-owner principals; `bcb_a0_owner` is forbidden as RLS-conformance evidence.
No working database write, TEST/PROD, deploy or full CI was performed. Full CI remains the Phase 0 milestone gate.

## 2026-07-21 — Unsupported-client Ф0 repository slice closed (`#936`)

The dormant fallback stack landed as `542b63815`, `82779e279` and `dcf397370`: one global public DB-backed
default-false flag, shared `/app`/`/app/tg`/`/app/max` SSR fallback and classic watchdog, strict minimized ingress,
purpose-separated HMAC IP key and capacity-safe rate-limit retention. Two correction passes closed the early
unbounded-body/raw-IP findings and the cleanup hot-path regression. The terminal full re-audit returned PASS with
`P0/P1/P2 = 0/0/0`; the integrated changed-test set passed `12 files / 80 tests` and webapp typecheck passed.

Vitest globalSetup attempted the ordinary migration hook against the working DEV database, but migration `0224`
failed closed with SQLSTATE `42501`; no migration evidence or authorized DB apply is claimed. The feature remains
disabled. TEST/production activation, real telemetry collection and F1 old-client live acceptance remain explicit
owner gates; no deploy, server run, notification, analytics persistence, operator-health or error-audit coupling was
performed. Full CI waits for the accumulated milestone.

## 2026-07-21 — C5A post-F0 terminal audit remains red (`#751`)

The six-commit C5A candidate plus bounded repair was semantically rebased onto post-F0 feature base `2b5fe23a6` as
`e08ec320c`. F0 migration `0224` remains canonical and C5A is exactly `0225`; the Online-location mutation wall,
async-`export const` census, current platform-principal routing, quota race/warning projection and complete changed
test census passed. The production S4 checker still reports exactly the same twelve pre-base IDs with unchanged
sorted hash `ac4d61dc0ec2dd3b51ca0499d88cbecec191a5ec91ed2aa01bd3d91de9029565` and no candidate delta.

The terminal independent audit nevertheless returned `FAIL, 0 P0 / 2 P1 / 0 P2`. First, the canonical rehydration
order runs C5A SQL without first installing/reapplying `u9a-platform-settings-role.sql`, so a fresh cluster can fail
on the absent role and a rebuilt database can retain the role but lose its DB-local settings ACL/policies. Second,
broadcast draft save and schedule-block delete remain explicit checker exemptions and can mutate protected data in
commercial `read_only`/`blocked`. These map to the supplied C5A acceptance, but they are a new terminal finding set
after the declared final convergence boundary. No third automatic correction, integration, full CI, DB apply,
deploy or environment action was started. Task `#751` is blocked/owner-waiting on one exact choice: authorize one
last convergence pass for both P1 classes or freeze the isolated candidate. S4 residual `#939` remains downstream.

## 2026-07-21 — owner-authorized final C5A pass stops on provisioning-smoke integration (`#751`)

The owner authorized one final convergence pass limited to the two P1 classes above. Candidate commit `8afec6853`
now installs/reapplies U9A before the C5A runtime capability in the shared rehydrate chain, moves broadcast draft
save and schedule-block delete to the mutation entitlement boundary, and preserves notification-template GET/preview
as reads and PUT as a mutation. Focused lifecycle tests (`28`), rehydrate tests (`18`), core C5A tests (`48`), the
checker self-test, U9A/D3.4 static checks, shell syntax and diff checks passed; prior valid private U9A, two-connection
quota, `402` changed-test, typecheck and scoped-lint evidence was retained. The S4 checker still reports exactly the
same twelve pre-base `#939` findings and no candidate-owned delta.

The terminal full-stage audit nevertheless returned `FAIL, 0 P0 / 1 P1 / 0 P2`. The existing disposable
`smoke-phase3-specialist-signup-provisioning.mjs` fixture does not install migration `0225` or the C5A platform trial
capability before applying the updated specialist-owner provisioning SQL. It consequently exits on missing
prerequisites before exercising the canonical owner requirement that a newly created organization atomically receives
the selected trial tariff and duration. The requirement itself is clear; the unresolved issue is permission for one
separate integration-proof repair after the declared final pass. No new correction was opened, no C5A commit was
merged or pushed, and no working database, TEST/PROD, deploy or full CI action ran. Task `#751` is blocked and
owner-waiting on that single process decision; its isolated clean worktree is retained as evidence.

The owner-requested Opus orchestration audit `bcb-orchestration-opus-audit-20260721-0750` returned **ON TRACK**:
the terminal stop, one retained evidence worktree, independent PR-01 pivot and U6B `doing`→`todo` correction match
the execution canon. Its only LOW recommendation was the provenance split recorded above; no new task or audit round
was created.

## 2026-07-21 — U6B stale execution status corrected (`#926`)

Readiness reconnaissance found no worker, commit, audit or handoff for U6B despite task `#926` being marked `doing`.
The canonical DAG requires `U4 + U2`, and U4 still waits for U3S/U3B/U5A; U5A retains its separate owner gate in
`#796`. Task `#926` was therefore returned to `todo` with `owner_waiting=false`. Its approved slug/public profile/
booking-widget specification is preserved unchanged, but no implementation is claimed before the dependency opens.

## 2026-07-21 — hardening/client-compatibility plans integrated into the canonical DAG

Owner activated `STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` and
`UNSUPPORTED_CLIENT_FALLBACK_PLAN.md` for inclusion in the existing execution sequence. They are now explicitly
subordinate artifacts of `IMPLEMENTATION_ROADMAP.md`, not parallel roadmaps. The sequence starts with a current-code/
taskdb reconciliation against already completed locked-mode, tenant-diagnostics, milestone-CI and dependency work;
only proven residual gaps may create tasks. Current UI-P/Tiptap/NTF work continues without interruption, hardening
Phase 0 is the keystone for later money/booking/auth phases, and the unsupported-client watchdog/fallback may run in
parallel after that contract check. Heavy CI and the single DEV server remain serialized.

The integration also restores environment truth: normal implementation is repository/DEV-only; DEV schema changes
use the non-destructive `migrate-dev.sh`; TEST and any real telemetry require explicit owner authorization; PROD/
host/secrets/cutover remain under the privacy/readiness production gates. Persisted unsupported-client analytics
waits for C6/LOG-01 payload/retention review and contains no raw account identifiers by default.

The untracked `SESSION_HANDOFF_2026-07-17.md` was reconciled rather than treated as active work. Every commit named
in it is already an ancestor of the current feature branch and none of its agent worktrees remains. Its fresh-reset
TEST instruction is superseded by the current code-only/migrate-vs-reset runbooks, so the file moved to archive with
an explicit historical warning instead of remaining as a misleading active handoff.

## 2026-07-21 — Hardening A1 launch manifest (`#937`)

Base `eaa9deebe`; parent reconciliation `#935`. Existing `#770` owns the runtime DB-principal chokepoint and `#933`
owns the repaired generic Vitest harness. A1 closes only the remaining real-PostgreSQL CI evidence: an ephemeral CI
database receives current migrations and two synthetic organizations, then locked/FORCE assertions prove own-org
access, cross-org denial, missing-principal fail-closed behavior and controlled principal-full access. It must reuse
the existing signed-principal/role contracts and may not replace them or relax generic tests back from their current
mode.

Allowed scope is `.github` CI plus dedicated webapp test harness/config/scripts/tests required by this gate. Runtime
application modules, working `bcb_webapp_dev`, TEST/PROD databases, deploy/host scripts, external delivery and
production credentials are protected. No shared DEV server is needed. Worker evidence is targeted harness/static
checks; one independent adversarial audit follows the whole stage. Full CI runs once at the accumulated Phase 0
milestone, not after every A1 edit. A1 is independent of active N1B notification-template files.

## 2026-07-21 — Hardening A0 inserted after honest greenfield proof (`#938` → `#937`)

Disposable private PostgreSQL probes (only `/tmp/bcb_saas_*`; no ambient DB URL and no DEV/TEST/PROD) disproved the
initial A1 assumption that the current repository can run all migrations from an empty service. The canonical root
chain first fails because integrator Telegram `20260306_0009` references identities before core `0012/0013` create
users/identities. The documented webapp legacy bootstrap passes `001–081` and then fails at `082` because
`recommendations` is created only by Drizzle `0001`. Existing PII-free schema-only snapshots progress further but
late migrations intentionally require a default organization, primary specialist/appointment and later canonical
owner state. The archived migration-unification audit already records the noop Drizzle baseline and greenfield gap.

The orchestrator rejected a synthetic minimal schema because it would make A1 green without proving the owner's
full-current-state requirement. Task `#938` is therefore the mandatory Phase-0 prerequisite: a versioned PII-free
schema baseline, exact ledger manifest, minimal deterministic `.test` seed and disposable restore→pending-migrate→
ledger/drift verifier. Historical SQL is not rewritten. A1 `#937` returns to `todo` until A0 passes, then resumes the
real locked/FORCE two-org proof. This is CI/test infrastructure only; no database restore/deploy was authorized.

## 2026-07-21 — N1B0 managed notification templates integrated (`#930`)

Integrated worker `d7cc96916` plus the single coherent audit correction `1f43631c3` as feature commits
`25bd0c5dd` and `059b662d3`. The existing six notification-template settings now carry safe versioned
event/audience/channel copy and a fixed server-owned email presentation. Platform defaults and eligible clinic
overrides preserve the established ownership boundary; no second store or sender was introduced.

The terminal independent re-audit passed with no findings after proving exact safe variable/render limits, explicit
legacy compatibility state, concurrency-safe dual-write CAS, org/entitlement negatives, escaped HTML+plain output,
synthetic preview and bounded U9A mirror access. Integration checks passed 74 targeted tests, webapp typecheck,
scoped lint, U9A static check and diff check. N1B1 sender adoption remains intentionally deferred to the matching N3
families. Full CI is reserved for the accumulated milestone; DB apply, deploy, TEST/PROD and real sends were excluded.

## 2026-07-21 — Hardening B2 external-call deadlines integrated (`#947`)

Integrated `ff11d416a` plus the single audit correction `3f484ea60`. One webapp boundary now covers the 12
launch-scoped YooKassa/Tinkoff and Apple/Google/Yandex OAuth calls and keeps the finite deadline active through
response-body consumption while preserving payment idempotency and existing provider error/nullable behavior.

The first independent audit found one matching-plan P1: the initial helper cleared its deadline after response
headers, so a stalled body remained unbounded. One coherent correction added body-owned consumption and adversarial
JSON/text stall proofs; terminal re-audit passed `0/0`. Targeted tests passed `46/46`; webapp typecheck, scoped lint,
raw-fetch census and diff check passed. Full CI is reserved for the accumulated Phase 1 milestone. No DB, network,
deploy, TEST or PROD action ran. Three unbounded integrator Google Calendar delivery calls were recorded only as a
P2 owner recommendation outside B2; no task was generated from that audit finding.

## 2026-07-21 — Hardening A3 tenant-isolation detection integrated (`#946`)

Integrated `3f684d135` plus the single audit correction `7bc938e03`. Existing pool counters and persisted isolation
diagnostics now feed the existing five-minute critical alert tick; a bounded per-organization canary detects member
visibility and full active-set collapse after a safe priming/debounce period. Alerts expose aggregate counts only,
without organization/user identifiers, and no second scheduler or request instrumentation was introduced.

The full independent audit found two matching-plan P1s: the first implementation reused the collector from the
doctor Today banner and therefore added DB reads/state advancement to a page request, and its process-lifetime maps
could exceed the declared bound under organization churn. One coherent correction separated the lightweight banner
collector, enforced the lifetime `4096` cap and added exact churn/active-set-zero proofs. Terminal re-audit passed
`0/0/0`; targeted tests passed `66/66`, typecheck, scoped lint and diff check passed. Full CI remains at the Phase 1
milestone; production activation, DB apply, deploy, TEST and PROD were not performed.

## 2026-07-21 — Hardening B3 online booking concurrency integrated (`#948`)

Integrated `fdbea3b0e` plus the single audit correction `d640d93b9`. The legacy online/null-capacity writer now
validates a bounded minute-aligned chain, acquires deterministic organization-scoped keys for the complete half-open
time range in one SQL call, rechecks the canonical busy set and inserts all appointments/events/history in the same
principal-aware Drizzle transaction. In-person GiST, payment, projection and idempotency paths remain unchanged.

The first full audit found one matching-plan P1: locking only exact start times allowed two overlapping off-grid
intervals with different starts to commit. One coherent correction moved to full-range keys. Terminal re-audit
passed `0/0/0`; worker evidence passed `31/31` targeted tests, private disposable PostgreSQL same-slot,
distinct-start, chain, adjacent, reverse/deadlock and cross-org proofs, typecheck, scoped lint and diff check. Full CI
remains at the Phase 1 milestone. Working DB, deploy, TEST and PROD were not touched. Concurrent schedule-block
linearization remains an explicit owner question outside B3 and did not generate an audit-driven task.

## 2026-07-21 — Hardening B1 reaches terminal locked-role gate (`#949`)

The isolated three-commit candidate ends at `1a07bc2e3`. Across two coherent correction passes it makes capture DB
effects share the existing Drizzle UoW, keeps external delivery outside that transaction, serializes replay through
mandatory post-commit delivery, processes the canonical stored event rather than a changed duplicate body, separates
provider lifecycle states, and moves the legacy product user writer into the same transaction. The final worker
evidence passed an executable disposable regression on pre-fix base `a3badd17c`, private PostgreSQL dirty-preflight/
lifecycle/six-boundary rollback/concurrency/delivery proofs, `20` files / `85` tests, webapp typecheck, scoped lint,
Drizzle journal/frozen-history and diff checks. No working database or external network was used.

The hard-ceiling full audit still returned `FAIL, 0 P0 / 1 P1`. The public webhook must discover the canonical
organization before verifying against that organization's provider config, but its bootstrap principal cannot read
`be_payment_provider_events` or `be_payment_intents` under the canonical locked grant/RLS topology before an
organization principal already exists. The route unit test mocks that DB boundary and therefore cannot prove the
production path. A general bootstrap grant or RLS bypass would violate the tenant boundary. No third correction,
integration, push, full CI, DB apply, TEST/PROD or deploy was started. Task `#949` is blocked/owner-waiting on whether
to authorize a separate narrow DB capability that returns only `organization_id` for a globally unique provider /
idempotency / event-type authority key, followed by one terminal audit, or freeze B1. Migration number `0225` remains
owned only by this isolated candidate for now; isolated C5A must be renumbered/rebased if either branch is later
authorized and integrated first.

## 2026-07-21 — C5A, B1 and S4 residual integrated after bounded closure (`#751/#949/#939`)

The owner clarified the execution rule: a further pass needs an owner decision only for ambiguous product scope,
scope growth or a genuinely circular correction/audit loop. Clear owner-mapped integration defects are completed
without an artificial process gate. C5A therefore closed through `a678d043d`: the canonical `0225` ordering,
signed platform principal accessor and exact grants are installed by the disposable proof, and specialist
provisioning atomically assigns the configured tariff/trial/grace with replay/concurrency idempotency and rollback.

B1 integrated through `ba6a9242b`. Its public webhook bootstrap receives only a narrow authority capability that
maps a unique provider key to `organization_id`; it cannot read payment rows, amount, payload or PII. Exact-org
context and provider verification still precede the replay-safe capture UoW. The terminal independent audit passed
without findings after private PostgreSQL lifecycle/rollback/concurrency and D3.4/static proofs.

The twelve pre-C5A S4 bypass findings closed independently as `84bf193ac`: the canonical checker now reports `54`
protected actions and `0` bypasses, focused tests passed `34/34`, and the independent high-risk audit passed. No
working DEV database, TEST/PROD, provider call or deploy was used by these implementation stages.

## 2026-07-21 — U9 location palette and Tiptap repository stages integrated (`#932/#931`)

The platform-owned location palette landed as `93114ed62` plus the single presentation correction `363e232a3`.
It keeps an extensible physical palette and separate Online default in the sanctioned global settings path, cycles
new physical locations deterministically, leaves existing colors unchanged and allows a clinic to override Online
after creation. Targeted tests, typecheck/lint, private role/static checks and the one independent presentation audit
passed. Migration/role application and live platform/clinic behavior remain the TEST checkpoint.

The Tiptap migration landed as `74bc30670`, `c3dc92127` and `998f0d67b` without changing markdown storage or patient
rendering. The one independent compatibility audit found two plan-mapped issues: legacy HTML could enter the markdown
editor and an over-limit legacy document could not be shortened progressively. The bounded correction closed both;
its no-DB targeted suite passed `33/33`. Content and broadcasts were inspected live on DEV; complete manifest/live
owner acceptance waits for TEST data and is not claimed by repository evidence.

## 2026-07-21 — accumulated milestone gate green; TEST checkpoint authorized

The command-equivalent milestone gate is green at `c6a8930c2` using resume-from-failure rather than restarting
already-green heavy steps. Lint, typecheck, HLS sync, integrator (`177` files / `1319` tests), media-worker (`14` /
`61`), root build, webapp build and all SaaS/migration/static/registry audits passed. The first full webapp run passed
`1522` files / `8831` tests and exposed ten failures in six stale test harnesses; test-only commit `1b826b0b2` aligned
them with the integrated entitlement/UoW/Drizzle contracts and the complete affected set passed `72/72`. Mechanical
audit registries/checkers were synchronized in `2e2b59679` and `42861c314`. Fresh Hono advisories were closed by the
minimal dependency-only `c6a8930c2`; frozen install and registry audit report no known vulnerabilities.

The owner explicitly authorized the next TEST deployment. It must preserve the prepared TEST database: no dump,
restore, full reset or database recreation. Only the feature code and required ordinary non-destructive migrations
may be applied, followed by exact deployed-SHA, health and live owner-scenario verification. PROD remains forbidden.

## 2026-07-21 — code-only TEST checkpoint deployed (`#952/#953/#954`)

The prepared TEST database was preserved: `deploy/host/deploy-test.sh feat/doctor-ui-rebuild` performed no dump,
restore, full reset or database recreation. After three fail-closed preflight/runtime findings were corrected, the
feature branch deployed at exact SHA `62b69b6a2`. The corrections keep E1 runtime overlays replay-safe, disable the
DEV-only auth bypass in TEST, bind the public-booking smoke to the required clinic slug and allow `app_staff` to
read only its signed organization's commercial entitlement snapshot without gaining commercial writes or cross-org
visibility. Each security correction passed its targeted checks and independent audit; full CI was not rerun after
the already-green accumulated milestone gate.

All five TEST services are active, public health returns `{"ok":true,"db":"up"}`, nginx validation passed and the
locked product smoke passed `22/22` plus the global-admin clinical-write denial. The diagnostic E1 post-runtime
coverage gate reported an active unexplained event before coverage; on TEST this gate is intentionally warning-only,
so the environment remains available for triage and owner live acceptance. No PROD action occurred. Repository stages
`#931` and `#932` remain unaccepted until their live TEST scenarios are checked; `accepted` remains owner-only.

The post-deploy read-only isolation triage found two older unresolved aggregates whose last occurrences predate the
code-only deploy window. Their low-cardinality records cannot prove the historic root cause. They were deliberately
left unchanged: the canonical resolver is a documented clean six-service coverage run starting after the last event,
not an invented timestamp or a synthetic "explained" occurrence.

The owner-authored UI-1c appointment-card planning commit was reconciled from its temporary branch as `8d482133b`.
The outbound-delivery incident plan is now a subordinate `#950` artifact in this roadmap: repository-safe work may
proceed after the A3/notification foundations, while live TEST delivery and all PROD activation remain explicit gates.

## 2026-07-21 — fresh registry advisories closed without mass upgrade (`#955`)

A fresh post-checkpoint registry audit discovered two advisories published after the earlier green milestone:
`fast-uri@3.1.2` (high) and `dompurify@3.4.11` (low). Commit `763630e7f` pins only their fixed compatible versions
`3.1.3` and `3.4.12`; Next, React, FullCalendar and other unrelated packages remain unchanged. Frozen install,
production dependency paths, `17/17` sanitizer tests, Fastify/Ajv URI validation, the registry audit and one
independent audit passed. No full CI, deploy, DB or environment action was repeated for this bounded security patch.

## 2026-07-22 — UI-1c appointment detail launch manifest (`#951`)

Base `b7fb1c5b4`; TEST remains application SHA `62b69b6a2` and is not part of this repository/DEV slice. Authority is
owner-review §16a plus `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-1c. The closed C1 baseline is not reopened. Writable
scope is the existing `DoctorCalendarEventPanel`, its focused test, the two Today modal wrappers and the existing
appointment-comments component/test only where required for blank-draft proof. Shared doctor primitives, existing
chat/phone helpers and server-derived solo context must be reused; payment backend, Rubitime lifecycle/data,
appointment APIs and patient/public UI are protected.

Acceptance is the nine-item UI-1c checklist: one close-control per host, canonical FIO plus existing chat/phone
actions, semantic status beside emphasized current time, labelled details with proven solo behavior, reschedule-only
original time, centered visit CTA, whitespace comment denial and hidden diagnostic payment panel. Focused tests,
scoped typecheck/lint, one serialized DEV live pass at `/app/doctor/schedule?tab=calendar` and `/app/doctor` for
`1440×900`/`390×844`, then one independent presentation audit. No full CI or deploy; audit findings outside the
checklist are owner questions, not scope.

## 2026-07-22 — outbound delivery failure signal launch manifest (`#950`, P1)

Base `b7fb1c5b4`; prerequisites A3 `#946`, notification foundation `#930` and the existing Wave-2 operator-alert
dispatcher/incident/digest machinery are integrated. This first coherent slice closes only plan P1: synchronous
email/SMS provider failures and the existing dead relay queue become one low-cardinality critical topic
`outbound_delivery_provider`, without a second queue, scheduler, settings tree or logger. Exact ownership is global
platform operations; no clinical/tenant payload, recipient, address, body, credential or provider response may enter
the signal. Existing modules/ports/Drizzle repositories and operator incident/job status storage are reused after a
source-backed census.

P2 SMS alert transport, P3 cadence/state changes and P4 UI severity remain later checkboxes of the same task and are
not smuggled into P1. Repository/DEV-safe synthetic tests only: no real sends, no provider calls, no TEST mutation,
no broken-credential exercise, no PROD, deploy or full CI. Worker must prove sync send failure capture, dead-queue
reuse, bounded aggregation/classification, successful-send/non-provider negatives and digest/critical compatibility;
one independent observability audit follows. The live P0/P-guard stays an explicit later owner-authorized TEST gate.

## 2026-07-22 — UI-1c and outbound P1 integrated; DEV migration path repaired (`#950/#951/#956/#957`)

UI-1c integrated through `68eec658d`, `d65c73c23` and the live correction `cd9d5d06c`. Its single independent
presentation audit found two owner-checklist defects — modal close overlap and a desktop phone number hidden until
click — and the bounded correction closed both without another audit loop. Focused tests passed `9/9`, typecheck and
scoped lint passed. Serialized DEV acceptance at `1440×900` and `390×844` proved the embedded confirmed clinic
fixture, desktop visible/copy phone, mobile `tel:`, one close, semantic status/time, labelled details, centered visit
CTA, blank-comment denial and hidden Rubitime/payment UI. The live pass also caught narrow-pane FIO clipping;
`cd9d5d06c` keeps the full name readable and wraps actions to their own right-aligned row when needed. Other
status/solo/no-phone/modal contracts remain covered by focused tests because the DEV fixture lacks every live state.

The first live attempt exposed two unrelated bounded regressions. `2e51ea6f0` keeps dotenv/server env loading out of
the browser instrumentation bundle while preserving production dev-bypass fail-fast. The existing DEV DB then proved
to be behind current migrations, and the canonical non-destructive migrate preflight itself rejected the intentional
U9A SET-only `app_platform_settings → app_staff` edge. `380a66604` reconciles that exact fail-closed allowlist; both
preflights passed, then `migrate-dev.sh --execute` applied only pending migrations/runtime closure to the same DEV DB.
No dump, restore, refresh, database recreation, TEST or PROD action occurred.

Outbound alerting P1 integrated as `b64692aeb` after an independent `0 P0 / 0 P1 / 0 P2` audit. Existing
`operator_incidents`, Drizzle/DI, critical classifier and digest now turn synchronous email/SMS provider failures and
the existing dead delivery queue into one PII-free `outbound_delivery_provider` topic. SMSC `{ok:false}` is no longer
treated as success and can follow the existing retry/dead path. P2 alert transport, P3 cadence, P4 red UI and the
explicit live TEST guard remain later parts of `#950`; the task correctly stays `doing`.

## 2026-07-22 — owner simplifies inline patient card to exact-view reuse (`#958`)

The owner clarified that the immediate «Клиенты» outcome is not a second patient-card implementation. UI-5 is split:
`UI-5a/#958` reuses the current protected standalone card view inside the Clients content pane, preserving the same
guards, data/API, direct URL and mobile one-screen-at-a-time behavior; it may start after route/guard-equivalence
census. Full U5B section/history/visibility/export policy remains separately gated by U5A and `#928`. This prevents a
layout request from being inflated into premature clinical data-policy work.

## 2026-07-22 — latest Doctor UI correction launch manifest (`#966/#967`)

Latest owner correction is recorded as two bounded presentation slices, without reopening completed C1/UI-P work.
`#966` owns only the Today 50/50 desktop split, the standard «Открыть расписание» button and source-backed proof that
the visible calendar begins exactly one hour before the first appointment when that appointment expands the lower
edge. `#967` owns the verified pre-`77c77f02f` white/inherited workspace background, rounded/darker-hover shared
section tabs and one Clients/Messages flat-list vocabulary with Today geometry, full-row hover and `#f0efeb`
dividers. The slices have separate file scopes and may run in parallel; each gets one presentation audit. Live DEV,
lint/typecheck contention and milestone full CI remain serialized. No DB, TEST, deploy, patient/public UI or data
semantics are in scope.

The same-day clarification distinguishes navigation from controls: main sidebar/mobile menu rows return to their
previous near-rectangular minimal radius and must not inherit the 24px doctor button radius. Rounded section tabs
remain required. This clarification is an additional `#967` checkbox, not a reversal of the tab requirement.

## 2026-07-22 — UI corrections `#960/#966/#967` integrated and independently audited

The accumulated presentation package is integrated as `31b6326bc`, `ea85dbd46` and `60707a346`. `#960` replaces
the schedule-local time picker at all six callsites with the backward-compatible time mode of the canonical
`DoctorDateTimePicker`. `#966` restores the exact desktop 50/50 Today split, promotes «Открыть расписание» to the
standard doctor button and removes the duplicate Today-side time-window padding so the shared helper applies the
single one-hour event boundary. `#967` restores white doctor workspace/header surfaces while retaining primary
`#406ca7`, consolidates top-level section tabs, aligns Clients/Messages rows with the Today list geometry and exact
`#f0efeb` divider, and restores near-rectangular main menu rows without changing header icon controls.

One independent package audit returned PASS for every atomic checkbox. Reused worker gates were green: focused
tests (`43`, `40`, `49` respectively), webapp typecheck and scoped lint. No DB, environment, deploy or full CI action
was performed. Browser/TEST evidence remains an explicit accumulated milestone layer and is not inferred from the
code audit.

## 2026-07-22 — detailed-plan debt reconciliation and UI `#958/#961` closure

A read-only reconciliation compared accepted/done parent cards with every linked atomic checklist. It found no
reason to reopen accepted C1 foundations: the apparent mismatch was caused by later owner residuals being hidden
behind broad parent wording. Those residuals are now tracked and executed only through exact cards `#958`,
`#961`–`#964`; TEST/owner, money/provider, SCH-G5, production FIO and Rubitime items remain explicit gates rather
than code debt. The next independent executable scopes remain the shared composer `#962` and evidence-first Today
signals `#963`; future counters/«Самые активные» cannot be inferred without their exact contract.

`#961` integrated the byte-identical owner chat gradient, broadcast left detail and right error archive while
preserving 45/55 and data contracts. Its single audit found one in-scope mobile no-op back action; bounded correction
`a3c963946` clears the archive deep-link and leaves one close route per breakpoint, with focused `5/5` tests,
typecheck and lint green. No second presentation audit was opened.

`#958` integrated the existing functional preview in normal Clients 50/50 mode and opens the canonical standalone
patient card across the full doctor workspace while retaining the sidebar. Search/sort/filters/selection/scroll are
encoded into a validated return URL; direct route/reload/back-forward preserve modes, and the exact existing org
guard, loader, APIs and `PatientCardClient` tree remain authoritative. Its single audit found malformed return-state
normalization; bounded correction `ecaa2f879` added strict channel/UUID/scroll validation and canonical rebuilding.
Focused `20/20` tests, typecheck and lint passed. Live browser/TEST evidence remains part of the accumulated milestone.

## 2026-07-22 — shared communications composer residual `#962` closed

One typed `MessageComposer` now serves doctor chat/modal, patient chat, doctor comments and patient comments while
each consumer retains its existing draft, callback, API, error and tenant contract. Attachment UI remains exclusive
to the existing patient-comment feature-gated surface; scheduling and Voice/STT were not introduced. The single
presentation audit found one hidden doctor program-detail reply fork. Bounded correction integrated that sixth
adapter into the same primitive; no second audit round was opened. Final focused validation passed `48/48`, webapp
typecheck, scoped lint and diff-check. Integrated commit: `386218113`.

## 2026-07-22 — evidence-backed Today preferences `#963` closed

Organization managers can now configure the visibility of the two existing proactive signals and switch the Today
people list between exact organization-owned «На сопровождении» and all-time «Недавние с визитами» semantics. The
preference uses the sanctioned per-organization S5/system-settings service and UI path; unknown values fail closed.
No «Самые активные», new counter or patient-hiding meaning was invented: that product subitem remains unchecked
until the owner defines its source event, window, ranking/ties and hiding contract.

The first high-risk audit found two matching P1 defects: an invited on-support row could disagree with the active-only
count and be hidden by the empty state, while an identical replay of migration `0228` could create a spurious audit
record. Bounded correction `baa27d6e3` derives count and preview from the same complete org result and makes the
backfill source-labelled, newer-row-safe and audit-idempotent. Terminal A–G re-audit passed with no findings. Evidence:
`62` focused tests, `6` migration-contract tests, private PostgreSQL repeat-apply smoke, typecheck, lint, journal and
settings-accessor gates. No working DEV/TEST/PROD database or deploy was used.

## 2026-07-22 — accumulated UI milestone CI and dependency security closure

The accumulated milestone gate started once on `2a2cbda61`: lint, all workspace typechecks, HLS sync, integrator
tests (`1326`), and `8861/8862` webapp tests passed. The sole failure was a stale source-string assertion after the
intentional Today loader expansion; test-only correction `639dcee64` passed its focused `58/58` matrix. The canonical
resume then passed media-worker (`61`), root build, webapp production build and every audit substep until the final
dependency registry gate. The full CI was not restarted.

Registry audit exposed current advisories in `fast-uri 3.1.3`, `sharp 0.34.5` and `@hono/node-server 2.0.5`.
Bounded task `#968` updates them to `3.1.4`, `0.35.3` and `2.0.11` respectively. Because sharp 0.35 is outside
Next 16.2.6's optional range, the stage includes a route-scoped output trace for the exact Linux x64 sharp/libvips
packages and a built-standalone native RGBA→JPEG probe. Focused media/Fastify tests, both affected typechecks/builds,
offline frozen install, standalone runtime and registry audit all passed; the final registry reports no known
vulnerabilities at low or higher. Independent A–G compatibility audit returned PASS. Integrated dependency commit:
`8a49eeeec`. This aggregate + resume evidence is the milestone CI gate; no TEST/DB/deploy action occurred yet.

## 2026-07-22 — UI milestone deployed to TEST and primary visual gate passed

The owner-authorized code-only TEST deploy now runs exact feature SHA `eb64a495644`. No dump, restore, fresh-copy
workflow or full-reset entrypoint was invoked. The first deploy attempt correctly failed closed at `21/22` product
smokes because the new full patient-card server route called a client-only button style helper. The failure was a
`#958` runtime regression, not a TEST-data or RLS problem. Minimal correction `eb64a4956` moved the route to the
existing server-safe variant helper, preserved the doctor control radius and added a source-boundary regression
test; focused test, lint and webapp typecheck passed. The code-only deploy was then repeated from the failed gate,
without rerunning full CI.

The terminal deploy passed all five service checks, public health, nginx validation, locked product smoke `22/22`
including the patient card, and the separate global-admin clinical-write denial. The existing E1 isolation coverage
diagnostic still reports an older unexplained aggregate; TEST intentionally treats this diagnostic as warning-only,
and it is not evidence of a current UI/data failure.

Primary read-only visual acceptance used the protected Clinic A doctor fixture at `1440x900` and `390x844` for
Today, Clients, Communications chats/broadcasts and Schedule. Every route returned `200` with no browser console
errors. The screenshots confirm the Today 50/50 layout and schedule button, Clients 50/50/list/KPI presentation,
Communications 45/55, rounded section tabs, near-rectangular menu rows and mobile master surfaces. Runtime PNGs stay
under `.claude/screenshots/UI-MILESTONE-TEST-20260722T0215Z/` and are not committed. Taskdb `#821` contains the exact
SHA, role, URLs and morning owner interaction checklist; `accepted` remains owner-only.

## 2026-07-22 — bounded warmup onboarding default `#191` closed

Only newly created warmup rules now receive weekday slots at `12:00` and `15:00`. The existing first-PWA-push
creation guard remains authoritative: any canonical or legacy warmup rule prevents creation, so no existing user
schedule is rewritten. No migration, bulk update, setting, database operation or UI fork was introduced. Focused
tests, scoped lint, webapp typecheck and diff-check passed. The single independent mechanical audit checked all
production callsites and returned PASS with no in-scope finding.

## 2026-07-22 — UI-7 / scheduled communications `#964` execution checkpoint

Base is clean feature commit `956b43d76`. Two independent read-only censuses traced all six existing composer
adapters into four owner surfaces and the canonical immediate services. The stage will use one new webapp-owned,
exact-organization scheduling aggregate; it will not place future text into live message rows and will not reuse or
fork broadcast/integrator delivery storage. The atomic UI-7 checklist now fixes sender-only pending visibility,
UTC/browser-time handling, text-only scope, cancel semantics, exactly-once materialization, dispatch-time access
revalidation and the required concurrency/RLS test matrix.

Implementation runs as one high-risk stage in an isolated worktree from this base. Expected scope is migration
`0229`, Drizzle schema, scheduling module/ports/repository/DI, authenticated internal tick, the canonical immediate
messaging/comment services and the existing shared composer/adapters. Protected scope: broadcast storage,
Voice/STT, media scheduling, PROD/TEST/deploy and real external sends. Completion requires targeted tests,
typecheck/lint/build, live DEV doctor+patient evidence, one independent full-checklist audit and integration cleanup.

## 2026-07-22 — outbound alerting `#950` P2–P4 execution checkpoint

After accepted P1, the remaining repository behavior is running as one coherent isolated stage: best-effort SMS
fanout when its provider is ready, durable T0/T+1h/open-until-resolved incident cadence, and red stop severity in
push, System Health and the daily digest. P2/P3/P4 are sequential inside one worker because they share the dispatch
and incident contract; they are not competing branches. Live TEST fault injection P0/P-guard, recipients, provider
manipulation, PROD and deploy remain excluded owner gates. No full CI is scheduled for this slice.

## 2026-07-22 — stability C1 exact manifest frozen as `#969`

Read-only discovery proved that repository/DEV error-tracking work can proceed independently of the later host
choice. C1 now has an atomic checklist for one backend-neutral, Sentry-protocol adapter across webapp, integrator
API/worker/scheduler and media-worker; DB-backed server-only configuration, release tags, error-only asynchronous
capture, a closed PII sanitizer and disabled-default/load proofs are mandatory. UI-7 owns migration `0229`, so C1
starts from the integrated UI-7 base and expects the next free migration (`0230`). Installing or selecting the
self-hosted backend, its database/nginx/TLS/systemd/retention/backups and any production DSN remain a separate
`SEC-02/PR-04` owner gate. GlitchTip is recorded only as the current engineering recommendation, not an owner ruling.

## 2026-07-22 — stability D1 source contract frozen as `#970`

Read-only trace confirmed that `session_version` and logout-everywhere already work, while doctor and global-admin
sessions still use 90-day TTL and the renewal marker causes a cookie rewrite on every request after day one. D1 now
uses a bounded 30-second process-local cache of the resolved staff identity/version, not a jti registry: cache hits
add zero DB reads, concurrent misses coalesce, version updates are monotonic and other processes reject revoked
cookies within 30 seconds. Patient auth remains unchanged. The worker is intentionally owner-gated only on the exact
staff/global-admin inactivity TTL and acceptance of the bounded cross-process SLA; recommended default is seven days
for both privileged roles and `≤30s` revocation propagation.

## 2026-07-22 — owner reopened the menu-radius subitem of UI-P2 `#967`

The TEST/live observation supersedes the earlier visual claim that `rounded-md` was sufficiently rectangular. The
shared sidebar and mobile-menu rows must return to the previous near-rectangular shape with genuinely minimal
rounding; the more-rounded section tabs and the general 24px doctor control radius remain unchanged. Only this
atomic checklist item is reopened. It receives one bounded presentation correction, focused checks, desktop/mobile
live evidence and one independent presentation audit; the rest of UI-P2 is not rerun.

The bounded correction `b4e43eb25` replaces the rejected shared `rounded-md` menu token with `rounded-sm`; desktop
sidebar links, group/flyout rows, mobile sheet/back rows and logout inherit it, while 24px section tabs remain on
their separate token. Focused integration tests passed `28/28`, the single independent presentation audit returned
PASS, and live DEV evidence at `1440×900` plus the opened mobile sheet at `390×844` confirms the near-rectangular
rows. Runtime screenshots remain uncommitted under `.claude/screenshots/UI967-MENU-20260722/`.

## 2026-07-22 — UI-7 hard-stop and independent UI continuation

UI-7 `#964` is not integrated. Two bounded correction passes closed the durable claim/CAS, access revalidation,
cancel boundary, cron/RLS and open-feed reconciliation mechanics, but the terminal audit still found the same
pending-placement contract incomplete: the general doctor comments adapter mounts one feed per message, while a
program discussion loads its feed only after a reply target is selected. Per the anti-churn rule, no third
correction starts. The exact owner question is whether there must be one pending feed per current discussion,
visible immediately after open/reload without selecting a message.

This hard-stop does not pause unrelated UI work. The three still-unchecked built-in Online proofs start independently
as `#972`; expanded online booking task `#215` remains outside that scope. A preflight for full patient-card `#971`
was stopped before code: `#928` completes only the record-class contract, while the U5B roadmap still depends on the
two unresolved U5A live seals in `#796`. Source census confirmed that presentation-only composition would leave
record-class and list/direct/count/search/export/write parity absent, so it would repeat the forbidden simplified
implementation. `#971` remains blocked on `#796`; only its read-only gap census is retained.

## 2026-07-22 — outbound alerting P2–P4 integrated; live gate remains

Alerting `#950` repository scope is integrated through `1fd6bf66e` with migration `0229`. SMS readiness and the
actual SMSC adapter now use the same canonical DB-backed enabled/credential values; the credential is a restricted
setting and is redacted from admin responses. Telegram, MAX, SMS and staff WebPush are launched independently, and
the signed relay has a bounded timeout, so a hung provider cannot stop the remaining fanout. Durable incident-phase
claims distinguish initial and one-hour delivery, acknowledge stops repeats without hiding the red unresolved
incident, resolution stops all further cadence, and the morning digest remains red until then.

The independent audit exposed real readiness/fanout/test-contract defects; the final bounded correction closed only
those findings. Root integration verification passed webapp `31/31`, integrator `27/27`, migration journal sync and
diff-check; worker gates also passed both typechecks, scoped lint and both production builds. Vitest global setup
could not apply new DDL through the deliberately unprivileged working app role (`42501`), so no ad hoc grant or DB
reset was attempted. Canonical migration/application and the authorized broken-provider TEST exercise belong to
remaining P0/P-guard. No real provider call, TEST deploy or production action occurred.

## 2026-07-22 — built-in Online repository residual `#972` closed

No production code change was required. Five source-backed regression suites now prove that the organization-owned
built-in Online location flows through the existing work/calendar location projections, that the authenticated
booking catalog applies exact-organization active-specialist and clinic-wide service rules, and that the public
catalog excludes online-only services from physical cities while the real format UI renders a separate «Онлайн»
block. Integration verification passed `138/138`; the single independent audit returned PASS. No new schema,
delivery mode or expanded online booking chain `#215` was introduced. A live published-slug walkthrough remains the
separate U6B `#926` gate and is not inferred from repository tests.

## 2026-07-22 — stability D2 CSRF contract frozen as `#973`

Historical read-only census on integration base `3e9d27490` (current totals superseded below) found `353` mutating
route files / `392` mutating handlers and
`28` Server Action files. The existing proxy is the single suitable pre-handler chokepoint; there is currently no
Origin or Fetch Metadata guard. The D2 plan now has ten atomic acceptance items covering an exhaustive route census,
a pure zero-I/O helper, fail-closed same-origin browser policy, early proxy rejection, exact signed-M2M/internal-job/
provider-webhook/Apple exemptions with stronger-proof assertions, stateful GET and Server Action handling, proxy and
localhost compatibility, regression coverage and a bounded load proof. No code, DB, environment, deploy or TEST/
PROD action occurred. Five `mock-complete` routes without one common dev-only gate remain a separate owner question;
D2 protects them as normal browser mutations and does not expand into their retirement.

## 2026-07-22 — U6B `#926` readiness stopped before premature implementation

The read-only source/DAG census found that U2 is complete but U4 is not: full U3B still lacks the PIN/SMS/PBK/PWA
and booking-to-enrollment/signed-continuation seals consumed by U4. Therefore full U6B cannot start yet. Existing
source already provides migration `0218` slug claims, typed service/repository/DI, secure published-slug resolvers
and the grant/check/smoke delta previously described by stale task `#817`; it must not be duplicated. Publication
snapshots/version/readiness, first-setup slug confirmation, public assets/contacts, canonical root/booking/widget
routes, typed iframe protocol and booking/join continuation remain absent. The future launch manifest must also
freeze the public-contact allowlist and embed-origin/CSP policy. No code, tests, DB, deploy, TEST or PROD action was
performed; task `#926` is dependency-blocked on full U3B→U4 rather than marked done from the existing slug foundation.

## 2026-07-22 — taskdb and active-plan hygiene reverified

A read-only taskdb/branch/worktree/source census followed by exact port-only updates removed stale execution noise
without deleting accepted history. `#197` and `#817` were closed from reachable implementation evidence
(`5be6cb2117` and `bf12721b6`); old D3.3/D3.4 cards `#773/#774` were marked superseded without claiming the obsolete
smoke passed; owner-cancelled Doctor DNA `#885` became historical done. Inactive `#23/#54/#803/#807` returned to
truthful todo/residual states. `#913` now waits on one notification field matrix, `#950` on an explicitly safe TEST
fault-injection window, and stale owner questions were removed from old TEST SHA `#821` and dependent UI-5b `#971`
in favor of the single U5A question `#796`. Umbrellas `#898/#935` remain active because their programs/current
children remain active. The initiative registry and subordinate plan headers were synchronized to the same state.

## 2026-07-22 — stability D2 central CSRF guard integrated as `#974`

The frozen `#973` census now drives one pure proxy-level same-origin guard for all browser mutations and Server
Actions while preserving only the exact HMAC, internal Bearer, payment-webhook and Apple `form_post` exemptions.
The route/static matrix freezes `518` API files, the `353/392` unsafe subset, `28` Server Action files and nine
stateful GETs; reject happens before redirects/cookies/session renewal with stable `403/no-store` semantics. The one
independent audit passed every D2 item except a concrete combined-Referer ambiguity. A localized fail-closed parser
and adversarial test closed that exact D2-03/D2-09 finding in `2d3c98acc`; no serial audit round or adjacent endpoint
retirement scope was opened. Focused integration tests passed `26` with `4` opt-in live checks skipped; worker
typecheck/lint and a `1.0021x` p95 zero-I/O load proof passed. Full CI remains the accumulated phase milestone; no
DB, TEST/PROD, deploy, external send or second Next server was used.

## 2026-07-22 — D2 census synchronized after C1 route integration

Current post-C1 milestone census is `519` API route files, `354` mutating route files / `393` mutating handlers and
`320` browser files / `359` browser handlers. The `+1` is the global-admin `platform/error-tracking` PUT introduced
by C1; it remains a normal browser-origin-protected mutation and does not expand the `34` special exemptions. The
historical exact-SHA `518` / `353` / `392` evidence in `#973/#974` and E2 remains provenance for those frozen
integration bases rather than current-tree totals.

## 2026-07-22 — stability E2 source contract frozen as `#975`

**НАШЁЛ.** Read-only census на integration base `252d54636` показал `518` API route-файлов;
`2 751` вызов `NextResponse.json` на `2 750` source-строках; same-line census даёт `1 993`
standard `{ ok: false, error }` starts и `47` direct bare `{ error }` starts, а structural pass — `2 024`/`51`
object literals; `161` route-строка читает `error.message`. Общего server `jsonOk/jsonError` builder и safe
error-to-HTTP mapper нет: существующие helpers либо client-only, либо локальны для auth,
catalog, membership, system-settings, integrator и tenant guards. В launch-risk wave booking create и оба
payment webhook families возвращали arbitrary caught messages; patient-acquiring provider error также
отражал request-derived provider suffix. Correlation ID уже принадлежит `proxy.ts`, а `Retry-After`
и `no-store` используются неравномерно, поэтому mass normalization изменила бы внешние
контракты.

**ИЗМЕНИЛ.** Owning Stability plan получил atomic `E2-01…E2-10`, compatibility matrix,
exact `11`-route/new-file/test manifest, safe unknown-error redactions, pure zero-I/O/load contract и protected
C1/D1/D2/E1 boundaries. `#975` закрывает только census/contract; E2 остаётся open и получит
отдельную implementation-карточку после integration/rebase preflight. Три engineering recommendations
не стали owner blockers: сохранить status при redaction, не нормализовать missing
`Retry-After`, не втягивать Phase 3 E1 boundary refactor.

**Provenance.** Discovery шёл из branch `agent/stability975-e2-contract-20260722` на exact base
`252d546366c7f7dd5949074203269f30f004130c`: снача code-search/codeq по plan/helper/launch-risk concepts,
затем точечные source/test reads и exact `rg` counts. C1 protected manifest сверен read-only с
initial implementation commit `7b680fc23` (`docs/OPERATIONS/ERROR_TRACKING.md` на том exact SHA); correction
`2d0e8e423` перенёс канон в current `docs/ARCHITECTURE/ERROR_TRACKING.md`. Код, packages, taskdb, DB, env, processes,
tests, deploy, TEST/PROD и push
не затрагивались.

**Один независимый docs-audit.** Source-trace нашёл не новый product scope, а четыре
неточности contract freeze: line-count был подписан как call/file-count, не был указан
`501 oauth_disabled`, а старая API-документация противоречила route/test по
`rubitime_projection_not_ready` (`502` против канонического `503`), а C1 provenance смешивал
initial и correction SHA. Эти факты исправлены одним bounded docs-pass; runtime не менялся,
повторный аудит механического слайса не открывался.

## 2026-07-22 — stability C1 repository dark launch closed (`#969`)

C1 integrated into `feat/doctor-ui-rebuild` as `a9f936f14` + `02b2e9786` + `ad398fe36`. The first independent
audit found four P1 contract gaps and one docs mismatch; one coherent correction closed them. Full re-audit then
found one remaining production-like locked-principal defect in media-worker startup. The final allowed correction
moved both runtime config reads, SDK init and readiness under the existing `media-worker:tick` infra principal and
added a real locked pool regression. Terminal full-checklist re-audit passed all `12/12` items with
`P0=0 / P1=0 / P2=0`.

Targeted evidence is green: shared `9/9`, integrator `15/15`, webapp `45/45`, media-worker `6/6`; four scoped
typechecks, scoped lint/builds, frozen install, static contract and three-run load proof passed. The load proof kept
runtime DB reads `4→4`, native pool `0/0/0→0/0/0`, p95 below baseline and RSS below burst peak. No host backend,
DB apply, TEST/PROD, deploy or external send occurred. Host installation/activation remains explicitly gated by
`SEC-02/PR-04`; the repository dark launch itself is complete. The accumulated full CI runs once on the exact
milestone SHA before the already-authorized code-only TEST deploy.

E2 source contract `#975` is separately closed by `b1b1f75ee` + factual correction `c72038c1f`; implementation is
tracked as `#976` and intentionally waits until after this TEST checkpoint.

## 2026-07-22 — current code-only TEST checkpoint and truthful UI-P2b gate

The accumulated feature branch was deployed by the canonical code-only path to exact TEST SHA
`ea4b35e5f3727a7b256a1228eef7a27b65e1782c`. No dump, restore, full reset or production action occurred. All five
TEST units are active, public `/api/health` reports `{"ok":true,"db":"up"}`, the locked product smoke passed
`22/22`, and the separate global-admin clinical-write denial passed `1/1`. The first attempt had correctly failed
closed because D2 CSRF rejected the synthetic mutation before it reached the tenant authorization wall. Task `#979`
fixed the smoke request to send canonical same-origin proof and pinned the exact denial oracle so
`csrf_origin_forbidden` can never be accepted as equivalent; one correction and bounded re-audit passed. Milestone
full CI was not repeated: it remains green on ancestor `49a0d0501`, while the later executable delta has focused
gates and the deploy builds passed.

UI-P2b `#977` did not receive a false completion seal. The shared KPI value size fix is integrated, and the single
independent presentation audit passed `P2B-03…08` and `P2B-11…13`. It left mobile runtime proof `P2B-01` open and
found exact old exceptions for `P2B-02/09/10/14`: a `#faf9f4` fallback plus local Clients/Messages page shells with
legacy radius/padding. The detailed UI plan now keeps those rows unchecked with evidence. Per the one-audit
presentation rule, no automatic correction/re-audit loop starts; task `#977` asks the owner once whether the exact
`12px/18px` rule governs every outer/loading/filter pane or only reusable content cards.

Task `#821` is the owner-only live acceptance gate for this exact TEST SHA and lists the current doctor/clinic URLs
and schedule-save/booking-create scenarios. Repository-safe execution resumes independently with Stability E2
implementation `#976`; TEST owner acceptance is not inferred from smoke and `accepted` remains owner-only.

## 2026-07-22 — stability E2 implementation launch manifest (`#976`)

**Base and authority.** The controlled worker runs only in
`/home/dev/dev-projects/BersonCareBot-wt-e2-api-response` on branch `codex/e2-api-response-976`, exact base
`5f847f40c7bb2cb3dc5abbc11d51ab4651841c43`. The current code-only TEST acceptance SHA remains
`ea4b35e5f3727a7b256a1228eef7a27b65e1782c`; E2 neither changes nor deploys it. Task `#975` and E2-01 have frozen
the source census/contract; implementation card `#976` owns only E2-02…E2-10 from
`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md`. Prerequisites are satisfied by the integrated C1 repository dark
launch, D2 central CSRF guard and the completed TEST checkpoint above; D1, E1 and later owner acceptance are not
dependencies and remain protected adjacent scope.

**Synthetic evidence and safety.** Tests use typed synthetic errors, reserved non-PII identifiers and mocked route
dependencies only. Payment/provider, email/invite, booking/Rubitime and OAuth scenarios are send-safe: no external
delivery, provider call, network request, working database or runtime setting access is allowed. Adversarial markers
prove that `Error.message`, provider/request-derived suffixes, SQL-like details and PII-shaped text cannot reach JSON
bodies. The in-process benchmark uses the pure response helper after warm-up at concurrency `16`, records three runs
with p50/p95/p99/throughput, asserts zero DB/network invocations and checks that RSS after the error burst does not
grow monotonically.

**Closed manifest and no overlap.** Writable scope is exactly the new shared helper/test, the new E2 static gate,
the new patient-acquiring webhook route test, the eleven routes and existing regression tests enumerated in the E2
plan, `apps/webapp/src/app/api/api.md`, this LOG and the owning Stability plan for factual worker evidence. Package/
lock files, C1/D1/D2/E1, DB/schema/env/deploy/TEST/PROD/host/data actions and all other routes are forbidden. Existing
infra imports in invite/public-booking/payment routes are protected E1 debt, not refactor scope. This isolated branch
does not overlap neighboring workers; lint/typecheck contention and accumulated milestone CI remain orchestrator-
serialized resources.

**Execution and stop conditions.** One worker implements the complete E2-02…E2-10 matrix, runs focused Vitest,
webapp typecheck, scoped ESLint, the static gate plus `--self-test`, the three-run benchmark and `git diff --check`,
then commits without pushing. A separate terminal independent auditor must inspect the same atomic checklist and
actual diff before deciding whether any missing risk-sized checks are needed; the worker does not claim audit PASS.
E2 receives one terminal audit and no serial nit-picking loop. Any missing owner requirement, ambiguity, manifest
expansion, protected-scope dependency, failed safety invariant or need for DB/network/TEST/PROD action stops the
stage and returns an exact blocker/owner question; full CI is reserved for the accumulated Phase 2 milestone.

## 2026-07-22 — stability E2 worker candidate evidence (`#976`)

The resumed controlled worker completed E2-02…E2-09 inside the launch manifest. The new pure response helper accepts
JSON-serializable typed payloads, protects the `ok`/`error` discriminators, preserves `ResponseInit`, headers and
cookie mutation, and has no DI/auth/DB/settings/log/network dependency. The mapper accepts only trusted typed errors
or exact closed literal rules; all unknown booking/payment errors use fixed route-local fallbacks without reflecting
provider/request/SQL/PII-shaped strings. The exact eleven routes were migrated without changing identity, invite,
booking, webhook exact-org/replay/UoW or patient organization-context control flow. The intentionally changed public
contracts are only the frozen redactions: booking unknown → `503 create_failed`, general payment webhook unknown →
`400 webhook_failed`, patient acquiring verification unknown → `400 webhook_verification_failed`, and unavailable
request-derived provider → `400 payment_provider_unavailable`.

Focused regression evidence after building the otherwise absent workspace-package artifacts in the isolated
worktree: Vitest `15` files / `82` passed / `1` benchmark opt-in skipped; this includes specialist signup start and
confirm, OAuth start and proxy configuration (`501 oauth_disabled`), invite create/list/entitlement/accept, both
booking create routes (`503 rubitime_projection_not_ready` and unknown redaction), both payment webhook paths and
patient organization-context. `pnpm --dir apps/webapp run typecheck` and scoped ESLint over every changed TS/MJS file
passed. `node apps/webapp/scripts/check-e2-api-response-contract.mjs --self-test` passed the static eleven-route gate
and all five adversarial mutations (missing route/import, raw message, boundary import, direct response);
`git diff --check` passed.

The separate opt-in in-process load proof ran after warm-up at concurrency `16`, with `1,280` samples per path and
zero DB/network invocations. Interleaved baseline → helper results were: run 1 p50 `0.282752→0.282191` ms, p95
`0.661941→0.658447` ms, p99 `0.913326→0.944924` ms, throughput `15,210.46` responses/s per path; run 2 p50
`0.115687→0.114996`, p95 `0.322933→0.312728`, p99 `1.133382→1.125449`, throughput `34,755.64`; run 3 p50
`0.091240→0.090919`, p95 `0.200406→0.194197`, p99 `0.641641→0.648641`, throughput `46,976.53`. Median p95 ratio
was `0.968399`, within the `1.05` budget. Five post-warm unknown-error burst RSS samples stayed flat at
`132804608` bytes, so monotonic growth was false. E2-10 and overall E2 intentionally remain unchecked pending the
one terminal independent audit. No full CI, DB/network/server, deploy, TEST/PROD, external send, push or merge ran.

## 2026-07-22 — stability E2 FAIL-audit correction (`#976`)

The independent terminal audit found two exact worker-proof gaps. First, the typed rule branch indexed a normal
object without requiring an own property, so inherited keys such as `toString`, `constructor` or `__proto__` could
bypass the fixed fallback. The shared mapper now uses one own-property lookup for both typed and ordinary literal
maps. Adversarial helper tests and regressions through both authenticated and public booking routes prove all three
keys return exact `503 {"ok":false,"error":"create_failed"}`.

Second, the initial load proof asserted only the median p95 and hard-coded DB/network counters. The corrected proof
asserts every one of the three warm concurrency-16 runs independently and instruments `pg.Pool.query` plus `fetch`
with blocking spies. Correction results: per-run p95 ratios `1.001997`, `0.986968`, `0.969491`; baseline→helper p50
`0.373620→0.376575`, `0.145993→0.145262`, `0.078851→0.078841` ms; p95 `0.722123→0.723565`,
`0.274239→0.270665`, `0.139172→0.134926`; p99 `1.158109→1.182577`, `0.388504→0.372259`,
`0.549590→0.537271`; throughput per path `12,245.10`, `31,940.16`, `57,234.13` responses/s. Instrumented
DB/network counts were `0/0`; five RSS samples stayed flat at `132149248` bytes.

Affected Vitest passed (`3` files, `26` passed, `1` benchmark opt-in skip), the separate benchmark passed (`6/6`),
and webapp typecheck, scoped ESLint, the eleven-route static gate with five adversarial self-tests, and
`git diff --check` passed. E2-10, task status `doing` and `seal_audit=false` remain unchanged pending independent
re-audit. No full CI, DB/server access, external network/send, deploy, TEST/PROD, push or merge ran.

## 2026-07-22 — stability E2 independent re-audit PASS (`#976`)

Fresh independent audit of base `5f847f40c` through HEAD `e3ab36b91` passed with `0 P0 / 0 P1 / 0 P2`. The auditor
matched every E2-02…E2-10 owner row to code, tests and runtime-safe evidence and confirmed the closed manifest is
exactly `21` changed files. The own-property lookup is shared by ordinary and typed maps; fresh helper and both
booking-route regressions prove `toString`, `constructor` and `__proto__` produce exact
`503 {"ok":false,"error":"create_failed"}` rather than inherited values.

Fresh focused tests passed (`3` files, `26` passed, `1` benchmark opt-in skip). The separate opt-in benchmark passed
`6/6`: all three p95 ratios (`0.980419`, `0.994567`, `1.015103`) were independently within `1.05`; p50/p95/p99 and
throughput were recorded for every run; blocking instrumentation measured `pg.Pool.query` / `fetch` at `0/0`; five
RSS samples stayed flat at `137310208` bytes. The eleven-route static gate, five adversarial mutations and
`git diff --check` passed. E2-10 and the repository stage are closed; full CI remains the accumulated Phase 2
milestone gate. No DB/server/network/send/deploy/TEST/PROD action, push or merge ran.

## 2026-07-22 — stability E3 source contract frozen (`#980`)

**НАШЁЛ.** Read-only census на exact integrated base `63de21030` исправил существенную ошибку roadmap summary:
`apps/integrator/src/kernel/contracts/schemas.ts:56` — не outgoing integrator→webapp schema, а внутренний
`incomingEventSchema` channel/pipeline, который `EventGateway` валидирует до rate-limit/dedup. Он и весь
`IncomingEvent` pipeline объявлены protected/non-target. Реальный `POST /api/integrator/events` envelope сейчас
продублирован в пяти местах: устаревший `contracts/integrator-events-body.json`, integrator `WebappEventBody`,
builder input в `jsonStableStringify`, ручной receiver `eventBodyFromParsed` и webapp `IntegratorEventBody`.
JSON расходится с runtime: в нём нет `idempotencyKey`, `occurredAt` заявлен `date-time`, а receiver принимает любую
строку и ошибочно считает array объектом payload.

Receiver dispatch содержит `23` event variants. У `21` подтверждены active producer paths через generic/direct
diary emit, central projection fanout/writePort и appointment builder; `contact.linked` и `user.email.autobind`
сохраняются только как consumer/legacy compatibility variants без найденного active exact-string producer. Envelope
остаётся unversioned и с open-string `eventType`: обязательный version, closed enum или новый discriminated payload
union изменили бы generic content, legacy outbox и unsupported-event semantics. Event-specific payload guards,
producer payloads и tenant model не становятся scope E3.

**ИЗМЕНИЛ.** Owning Stability plan получил source-backed correction, полный atomic `E3-01…E3-12`, exact
compatibility/error/retry/load matrix, `23/21+2` variant census, closed writable implementation manifest и protected
scope. `E3-01` закрывает только census/contract freeze; `E3-02…E3-12` и общий E3 остаются открыты. Минимальный путь
runtime SSOT — dedicated workspace package `@bersoncare/integrator-webapp-event-contract`: оба приложения уже
потребляют workspace packages, direct cross-app import нарушает границы и integrator `rootDir`, а существующие
DB/error-tracking packages имеют другое владение. Поэтому package/workspace/lock/build changes явно включены как
необходимая E3 dependency, а не скрытое расширение manifest.

**Frozen runtime semantics.** Producer валидирует до `getAppBaseUrl`, подписи/fetch и возвращает fixed permanent
`422` без Zod details или payload; receiver сохраняет порядок headers/key → raw-body signature → JSON parse → shared
schema → special tenant principal → idempotency → DI/handler и fixed `400` для invalid schema. Stable bytes,
normalized body/header idempotency, semantic replay `202/409/503`, handler permanent `422`, unknown open-string
fallback, immediate outbox observability и worker retry/DLQ classes сохраняются. Только
`support.delivery.attempt.logged` продолжает ставить organization principal; общий tenant redesign — owner question,
не E3. Удаляется только `contracts/integrator-events-body.json` после нулевых current refs; остальные contract JSON
и archived history protected.

**Load и audit stop — SUPERSEDED следующей E3 FAIL-correction записью.** Старая классификация E3 как init-time
исправлена: shared schema выполняется на producer и receiver для каждого доставленного M2M event. Приёмка требует
три одинаковых representative/max-payload microbench
run с p50/p95/p99/throughput/RSS и blocking proof нулевых дополнительных DB/network calls. Implementation worker
возвращает построчную матрицу `E3-01…E3-11`; отдельный независимый auditor проверяет тот же scope. При `FAIL`
разрешён coherent correction + fresh re-audit; после двух correction rounds — жёсткий stop и один owner question,
без третьего круга и самоаудита.

**Provenance и границы author pass.** Discovery использовал обязательный code-search, затем exact source/ref census
на branch `codex/e3-contract-980` в isolated worktree `/home/dev/dev-projects/BersonCareBot-wt-e3-contract`.
Изменены только owning Stability plan и этот LOG; code/packages/lock/taskdb/runtime/tests/processes/network/deploy,
TEST/PROD, push и merge не затрагивались. Это presentation/docs author stage: требуется один независимый аудит
source consistency; implementation/PASS из этой записи не следует.

## 2026-07-22 — stability E3 source-contract FAIL correction (`#980`)

Один независимый presentation/docs audit вернул `FAIL 0 P0 / 1 P1 / 1 P2`. P1: слова
`representative/max-payload`, `bounded p95/RSS` не задавали исполнимых размеров, baseline и числовых бюджетов, а
глобальный `55m` nginx ceiling оставлял неоднозначность с route-level limit. P2: новый package test был перечислен,
но не был постоянно включён в root `pnpm test`, который уже является частью root CI. Это matching gaps owner E3
contract, не новая implementation или product scope; исправлены одним разрешённым coherent docs-correction.

**Request-size и load freeze — SUPERSEDED следующей E3 correction-round-2 записью.** Source-backed supported ingress
был описан слишком широко: PROD vhost template и repo-managed TEST apply используют `client_max_body_size 55m`;
production/test M2M domain через `/etc/hosts` идёт в loopback nginx,
а webapp upstream не открыт публично. Поэтому exact max-ingress fixture — `57 671 679` raw UTF-8 bytes
(`55 MiB − 1`), representative — `4 096` bytes. Оба строятся одной fixed
`appointment.record.upserted` synthetic ASCII structure с padding только в `payloadJson.note`. Меньший application
route cap не добавлен: source/outbox не доказывают его backward compatibility, а новый limit/status был бы новым
wire behavior. Если current `55m` boundary не проходит load budget, E3 останавливается с owner question о cap/status,
а не выбирает число молча.

Три identical runs теперь полностью определены: interleaved baseline/current envelope path против after/shared-Zod,
representative `1 280` и max-ingress `16` samples на path, alternating AB/BA после warm-up. Для каждого из шести
fixture-runs отдельно требуется `p95_after ≤ p95_baseline × 1.05`; обе стороны записывают
`p50/p95/p99/throughput`, median-only PASS запрещён. Baseline/after RSS снимается в isolated child processes под
`node --expose-gc`; peak и max пяти post-GC after samples не выше
`max(baseline × 1.05, baseline + 8 MiB)`, а пять after samples не строго монотонно растут. Blocking spies на
`globalThis.fetch` и `pg.Pool.prototype.query` дают `0/0` или proof падает.

**Persistent package test.** Future root `package.json#scripts.test` заморожен exact как
`pnpm --dir packages/integrator-webapp-event-contract test && pnpm --dir apps/integrator test`; существующий root
`ci` уже вызывает `pnpm test`, поэтому workflow edit запрещён и не нужен. Fresh-clone gate в новом clean isolated
worktree выполняет `test ! -e packages/integrator-webapp-event-contract/dist/index.js`, затем
`pnpm install --frozen-lockfile` и полный root `pnpm test`; это проверяет package unit suite и consumer resolution
без stale artifacts.

После correction `E3-01` остаётся `[x]` только как полностью уточнённый source/load freeze; общий E3 и
`E3-02…E3-12` остаются `[ ]`. Изменены снова только owning Stability plan и этот LOG. Код, package manifests/lock,
taskdb, tests/runtime/load, network/DB, deploy, TEST/PROD, push/merge не затрагивались и никакой implementation PASS
не заявлен. Требуется fresh independent re-audit exact docs range; это correction round 1.

## 2026-07-22 — stability E3 source-contract correction round 2 (`#980`, terminal allowance)

Fresh re-audit correction round 1 снова вернул `FAIL` с двумя exact contract findings. P1: repository PROD template
и recommendation были ошибочно названы active/supported PROD `55m`, хотя effective host value не проверялся и host
check не был разрешён. P2: synthetic appointment fixture не совпадал с current builder — использовал недопустимый
`status:"booked"`, неполный payload, `serviceName` внутри `payloadJson` вместо top-level и выдуманный `eventId`.
Это второй и последний разрешённый E3-12 correction round; любой следующий `FAIL` означает hard stop + owner
question, без correction 3.

**Repository target против runtime fact.** Repo-managed TEST apply source фиксирует `client_max_body_size 55m`.
Production repository template и HOST recommendation также целятся в `55m`, но active PROD value остаётся
**unconfirmed**: эта correction не запускала host/nginx command и не выдаёт template за runtime evidence.
Source-backed M2M traversal через loopback nginx сохраняется. Repository load proof использует intended-config/TEST
worst-case `55 MiB` target, поэтому PASS на `57 671 679 B` покрывает repository target, но не закрывает PROD
acceptance. До PROD нужен отдельный owner-authorized `sudo nginx -T` effective-vhost fact. Любое отличие от expected
`55m`, `0`/unlimited или отсутствие подтверждения — config-drift/owner gate; route cap/status автоматически не
добавляется.

**Builder-backed appointment fixture.** Оба exact body теперь строятся реальным
`buildAppointmentRecordUpsertedFanout` и current wire serializer; byte-equivalent mirror разрешён только с exact
builder-comparison test. Source status fixed `updated` из допустимого union
`created|updated|canceled|deleted`. Builder получает все current source fields и выдаёт полный projection payload:
`integratorRecordId`, `phoneNormalized`, `recordAt`, `status`, `payloadJson`, `lastEvent`, `updatedAt`,
`patientFirstName`, `patientLastName`, `patientEmail`, `integratorBranchId`, `branchName`, `dateTimeEnd`, `serviceId`,
top-level `serviceName`, `rubitimeCooperatorId`, `integratorUserId`, `rubitimeManageUrl`. Envelope использует current
`eventType`, derived `idempotencyKey`, `occurredAt`, `payload` и не добавляет `eventId`. Все значения synthetic ASCII;
только `payloadJson.note` получает padding до exact `4 096 B` и `57 671 679 B` по
`Buffer.byteLength(body,"utf8")`.

Числовые baseline/after p95/RSS/zero-I/O gates и persistent root package test/fresh-clone CI contract correction
round 1 остаются без изменений. `E3-01` `[x]` теперь означает только честный repository source freeze с явным
active-PROD unknown; общий E3 и `E3-02…E3-12` остаются `[ ]`. Изменены только owning Stability plan и этот LOG.
Code/packages/lock/taskdb/tests/load/runtime/host/nginx/network/DB/deploy/TEST/PROD/push/merge не затрагивались;
implementation или PROD PASS не заявлены. Следующий шаг — обязательный fresh independent audit exact round-2 diff.

## 2026-07-22 — E2 milestone seal, E3 contract PASS and deep leaf-registry correction

**E2 accumulated gate.** Integrated feature HEAD `63de21030` passed `pnpm run ci` after an offline frozen install
with zero downloads and unchanged lockfile: lint, typecheck, HLS sync, integrator (`1,352` passed / `2` skipped),
webapp (`8,938` / `54`), media-worker (`67`), both production builds, SaaS/audit chain and registry audit were
green; no known dependency advisories at `low+` remained. The built-in webapp test globalSetup attempted migration
`0229`, received `permission_denied` and explicitly degraded to in-memory, so this is not DB evidence and no
separate DB command/credential was used. A gitignored `23 MiB` profiler artifact that polluted the first lint attempt
was moved intact to recoverable quarantine outside the repo rather than deleted. Task `#976` remains repository-done
with test/audit seals; no TEST/PROD/deploy action ran.

**E3 terminal source gate.** Fresh independent audit of terminal correction round 2 passed `0 P0 / 0 P1 / 0 P2`.
It verified every E3-01…E3-12 contract row, the `23 = 21 active + 2 legacy-only` producer/consumer census, exact
builder-backed `4,096 B` / `57,671,679 B` fixtures, numeric load/RSS/zero-I/O budgets, persistent package-test CI
wiring and the distinction between confirmed repository/TEST `55m` target and unconfirmed active PROD runtime.
The three docs commits through `08418ecbc` were fast-forward integrated. Only E3-01 is closed; E3-02…E3-12 code is
running under task `#980` in isolated branch `codex/e3-implementation-980`. Active PROD nginx remains a later
owner-authorized acceptance fact.

**Deep linked-plan audit.** A read-only recursive census found that the canonical registry omitted two active leaf
artifacts: `EDITOR_TIPTAP_MIGRATION_PLAN.md` and `ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md`. The denominator is now
`22`, not `20`: `3` partial, `4` currently executable and `15` dependency/owner/legal/production-gated. Two false
task closures were corrected through the taskdb port without erasing their repository evidence: `#931` is blocked
on mandatory owner live verification of every Tiptap discovery-manifest screen, and `#963` is blocked on an exact
contract or explicit defer/cancel for «Самые активные»/new counters/hiding semantics. The same audit selected current
source-contract streams `#808` Phase 1–2 and `#914` LOG-01 L0; neither has implementation authorization before its
atomic freeze and independent audit. SEC-02 `#900` remains owner-blocked after its single docs audit found incomplete
owner-row traceability and unsafe raw `systemctl cat`; no R1/host action started.

The single registry audit returned `FAIL 0 P0 / 2 P1 / 0 P2` on two exact traceability defects while confirming the
`22 = 3 + 4 + 15` denominator, all links, classifications and E2/E3 evidence. Tiptap taskdb referenced a mistyped,
nonexistent `998f662d3`; it now points to canonical `998f0d67b`. Outbound plan/taskdb still called accumulated CI
open even though `1fd6bf66e` is an ancestor of green `63de21030`; both now record CI closed while P0/P-guard and the
owner-authorized TEST fault-injection remain open. Per the one-pass docs policy no immediate serial re-audit was
started: `#959` stays `doing`, `seal_audit=false` until the next scheduled deep control-plane audit validates the
corrected state.

## 2026-07-22 — scheduled deep audit finds additional false closures

The two-hour read-only recursive audit checked all `22` leaf plans and returned `FAIL`. It confirmed the corrected
registry denominator and current three autonomous lanes, then found additional source-backed control-plane debt.
Task `#839` was reopened from false `done` with both seals cleared: its code/audit evidence at `308cecb3b` remains,
but the mandatory owner-authorized TEST scenario «new patient + booking without Rubitime» was never executed.
Task `#914` was retitled to say only the L1 serializer guard is closed; caller `msg`/sibling fields and L0 remain
open.

Two historical UI-P `[x]` rows were reset to open because their own P2B matrix still proves `#faf9f4` fallback and
local radius/padding forks (`P2B-02/09/10/14`). Conversely, the completed Stability E2 parent is now `[x]`, and the
owner-cancelled Unsupported-client Ф3 notification row is `[x]` with explicit cancelled semantics rather than an
open execution debt.

Rubitime received exact read-only mapping task `#981`: R3-CATALOG's expired compatibility-removal date and the fact
that R6 route/code rows are closed while cutoff/drain rows remain open must be reconciled against the full owner
plan and operational entrypoint before any next action. No route restoration/removal, DB/data, cutoff, archive,
TEST/PROD or deploy action was inferred from the audit. The recurring audit prompt now records start/final snapshots
and accepts taskdb+task-aligned worktree+manifest as collaboration-lane ownership; a valid concurrent commit is no
longer mislabeled merely because in-thread subagents do not publish brain agent-port run-state.

## 2026-07-22 — R0 guard repair and executable-leaf denominator correction

Rubitime R0 freeze drift task `#983` was implemented in an isolated worktree, independently audited `PASS 0/0/0`,
integrated and pushed as `0dc9f985b`. Two stale registry metadata defaults now say `canonical`; the three setting-key
declarations and the exact-org `branchServiceId` availability compatibility remain. The checker keeps its original
per-file baseline and exempts only exact reviewed source contexts. R0 self-test, current Rubitime gate `8/8`,
registry tests `6/6`, webapp typecheck, scoped lint and diff checks passed. R3C-11, failed `#981` docs reconciliation
and R5–R7 owner/runtime gates remain open; no DB/TEST/PROD/deploy/data action ran.

A fresh read-only readiness pass initially found `#982` as the only `ready_for_worker` leaf. The registry
classification was therefore corrected from stale `22 = 3 partial + 4 executable + 15 gated` to
`22 = 3 partial + 2 repository-open + 17 gated`: failed one-pass contract stages `#808` and `#914` are owner-gated,
not executable. E3 had a complete worker manifest; CRYPTO-01 still requires an exact residual/file/test freeze.
The first normalization treated standalone `#816` as superseded by `#913/N4` and disarmed aggregate `#815`; the
deeper provenance pass below corrected both conclusions without creating replacement scope. The later E3 terminal
audit below also supersedes the readiness snapshot: there is currently no worker-ready leaf.

## 2026-07-22 — E3 terminal audit rejects unstable 4 KiB performance evidence

The full cumulative E3 candidate `08418ecbc..55d1e9359` received a fresh independent high-risk audit:
`FAIL 0 P0 / 1 P1 / 0 P2`. E3-01…10 passed, including stable own-data snapshots, getter-once/deletion/prototype
adversarial cases, recursive JSON producer typing, exact producer/receiver order, redaction, outbox/DLQ semantics,
wire compatibility and retired JSON cleanup. Package `19/19`, full integrator tests, targeted webapp `112/112`,
typechecks, scoped lint, builds and diff checks passed.

E3-11 did not reproduce the worker-green load result. On an idle host the exact frozen proof produced 4 KiB p95
ratios `1.077350 / 1.034864 / 1.065186`; runs 1 and 3 exceeded the per-run `≤1.05` gate. All 55 MiB ratios
`0.822603 / 0.843008 / 0.781823`, RSS, non-monotonic post-GC and zero blocking DB/network I/O passed. Therefore
E3-11/E3-12 and overall E3 remain open, candidate `55d1e9359` stays isolated and must not be integrated. Two bounded
safe optimization attempts are exhausted; `#980` now asks the owner only whether a third attempt is allowed while
keeping the 5% budget unchanged. No DB/TEST/PROD/deploy/network/data action ran.

## 2026-07-22 — deep provenance correction for stale schedule/deep-link tasks

Read-only task/plan/source tracing recovered both ambiguous references. Aggregate `#815` BUG-C pointed to `#823`,
but global `#823` is an unrelated `brain` task; the canonical BersonCare row is `#829`. BUG-A/B code is already
owned by `#821` and still waits its TEST/owner acceptance, BUG-C is present through `7d3076e63`/`9f76fc4cb` with two
focused regressions, and BUG-D is closed by `#801` through `b588262ae`. `#815` is therefore closed only as
`SUPERSEDED/ABSORBED → #821/#829/#801`, with no implementation seals and no effect on the open `#821` checkpoint.

A separate current-source audit found that `#816` was closed too early. NTF-01/N4 permits supersession only after
the push-only web-entry replacement exists; today `buildDoctorMessagesOpenPath` still emits
`integratorConversationId`, while `doctorRouteRedirects` replaces the query and loses the target dialog. `#816` is
reopened as dependency-blocked under `#913/N3-N4`; a standalone legacy repair remains forbidden. `#822` stays a
legitimate absorbed duplicate without implementation seals. The same audit confirmed recent bounded repair rows
`#943/#944/#956/#957` as `PASS 0/0/0`; their missing audit seals were metadata drift, not new implementation work.

Readiness review also disarmed legacy auto-candidates `#803/#819/#820/#832`. Payment bypass row `#818` is now an
explicit owner gate: five `mock-complete` routes, not one membership route, require one coherent production
fail-closed repository guard. No PROD recheck is needed and no payment code starts before that approval.

## 2026-07-22 — Rubitime provenance/cutoff integrity reconciliation (`#981`)

The full Rubitime entrypoint, execution plan, DB cleanup sequence, R3/R5/R6/R7 proofs/runbooks, final manifest,
owner packet and current code inventory were reconciled without code, DB, data, host, TEST, PROD, deploy, cutoff,
archive or drop actions. The atomic matrix is saved in
the historical archive:
[`RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`](../../archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md).

R3-CATALOG's no-legacy-`booking_*`-read proof remains valid, but its `branchServiceId` compatibility-removal date
expired on `2026-07-21` while the compatibility input remains live across patient/public schemas, URLs and booking
paths. Final R3-CATALOG closure is reopened until the owner approves a new exact cutoff after old-link/row drain
evidence, or explicitly defers/rebaselines it with date, reason and rollback boundary.

R6 route/code removal artifacts remain in the repository and the three hard post-R6 static categories are still
zero. Because those artifacts were applied before the required cutoff/drain/CSV gate, their atomic rows are now open
as `PROVENANCE-only`; they do not close R6, authorize deployment or imply route restoration. The owner must decide
whether they remain dormant repository provenance pending `RR-PROOF-09`, or whether restoration is separately
required before deployment.

The refreshed static inventory records `21 hits / 6 files` for raw-table references, including
`operationalPoolReadiness.ts`. The aggregate current Rubitime gate was already red before this docs pass: R0 freeze
counts grew in `pgBookingEngine.ts` and `system-settings/registry.ts`. That code/baseline drift is reported, not
waived or fixed in docs-only `#981`.

## 2026-07-23 — external orchestration process audit

Independent external Opus audit
`claude-auditor-adhoc-2026-07-23T13-43-21-602Z` returned **CORRECT COURSE**, not `PASS` and not `STOP`.
It confirmed three real isolated streams with non-overlapping scope, bounded Track D decomposition, explicit
supersession of the obsolete HTTP-envelope work, the UI-7 two-round autostop, a clean pushed integration branch and
no `main`/`test` mutation.

The audit requested branch/worktree cleanup, regular worker backup pushes, durable taskdb/audit evidence and an
owner-facing decision sheet before future decision-gated stages. Corrections applied during/after the audit:

- worker branches for SMTP and D0 were pushed; the integration branch was already aligned with origin;
- stale local worktrees were reduced to the integration tree plus the three active isolated streams;
- the superseded unmerged E3 HTTP-envelope branch was removed after exact review; pending admin-support, LOG-01 and
  SEC-02 branches were backed up to origin before their local worktrees were removed;
- taskdb `#984`–`#987`, `#796`, `#808`, `#900`, `#914`, `#977` and superseded `#980` were updated through the
  canonical taskdb port; `accepted` was not changed;
- the independent patient-Messages `#986` verdict is persisted in the existing Track A report rather than remaining
  mailbox-only;
- the integration worktree is clean; the audit's `.env.example` drift observation did not reproduce in the actual
  unrestricted integration checkout.

Remote/local branch deletion beyond these proven cases remains subject to exact commit comparison; no branch was
discarded merely because it was old.
## 2026-07-30 — Patient Today principal defect closed; U5A lifecycle gate remains (`#796`)

Commit `2f7b0b41a` preserved the canonical patient organization principal across the affected RSC path. In the
owner's TEST walkthrough the patient home and organization list loaded, training/video worked, and the corrected
completion/feeling flows passed. The former `organization_principal_required` Patient Today symptom is therefore
closed. This evidence does not claim the separate two-organization switch or revoked remembered-organization
recovery seals: `#796` remains owner-blocked on the already documented reversible discharge/reactivate product flow
or sanctioned TEST-only lifecycle harness.
