# SaaS Foundation Plan — Dormant-but-Ready Multi-Tenant / Multi-Lingual / Multi-Region

Status: DRAFT v2 (2026-06-16) — hardened after an adversarial repo-grounded review. See **§12** for
findings folded in and **§13** for corrected sizing. The original v1 design (§0–§11) stands as the
target shape, but its "flip = a flag" promise is **corrected below**: the dormant scaffolding flips;
enforcing isolation is a one-time multi-week cutover, not a switch.

Purpose: lay every seam and mechanism for a multi-specialist,
multi-cabinet, multi-region (RU↔EU), multi-locale SaaS **now**, while the production app stays
single-cabinet / single-region / `ru` and **behaves identically**. Turning the SaaS on becomes a
set of config flags flipped over pre-built, tested machinery — not a refactor.

Chosen model (owner-confirmed): **global Person + Cabinet(=tenant) + Enrollment(join, clinical
root)**. A patient (Person) may enrol into many Cabinets; per-doctor clinical data hangs off the
Enrollment, not the Person.

---

## 0. Design invariants (non-negotiable)

1. **Zero behavior change today.** Every new column is nullable + backfilled to a single default
   Cabinet/Person/Region. Every new table has exactly one seeded default row. RLS ships present but
   not enforced for the prod role. i18n ships with one active locale.
2. **Flip-on, not rewrite — with one honest exception (v2).** The *dormant scaffolding* is additive
   and flag-gated (§1). BUT enforcing tenancy isolation is **not** a flag: it needs a one-time
   **enforcement cutover (T0)** — a bounded multi-week refactor (per-request connection model, 4
   process entrypoints, DB-role split, session schema). The scaffolding flips; *enforcement* is cut
   over once. See §12.C1–C3.
3. **Default-deny by construction once enabled.** You cannot obtain a DB handle without a Principal;
   the DB (RLS) enforces isolation even if an app query forgets a WHERE.
4. **Structural region/PII split from day one.** The global directory (id→region, no PII) is a
   separate schema from regional PII/clinical data, even while both live in one DB. EU later =
   "deploy a cell", not "untangle PII".
5. **Additive, online, idempotent migrations.** No downtime; backfills batched + re-runnable.

---

## 1. The flip points (the "two lines" made honest)

| Flag (default) | What flipping it does | Pre-built behind it |
|---|---|---|
| `TENANCY_ENFORCED=false` | Request edge builds a **real** Principal (patient→active cabinet from session; doctor→cabinet membership) instead of the system/bypass principal; DB connects as a **non-BYPASSRLS** role | Principal type, `withTenantContext`, RLS policies, scope columns |
| `ONBOARDING_ENABLED=false` | Exposes signup / cabinet-provisioning / invite routes | Provisioning service + routes (route-guarded off) |
| `LOCALES=ru` → `ru,en` | Adds EN to the allowlist; UI + content fall back ru→en | i18n provider, message catalogs, content translation shape |
| `APP_REGION=ru` + directory live | App runs as a regional cell; gateway routes by identity→region | region columns, RegionGuard, DirectoryPort |

Honest framing (revised v2): the *scaffolding* is ~4 flags in front of dormant, tested code. But
`TENANCY_ENFORCED` specifically sits behind the **T0 enforcement cutover** (§12.C1–C3) — a multi-week
refactor, not a switch. The other three (onboarding, locales, region) are genuine flags once their
dormant code lands.

---

## 2. Workstream A — Identity & tenancy schema

Two Postgres schemas to make the directory/PII split structural:

- `directory.*` — global routing brain, **no PII**:
  - `directory.regions(code PK, name, is_active)` — seed `('ru','Russia',true)`.
  - `directory.persons(id uuid PK, home_region FK regions, created_at)`.
  - `directory.cabinets(id uuid PK, home_region FK regions, created_at, status)`.
  - (later) `directory.routes(...)` — gateway lookup table (identity/cabinet → region). No subdomains.
- `app.*` — regional PII + clinical:
  - `app.person_profiles(person_id PK FK directory.persons, region, full_name, phone, dob, ...)`.
  - `app.cabinets(id PK FK directory.cabinets, region, owner_user_id, title, status, created_at)`.
  - `app.cabinet_members(cabinet_id, user_id, role, status)` — role ∈ owner|admin|doctor|assistant.
  - `app.enrollments(id PK, person_id, cabinet_id, region, status, created_at, UNIQUE(person_id,cabinet_id))`
    — **the join + clinical root**. Net-new (no patient↔doctor table exists today).

**Scope columns on the ~23 clinical/patient-owned tables** (symptom_entries, lfk_sessions,
lfk_complexes, media_files, user_channel_preferences, doctor_notes, message_log, broadcast_audit,
support_*, …): add `enrollment_id` + **denormalized** `cabinet_id` + `region` (all nullable now).

> Denormalization is deliberate: RLS policies must be a cheap equality on an **indexed** column, not
> a per-row subquery/join. `cabinet_id`/`region` ride on every scoped row. Enrollments do not move
> between cabinets (a re-enrollment is a new row), so the denorm never drifts.

**Backfill (idempotent, batched):**
1. One `directory.persons` + `app.person_profiles` per existing patient (`platform_users` role=patient), `home_region='ru'`.
2. One default `app.cabinets` (the current clinic), owner = the canonical specialist (see specialist-consolidation).
3. `cabinet_members` ← existing specialists/admins.
4. `app.enrollments` ← one per (patient, default cabinet).
5. Clinical rows ← set `enrollment_id/cabinet_id/region` to the default enrollment/cabinet/`ru`.

Indexes: `(cabinet_id)` and `(enrollment_id, ...)` composite on every scoped hot table.

---

## 3. Workstream B — The scoping chokepoint (the engine)

```ts
type Principal =
  | { kind: 'patient'; personId: string; enrollmentId: string; region: string }
  | { kind: 'doctor';  userId: string;  cabinetId: string;     region: string }
  | { kind: 'system';  region: string;  bypass: true };          // jobs, admin, migrations

withTenantContext<T>(p: Principal, fn: (tx: Tx) => Promise<T>): Promise<T>
```

- **Ambient context, minimal port churn.** The request edge wraps handling in
  `withTenantContext(principal, () => handler())`, storing the Principal in `AsyncLocalStorage`. The
  shared `Database` handle, on **connection checkout**, reads the ambient Principal and applies it to
  the connection; it **throws if no context is set**. Ports keep calling `db.query(...)` largely
  unchanged — this is why it is not 340 edits.
- **Connection/context application (key decision, red-team target).** To stay correct under
  connection pooling: pin **one connection per request**, set context on checkout, `RESET ALL` on
  release. (Alternative: wrap request DB work in one transaction with `SET LOCAL`. Avoid plain `SET`
  on a shared pooled connection — it leaks across requests. If pgbouncer is in transaction mode, only
  the `SET LOCAL`-per-transaction variant is safe.)
- **Inert mode (today):** the edge always builds a `system` Principal (`bypass:true`) → app connects
  as a **BYPASSRLS** role → RLS not enforced → identical to current behavior.
- **Flip:** build real Principals + connect as a non-bypass role. Wire-up lives in `buildAppDeps`
  (the single edge where deps are constructed — the clean-architecture lever).

---

## 4. Workstream C — RLS policies (enforcement), shipped inert

Per scoped table (example `app.symptom_entries`):

```sql
ALTER TABLE app.symptom_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_patient ON app.symptom_entries FOR ALL
  USING      (current_setting('app.principal_kind', true) = 'patient'
              AND enrollment_id = current_setting('app.enrollment_id', true)::uuid)
  WITH CHECK (enrollment_id = current_setting('app.enrollment_id', true)::uuid);

CREATE POLICY p_doctor ON app.symptom_entries FOR ALL
  USING      (current_setting('app.principal_kind', true) = 'doctor'
              AND cabinet_id = current_setting('app.cabinet_id', true)::uuid)
  WITH CHECK (cabinet_id = current_setting('app.cabinet_id', true)::uuid);
-- 'system' acts via a BYPASSRLS role; no policy row required.
```

- `current_setting(key, true)` (missing_ok) avoids errors when unset; **unset must evaluate to DENY**,
  never accidentally to a NULL comparison that passes. Policies are written so a missing/empty GUC
  matches no row.
- `WITH CHECK` on writes = cannot insert/update a row into a cabinet/enrollment you are not scoped to.
- **Inert strategy:** RLS is `ENABLE`d, policies present and tested in CI under a **non-bypass** role,
  but the prod role has BYPASSRLS until flip. Flip = swap prod role + real Principals.
- **Shadow/dry-run before flip:** run staging with the non-bypass role + real Principals against the
  full test suite and a traffic shadow, logging every denial. Surfaces missed cross-boundary reads,
  public tables, and admin paths **before** the real cutover. This is the primary de-risking step.

---

## 5. Workstream D — Per-tenant config & secrets (dormant)

- `app.cabinet_integrations(cabinet_id, integration_code, config_json, encrypted_secret, enabled)`.
- Envelope encryption (KMS/age), key per region later (residency).
- `SecretsResolver` port: `resolve(cabinetId, integrationCode)` → prefers a per-cabinet row, **falls
  back to global env** when none exists. Today: no rows → current single Telegram bot / Rubitime /
  GCal / S3 keys keep working untouched. Flip = insert per-cabinet rows.
- Covers all 9 integrations (Rubitime, GCal, Telegram, S3, SMSC, Email, VK, MAX) behind one resolver.
- **Multi-bot Telegram** (separate sub-task): inbound webhook must route an update to the owning
  cabinet's bot identity — design the routing key now even if one bot today.

---

## 6. Workstream E — i18n scaffold (ru-only, dormant)

- Add `next-intl`: provider at app root, `messages/ru.json`, `useTranslations`. Locale resolution =
  cookie → `Accept-Language` → default `ru`. Allowlist `['ru']`. **No path prefix / no subdomain.**
- String extraction is incremental; the **framework + `t()` plumbing is what we land now**.
- Content (7 user-authored tables: content_pages, content_sections, lfk_exercises, lfk_complexes,
  references, system_settings, doctor_notes): add nullable `locale` (default `'ru'`) + a read helper
  with fallback to default locale. Flip EN = seed `en` rows + allowlist `'en'`.

---

## 7. Workstream F — Region awareness (dormant, one region)

- `region` on persons/cabinets/scoped rows + carried in the Principal/GUC.
- App reads its own region from `APP_REGION` (one cell = one region). `RegionGuard`: cross-region
  access denied by the same RLS mechanism (region in the policy) — inert with one region.
- `DirectoryPort.resolveRegion(personId|cabinetId)` → returns `ru` today; later queries the real
  global directory. Gateway contract (documented, infra-owned): authenticate → look up region in
  directory → route to the regional cell. **No subdomains** — routing is by authenticated identity.
- EU later = deploy a second cell (`APP_REGION=eu`, own DB + storage) + populate directory routes.

---

## 8. Workstream G — Quality gates (build in from day one)

1. **CI invariant:** a test scans `information_schema`; any `app.*` table carrying `enrollment_id`/
   `person_id` **must** have RLS enabled + ≥1 policy, else the build fails. Keeps default-deny true as
   the schema grows.
2. **Append-only clinical audit:** trigger-based `app.clinical_audit(actor, action, table, row_id,
   at)` on scoped clinical tables (medico-legal / 152-FZ / GDPR). Cheap now, lossy if added later.
3. **Soft-delete:** `deleted_at` on clinical tables; the scoping layer filters it.
4. **Transactional outbox:** `app.outbox(...)` + relay worker; booking write + side-effect enqueue in
   one tx; relay delivers to Telegram/Rubitime/GCal. Closes the desync class that already leaked an
   overlap booking to GCal in prod.
5. **Multi-tenant test fixtures:** seed two cabinets + one shared Person; an isolation test asserting
   doctor A cannot read cabinet B's chart (run under the non-bypass role).

---

## 9. Sequencing (Phase 0 — all inert, independently shippable)

1. Schema seams + backfill (§2).
2. Chokepoint + Principal + `buildAppDeps` wiring, running under system/bypass (§3).
3. RLS policies under BYPASSRLS role + CI invariant (§4, §8.1).
4. SecretsResolver with env fallback (§5).
5. i18n provider ru-only + content locale shape (§6).
6. Region columns + RegionGuard + DirectoryPort stub + gateway contract doc (§7).
7. Outbox + audit + soft-delete + isolation fixtures (§8).
8. Flags + flip runbook (§1).

Throughout: production stays single-cabinet/`ru`, behavior unchanged.

---

## 10. Open product decisions (block specific tables — decide before coding them)

- **Shared vs private boundary.** Demographics (name/phone/dob) = shared on Person. Clinical
  (complaints/diagnoses/notes/course progress/files) = private per Enrollment. **Undecided:** payments
  history, uploaded documents, appointment history — shared identity or per-cabinet? This decides
  exactly which tables re-parent onto Enrollment vs stay on Person.
- **Cross-region enrollment** (RU patient + EU doctor): legal dead-end. Default = forbid; opt-in
  replication-by-consent is a later feature. Decide the default now.
- **Person dedup** across cabinets: same human enrolling in a second cabinet — match by phone? create
  new Person? identity-matching policy needed.

---

## 11. Known weak spots to pressure-test (self red-team seed)

- `SET LOCAL` vs connection pooling / pgbouncer — context leak across requests if mis-scoped.
- BYPASSRLS role accidentally reused on a post-flip hot path → silent global leak.
- Backfill race: rows written **during** the backfill window with NULL scope.
- `current_setting` unset → must DENY, not pass via NULL comparison.
- Enumerating cross-boundary reads ("list my doctors") and public tables is manual — one miss =
  leak or breakage.
- Long-transaction-per-request variant → lock contention.
- 152-FZ: even a global `person_id→region` linkage may count as PII linkage — legal review.
- RLS performance on hot tables; index coverage for `cabinet_id`/`enrollment_id`.
- Multi-bot Telegram inbound routing; one webhook today.
- 106 existing migrations + online backfill on large tables.

---

## 12. Red-team hardening (v2 — adversarial repo-grounded review, 2026-06-16)

Findings from a code-grounded adversarial review, with resolutions folded into the plan. Severity in
brackets. Evidence paths are real and verified against the repo.

### C1 [CRITICAL] — Shared `pg.Pool` + Drizzle per-statement checkout breaks ambient `SET LOCAL`.
The app runs every statement against a **shared pool** (`infra/db/client.ts` `new Pool({max:5})`),
through Drizzle (`app-layer/db/drizzle.ts`) and a default executor `runWebappPgText` (`infra/db/
runWebappSql.ts`). A connection is checked out **per statement** and released immediately, so
`SET app.enrollment_id = …` on connection A is invisible to the next statement on connection B.
~590 sites resolve the db via `getPool()/getDrizzle()`; 39 use dedicated `pool.connect()` clients;
132 issue raw `.query()`.
**Resolution:** RLS-via-GUC requires a **request-scoped pinned connection** (feasible: app talks to
Postgres directly at `127.0.0.1:5432`, no pgbouncer in path — session-level `SET` + `RESET ALL` on
release is valid). Hook it at the single default executor (`runWebappPgText`/`getWebappSqlDb` resolve
the pinned client from `AsyncLocalStorage`) — **not** 590 hand-edits, but the 39 dedicated-client and
132 raw-query paths must each opt in, and this is the **T0 enforcement cutover**, not a flag. The
plan's "ports unchanged / flip is a flag" claim is **retracted** for enforcement.

### C2 [CRITICAL] — Non-request processes have no edge to wrap (4 entrypoints).
`buildAppDeps` is not "the single edge." Long-running processes build `dbPort = createDbPort()` once
at boot (`integrator/app/di.ts`) and never see an HTTP request: the **bot** (per-update via
`handleUpdate/handleMessage/handleCallback`), the **delivery/projection worker**
(`integrator/.../runtime/worker/main.ts`), the **scheduler** (`runtime/scheduler/main.ts`), and the
**media-worker** (own pool). Under enforcement these run with no context → crash on "throw if unset",
or run as BYPASSRLS → the silent leak §11 warns about.
**Resolution:** New workstream — wrap **each loop** in `withTenantContext`, resolving the owning
cabinet from the inbound update / job row / tick. This is real work in T0, per process.

### C3 [CRITICAL] — Session has no `activeCabinetId`; the patient principal is unbuildable.
`shared/types/session.ts` `AppSession`/`SessionUser` carry no tenant/cabinet/region field.
**Resolution:** Add `activeCabinetId`+`region` to the session (land the field **dormant** in Phase 0),
plus a cabinet-selection UX for multi-enrolled patients and default-cabinet resolution for the
single-cabinet case. Live use is T0.

### C4 [CRITICAL] — A conflicting tenant axis already exists (`beOrganizations`/`organization_id`).
The booking engine already scopes by organization: `getDefaultOrganizationId` used **109×**,
`organization_id` **36×**, a `beOrganizations` table with CRUD, default from
`system_settings.booking_default_organization_id` (`infra/repos/pgBookingEngine.ts`). Introducing
`Cabinet` as a *new* tenant axis would create two parallel dimensions → drift + double-scoping bugs.
**Resolution (DECIDED 2026-06-16):** **Cabinet ≡ Organization** — reuse `be_organizations`; do NOT add
a parallel `cabinet_id`. Verified against the canonical booking engine (migration `0086`): it already
models `be_organizations → be_branches → be_rooms`, with `be_specialists` **owned by an org**
(`organization_id` FK) and `be_appointments(org, branch, specialist, platform_user)`. Solo specialist
= an org with 1 specialist; clinic = the same org with N specialists/branches — **the clinic hierarchy
already exists**, it is merely wired for booking only today (clinical tables lack `organization_id`).
Therefore: `enrollment = Person ↔ Organization` (the specialist is linked via `be_appointments`, NOT
the tenant key); Phase 0 extends `organization_id` onto the ~50 clinical tables. **Intra-clinic card
visibility = a soft per-org policy** (`be_organizations.card_visibility_policy`, default `all` = every
org specialist sees every org patient; optional `assigned` = only via appointment/primary-specialist)
— a column + an optional 2nd RLS predicate, **switchable later WITHOUT a migration**. Safe to defer;
launch solo with `all`.

### H1 [HIGH] — Scoped surface is ~95 tables / 148 migrations / 5 dirs, not 23 / 106.
Real counts: ~**95 tables**, **148 migration files** across **5 roots** (webapp 91, integrator 1,
telegram 14, rubitime 7, …). Omitted clinical tables include `online_intake_*`,
`patient_lfk_assignments`, `conversations`/`conversation_messages`, `question_messages`/
`user_questions`, `appointment_records`, `patient_bookings`, reminder occurrence tables,
`media_upload_sessions`, subscriptions, plus Telegram-schema per-user tables.
**Resolution:** Regenerate the scoped inventory from `information_schema`; size backfill against ~50+
clinical tables; the §8.1 CI invariant and every `ENABLE RLS` must cover all 5 migration roots.

### H2 [HIGH] — BYPASSRLS-until-flip leaves prod superuser paths; one shared DB role today.
Migrations run on **every boot** (`integrator/main.ts` → `runMigrations()`) under the **same single
role** as the app (`deploy/env/*`, one role, no separate migration role). If that role has BYPASSRLS,
RLS is **never** enforced. 39 dedicated-client + 132 raw-query paths (advisory locks, uploads, purges,
merges, audit) need classifying.
**Resolution (do in Phase 0):** Introduce **two roles now** — a migration role and a **non-bypass app
role** (two `DATABASE_URL`s). Prefer `FORCE ROW LEVEL SECURITY` + a **narrow, enumerated** bypass role
used only by listed jobs, over "app role has BYPASSRLS." Classify the 39+132 paths during T0.

### H3 [HIGH] — File storage is not isolated (single bucket, flat keys, shared creds).
`infra/s3/client.ts` keys are `${S3_KEY_PREFIX}/${mediaId}/${file}` — no cabinet/region; one bucket,
one credential set. A presign/key-guess bug crosses tenants; a physical EU split can't "just deploy a
cell" because objects are region-less.
**Resolution (Phase 0):** Put **cabinet/region into the key prefix now** (even single-tenant) so new
objects are physically partitioned; document legacy re-keying before any region split; SecretsResolver
covers per-cabinet bucket/prefix, not only credentials.

### H4 [HIGH] — Cross-schema FKs `app.* → directory.*` won't survive a physical region split.
Intra-DB FKs (`app.person_profiles.person_id → directory.persons`) cannot exist once EU is a separate
physical DB (the §7 end-state). RLS is same-DB only; cross-region isolation depends entirely on the
unbuilt gateway/DirectoryPort.
**Resolution:** Make directory references **soft (no FK)** from day one, or accept an explicit
FK-severance migration at split. Stop marketing the schema split as making EU a pure deploy — it buys
logical tidiness, not physical portability.

### M1 [MED] — Backfill assumes clean patient→cabinet→enrollment; data says otherwise.
Specialist consolidation is incomplete (`scripts/consolidate-specialist-identity.ts`) and
NULL-specialist appointments exist; such rows can't be deterministically assigned a cabinet. Writes
never stop (bot+workers), so rows land during the backfill window with NULL scope.
**Resolution:** Gate backfill **behind specialist consolidation**; add a reconciliation pass + a
DEFAULT/trigger stamping `cabinet_id` on rows inserted during the window; only then add NOT-NULL.

### M2 [MED] — Integrator reads use bare `pool.query`; `tx()` is opt-in → uneven outbox guarantees.
Verify the motivating overlap-leak booking path actually runs inside `tx()` before relying on the
§8.4 outbox.

### M3 [MED] — `next-intl` locale resolution assumes middleware; repo uses `proxy.ts` (no middleware).
Landing the provider is easy; wiring cookie/`Accept-Language` resolution through the proxy-not-
middleware constraint is the real, currently-unscoped work.

### Missing workstreams (the plan built isolation, not tenant lifecycle)
- **Per-tenant rate-limit / quotas** (noisy-neighbor) — none today.
- **Tenant offboarding / deletion / export** — only user-level purge exists; nothing cabinet-scoped.
- **SaaS billing / provisioning lifecycle** — existing `subscriptions`/`memberships` are *patient*
  product subs, **not** tenant billing; `ONBOARDING_ENABLED` has no plan/payment model behind it.
- **Per-tenant inbound bot/webhook routing** — hard requirement; one Telegram secret today; routing an
  update to the owning cabinet's bot **gates multi-tenant Telegram entirely**.
- **Per-tenant observability** — global logger, no tenant tag for support/abuse triage.
- **`/admin` boundary** — API client with no own DB; its place in the bypass/tenancy model is undefined.
- **Caching vs per-request context** — `react cache()` wraps `buildAppDeps` as **module-singleton**
  ports; a process-wide singleton DI graph clashes with per-request tenant context. Must resolve.

### Verdict (folded in)
The **dormant, additive half is sound and landable now with zero behavior change** (nullable scope
columns, `directory/app` split with soft refs, seeded default cabinet, RLS present-but-bypassed, i18n
provider, SecretsResolver+env fallback, region columns, S3 key scheme, dormant session field, CI
invariant). The **turn-on is NOT a flag** — it is the T0 enforcement cutover: per-request connection
refactor, 4 process entrypoints, session+UX, role split + path audit, and the `organization_id`
reconciliation. Plan reframed accordingly.

---

## 13. Revised sizing (v2)

| Block | What | Eng-weeks |
|---|---|---|
| **Phase 0 — dormant scaffolding** (zero behavior change, landable now) | ~50-table nullable scope + backfill across 5 migration roots · `directory/app` split with **soft refs** · **two DB roles now** · RLS policies under `FORCE`+narrow-bypass · CI RLS invariant · SecretsResolver+env fallback · i18n provider (proxy-based) · region cols · **S3 cabinet/region key scheme** · dormant `activeCabinetId` session field · outbox/audit/soft-delete/isolation fixtures · **decide Cabinet≡Organization** | **~2.5–4** 🟢 safe |
| **T0 — enforcement cutover** (the refactor; run when ready to enforce) | per-request pinned-connection model hooked at `runWebappPgText` + audit 39 dedicated + 132 raw paths · wrap **4 process entrypoints** · session live + cabinet-selection UX · swap to non-bypass app role + classify bypass paths · shadow-enforcement period | **~6–9** 🔴 |
| **Tenant lifecycle** (the SaaS itself) | onboarding/provisioning + plan/billing · **per-tenant inbound bot routing** · offboarding/deletion/export · per-tenant quotas/rate-limit · per-tenant observability · `/admin` boundary | **~5–8** 🟠 |
| **i18n activation (EN)** | unchanged | **~3–4.5** 🟡 |
| **Multi-region (EU cell)** | unchanged + FK-severance | **~7–11** 🟠 infra |

**Near-term safe step:** Phase 0 (~2.5–4 wk), entirely dormant.
**To actually be a single-region multi-tenant SaaS:** Phase 0 + T0 + lifecycle ≈ **~14–21 wk**
(revised up from the v1 ~10–14 — v1 undercounted the connection refactor, the 4 entrypoints, the
~95-table surface, and tenant lifecycle).
