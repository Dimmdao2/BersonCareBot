/**
 * declaration.ts — DB privilege-layer DECLARATION («как должно быть»): single source of truth.
 *
 * ⚠ STATUS. Not wired into any deploy, no DDL/DML has run, no generator (Ф2.3) consumes it yet.
 *   What CHANGED vs the Ф2.2 draft: the draft transcribed the LIVE census minus known defects; this
 *   file adds the DECIDED MODEL — the owner's decisions of 2026-08-08 (§0 below), a declared data
 *   CLASS + required WALL on every one of the 239 classified tables, the two-port access model, the
 *   narrow resolver role, the maintenance (pruner) role, and the acceptance invariant. Where today's
 *   code does something the model forbids, the model is declared and the code is listed in
 *   `CODE_MUST_CHANGE` — never rubber-stamped by declaring the current grant.
 *
 * Shape: SCHEME §A (ten sections), reconcilable per SCHEME §F (every declared field has a catalog
 *   side the two-way diff compares against). Provenance rule (FACTS §0): every value traces to the
 *   census (`evidence/13 §N`), to the classification (`evidence/14 part N`, `FINDINGS_TABLES Дn/Иn/Оn`),
 *   to a disposition doc (`evidence/15`, `evidence/16`, `evidence/18`) or to repo code (`file:line`).
 *   No invented literals — a guessed proconfig/grant is a byte-level false-red under §F.
 *
 * Refuted approaches NOT reintroduced (FACTS §9): capability-only as norm (§9.4), "always throw"
 *   (§9.2), AST analysis (§9.3), EXPLAIN-proofs (§4). definer functions are ENUMERATED EXCEPTIONS,
 *   not a design (SCHEME §A.7).
 *
 * Scoping (SCHEME §A): `cluster` (roles + scope) is CLUSTER-level; `databases.<db>` (schemas, tables,
 *   functions, types, definerExceptions, creators, orgTableAllowlist, dbSettings) is per-database.
 *   The two managed DBs DIFFER — both are encoded, dev deltas declared explicitly.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * // GAPS — what this file still could NOT resolve (input to Ф2.3 generator + owner triage).
 *   Search `TODO(census-gap)` / `TODO(owner?)` in-file for the exact sites. RESOLVED gaps are listed
 *   at the bottom of this block so nobody re-opens them.
 *
 *   G1. Exact list of the 11 tenant-bypassable roles (FACTS §1.5 "11 строк"). The SET ROLE ×
 *       principal sweep of 1892 cells was NOT re-run (evidence/13 §6.1). Every role carries a
 *       `scope`, but the canonical 11-row visibility set §H.5 renders against is unconfirmed.
 *   G2. Full per-table GRANT matrix (~239 app tables). The read-only census enumerated ACLs for a
 *       handful of representative tables only (evidence/13 §2.5); the classification named the
 *       DANGEROUS grants per table but not the complete `relacl`. Tables carry
 *       `grantMatrix: 'G2-pending'` where the full ACL is not enumerated — class + wall + the
 *       justified/forbidden grants ARE declared, the exhaustive ACL row set is not guessed.
 *   G3. Which of the 38 migrator-owned + 1 `app_platform_settings`-owned definer functions are
 *       INTENTIONALLY non-`app_owner` vs ownership drift (evidence/13 §3.2, §6.3). Only 1 of the 38
 *       is named in the census.
 *   G8. Policy names/bodies (9 on `platform_users`, 4 on `admin_audit_log`, …) not enumerated by the
 *       read-only census (evidence/13 §2.4). Required POLICY SEMANTICS are declared per table
 *       (`policyRequirement`); the existing names/bodies are `TODO(census-gap G8)`.
 *   G9. Exact env-secret variable names + per-login CONNECT / VALID UNTIL / conn-limit (they live in
 *       the deploy secret store, not the catalog). `passwordEnv` values are convention placeholders.
 *   G10. Coverage gap of the classification itself: FACTS §1.6 counts 307 relations; the four slices
 *       covered 239 tables (`relkind IN ('r','p')` in public/app/integrator/drizzle). The remaining
 *       relations (views, matviews, partitions, non-covered schemas) are NOT classified — declaring
 *       classification "complete" before that measurement would be false (FINDINGS_TABLES §1.3 ⚠).
 *   G11. Row counts taken from `pg_class.reltuples` are unreliable in this database (proved twice:
 *       FINDINGS Д14/К8, К9). Any volume-driven decision needs `count(*)`. Open: exact size of
 *       `public.idempotency_keys`.
 *
 *   RESOLVED since the draft — do not re-open:
 *   • G4 (NOINHERIT drift) — RESOLVED as a DECISION, not a gap: every login is declared NOINHERIT
 *     (SCHEME §A.1 pin) and the three live `rolinherit=t` logins are declared as drift to be brought
 *     to NOINHERIT by `roles-install`. Reason: with INHERIT the login carries its terminal role's
 *     privileges before any `SET ROLE`, which is the mechanism behind FINDINGS И3 (`app.is_staff()`
 *     true for `bcb_test_integrator_login` before any SET ROLE) — declaring the drift as "the norm"
 *     would bless that defect.
 *   • G5 (`app_ext` owner differs per db) — RESOLVED: canonical owner is `postgres` on BOTH managed
 *     dbs (SCHEME §C: the extension seam belongs to the superuser; TEST already matches). dev's
 *     `bcb_webapp_dev_user` ownership is declared as drift.
 *   • G6 (`platform_users` Ф6 red baseline) — not a declaration value: the declaration says
 *     `rls: 'force'` (SCHEME §I Р3); WHERE the red baseline is taken (a0 snapshot vs temporary
 *     RLS-off) is an acceptance-run choice, recorded in PLAN Ф6, not here.
 *   • G7 (`reference_catalog_snapshot_receipts`, dev `patient_specialist_links`) — RESOLVED: both are
 *     TRUE org tables. The receipt is per-organization by construction (it records that THIS
 *     organization's copy of the global catalog was seeded — evidence/14 part 3, the
 *     `reference_catalog_seed_owner` policy reads it per org); `patient_specialist_links` links a
 *     patient to a specialist inside one organization (evidence/14 part 3, class P). Both `org: true`.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================================
 * SECTION 0 — OWNER DECISIONS 2026-08-08 (normative; every section below implements them)
 *   These are the owner's words, dated. "пока" markers are preserved: a current-state decision is
 *   not a permanent one, and the difference has to survive in the file, not in someone's memory.
 * ========================================================================================== */

export interface OwnerDecision {
  id: string;
  date: string;
  /** owner's own words where they were verbatim; otherwise a faithful one-line restatement */
  said: string;
  /** what this file does about it */
  encodedAs: string;
  /** true = explicitly a CURRENT-state decision ("пока"), revisit expected */
  provisional: boolean;
}

export const OWNER_DECISIONS: OwnerDecision[] = [
  {
    id: 'D1-platform-scope',
    date: '2026-08-08',
    said: 'Глобал админ не лезет в медицину, пока так.',
    encodedAs:
      'PLATFORM_ROLE_SCOPE below: app_platform_settings gets grants/policies ONLY on commerce + clinic '
      + 'scaffolding + audit (organizations, branches, services, billing, tariffs, admin_audit_log). Zero '
      + 'grants and zero policies on treatment programs, tests, symptoms, support, reminders and clinical '
      + 'artifacts. Two live cross-tenant platform reads are declared REMOVED (see CODE_MUST_CHANGE C1/C2). '
      + 'Closes FINDINGS О1 in direction (а).',
    provisional: true, // «пока» — owner may later ask for an audited path (О1 variant б)
  },
  {
    id: 'D2-patient-visibility',
    date: '2026-08-08',
    said: 'Пациент видит ТОЛЬКО тесты, добавленные в его программу. он НЕ ВИДИТ внутренние '
      + 'комментарии и пометку проблемный и тд.',
    encodedAs:
      'PATIENT_VISIBILITY below + per-table `revoke`/`policyRequirement`: app_patient loses SELECT on '
      + 'be_appointment_staff_comments and be_patient_booking_profiles; the patient branch on test_attempts/'
      + 'test_results must resolve through the program item (test_attempts.instance_stage_item_id), not '
      + 'through the flat patient_user_id column; clinical_test_regions / clinical_test_measure_kinds stay '
      + 'closed to the patient. Closes FINDINGS О2.',
    provisional: false,
  },
  {
    id: 'D3-reference-org-copy',
    date: '2026-08-08',
    said: 'Справочники: глобальный шаблон → копия на организацию при её создании; клиника владеет '
      + 'своей копией (правит, переименовывает, удаляет ненужное). Арендатор НЕ пишет в глобальный шаблон.',
    encodedAs:
      'WALL_TEMPLATES `reference-template` (platform-owned template, tenant read-only, tenant write '
      + 'FORBIDDEN) and `reference-org-copy` (the org-owned copy: organization_id + clinic wall). Every '
      + 'class-R table and the platform library tables declare one of the two. The existing '
      + 'reference_categories / reference_items / reference_catalog_snapshot_receipts trio already '
      + 'implements this shape and is the reference form.',
    provisional: false,
  },
  {
    id: 'D4-two-ports',
    date: '2026-08-08',
    said: 'Ровно ДВА порта доступа к БД: webapp и integrator. Воркеры, крон и прунер своих '
      + 'подключений НЕ открывают — ходят через один из двух.',
    encodedAs:
      'PORTS below + `port` on every login record. No third port: today five process families and nine '
      + 'connection strings exist (webapp staff/nonstaff/config-reader/operator, integrator request/'
      + 'diagnostic/delivery/scheduler/telemetry, media-worker) — the ones that constitute a third port '
      + 'are marked `mustFold` and listed in CODE_MUST_CHANGE C5-C8.',
    provisional: false,
  },
  {
    id: 'D5-narrow-resolver',
    date: '2026-08-08',
    said: 'Узкая роль резолвера: предмаршрутный поиск интегратора (chat_id/внешний id → организация) '
      + 'получает СВОЮ узкую роль ровно на этот один поиск.',
    encodedAs:
      'Role `app_integrator_resolver` (scope NONE, access only through the definer accessor '
      + '`app.resolve_organization_for_channel_identity`). The live 4-way membership of the integrator '
      + 'login (app_identity_bootstrap + app_patient + app_staff + app_worker, evidence/13 §1.3) is NOT '
      + 'declared — the env mapping declares the resolver role instead. CODE_MUST_CHANGE C3/C4.',
    provisional: false,
  },
  {
    id: 'D6-acceptance-invariant',
    date: '2026-08-08',
    said: 'любой запрос к базе данных без контекста и точного совпадения разрешений выдает 0 строк '
      + 'и пишет ошибку в журнал.',
    encodedAs:
      'ACCEPTANCE_INVARIANT below. Consequence encoded: the context accessors (app.current_org_id, '
      + 'app.current_patient_user_id, app.current_integrator_user_id) MUST RAISE on missing context '
      + 'instead of returning NULL — a silent zero is exactly the failure mode this invariant forbids. '
      + 'That is a change of behaviour, so the accessors carry `contextMissing: raise` and the swallow '
      + 'sites are listed in CODE_MUST_CHANGE C9-C11.',
    provisional: false,
  },
  {
    id: 'D7-wall-by-class',
    date: '2026-08-08',
    said: 'Стена — по объявленному КЛАССУ таблицы, а не по наличию organization_id.',
    encodedAs:
      'Every table declares `cls` (P/C/S/R/T) and `wall`; WALL_TEMPLATES maps class → required wall. '
      + 'Load-bearing because only 162 of 239 classified tables carry organization_id (172 org tables '
      + 'live in the db, evidence/13 §2.3, against 239 classified) — a presence test would leave the '
      + 'rest wall-less by construction.',
    provisional: false,
  },
  {
    id: 'D8-pruner',
    date: '2026-08-08',
    said: 'Прунер работает под своей сервисной ролью через порт webapp (внутренний эндпоинт), '
      + 'никогда под арендной ролью.',
    encodedAs:
      'Role `app_operational_maintenance` (kind service, scope NONE, login false), reached from the '
      + 'webapp port internal endpoint. Today the retention seam runs `SET ROLE app_staff` '
      + '(packages/db-principal/src/index.ts:1032-1037) — a tenant ORG role holding DELETE on '
      + 'cross-tenant journals. CODE_MUST_CHANGE C12.',
    provisional: false,
  },
  {
    id: 'D9-superuser',
    date: '2026-08-08',
    said: 'Суперпользователь сохраняет полный доступ (путь DBA); на проде защищён сильным паролем.',
    encodedAs:
      'Role `postgres` declared kind superuser, scope GLOBAL, `bypassrls: true` — declared, not a '
      + 'defect. Sweep §G.5 renders its allowlist from this declaration instead of hardcoding.',
    provisional: false,
  },
];

/** SCHEME §I Р3/Р4 are re-presented to the owner at Ч1.3 acceptance; recorded here so they are not lost. */
export const OWNER_GATES_OPEN: Array<{ id: string; question: string; safeDefault: string }> = [
  {
    id: 'O3-empty-tenant-discriminator',
    question:
      'organization_id IS NULL массово на живых таблицах (outgoing_delivery_queue 812/812, '
      + 'product_analytics_hourly 5300/5421, patient_bookings 219/263, …; FINDINGS Д27). Сперва backfill, '
      + 'потом стена — или включаем стену и списываем NULL-строки?',
    safeDefault:
      'backfill first: turning the wall on as-is cuts 83-100% of rows on three live tables. Tables '
      + 'affected carry `ownerGate: [\'O3\']` and their wall stays declared but NOT scheduled before the answer.',
  },
  {
    id: 'O4-dead-tables',
    question:
      'Судьба мёртвых/недостроенных таблиц с ПДн: booking_cities (2 строки, шов не вызывается), '
      + 'online_intake_answers/_status_history (4/8 строк, читателей нет) — дропать или закрывать стенами?',
    safeDefault:
      'keep + wall (reversible on TEST); dropping data is not an engineering decision. Declared ACTIVE '
      + 'with `ownerGate: [\'O4\']`.',
  },
  {
    id: 'O5-user-identity-cutover',
    question:
      'user_identity + user_contacts — 18 политик и 31 грант охраняют КОПИЮ (evidence/18 §1-2: 237/237 и '
      + '192/192 совпадений). Направление cutover: снести зеркало или снести колонки-источники в platform_users?',
    safeDefault:
      'no move before the answer; both tables declared ACTIVE with their walls (they hold live PII today).',
  },
  {
    id: 'O6-webapp-session-logins',
    question:
      'Решение D4 говорит «свой env-секрет и свой пул» на порт. Порт webapp сегодня держит ДВА '
      + 'рантайм-логина (staff и nonstaff) — это два подключения ОДНОГО порта. Свести их в один логин с SET ROLE?',
    safeDefault:
      'НЕТ — не сводить. Один логин, состоящий в app_staff, делает `app.is_staff()` истинным ДО всякого '
      + 'SET ROLE (это ровно механизм дефекта FINDINGS И3 на логине интегратора). Инженерное чтение решения '
      + 'D4: «свой секрет» — на ПОРТ (секрет webapp ≠ секрет integrator), а не на логин. Записано явно, '
      + 'потому что расходится с буквальным прочтением.',
  },
];

/* ============================================================================================
 * SECTION 0b — ACCEPTANCE INVARIANT (owner's criterion for the whole work)
 * ========================================================================================== */

export const ACCEPTANCE_INVARIANT = {
  owner: 'любой запрос к базе данных без контекста и точного совпадения разрешений выдает 0 строк '
    + 'и пишет ошибку в журнал.',
  date: '2026-08-08',
  /** the two halves, and what each one costs */
  parts: [
    {
      half: 'zero rows',
      mechanism:
        'RLS+FORCE on every declared table + deny-by-default (SCHEME §D) + wall-at-birth (§E). Without '
        + 'a principal every policy predicate is false, so the answer is 0 rows. Already the mechanism today.',
    },
    {
      half: 'and writes an error to the journal',
      mechanism:
        'THIS is the half that is not true today and that changes behaviour. A missing principal today '
        + 'produces a SILENT zero: app.current_org_id() returns NULL, the predicate is simply false, '
        + 'nothing is logged, and the application swallows it (FACTS §1.1 61k/day denials found only by '
        + 'reading pg_stat; §11.7 pgEmailSetupFlowPort turns 42501 into reason:\'user_not_found\'). Under '
        + 'the invariant the context accessors MUST RAISE (SQLSTATE 42501 with a named condition) when '
        + 'context is missing, so the engine writes the row and the caller cannot mistake "no access" for '
        + '"no data". This is NOT FACTS §9.2 "always throw" (refuted): the refuted proposal was to replace '
        + 'RLS denial with application-level throwing everywhere. Here the ENGINE still denies; only the '
        + 'three context accessors stop returning NULL for "no context".',
    },
  ],
  /** the accessors whose contract changes; declared here, applied by the function BODY in migration (SCHEME §B) */
  contextAccessorsMustRaise: [
    'app.current_org_id()',
    'app.current_patient_user_id()',
    'app.current_integrator_user_id()',
  ],
  /** why this cannot be a generator statement */
  appliedBy:
    'the function BODY in its migration (one authority, dbt #6238) — the generator never writes function '
    + 'bodies or proconfig; §F only compares.',
  /** acceptance test, phrased so it can be run */
  acceptanceTest:
    'For each declared table: open a session as the port login, do NOT install a principal, run SELECT. '
    + 'Expected: 0 rows AND a logged denial. A silent 0 rows with an empty log = FAIL.',
} as const;

/* ============================================================================================
 * SECTION 0c — CODE THAT MUST CHANGE (the model forbids what these do today)
 *   Discipline: a grant is never declared because "code touches it today". Where today's code needs
 *   something the model refuses, the MODEL is declared and the code lands here.
 * ========================================================================================== */

export interface CodeChange {
  id: string;
  what: string;
  where: string[];
  becauseOf: string; // owner decision id / defect id
}

export const CODE_MUST_CHANGE: CodeChange[] = [
  {
    id: 'C1',
    what: 'Cross-tenant platform read of clinical failure archive must go: policy '
      + '`operator_health_failure_archive` platform branch is `USING true` and exposes doctor_user_id of '
      + 'every clinic.',
    where: ['deploy/postgres (policy on public.operator_health_failure_archive)', 'evidence/14 part 3 В2'],
    becauseOf: 'D1-platform-scope',
  },
  {
    id: 'C2',
    what: 'Policy `product_analytics_registration_platform_operations_select` gives app_platform_settings '
      + 'cross-tenant registration events with user_id — outside commerce/scaffolding scope.',
    where: ['deploy/postgres (policy on public.product_analytics_events_recent)', 'evidence/14 part 3 В2'],
    becauseOf: 'D1-platform-scope',
  },
  {
    id: 'C3',
    what: 'Integrator pre-routing resolves the organization with a raw 4-table join '
      + '(integrator.identities + public.platform_users + public.org_enrollments + '
      + 'public.be_organization_members), which is why the integrator login is a member of four terminal '
      + 'roles at once. It must call one definer accessor instead.',
    where: [
      'apps/integrator/src/infra/db/repos/channelUsers.ts:65-95 (resolveActiveOrganizationIdForMessengerIdentity)',
      'apps/integrator/src/app/routes.ts:44-95 (pre-routing resolvers)',
    ],
    becauseOf: 'D5-narrow-resolver',
  },
  {
    id: 'C4',
    what: 'Drop the integrator login\'s membership in app_identity_bootstrap / app_patient / app_staff / '
      + 'app_worker (evidence/13 §1.3). Side effect that must be verified: `app.is_staff()` is TRUE for '
      + 'that login before any SET ROLE today (FINDINGS И3) — several RLS branches silently rely on it.',
    where: ['deploy/postgres/integrator-login-public-identity-grants.sql', 'roles-install (env mapping)'],
    becauseOf: 'D5-narrow-resolver',
  },
  {
    id: 'C5',
    what: 'Integrator opens FOUR pools from four connection strings (request + DATABASE_URL_DIAGNOSTIC + '
      + 'DATABASE_URL_DELIVERY_WORKER + DATABASE_URL_SCHEDULER). One port = one pool; the operational role '
      + 'is selected by SET ROLE on the port\'s own connection (the same file already has '
      + 'setDbOperationalRuntimeRole for exactly that).',
    where: [
      'apps/integrator/src/infra/db/integratorPoolProvider.ts:84-155',
      'apps/integrator/src/infra/db/withClient.ts:66-74',
    ],
    becauseOf: 'D4-two-ports',
  },
  {
    id: 'C6',
    what: 'Integrator opens a FIFTH, principal-less pool for isolation telemetry.',
    where: ['apps/integrator/src/infra/db/integratorPoolProvider.ts:159-166'],
    becauseOf: 'D4-two-ports',
  },
  {
    id: 'C7',
    what: 'media-worker is a separate process family with its own DB URL (third port).',
    where: ['docs/_TODO/SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md:12-26 (process families)'],
    becauseOf: 'D4-two-ports',
  },
  {
    id: 'C8',
    what: 'SAAS_ISOLATION_OPERATOR_DATABASE_URL / DATABASE_URL_CONFIG_READER are separate logins opened '
      + 'outside the two ports; they must be reached through the webapp port.',
    where: [
      'apps/webapp/src/infra/db/client.ts:18-20,87-90',
      'apps/webapp/src/infra/db/saasIsolationTelemetry.ts:5',
    ],
    becauseOf: 'D4-two-ports',
  },
  {
    id: 'C9',
    what: 'Context accessors return NULL on missing context; must RAISE (see ACCEPTANCE_INVARIANT). '
      + 'Every caller that treats NULL as "no rows" has to be re-read after the change.',
    where: [
      'deploy/postgres/p2-b-protected-principal-context.sql (bodies of app.current_org_id / '
      + 'app.current_patient_user_id / app.current_integrator_user_id)',
    ],
    becauseOf: 'D6-acceptance-invariant',
  },
  {
    id: 'C10',
    what: 'Denials are swallowed at the application layer, which is why 61k/day 42501 went unnoticed: '
      + 'pgEmailSetupFlowPort turns 42501 into reason:\'user_not_found\'; the metric writer catches and '
      + 'returns false; integrator pre-routing catches and returns null ("fail-open per read").',
    where: [
      'apps/webapp/src/infra/repos/pgEmailSetupFlowPort.ts (FACTS §11.7)',
      'apps/webapp/src/infra/repos/playbackUserVideoFirstResolve.ts:29-35 (FINDINGS И7)',
      'apps/integrator/src/app/routes.ts:53-56,71-74 (catch → return undefined/null)',
    ],
    becauseOf: 'D6-acceptance-invariant',
  },
  {
    id: 'C11',
    what: 'The role a query runs under is GUESSED in Node instead of being declared '
      + '(withClient.ts role inference by `source` string).',
    where: ['apps/integrator/src/infra/db/withClient.ts:14-64', 'FACTS §1.1'],
    becauseOf: 'D6-acceptance-invariant',
  },
  {
    id: 'C12',
    what: 'The locked infra-cron seam runs retention/pruning as `SET ROLE app_staff` — a tenant ORG role '
      + 'holding DELETE on cross-tenant journals. Must become app_operational_maintenance.',
    where: [
      'packages/db-principal/src/index.ts:1032-1037',
      'packages/db-principal/src/webappLockedInfraCronSources.ts',
      'evidence/16 §«Роль прунера»',
    ],
    becauseOf: 'D8-pruner',
  },
  {
    id: 'C13',
    what: 'Raw SQL on auth tables bypasses the definer seam (the seam exists and is complete): the '
      + 'declaration revokes every runtime grant on the 13 Д1 tables, so these two call sites break unless '
      + 'moved onto the accessors.',
    where: [
      'apps/webapp/src/infra/repos/pgEmailSetupFlowPort.ts:63',
      'apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:88',
    ],
    becauseOf: 'FINDINGS Д1',
  },
  {
    id: 'C14',
    what: 'Patient-facing reads of staff-only material must go: patient SELECT is revoked on '
      + 'be_appointment_staff_comments and be_patient_booking_profiles, and the patient branch of '
      + 'test_attempts/test_results must resolve through the program item.',
    where: [
      'apps/webapp/src/infra/repos/pgClientHistory.ts (staff comments / booking profile reads)',
      'deploy/postgres (saas_org_dormant_* patient branches on the three tables)',
    ],
    becauseOf: 'D2-patient-visibility',
  },
  {
    id: 'C15',
    what: 'Tenant WRITE into a global template is forbidden: app_staff currently holds INSERT on '
      + 'clinical_test_measure_kinds (a pool the code itself calls global) and full CRUD on booking_cities.',
    where: [
      'apps/webapp/src/modules/tests/measureKindCode.ts:1',
      'apps/webapp/src/app/api/api.md:100 (doctor POST/PATCH on measure kinds)',
      'FINDINGS Д21',
    ],
    becauseOf: 'D3-reference-org-copy',
  },
  {
    id: 'C16',
    what: 'Role escalation must be closed: app_staff is a member of app_platform_settings and '
      + 'app_clinic_billing, so one SET ROLE reaches the GLOBAL role from tenant runtime (14 tables). '
      + 'Until it is closed, EVERY org policy on those tables is advisory.',
    where: ['deploy/postgres (role memberships)', 'FINDINGS Д4'],
    becauseOf: 'D1-platform-scope',
  },
  {
    id: 'C17',
    what: 'app.is_staff() tests MEMBER instead of USAGE, so any login that is a member of app_staff is '
      + '"staff" for RLS before any SET ROLE (five roles today).',
    where: ['deploy/postgres (app.is_staff body)', 'FINDINGS И3, К6'],
    becauseOf: 'D6-acceptance-invariant',
  },
  {
    id: 'C18',
    what: 'Two different org accessors are used inside one database: '
      + '`(NULLIF(current_setting(\'app.org\', true),\'\'))::uuid` in the c4_web_push_reminder_* policies '
      + 'vs `app.current_org_id()` everywhere else. Once the accessor RAISEs on missing context, the raw '
      + 'current_setting form silently keeps the old behaviour.',
    where: [
      'deploy/postgres (c4_web_push_reminder_catalog on content_pages/content_sections; same form on '
      + 'notification_delivery_attempts, product_push_notifications)',
      'FINDINGS И5',
    ],
    becauseOf: 'D6-acceptance-invariant',
  },
];

/* ============================================================================================
 * SECTION 0d — the model in three tables: classes, wall templates, ports
 * ========================================================================================== */

/** FINDINGS_TABLES: the class every one of the 239 tables was classified into. */
export type DataClass =
  | 'P' // данные пациента
  | 'C' // операционные данные клиники/врача
  | 'S' // системные таблицы платформы
  | 'R' // справочник (глобальный шаблон и/или его копия на организацию)
  | 'T'; // техническое

/** Decision D7: the class determines the wall template, not the presence of organization_id. */
export type Wall =
  | 'clinic+patient' // RLS FORCE; staff branch by org; patient branch by own row
  | 'parent+patient' // no organization_id BY DESIGN; org derived via EXISTS on the parent + patient branch
  | 'clinic' // RLS FORCE; staff branch by org; no patient grant at all
  | 'parent' // no organization_id by design; org derived via EXISTS on the parent
  | 'platform-role' // RLS FORCE; only the declared platform/service role; NO tenant grant
  | 'platform-role+clinic' // global rows (organization_id IS NULL) — platform role only; org rows — clinic wall
  | 'reference-template' // platform-owned global template: tenant READ only, tenant WRITE forbidden (D3)
  | 'reference-org-copy' // the organization's own copy of the template: organization_id + clinic wall (D3)
  | 'definer-only' // zero grants to any app role; access exclusively through enumerated definer accessors
  | 'closed' // technical: closed to every app role (owner/migrator only)
  | 'pending-removal'; // table is slated for removal — no wall work, no grants (evidence/15, evidence/18)

export const WALL_TEMPLATES: Record<Wall, { rls: 'force' | 'n/a'; requires: string }> = {
  'clinic+patient': {
    rls: 'force',
    requires:
      'staff branch `organization_id = app.current_org_id() AND app.is_staff()`; patient branch on the '
      + 'own-row key (platform_user_id / patient_user_id, or EXISTS on the parent that carries it). Both '
      + 'branches in USING and in WITH CHECK.',
  },
  'parent+patient': {
    rls: 'force',
    requires:
      'organization_id is absent BY DESIGN; the org branch is EXISTS over the parent table\'s org, the '
      + 'patient branch is EXISTS over the parent\'s patient key. Declared, not inferred.',
  },
  clinic: {
    rls: 'force',
    requires: 'staff branch by org; app_patient holds no grant and no policy branch.',
  },
  parent: {
    rls: 'force',
    requires: 'org branch via EXISTS over the parent; no patient access.',
  },
  'platform-role': {
    rls: 'force',
    requires:
      'policy restricted to the declared platform/service role; app_staff and app_patient hold NO grant. '
      + '"Стена своей роли" from the owner\'s norm.',
  },
  'platform-role+clinic': {
    rls: 'force',
    requires:
      'two branches: rows with organization_id IS NULL are reachable only by the declared platform/service '
      + 'role; rows with an organization are under the clinic wall. The NULL branch MUST test the role — an '
      + 'unconditional `organization_id IS NULL` disjunct is defect Д3/Д7.',
  },
  'reference-template': {
    rls: 'force',
    requires:
      'D3: platform-owned template rows. Tenant roles get SELECT only (or nothing); tenant INSERT/UPDATE/'
      + 'DELETE is forbidden. Writing is the platform role or the seed seam.',
  },
  'reference-org-copy': {
    rls: 'force',
    requires:
      'D3: the copy made for the organization at its creation. Carries organization_id, clinic wall, and '
      + 'the clinic owns it (edit/rename/delete its own rows). The seeding seam is an enumerated definer '
      + 'exception, not a tenant grant.',
  },
  'definer-only': {
    rls: 'force',
    requires:
      'zero grants to any runtime role; the only path is the enumerated SECURITY DEFINER accessors. RLS+FORCE '
      + 'stays ON as a backstop (FINDINGS И1 recommendation + repo canon "FORCE RLS не снимать"): a wall made '
      + 'of grants alone holds exactly until the day someone grants — and Д1 is thirteen tables where that day came.',
  },
  closed: {
    rls: 'force',
    requires: 'no runtime grants at all; owner/migrator only. RLS+FORCE as the same backstop.',
  },
  'pending-removal': {
    rls: 'n/a',
    requires:
      'NO wall work and NO grants: the table is going away (evidence/15 / evidence/18). Declared so the '
      + 'two-way diff §F has a named exception instead of silence, and so nobody spends wall work on it.',
  },
};

/** class → default wall (a table may override with a reason). */
export const CLASS_DEFAULT_WALL: Record<DataClass, Wall> = {
  P: 'clinic+patient',
  C: 'clinic',
  S: 'platform-role',
  R: 'reference-template',
  T: 'closed',
};

/** Decision D4 — exactly two ports. */
export type Port = 'webapp' | 'integrator';

export const PORTS: Record<Port, {
  process: string;
  what: string;
  logins: string[];
  reachedThrough: string;
}> = {
  webapp: {
    process: 'apps/webapp (Next.js server)',
    what:
      'Everything a human does in the cabinet, plus every internal job: cron ticks land on '
      + '/api/internal/**/tick inside THIS process and use THIS pool. Workers and the pruner have no '
      + 'connection of their own (D4, D8).',
    logins: ['<env>_staff_login', '<env>_nonstaff_login', '<env>_maintenance_login'],
    reachedThrough:
      'host cron → POST /api/internal/<job>/tick (Bearer INTERNAL_JOB_SECRET) → the webapp pool with the '
      + 'declared service role.',
  },
  integrator: {
    process: 'apps/integrator (delivery module)',
    what:
      'Inbound webhooks, outbound delivery, scheduler ticks and projection. Per the owner\'s framing '
      + '(evidence/15) the integrator is a DELIVERY module, not a store of user data.',
    logins: ['<env>_integrator_login', '<env>_resolver_login'],
    reachedThrough:
      'one pool; the operational role (delivery / scheduler / diagnostic) is selected by SET ROLE on that '
      + 'pool\'s connection, not by opening another pool (C5).',
  },
};

/* ============================================================================================
 * SECTION 0e — decision D1: what the platform (global-admin) role may touch, and what it may not
 * ========================================================================================== */

export const PLATFORM_ROLE_SCOPE = {
  role: 'app_platform_settings',
  owner: 'Глобал админ не лезет в медицину, пока так. (08.08)',
  provisional: true,
  mayTouch: [
    'public.be_organizations', // клиника как арендатор — каркас
    'public.be_branches',
    'public.be_clinic_services',
    'public.saas_billing_accounts',
    'public.saas_billing_invoices',
    'public.saas_billing_subscriptions',
    'public.saas_billing_provider_events',
    'public.saas_billing_refunds',
    'public.saas_org_entitlement_overrides',
    'public.saas_organization_trials',
    'public.saas_tariffs',
    'public.saas_billing_periods',
    'public.saas_trial_policy',
    'public.saas_registration_tariff_policy',
    'public.saas_paid_period_policy',
    'public.admin_audit_log', // журнал административных действий — платформенный
    'public.app_runtime_settings', // только строки organization_id IS NULL (u9a_platform_runtime_global_only)
    'public.app_runtime_settings_audit',
    'public.system_settings', // только глобальные строки, и только через стену роли (Д3)
    'public.system_settings_audit',
  ],
  mustNotTouch:
    'Everything medical or clinical: treatment_program_* (9), support_* (5), tests / test_sets / '
    + 'test_set_items / test_attempts / test_results, symptom_*, clinical_*, specialist_tasks, reminder_*, '
    + 'patient_*, be_appointment*, be_patient*, be_payment*, media_*, integrator.*. No grant, no policy, no '
    + 'definer accessor. Two live violations of this rule are CODE_MUST_CHANGE C1/C2.',
  consequenceRecorded:
    'With this decision the platform cannot diagnose or restore a clinic\'s treatment program except under '
    + 'the database owner role (FINDINGS О1). The owner accepted that consequence "пока".',
} as const;

/* ============================================================================================
 * SECTION 0f — decision D2: what the patient sees
 * ========================================================================================== */

export const PATIENT_VISIBILITY = {
  role: 'app_patient',
  scope: 'OWN',
  owner: 'Пациент видит ТОЛЬКО тесты, добавленные в его программу … он НЕ ВИДИТ внутренние '
    + 'комментарии и пометку проблемный и тд. (08.08)',
  sees: [
    'свои записи, визиты, платежи, абонементы (be_appointment*, be_payment*, be_patient_packages …) — '
    + 'own-row branch',
    'свою программу лечения и её задания (treatment_program_instance*) — own-row branch через instance',
    'тесты, ДОБАВЛЕННЫЕ В ЕГО ПРОГРАММУ: test_attempts/test_results ТОЛЬКО через '
    + 'test_attempts.instance_stage_item_id → treatment_program_instance_stage_items → instance.patient_user_id',
    'свою переписку с поддержкой (support_*), свои напоминания, свой дневник симптомов',
  ],
  doesNotSee: [
    'public.be_appointment_staff_comments — внутренние комментарии персонала о нём (revoke SELECT)',
    'public.be_patient_booking_profiles — is_problematic / problematic_note / booking_blocked / '
    + 'no_show_count (revoke SELECT)',
    'клинические тесты, снятые на приёме: public.clinical_test_regions, public.clinical_test_measure_kinds '
    + '(гранта нет и не будет — закрыто по умолчанию, это конечное состояние, а не пробел)',
    'каталог тестов клиники: public.tests / test_sets / test_set_items (пациент видит только снимок '
    + 'задания внутри своей программы)',
    'служебные и платформенные таблицы любого рода',
  ],
} as const;

/* ============================================================================================
 * SECTION 0g — decision D3: reference books
 * ========================================================================================== */

export const REFERENCE_MODEL = {
  owner: 'Справочники: глобальный шаблон → копия на организацию при её создании. (08.08)',
  shape:
    'At organization creation the platform seed is COPIED into org-owned rows. The clinic owns its copy: '
    + 'edits, renames, deletes what it does not need. Tenants get NO write on the global template.',
  alreadyImplemented:
    'public.reference_categories + public.reference_items + public.reference_catalog_snapshot_receipts — '
    + 'staff-org wall + patient read through an active org enrollment + a seed seam '
    + '(`reference_catalog_seed_owner` for app_owner, live only while no receipt exists for that org). '
    + 'evidence/14 part 3 calls it the reference form; the receipt is what makes it per-organization '
    + '(and is why GAP G7 resolves to org: true).',
  consequence:
    'Most reference tables are therefore ORG-scoped, not global: their class stays R but their wall is '
    + '`reference-org-copy`. Only the platform-owned template store keeps `reference-template`.',
} as const;

/* ============================================================================================
 * SECTION 1 — TYPES (SCHEME §A grammar; closed enumerations so the compiler catches typos)
 * ========================================================================================== */

/** SCHEME §A.2 — one scope per role. */
export type Scope = 'ORG' | 'OWN' | 'GLOBAL' | 'NONE';

/** SCHEME §A.1 — closed role grammar. `service` = infra cluster roles (app_migration_phase §E, pruner §D8). */
export type RoleKind = 'terminal' | 'capability' | 'owner' | 'service' | 'operator' | 'superuser';

/** SCHEME §A.4 — RLS mode grammar. 'force'=RLS+FORCE, 'on'=RLS w/o FORCE (needs a justification),
 *  'off'=explicitly declared absence (not silence), 'n/a'=table is PENDING_REMOVAL. */
export type RlsMode = 'force' | 'on' | 'off' | 'n/a';

export type Privilege =
  | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  | 'REFERENCES' | 'TRIGGER' | 'TRUNCATE';

/** A column-scoped grant (SCHEME §A.4 — table-only checks lie without this, FACTS §1.4). */
export interface ColumnGrant {
  kind: 'columns';
  priv: Privilege;
  columns: string[];
}

export type GrantSet = Array<Privilege | ColumnGrant>;

/** DISCIPLINE: a grant without a justification is not declarable — `why` is structurally required. */
export interface GrantDecl {
  privs: GrantSet;
  /** who uses it / why, traceable to the classification or to code (file:line). */
  why: string;
  /** SCHEME §A.4: default false, and the default IS part of the expected side (c5a:1300). */
  grantable?: false;
}

/** Membership on the GRANTED side, options per pg_auth_members. */
export interface Membership {
  role: string;
  admin: boolean;
  inherit: boolean;
  set: boolean;
}

export interface RoleDecl {
  kind: RoleKind;
  scope: Scope;
  login: boolean;
  superuser: boolean;
  bypassrls: boolean;
  inherit: boolean;
  createrole: boolean;
  rolconfig: string[] | null;
  grantedTo?: Membership[];
  members?: string[];
  /** true = role does not exist in the live catalog yet; roles-install (§B step 1) creates it. */
  isNew?: boolean;
  why?: string;
}

/** SCHEME §A.1 — a per-env login record (env-dependent truth; lives in env/<env>.json). */
export interface LoginRecord {
  /** D4: which of the two ports this login belongs to; null = does not belong to a port (must fold). */
  port: Port | null;
  /** set when this login is a third port today and must be folded into `port` (CODE_MUST_CHANGE). */
  mustFold?: string;
  canonicalRole: string | null;
  membership?: Membership;
  login: true;
  superuser: false;
  bypassrls: false;
  createrole: false;
  /** DECLARED TARGET: NOINHERIT everywhere (SCHEME §A.1). See `inheritDrift` where live differs. */
  inherit: false;
  inheritDrift?: string;
  passwordEnv: string;
  rolconfig: string[] | null;
  connect: string[];
  validUntil?: string | null;
  connectionLimit?: number | null;
  why?: string;
}

export interface SchemaDecl {
  owner: string;
  usage: string[];
  create: string[];
  publicDefect?: boolean;
  present: boolean;
  ownerDrift?: string;
  why?: string;
}

export interface PolicyDecl {
  name: string;
  as: 'PERMISSIVE' | 'RESTRICTIVE';
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  to: string[];
  using?: string;
  withCheck?: string;
  note?: string;
}

export type Disposition = 'ACTIVE' | 'PENDING_REMOVAL' | 'REMOVED';

export interface TableDecl {
  /** FINDINGS_TABLES class (evidence/14). */
  cls: DataClass;
  /** required wall template (D7). */
  wall: Wall;
  disposition: Disposition;
  /** one line: who uses it / why this class and this wall. DISCIPLINE: required on every table. */
  why: string;
  rls: RlsMode;
  rlsWhy?: string;
  owner: string;
  /** carries organization_id (feeds orgTableAllowlist §A.9). Omitted where the census did not measure it. */
  org?: boolean;
  /** only justified grants. Empty object = deny-by-default is the declared target. */
  grants: Record<string, GrantDecl>;
  /** full relacl not enumerated by the read-only census (GAP G2) — class+wall are declared, ACL is not guessed. */
  grantMatrix?: 'G2-pending';
  /** live grants the model REMOVES, with the reason. */
  revoke?: Record<string, string>;
  /** required policy semantics (the bodies are G8). */
  policyRequirement?: string;
  policies?: Array<PolicyDecl | { todo: string }>;
  /** FINDINGS defect ids this table carries. */
  defect?: string[];
  /** open owner gates that touch this table. */
  ownerGate?: string[];
  /** CODE_MUST_CHANGE ids triggered by this table's declaration. */
  codeMustChange?: string[];
  /** for PENDING_REMOVAL: the disposition source and what blocks the drop. */
  removal?: { verdict: string; source: string; blockedBy?: string };
  drift?: string;
}

export interface SequenceRuleDecl {
  rule: string;
  examples: Record<string, Record<string, Array<'USAGE' | 'SELECT' | 'UPDATE'>>>;
}

export interface DefinerException {
  owner: string;
  /** expected pg_proc.proconfig, BYTE-EXACT. Applied by the function BODY in migration, not the generator. */
  searchPath: string[];
  execute?: string[];
  why: string;
  /** true = the function does not exist yet; its migration is part of this work. */
  isNew?: boolean;
}

export interface DefinerExceptionsSection {
  defaults: {
    schema: 'app';
    securityDefiner: true;
    owner: 'app_owner';
    searchPath: string[];
    publicExecute: false;
    coveredCount: number;
    rule: string;
  };
  proconfigExceptions: Record<string, DefinerException>;
  ownershipExceptions: {
    intentional: Record<string, { count: number; why: string; functions: string[] | { todo: string } }>;
    drift: Record<string, { count: number; targetOwner: string; why: string; known: string[]; todo: string }>;
  };
}

export interface DbSettingsSection {
  datdba: string;
  databaseLevel?: Record<string, string[]>;
  perRoleInDatabase: Record<string, string[]>;
}

export interface DatabaseDecl {
  database: {
    owner: string;
    connect: string[];
    publicConnectTempDefect: boolean;
    note?: string;
  };
  schemas: Record<string, SchemaDecl>;
  tables: Record<string, TableDecl>;
  sequences: SequenceRuleDecl;
  functionsViews: {
    default: string;
    views: Record<string, { securityInvoker: true; execute?: string[] }> | { todo: string };
  };
  types: Record<string, { usage: string[] }>;
  definerExceptions: DefinerExceptionsSection;
  creators: string[];
  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true';
    named: string[];
    fullCountLive: number;
    todo: string;
  };
  dbSettings: DbSettingsSection;
}

export interface PrivilegeDeclaration {
  ownerDecisions: OwnerDecision[];
  acceptanceInvariant: typeof ACCEPTANCE_INVARIANT;
  platformRoleScope: typeof PLATFORM_ROLE_SCOPE;
  patientVisibility: typeof PATIENT_VISIBILITY;
  referenceModel: typeof REFERENCE_MODEL;
  ports: typeof PORTS;
  wallTemplates: typeof WALL_TEMPLATES;
  codeMustChange: CodeChange[];
  ownerGatesOpen: typeof OWNER_GATES_OPEN;
  cluster: {
    envs: string[];
    roles: Record<string, RoleDecl>;
  };
  envMapping: Record<string, Record<string, LoginRecord>>;
  databases: Record<string, DatabaseDecl>;
}

/* ============================================================================================
 * SECTION 2 — CLUSTER ROLES (SCHEME §A.1/§A.2)
 *   Attributes from evidence/13 §1.2. BYPASSRLS declared for EXACTLY 3 (postgres, app_owner,
 *   saas_system_health_owner), each justified. Two roles are NEW (`isNew`) and come from the owner's
 *   decisions: `app_integrator_resolver` (D5) and `app_operational_maintenance` (D8).
 * ========================================================================================== */

const roles: Record<string, RoleDecl> = {
  // ── terminal runtime roles ──
  app_staff: {
    kind: 'terminal', scope: 'ORG', // evidence/13 §4: own organization
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    members: [], // ⚠ TARGET: app_staff must NOT be a member of app_platform_settings/app_clinic_billing
    why: 'терминал персонала клиники. ⚠ Сегодня app_staff — ЧЛЕН app_platform_settings и '
      + 'app_clinic_billing, т.е. один SET ROLE выводит арендную сессию в GLOBAL-роль на 14 таблицах '
      + '(FINDINGS Д4). Декларация этого членства НЕ несёт — CODE_MUST_CHANGE C16.',
  },
  app_patient: {
    kind: 'terminal', scope: 'OWN', // FACTS §1.5: own-data wall; a wrong ORG rule gives 65 false silent zeros
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    why: 'терминал пациента: только свои данные (PATIENT_VISIBILITY).',
  },
  app_platform_settings: {
    kind: 'terminal', scope: 'GLOBAL',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
    why: 'платформенная (глобал-админ) роль. Поверхность ограничена PLATFORM_ROLE_SCOPE (решение D1): '
      + 'коммерция + каркас клиник + аудит, НИКАКОЙ медицины. §I Р4 сузил её ещё и на be_organization_members.',
  },
  app_worker: {
    kind: 'terminal', scope: 'ORG',
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
    why: 'инфра-роль воркеров вебаппа; фильтр — на ENQUEUE, не в RLS (канон владельца; FINDINGS И11 требует '
      + 'объявить обход на media_transcode_jobs ИМЕНОВАННЫМ исключением, что и сделано в этой таблице).',
  },

  // ── operational roles: table-level everything denied; access ONLY via definer (FACTS §6) ──
  app_operational_delivery_worker: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'доставка исходящих; ходит на порт integrator через SET ROLE (D4), своего пула не открывает (C5).',
  },
  app_operational_diagnostic: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'health/projection-пробы интегратора; тот же порт, SET ROLE (C5).',
  },
  app_operational_media_worker: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'медиа-конвейер. ⚠ Сегодня media-worker — отдельный процесс со своим подключением = третий порт '
      + '(C7); в целевой модели это роль внутри порта webapp.',
  },
  app_operational_scheduler: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'тики планировщика интегратора; тот же порт, SET ROLE (C5).',
  },
  app_operational_web_push_reminder: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'web-push напоминания; discovery — через app_web_push_reminder_discovery_definer. '
      + 'evidence/13 §1.1: держит прямой CONNECT на bersoncarebot_test (материал env-маппинга).',
  },
  app_operational_maintenance: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    isNew: true, // does not exist in the live catalog (evidence/13 §1.2 has 45 roles, not this one)
    why: 'РЕШЕНИЕ D8: прунер/ретеншен журналов. Ходит через ВНУТРЕННИЙ эндпоинт порта webapp, никогда '
      + 'арендной ролью. Сегодня тот же шов ставит SET ROLE app_staff — терминальная ORG-роль с DELETE на '
      + 'кросс-арендных журналах (evidence/16; C12). DELETE выдаётся ровно на перечисленные журналы, а '
      + 'app.context_nonce_ledger чистится через definer app.prune_context_nonce_ledger (таблица закрыта от всех).',
  },

  // ── capability roles ──
  app_clinic_billing: {
    kind: 'capability', scope: 'ORG',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }], // evidence/13 §1.3
    why: 'биллинг в рамках своей организации. ⚠ Членство app_staff→сюда — часть Д4 (эскалация); '
      + 'оставлено объявленным, но переход ОБЯЗАН быть закрыт вместе с app_platform_settings (C16).',
  },
  app_identity_bootstrap: {
    kind: 'capability',
    scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'предсессионный резолв идентичности при регистрации. Гранты — только на public.platform_users и '
      + 'public.user_identity (d15b4-…-identity-bootstrap-role.sql:31-42), org-таблиц ноль → scope NONE. '
      + '⚠ FINDINGS Д5: сегодня её политики проверяют «кто ты» (pg_has_role … MEMBER) и НИЧЕГО про строку, '
      + 'а членами являются четыре ЛОГИН-роли — под ними читаются все 278 platform_users, 444 контакта и 237 ФИО. '
      + 'Целевая форма (FINDINGS И15, рекомендация «в»): весь bootstrap-путь уезжает в definer-аксессор, как уже '
      + 'сделано для всех остальных таблиц аутентификации (0258_bootstrap_auth_table_accessors.sql); политики '
      + 'обязаны фильтровать СТРОКУ, а не роль.',
  },
  app_integrator_resolver: {
    kind: 'capability', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    isNew: true,
    why: 'РЕШЕНИЕ D5: узкая роль предмаршрутного резолва интегратора (chat_id/внешний id → организация). '
      + 'Умеет РОВНО этот один поиск и только через definer app.resolve_organization_for_channel_identity. '
      + 'Заменяет живое состояние, где логин интегратора состоит СРАЗУ в четырёх терминалах '
      + '(app_identity_bootstrap + app_patient + app_staff + app_worker, evidence/13 §1.3) — то самое членство, '
      + 'из-за которого app.is_staff() истинно для соединения интегратора до всякого SET ROLE (FINDINGS И3/К6). '
      + 'Четырёхстороннее членство в декларации НЕ объявлено (C3/C4).',
  },

  // ── owner roles (NOLOGIN definer owners; §C) ──
  app_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // 1 of exactly-3; deploy HARD-asserts rolbypassrls (deploy-test-saas.sh:907, deploy-test.sh:174)
    inherit: true, createrole: false, rolconfig: null,
    members: [], // zero members outside the migration window (SCHEME §C)
    why: 'владелец definer-шва. Оставить-и-объявить — SCHEME §I Р5.',
  },
  saas_system_health_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // 2 of exactly-3; live chain sets it (saas-system-health-diagnostics.sql:166-173)
    inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'NOLOGIN-владелец health-агрегации. Оставить-и-объявить — SCHEME §I Р9.',
  },
  saas_telemetry_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'владеет saas_isolation_* и 7 definer-функциями телеметрии (evidence/13 §3.2; §C). Эталон формы: '
      + 'ACL только у владельца, доступ — через app.report_saas_isolation_event / app.read_saas_isolation_events.',
  },
  app_web_push_reminder_discovery_definer: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    why: 'владелец discovery-шва app.list_web_push_reminder_organization_ids; не рантайм-читатель таблиц.',
  },

  // ── operator role (NOLOGIN canonical; operator LOGINS live in envMapping) ──
  saas_telemetry_operator: {
    kind: 'operator', scope: 'GLOBAL',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'читает телеметрию изоляции кросс-орг (saas-isolation-telemetry.sql). Это диагностика ПЛАТФОРМЫ '
      + 'о самой себе (события нарушения изоляции), не медицинские данные — решение D1 не нарушается. '
      + '⚠ Ходить обязана через порт webapp (C8), своего подключения не открывает.',
  },

  // ── service role: migration-phase marker (SCHEME §A.1/§E) ──
  app_migration_phase: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
    isNew: true,
    why: 'NOLOGIN-маркер фазы миграций, читается event trigger (SCHEME §E). Ноль членов в стационаре.',
  },

  // ── cluster superuser (decision D9) ──
  postgres: {
    kind: 'superuser', scope: 'GLOBAL',
    login: true, superuser: true, bypassrls: true, inherit: true, createrole: true,
    rolconfig: null,
    why: 'РЕШЕНИЕ D9: полный доступ DBA сохраняется и ОБЪЯВЛЯЕТСЯ (не дефект); на проде защищён сильным '
      + 'паролем. Владеет app_ext и event trigger (§C); 3 of exactly-3 BYPASSRLS.',
  },
};

/* ============================================================================================
 * SECTION 3 — ENV-MAPPING (SCHEME §A.1) + PORT BINDING (decision D4)
 *   inherit is declared FALSE everywhere (SCHEME §A.1 pin). Where live carries rolinherit=t the
 *   divergence is named in `inheritDrift` and `roles-install` brings it to NOINHERIT — see the
 *   resolved-G4 note in the header for why the drift is not blessed as the norm.
 * ========================================================================================== */

const SEARCH_PATH_PUBLIC_INTEGRATOR = 'search_path=public, integrator'; // byte-exact, evidence/13 §3.4

const envMapping: Record<string, Record<string, LoginRecord>> = {
  test: {
    bersoncarebot_test: {
      port: null, // migrator/datdba: a deploy channel, not an application port
      canonicalRole: null, // steady state; gains app_owner + BYPASSRLS only inside the migrate bracket
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t (evidence/13 §1.2) — bring to NOINHERIT',
      passwordEnv: 'PGPASSWORD_BERSONCAREBOT_TEST', // TODO(census-gap G9)
      rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // evidence/13 §3.4 (setdatabase=0)
      connect: ['bersoncarebot_test'],
      why: 'TEST migrator-login = datdba of bersoncarebot_test (evidence/13 §3.5). Не порт приложения.',
    },
    bcb_test_integrator_login: {
      port: 'integrator',
      canonicalRole: 'app_integrator_resolver', // ⬅ D5: narrow role INSTEAD of the live 4-way membership
      membership: { role: 'app_integrator_resolver', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_INTEGRATOR', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'порт integrator. ⚠ ЖИВОЕ состояние — член ЧЕТЫРЁХ ролей сразу (app_identity_bootstrap, '
        + 'app_patient, app_staff, app_worker; evidence/13 §1.3). Декларация несёт ТОЛЬКО узкую роль '
        + 'резолвера (D5); остальные три пути обязаны уехать в definer-аксессоры (C3/C4).',
    },
    bcb_test_nonstaff_login: {
      port: 'webapp',
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_NONSTAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'пациентская сессия порта webapp (DATABASE_URL_NONSTAFF). ⚠ Живьём ещё и член '
        + 'app_identity_bootstrap (evidence/13 §1.3) — по Д5 это путь, которым читаются все 278 '
        + 'platform_users; декларация членства не несёт, bootstrap уезжает в definer (И15).',
    },
    bcb_test_staff_login: {
      port: 'webapp',
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true }, // ⬅ TARGET inherit=false
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t + membership inherit_option=t (evidence/13 §1.2/§1.3): the login '
        + 'carries app_staff privileges before any SET ROLE — the mechanism behind FINDINGS И3',
      passwordEnv: 'PGPASSWORD_BCB_TEST_STAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'сессия персонала порта webapp (DATABASE_URL_STAFF).',
    },
    bcb_test_worker_login: {
      port: 'webapp',
      canonicalRole: 'app_worker',
      membership: { role: 'app_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t (evidence/13 §1.2/§1.3)',
      passwordEnv: 'PGPASSWORD_BCB_TEST_WORKER', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'воркер-сессия порта webapp. D4: воркер НЕ открывает своего подключения — это роль внутри порта.',
    },
    bcb_test_maintenance_login: {
      port: 'webapp',
      canonicalRole: 'app_operational_maintenance',
      membership: { role: 'app_operational_maintenance', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_MAINTENANCE', // TODO(census-gap G9)
      rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR],
      connect: ['bersoncarebot_test'],
      why: 'НОВЫЙ (D8): прунер/ретеншен через внутренний эндпоинт порта webapp. Сегодня этой роли нет и '
        + 'ретеншен бежит под app_staff (C12).',
    },
    bcb_test_operational_delivery_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_DELIVERY_WORKER is a separate pool today; the role must be reached by '
        + 'SET ROLE on the integrator port pool',
      canonicalRole: 'app_operational_delivery_worker',
      membership: { role: 'app_operational_delivery_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DELIVERY',
      rolconfig: null, // evidence/13 §3.4: operational logins carry NO role-level search_path
      connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_diagnostic_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_DIAGNOSTIC',
      canonicalRole: 'app_operational_diagnostic',
      membership: { role: 'app_operational_diagnostic', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DIAGNOSTIC', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_media_login: {
      port: 'webapp',
      mustFold: 'C7 — media-worker is a separate process family with its own DB URL today',
      canonicalRole: 'app_operational_media_worker',
      membership: { role: 'app_operational_media_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_MEDIA', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_scheduler_login: {
      port: 'integrator',
      mustFold: 'C5 — DATABASE_URL_SCHEDULER',
      canonicalRole: 'app_operational_scheduler',
      membership: { role: 'app_operational_scheduler', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_SCHEDULER', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_web_push_reminder_login: {
      port: 'webapp',
      canonicalRole: 'app_operational_web_push_reminder',
      membership: { role: 'app_operational_web_push_reminder', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_WEBPUSH', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_saas_operator_test: {
      port: 'webapp',
      mustFold: 'C8 — SAAS_ISOLATION_OPERATOR_DATABASE_URL is opened outside the two ports today',
      canonicalRole: 'saas_telemetry_operator',
      membership: { role: 'saas_telemetry_operator', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t + inherit_option=t (evidence/13 §1.2/§1.3)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'], // evidence/13 §1.1 datacl
    },
    bcb_saas_diag_test: {
      port: null,
      mustFold: 'C8 — no canonical membership in the census (evidence/13 §1.3) and no declared port: '
        + 'either fold into the webapp port with a declared role, or drop the login',
      canonicalRole: null,
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t (evidence/13 §1.2)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_DIAG_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'],
      why: 'TODO(owner?): логин без объявленной роли и без порта. Кандидат на удаление (та же категория, '
        + 'что stray-остатки evidence/13 §5).',
    },
  },

  dev: {
    bcb_webapp_dev_user: {
      port: null, // migrator/datdba
      canonicalRole: null, // ⬅ TARGET: no app_identity_bootstrap membership (Д5)
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t and live member of app_identity_bootstrap (evidence/13 §1.2/§1.3) — '
        + 'a migrator/datdba login must not carry a runtime capability role (Д5)',
      passwordEnv: 'PGPASSWORD_BCB_WEBAPP_DEV_USER',
      rolconfig: null, // role-level NULL; per-(login,db) search_path in dbSettings (§A.10)
      connect: ['bcb_webapp_dev'],
      why: 'dev migrator-login = datdba of bcb_webapp_dev (evidence/13 §3.5); его search_path — НЕСУЩАЯ '
        + 'строка setdatabase≠0 (SCHEME §A.10), не дефект.',
    },
    bcb_dev_runtime_nonstaff_login: {
      port: 'webapp',
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_NONSTAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
      why: 'пациентская сессия порта webapp на dev. ⚠ Живьём ещё и член app_identity_bootstrap (Д5) — '
        + 'декларация членства не несёт.',
    },
    bcb_dev_runtime_staff_login: {
      port: 'webapp',
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_STAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
    },
    bcb_saas_operator_dev: {
      port: 'webapp',
      mustFold: 'C8 — same as TEST; no canonical membership in the census',
      canonicalRole: null,
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      inheritDrift: 'live rolinherit=t (evidence/13 §1.2)',
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_DEV', rolconfig: null,
      connect: ['bcb_webapp_dev'],
      why: 'TODO(owner?): роль не объявлена в переписи — либо saas_telemetry_operator, либо на удаление.',
    },
  },
};

/* ============================================================================================
 * SECTION 4 — definer defaults + proconfig exceptions (evidence/13 §3.1/§3.2), shared by both dbs
 * ========================================================================================== */

const DEFINER_DEFAULTS: DefinerExceptionsSection['defaults'] = {
  schema: 'app',
  securityDefiner: true,
  owner: 'app_owner',
  searchPath: ['search_path=pg_catalog'], // evidence/13 §3.1: 235 functions
  publicExecute: false,
  coveredCount: 235,
  rule:
    'Every SECURITY DEFINER function in schema `app` NOT listed in proconfigExceptions/ownershipExceptions '
    + 'is expected: owner=app_owner, proconfig=[\'search_path=pg_catalog\'], PUBLIC EXECUTE revoked (§D.5). '
    + 'All 244 definer functions live in schema `app` (public/integrator/app_ext = 0; evidence/13 §3.1).',
};

const PROCONFIG_EXCEPTIONS: Record<string, DefinerException> = {
  'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, app_ext, pg_catalog'], // body calls app_ext.hmac (p2-b:231)
    execute: ['app_owner', 'app_staff', 'app_patient', 'app_clinic_billing'], // evidence/13 §3.3
    why: 'вход принципала: HMAC-подпись проверяется до установки GUC (evidence/13 §3.1; SCHEME §A.7)',
  },
  'app.current_integrator_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'принципал-аксессор. ⚠ РЕШЕНИЕ D6: обязан RAISE при отсутствии контекста, а не возвращать NULL '
      + '(ACCEPTANCE_INVARIANT; применяет тело функции в миграции, C9).',
  },
  'app.current_org_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [ // evidence/13 §3.3 LIVE grantees + the 4 missing ones (defect below)
      'app_owner', 'app_staff', 'app_patient', 'app_worker', 'app_operational_media_worker',
      'app_platform_settings', 'app_clinic_billing', 'app_identity_bootstrap',
      'app_operational_scheduler', 'app_operational_delivery_worker', 'app_operational_diagnostic',
      'app_operational_web_push_reminder',
    ],
    why: 'org-аксессор. ⚠ ДЕФЕКТ (evidence/13 §3.3 / FACTS §1.1): EXECUTE НЕ выдан четырём operational-ролям '
      + '→ корень 61k/сутки 42501. Цель добавляет эти четыре гранта. ⚠ РЕШЕНИЕ D6: обязан RAISE при '
      + 'отсутствии контекста (C9).',
  },
  'app.current_patient_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'принципал-аксессор. ⚠ РЕШЕНИЕ D6: обязан RAISE при отсутствии контекста (C9).',
  },
  'app.release_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [
      'app_owner', 'app_staff', 'app_patient', 'app_clinic_billing',
      'app_operational_delivery_worker', 'app_operational_diagnostic',
      'app_operational_media_worker', 'app_operational_scheduler',
    ],
    why: 'снятие принципала; широкий EXECUTE (evidence/13 §3.3). TODO(census-gap): точные login-грантополучатели',
  },
  'app.reset_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'сброс принципала (evidence/13 §3.1)',
  },
  'app.close_active_user_phone_history(uuid)': {
    owner: 'app_owner', searchPath: ['search_path=app, public, pg_catalog'],
    why: 'обслуживание истории телефонов; тело достаёт public (evidence/13 §3.1)',
  },
  'app.list_web_push_reminder_organization_ids(timestamp with time zone)': {
    owner: 'app_web_push_reminder_discovery_definer',
    searchPath: ['search_path=pg_catalog, public'],
    execute: ['app_operational_web_push_reminder'],
    why: 'discovery-шов web-push; владелец — отдельная definer-роль (evidence/13 §3.1/§3.2)',
  },
  'app.read_outbound_provider_incident_health()': {
    owner: 'app_owner', // ⬅ TARGET: live owner is the migrator-login (drift, evidence/13 §3.2)
    searchPath: ['search_path=pg_catalog, public'],
    why: 'чтение здоровья исходящих инцидентов. ⚠ ДРЕЙФ владения: живьём владелец — мигратор-логин; '
      + 'цель — app_owner (§C). TODO(census-gap G3) для остальных 37.',
  },
  'app.resolve_organization_for_channel_identity(text,text)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, public, integrator, pg_catalog'],
    execute: ['app_integrator_resolver'],
    isNew: true,
    why: 'РЕШЕНИЕ D5: единственный вход узкой роли резолвера. Заменяет сырой join по четырём таблицам '
      + '(integrator.identities + platform_users + org_enrollments + be_organization_members), из-за которого '
      + 'логин интегратора состоит в четырёх терминалах сразу '
      + '(apps/integrator/src/infra/db/repos/channelUsers.ts:65-95; C3).',
  },
  'app.prune_context_nonce_ledger(integer,integer)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, pg_catalog'],
    execute: ['app_operational_maintenance'],
    isNew: true,
    why: 'РЕШЕНИЕ D8: app.context_nonce_ledger закрыта от ВСЕХ ролей (ACL только app_owner; '
      + 'p2-b:356-359 отзывает всё у PUBLIC/staff/patient), поэтому прунер входит только через definer. '
      + 'EXECUTE — только сервисной роли: дать его app_staff означало бы DELETE по шву принципала из любой '
      + 'арендной сессии (evidence/16).',
  },
};

const OWNERSHIP_EXCEPTIONS: DefinerExceptionsSection['ownershipExceptions'] = {
  intentional: {
    saas_telemetry_owner: {
      count: 7, why: 'владеет definer-функциями телеметрии изоляции (§C; evidence/13 §3.2)',
      functions: { todo: 'TODO(census-gap G3): 7 имён не перечислены read-only переписью' },
    },
    saas_system_health_owner: {
      count: 4, why: 'владеет definer-функциями health-агрегации; BYPASSRLS-владелец (§I Р9)',
      functions: { todo: 'TODO(census-gap G3): 4 имени не перечислены' },
    },
    app_web_push_reminder_discovery_definer: {
      count: 1, why: 'владеет своим discovery-швом (§C; evidence/13 §3.2)',
      functions: ['app.list_web_push_reminder_organization_ids(timestamp with time zone)'],
    },
  },
  drift: {
    bersoncarebot_test: {
      count: 38, targetOwner: 'app_owner',
      why: 'мигратор-логин владеет 38 definer-функциями против канона §C (evidence/13 §3.2).',
      known: ['app.read_outbound_provider_incident_health()'],
      todo: 'TODO(census-gap G3): 37 оставшихся имён + какие (если такие есть) намеренно под мигратором',
    },
    app_platform_settings: {
      count: 1, targetOwner: 'app_owner',
      why: 'рантайм-роль не должна ВЛАДЕТЬ definer-функцией (evidence/13 §3.2) — дрейф',
      known: [],
      todo: 'TODO(census-gap G3): имя функции, которой владеет app_platform_settings',
    },
  },
};

/* ============================================================================================
 * SECTION 5 — TABLES. All 239 classified tables (evidence/14 parts 1-4 → FINDINGS_TABLES).
 *   Every entry declares: class (P/C/S/R/T), required wall (D7), disposition, and a one-line
 *   justification. Grants appear ONLY with a justification (`GrantDecl.why`); `grantMatrix:
 *   'G2-pending'` marks tables whose full relacl the read-only census did not enumerate — class and
 *   wall are declared, the exhaustive ACL row set is not guessed (§F byte-red discipline).
 *   `revoke` carries the live grants the model removes, with the reason.
 *
 *   The table set is shared between the two managed dbs (the schema is the same); per-db deltas are
 *   declared explicitly in the dev section below (evidence/13 §2.2 "две managed-базы НЕ идентичны").
 * ========================================================================================== */

const APP_TABLES: Record<string, TableDecl> = {
  'app.context_nonce_ledger': {
    cls: 'T', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'защита от повтора подписи: `nonce` (PK), `backend_pid`, `accepted_at`, `expires_epoch` | ЗАЧЕМ: '
        + 'без неё подписанный контекст можно проиграть повторно | evidence/14 часть 1, класс T.',
    rls: 'force', owner: 'app_owner',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'definer-only: ACL только app_owner, p2-b:356-359 отзывает всё у PUBLIC/app_staff/app_patient. I14: '
        + 'таблица росла неограниченно (12,6 млн просроченных строк удалено 08.08 по двум базам) — решение D8 '
        + 'даёт ей прунер через app.prune_context_nonce_ledger под app_operational_maintenance, ежечасно '
        + '(evidence/16).',
    defect: ['I1-definer-plus-force', 'I14-unbounded-growth'],
  },
  'app.context_signing_secrets': {
    cls: 'T', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'HMAC-секрет подписи контекста: `id`, `secret` | ЗАЧЕМ: утечка = подделка принципала, т.е. обход '
        + 'всех стен разом | evidence/14 часть 1, класс T.',
    rls: 'force', owner: 'app_owner',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'definer-only: утечка = подделка принципала, то есть обход всех стен разом.',
    defect: ['I1-definer-plus-force'],
  },
  'app.principal_context': {
    cls: 'T', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      '«кто сейчас в этой сессии»: `backend_pid`, `org_id`, `patient_user_id`, `integrator_user_id`, '
        + '`nonce`, `expires_epoch` | ЗАЧЕМ: несущая деталь: без неё все RLS-предикаты видят NULL и вся база '
        + 'становится пустой | evidence/14 часть 1, класс T.',
    rls: 'force', owner: 'app_owner',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'definer-only: пишется только app.install_signed_context, читается только context-аксессорами. '
        + 'Несущая деталь — без неё все RLS-предикаты видят NULL и база выглядит пустой; именно поэтому '
        + 'решение D6 требует RAISE вместо NULL.',
    defect: ['I1-definer-plus-force'],
  },
  'drizzle.__drizzle_migrations': {
    cls: 'T', wall: 'closed', disposition: 'ACTIVE',
    why:
      'журнал применённых миграций webapp: `hash`, `created_at` | ЗАЧЕМ: миграции применяются повторно '
        + 'или не применяются | evidence/14 часть 1, класс T.',
    rls: 'off', owner: 'migrator',
    rlsWhy:
      'ЯВНО объявленное отсутствие RLS (SCHEME §A.4: \'off\' — объявленное отсутствие, а не молчание). '
        + 'Журнал мигратора читает и пишет сам мигратор, в том числе ВНЕ окна элевации (шаг 0 цепочки сверяет '
        + 'max(created_at) против watermark), а FORCE RLS без политики закрыл бы таблицу и от её владельца — '
        + 'цепочка деплоя перестала бы работать. Стена здесь — НУЛЕВОЙ грант рантайм-ролям: ACL пуст, кроме '
        + 'владельца.',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'integrator.contacts': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'контакты пользователя мессенджера: `user_id`, `type`, `value_normalized`, `is_primary` | ЗАЧЕМ: '
        + 'нельзя связать чат с телефоном пациента | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    removal: {
      verdict: 'DROP',
      source:
        'evidence/15 §5 — 78/78 телефонов уже в public.platform_users.phone_normalized; легаси-фолбэк не '
          + 'даёт ничего',
    },
  },
  'integrator.content_access_grants': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'временные ссылки-доступы к контенту пациента: `content_id`, `purpose`, `token_hash`, `expires_at`, '
        + '`revoked_at` | ЗАЧЕМ: по ссылке из напоминания не открывается материал | evidence/14 часть 1, '
        + 'класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    removal: {
      verdict: 'DROP',
      source:
        'evidence/15 §2 — волна 0, 0 строк, писатель недостижим, читателя нет',
    },
  },
  'integrator.conversation_messages': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'сообщения диалога: `sender_role`, `text`, `external_chat_id`, `external_message_id` | ЗАЧЕМ: '
        + 'пропадает текст переписки с пациентом | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D25-foundation-identities'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §6-9 — волна 2',
      blockedBy:
        'зеркало public.support_conversation_messages 34/34',
    },
  },
  'integrator.conversations': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'диалоги поддержки: `source`, `user_identity_id`, `admin_scope`, `status`, `close_reason` | ЗАЧЕМ: '
        + 'ломается переписка «пациент ↔ поддержка» | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D25-foundation-identities'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §6-9 — волна 2',
      blockedBy:
        'зеркало public.support_conversations 21/21; писатель ещё жив (пишется на каждое сообщение '
          + 'поддержки)',
    },
  },
  'integrator.delivery_attempt_logs': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'журнал попыток отправки: `intent_type`, `channel`, `status`, `attempt`, `reason`, `payload_json` '
        + '(полезная нагрузка сообщения, кроме OTP) | ЗАЧЕМ: нельзя разобрать, почему письмо/СМС не ушло | '
        + 'evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D14/I16: payload_json — тело отправленного сообщения (редактируется только OTP, '
          + 'dispatchPort.ts:90). Рекомендация I16(б): не добавлять organization_id, а отозвать app_staff и '
          + 'ходить операционными ролями области NONE — шов уже есть (app.record_global_email_delivery_attempt, '
          + 'app.record_operational_delivery_attempt_audit).',
    },
    policyRequirement:
      'platform-role: ЕДИНСТВЕННАЯ таблица схемы integrator, где стена реально нужна (evidence/15 §14).',
    defect: ['D14-integrator-no-wall', 'I16-integrator-queues'],
  },
  'integrator.idempotency_keys': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'ключи идемпотентности API: `key`, `request_hash`, `status`, `response_body` (полное тело ответа), '
        + '`expires_at` | ЗАЧЕМ: повтор вебхука начинает дублировать записи и отправки | evidence/14 часть 1, '
        + 'класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D14: очередь дедупа вебхуков — не место арендной роли.',
    },
    policyRequirement:
      'platform-role, приоритет низкий: ПДн нет вовсе — опровергнуто замером (~225 живых строк, '
        + 'response_body=\'{}\' в 261 из 261; evidence/15 §16, FINDINGS К8). Стены клиники/пациента не '
        + 'требуется.',
    defect: ['D14-integrator-no-wall'],
  },
  'integrator.identities': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'связка «человек ↔ внешний аккаунт»: `user_id`, `resource` (telegram/max), `external_id` | ЗАЧЕМ: '
        + 'никто не узнаёт, чей это чат — весь вход в бота ломается | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D14-integrator-no-wall', 'D25-foundation-identities'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §10-11 — волна 3 (это и есть незакрытый фундамент D25)',
      blockedBy:
        'горячий путь каждого вебхука; integrator.telegram_state держит FK — дропать только после её '
          + 'урезания. До сноса пять пациентских стен, построенных на EXISTS по этой таблице, остаются '
          + 'недействующими',
    },
  },
  'integrator.integration_data_quality_incidents': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'инциденты качества данных внешней интеграции: `integration`, `entity`, `external_id`, `field`, '
        + '`raw_value`, `timezone_used`, `error_reason` | ЗАЧЕМ: не видно, что внешняя система прислала мусор '
        + '(например, кривой TZ филиала) | evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D14: raw_value может содержать исходное значение поля пациента или филиала.',
    },
    policyRequirement:
      'по смыслу клиническая стена (инцидент принадлежит интеграции конкретной клиники), но '
        + 'organization_id нет; при 3 строках приоритет низкий (evidence/15 §19).',
    defect: ['D14-integrator-no-wall'],
  },
  'integrator.message_drafts': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'черновик сообщения пациента в боте: `identity_id`, `draft_text_current`, `state` | ЗАЧЕМ: пациент '
        + 'теряет набранный, но не отправленный текст | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient. D25: пациентская ветка построена на EXISTS по integrator.identities, у которой '
        + 'стены нет и которая СНОСИТСЯ — после сноса ветку перевесить на public.user_channel_bindings '
        + '(evidence/15 §13).',
    defect: ['D25-foundation-identities'],
  },
  'integrator.message_retry_jobs': {
    cls: 'S', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'очередь повторной отправки сообщений: `phone_normalized`, `message_text`, `next_try_at`, '
        + '`attempts_done`, `last_error`, `payload_json` | ЗАЧЕМ: недоставленные SMS/сообщения не досылаются '
        + '| evidence/14 часть 1, класс S.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D14-integrator-no-wall'],
    removal: {
      verdict: 'DROP',
      source:
        'evidence/15 §3 — волна 1; заменена public.outgoing_delivery_queue',
      blockedBy:
        '10 строк pending — не раньше 2026-08-29 17:00 MSK (живая работа, удаление = потерянное сообщение '
          + 'человеку)',
    },
  },
  'integrator.projection_outbox': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'очередь проекций событий в webapp: `event_type`, `idempotency_key`, `payload`, `status`, '
        + '`attempts_done`, `last_error` | ЗАЧЕМ: события интегратора перестают доезжать в webapp | '
        + 'evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D14: payload несёт события по конкретным пациентам и записям.',
    },
    policyRequirement:
      'platform-role; приоритет понижен — ставить после переезда поддержки, когда ясен остаточный состав '
        + 'событий (evidence/15 §15).',
    defect: ['D14-integrator-no-wall'],
  },
  'integrator.question_messages': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'сообщения внутри вопроса: `sender_type`, `message_text` | ЗАЧЕМ: обрывается нитка ответа на вопрос '
        + '| evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D25-foundation-identities'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §6-9 — волна 2',
      blockedBy:
        'зеркало public.support_question_messages 20/20; не читается ниоткуда',
    },
  },
  'integrator.schema_migrations': {
    cls: 'T', wall: 'closed', disposition: 'ACTIVE',
    why:
      'журнал миграций интегратора: `version`, `applied_at` | ЗАЧЕМ: то же для интегратора | evidence/14 '
        + 'часть 1, класс T.',
    rls: 'off', owner: 'migrator',
    rlsWhy:
      'ЯВНО объявленное отсутствие RLS (SCHEME §A.4: \'off\' — объявленное отсутствие, а не молчание). '
        + 'Журнал мигратора читает и пишет сам мигратор, в том числе ВНЕ окна элевации (шаг 0 цепочки сверяет '
        + 'max(created_at) против watermark), а FORCE RLS без политики закрыл бы таблицу и от её владельца — '
        + 'цепочка деплоя перестала бы работать. Стена здесь — НУЛЕВОЙ грант рантайм-ролям: ACL пуст, кроме '
        + 'владельца.',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'integrator.telegram_state': {
    cls: 'P', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'состояние Telegram-диалога: `username`, `first_name`, `last_name`, `state`, `notify_*`, '
        + '`is_active` | ЗАЧЕМ: бот теряет шаг диалога и настройки уведомлений | evidence/14 часть 1, класс '
        + 'P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'evidence/15 §12: ОСТАВИТЬ, урезав 7 колонок (username/first_name/last_name + четыре '
        + 'notify_*/is_active). После урезания таблица перестаёт быть носителем ПДн и вопрос о стене '
        + 'снимается сам; до этого обе стены отсутствуют (D14).',
    defect: ['D14-integrator-no-wall'],
  },
  'integrator.telegram_users': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'легаси-хранилище Telegram-аккаунтов: `telegram_id`, `username`, `first_name`, `last_name`, `phone` '
        + '| ЗАЧЕМ: ничего не ломается — таблица мёртвая | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D14-integrator-no-wall'],
    removal: {
      verdict: 'DROP',
      source:
        'evidence/15 §1 — волна 0, 2 строки, единственная таблица, где обе оценки сошлись',
    },
  },
  'integrator.user_questions': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'вопросы пациента врачу/поддержке: `text`, `answered`, `answered_at` | ЗАЧЕМ: вопрос пациента не '
        + 'доходит до персонала | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D25-foundation-identities'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §6-9 — волна 2',
      blockedBy:
        'зеркало public.support_questions 16/16',
    },
  },
  'integrator.user_reminder_delivery_logs': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'журнал доставки напоминаний: `occurrence_id`, `channel`, `status`, `error_code`, `payload_json` | '
        + 'ЗАЧЕМ: не видно, почему напоминание не дошло | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). ⚠ evidence/18 §6: полная проекция в public.reminder_delivery_events '
        + '(1735/1735 в обе стороны) — одна из двух таблиц уходит; какая именно, решает общее решение по '
        + 'evidence/15.',
  },
  'integrator.user_reminder_occurrences': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'конкретные срабатывания напоминаний: `planned_at`, `status`, `delivery_channel`, '
        + '`platform_user_id` | ЗАЧЕМ: напоминания не ставятся в очередь и дублируются | evidence/14 часть 1, '
        + 'класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). Опирается на reminder_rules; после волны 3 проверить, на что смотрит '
        + 'ветка.',
  },
  'integrator.user_reminder_rules': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'правила напоминаний пациента: `category`, `schedule_type`, `timezone`, `quiet_hours_*`, '
        + '`deep_link`, `custom_text` | ЗАЧЕМ: пациент перестаёт получать напоминания | evidence/14 часть 1, '
        + 'класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    removal: {
      verdict: 'DROP',
      source:
        'evidence/15 §4 — 27/27 уже в public.reminder_rules',
    },
  },
  'integrator.users': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'реестр пользователей интегратора: `id`, `created_at`, `merged_into_user_id` | ЗАЧЕМ: нет якоря, к '
        + 'которому цепляются идентичности, контакты и напоминания | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D14-integrator-no-wall'],
    removal: {
      verdict: 'MOVE+DROP',
      source:
        'evidence/15 §10-11 — волна 3',
      blockedBy:
        'горячий путь; зеркало public.platform_users.integrator_user_id / .merged_into_id',
    },
  },
  'public.admin_audit_log': {
    cls: 'S', wall: 'platform-role+clinic', disposition: 'ACTIVE',
    why:
      'журнал административных действий: `actor_id`, `action`, `target_id`, `details`, `status`, '
        + '`repeat_count` | ЗАЧЕМ: пропадает разбор «кто что сделал» и авто-мерджи конфликтов | evidence/14 '
        + 'часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.app_runtime_settings': {
    cls: 'S', wall: 'platform-role+clinic', disposition: 'ACTIVE',
    why:
      'настройки рантайма: `key`, `scope`, `organization_id`, `audience`, `value_json` | ЗАЧЕМ: сервис '
        + 'теряет управляемые из кабинета настройки | evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.app_runtime_settings_audit': {
    cls: 'S', wall: 'platform-role+clinic', disposition: 'ACTIVE',
    why:
      'кто и когда менял настройку: `old_value_json`, `new_value_json`, `updated_by`, `source` | ЗАЧЕМ: '
        + 'нельзя восстановить, кто сломал настройку | evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.appointment_records': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'легаси-проекция записей на приём из Rubitime: `integrator_record_id`, `phone_normalized`, '
        + '`record_at`, `status`, `payload_json`, `platform_user_id`, `organization_id` | ЗАЧЕМ: ломается '
        + 'статистика и сверка со старым источником записей | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    defect: ['D15-appointment-records'],
    removal: {
      verdict: 'DUP-DROP (сначала перевести код)',
      source:
        'evidence/18 §7 — 394/410 отображены в be_appointments, phone 394/394',
      blockedBy:
        'шесть живых читателей (бот, админ интегратора, список врача) — перевести на '
          + 'be_appointments.phone_normalized. До сноса таблица стоит БЕЗ обеих стен (D15) и это единственный '
          + 'пункт списка, где ошибка видна пациенту',
    },
  },
  'public.auth_rate_limit_events': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'счётчик попыток входа/отправки кода: `scope`, `key` (IP либо `userId`), `occurred_at` | ЗАЧЕМ: '
        + 'снимается защита от перебора OTP и OAuth-стартов | evidence/14 часть 1, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables', 'I1-definer-plus-force'],
    codeMustChange: ['C13'],
  },
  'public.be_appointment_cancellations': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'отмены визитов: `cancellation_type`, `was_penalized`, `prepayment_refunded`, `staff_comment`, '
        + '`applied_policy_snapshot` | ЗАЧЕМ: ломается политика отмен и возвратов предоплаты | evidence/14 '
        + 'часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_appointment_events': {
    cls: 'P', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'системные события записи: `appointment_id`, `event_type`, `actor_id`, `payload` | ЗАЧЕМ: пропадает '
        + 'машинная история изменения брони | evidence/14 часть 1, класс P.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    removal: {
      verdict: 'DUP-DROP',
      source:
        'evidence/18 §3 — 434/434 совпадений с be_appointment_history_events, ноль SELECT во всём '
          + 'репозитории',
      blockedBy:
        'убрать 6 INSERT-блоков: pgBookingEngine.ts:205,1760,1817 и '
          + 'pgBookingAppointmentLifecycle.ts:253,362,496; поправить TRUNCATE в нагрузочном скрипте',
    },
  },
  'public.be_appointment_history_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'человекочитаемая история записи: `event_type`, `actor_id`, `payload`, `occurred_at` | ЗАЧЕМ: врач '
        + 'перестаёт видеть «кто и когда менял запись» | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_appointment_no_shows': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'неявки: `actor_type`, `reason`, `staff_comment`, `notifications_sent` | ЗАЧЕМ: не считается '
        + 'счётчик неявок пациента | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_appointment_reschedules': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'переносы: `from_*`/`to_*`, `was_in_free_reschedule_window`, `applied_policy_snapshot` | ЗАЧЕМ: '
        + 'ломается бесплатный/платный перенос и лимит переносов | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_appointment_staff_comments': {
    cls: 'P', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'внутренние комментарии персонала о пациенте: `platform_user_id`, `author_id`, `body` | ЗАЧЕМ: врач '
        + 'теряет заметки по визиту | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_patient:
        'РЕШЕНИЕ D2, дословно: «он НЕ ВИДИТ внутренние комментарии». Колонка body заполняется '
          + 'врачом/администратором (pgClientHistory.ts), таблица так и называется — staff comments.',
    },
    policyRequirement:
      'clinic-only: пациентскую ветку политики (platform_user_id = app.current_patient_user_id()) снять. '
        + 'Закрывает FINDINGS О2 в сторону «пациент не видит».',
    codeMustChange: ['C14'],
  },
  'public.be_appointments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'записи на приём: `organization_id`, `branch_id`, `specialist_id`, `service_id`, '
        + '`platform_user_id`, `start_at/end_at`, `status`, `phone_normalized` | ЗАЧЕМ: нет записи на приём — '
        + 'нет ни расписания врача, ни визита пациента | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_availability_rules': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'правила доступности специалиста: `specialist_id`, `rule_type`, `config` | ЗАЧЕМ: не считаются '
        + 'свободные слоты | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_booking_form_fields': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'конструктор полей формы записи: `field_key`, `field_type`, `visible_to_patient/staff`, '
        + '`is_required` | ЗАЧЕМ: форма записи теряет настраиваемые поля | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_booking_form_submissions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'ответы пациента в форме записи: `appointment_id`, `field_id`, `value_text` | ЗАЧЕМ: теряются '
        + 'данные, введённые пациентом при записи | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_branches': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'филиалы клиники: `title`, `city_code`, `address`, `timezone`, `color` | ЗАЧЕМ: расписание некуда '
        + 'привязать, ломаются часовые пояса | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_cancellation_policies': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'политика отмен: `free_cancel_hours_before`, `late_cancellation_behavior`, '
        + '`refund_prepayment_on_late` | ЗАЧЕМ: отмены перестают штрафоваться по правилам клиники | '
        + 'evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_clinic_services': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'услуги клиники: `title`, `duration_minutes`, `price_minor`, `public_widget_visible`, '
        + '`prepayment_applicable` | ЗАЧЕМ: не на что записываться и нечего считать в прайсе | evidence/14 '
        + 'часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_external_entity_mappings': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'сопоставление «наш id ↔ id внешней системы»: `entity_type`, `canonical_id`, `external_system`, '
        + '`external_id` | ЗАЧЕМ: рвётся связь с Rubitime/внешними системами, начинаются дубли | evidence/14 '
        + 'часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_organization_members': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'членство человека в клинике: `platform_user_id`, `role` (owner/admin/doctor/assistant), '
        + '`specialist_id`, `status`, `doctor_screens_disabled` | ЗАЧЕМ: никто не определяется как врач/админ '
        + 'клиники — падает вся авторизация кабинета | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_platform_settings:
        'SCHEME §I Р4 + решение D1: платформенное чтение членств — через definer-исключение (образец '
          + 'c5a:1293-1355), а не табличный SELECT. Это одна из 2 оставшихся живых ячеек утечки FACTS §1.2.',
      bcb_test_integrator_login:
        'I2: то же; резолвер получает организацию через definer (D5).',
      bcb_test_nonstaff_login:
        'I2: грант выдан логин-роли напрямую.',
    },
    policyRequirement:
      'RLS+FORCE (живьём relrowsecurity=false — D16) + org-политика staff. На этой таблице стоит '
        + 'определение «кто врач/админ клиники», то есть авторизация кабинета целиком.',
    defect: ['D16-org-members-leak', 'I2-grant-to-login'],
  },
  'public.be_organizations': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'сама клиника: `title`, `is_active`, `tariff_id`, `cabinet_first_entered_at` | ЗАЧЕМ: без неё нет '
        + 'арендатора вообще | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_package_history_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'история абонемента пациента: `patient_package_id`, `event_type`, `payload_json` | ЗАЧЕМ: не видно, '
        + 'кто продлил/заморозил абонемент | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_package_items': {
    cls: 'C', wall: 'parent', disposition: 'ACTIVE',
    why:
      'состав абонемента-шаблона: `package_id`, `service_id`, `quantity` | ЗАЧЕМ: нельзя описать, что '
        + 'входит в абонемент | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_package_usages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'списания сеансов абонемента: `patient_package_id`, `appointment_id`, `usage_kind`, `quantity` | '
        + 'ЗАЧЕМ: сеансы не списываются с абонемента | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_patient_booking_profiles': {
    cls: 'P', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'профиль пациента у клиники: `is_problematic`, `booking_blocked`, `problematic_note`, '
        + '`no_show_count` | ЗАЧЕМ: нельзя заблокировать самозапись проблемному пациенту | evidence/14 часть '
        + '1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_patient:
        'РЕШЕНИЕ D2: «пометка проблемный и тд» — служебная оценка клиники (is_problematic, '
          + 'problematic_note, booking_blocked, no_show_count); пациенту не показывается.',
    },
    policyRequirement:
      'clinic-only: снять пациентскую ветку. Закрывает FINDINGS О2.',
    codeMustChange: ['C14'],
  },
  'public.be_patient_package_items': {
    cls: 'P', wall: 'parent+patient', disposition: 'ACTIVE',
    why:
      'состав купленного абонемента: `patient_package_id`, `service_id`, `quantity_initial` | ЗАЧЕМ: не '
        + 'известно, сколько сеансов какой услуги куплено | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_patient_packages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'купленные пациентом абонементы: `platform_user_id`, `status`, `price_minor`, `valid_from/until`, '
        + '`paid_amount_minor` | ЗАЧЕМ: абонементы перестают списываться и показываться | evidence/14 часть '
        + '1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_patient_timeline_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'лента событий пациента: `domain`, `event_type`, `linked_object_*`, `payload` | ЗАЧЕМ: пропадает '
        + 'единая хронология по клиенту | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_payment_history_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'история платежей пациента: `payment_id`, `refund_id`, `amount_minor`, `event_type` | ЗАЧЕМ: '
        + 'пропадает платёжная хронология в карточке пациента | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_payment_intents': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'намерения оплаты: `provider_id`, `amount_minor`, `status`, `checkout_url`, `idempotency_key` | '
        + 'ЗАЧЕМ: не создаётся ссылка на оплату/предоплату | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_payment_provider_events': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'сырые вебхуки платёжного провайдера: `provider_id`, `event_type`, `payload_json`, `intent_ref` | '
        + 'ЗАЧЕМ: платёж не подтверждается автоматически | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_payments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'платежи пациента: `platform_user_id`, `amount_minor`, `status`, `purpose`, `captured_at` | ЗАЧЕМ: '
        + 'нет учёта оплат визитов | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_prepayment_policies': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'политика предоплаты по услуге: `mode`, `amount_minor`, `percent_bps`, `online_category` | ЗАЧЕМ: '
        + 'не берётся предоплата | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_refunds': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'возвраты: `payment_id`, `amount_minor`, `reason`, `provider_refund_ref` | ЗАЧЕМ: нельзя вернуть '
        + 'предоплату | evidence/14 часть 1, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_reschedule_policies': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'политика переносов: `self_reschedule_hours_before`, `max_self_reschedules`, `allow_different_*` | '
        + 'ЗАЧЕМ: пациент переносит визит без ограничений | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_rooms': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'кабинеты филиала: `branch_id`, `title`, `is_active` | ЗАЧЕМ: нельзя развести приёмы по кабинетам | '
        + 'evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_schedule_blocks': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'блокировки времени (отпуск, перерыв): `specialist_id`, `start_at/end_at`, `block_type` | ЗАЧЕМ: '
        + 'врача записывают в занятое/нерабочее время | evidence/14 часть 1, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_schedule_templates': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Шаблоны рабочего дня клиники — `branch_id`, `name`, `start_minute`, `end_minute`, `breaks`, '
        + '`is_active` | ЗАЧЕМ: Без неё нельзя быстро назначить типовой график | evidence/14 часть 2, класс '
        + 'C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_service_location_availability': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Где оказывается услуга — `service_id`, `branch_id`, `is_active` | ЗАЧЕМ: Без неё запись не знает, '
        + 'в каком филиале доступна услуга | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_specialist_locations': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Специалист ↔ филиал — `specialist_id`, `branch_id`, `is_active` | ЗАЧЕМ: Без неё специалист не '
        + 'привязан к филиалу — слоты не строятся | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_specialist_rooms': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Специалист ↔ кабинет — `specialist_id`, `room_id`, `is_active` | ЗАЧЕМ: Распределение по кабинетам '
        + 'при записи | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_specialist_service_availability': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Какой специалист какую услугу оказывает — `specialist_id`, `service_id`, `branch_id`, `room_id`, '
        + '`city_code`, `price_minor_override` | ЗАЧЕМ: Ядро подбора слота: без неё публичная запись пуста | '
        + 'evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      bcb_test_nonstaff_login:
        'I2: то же (ч.2 В5).',
    },
    defect: ['I2-grant-to-login'],
  },
  'public.be_specialists': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Карточка специалиста клиники — `full_name`, `description`, `is_active`, '
        + '`appointment_reminder_default_preset_id` | ЗАЧЕМ: Витрина записи и расписание без специалистов не '
        + 'существуют | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      bcb_test_nonstaff_login:
        'I2: табличный грант выдан логин-роли напрямую (ч.2 В5).',
    },
    defect: ['I2-grant-to-login'],
  },
  'public.be_subscription_packages': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Абонементы клиники — `title`, `price_minor`, `currency`, `validity_days`, `deduction_mode` | '
        + 'ЗАЧЕМ: Без неё нельзя продать/списать абонемент | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_working_days': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'График на конкретную дату (перекрывает недельный) — `specialist_id`, `work_date`, `start_minute`, '
        + '`end_minute`, `is_closed`, `breaks` | ЗАЧЕМ: Разовые изменения графика (отпуск, дополнительный '
        + 'день) | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.be_working_hours': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Недельный график — `specialist_id`, `branch_id`, `room_id`, `weekday`, `start_minute`, '
        + '`end_minute` | ЗАЧЕМ: Базовое расписание — без него нет ни одного слота | evidence/14 часть 2, '
        + 'класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.booking_calendar_map': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Связь записи с событием Google Calendar — `appointment_key`, `gcal_event_id` | ЗАЧЕМ: Без неё '
        + 'запись пациента не отражается/не удаляется в календаре врача | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D22-booking-calendar-map', 'I1-definer-plus-force'],
  },
  'public.booking_cities': {
    cls: 'R', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Города каталога записи — `code`, `title`, `is_active`, `sort_order` (2 строки) | ЗАЧЕМ: '
        + 'listActiveBookingCities" apps/webapp/src` → пусто). В коде остались только `code`-строки '
        + '(`src/modules/help-content/patientHelpAddressLink.ts:7`, `cityCode` в `/book`), FK из '
        + '`046_booking... | evidence/14 часть 2, класс R.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'РЕШЕНИЕ D3 + D21: клиника A может переименовать/деактивировать/удалить город, который видит '
          + 'клиника B. Запись в глобальный шаблон запрещена.',
    },
    defect: ['D21-reference-write'],
    ownerGate: ['O4-dead-tables'],
    codeMustChange: ['C15'],
  },
  'public.broadcast_audit': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Журнал рассылок клиники — `actor_id`, `category`, `audience_filter`, `message_title`, '
        + '`sent_count`, `error_count`, `channels`, `message_body` | ЗАЧЕМ: Без неё нет истории рассылок и '
        + 'счётчиков доставки | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic. I4: app_owner=r без политики — тот же класс тихого нуля.',
    defect: ['I4-dead-grant'],
  },
  'public.broadcast_audit_recipients': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Кому ушла рассылка — `audit_id`, `platform_user_id`, `organization_id` | ЗАЧЕМ: Пациент видит '
        + 'адресованные ему рассылки; врач — охват | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.broadcast_drafts': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Черновики рассылок — `doctor_user_id`, `category`, `audience`, `channels`, `title`, `body`, '
        + '`media_url` | ЗАЧЕМ: Врач теряет несохранённый текст рассылки | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.channel_link_secrets': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Одноразовые секреты привязки мессенджера — `user_id`, `channel_code`, `token_hash`, `expires_at`, '
        + '`used_at` | ЗАЧЕМ: Привязка Telegram/MAX к аккаунту | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.clinic_dedicated_bot_bindings': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Привязка собственного бота клиники — `channel`, `organization_id`, `credential_fingerprint`, '
        + '`is_active` | ЗАЧЕМ: Без неё вебхук собственного бота клиники не маршрутизируется | evidence/14 '
        + 'часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic. I4 «мёртвый грант»: app_staff=arwd без единой staff-политики при FORCE RLS = тихий ноль. '
        + 'Либо отозвать грант (путь идёт через app.resolve_clinic_dedicated_bot_organization), либо дописать '
        + 'политику — но не оставлять пару «грант без политики».',
    defect: ['I4-dead-grant'],
  },
  'public.clinic_public_directory_entries': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Публичная витрина клиники — `slug`, `display_name`, `is_published`, `published_at` | ЗАЧЕМ: Без '
        + 'неё клиника не находится по публичной ссылке записи | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_anamnesis_illness': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Анамнез: перенесённые болезни и стрессы — `patient_user_id`, `period`, `what`, `comment`, '
        + '`created_by` | ЗАЧЕМ: Без неё врач теряет историю болезней пациента в карточке | evidence/14 часть '
        + '2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_anamnesis_lifestyle': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Анамнез: образ жизни — `patient_user_id`, `record_date`, `text`, `created_by` | ЗАЧЕМ: То же — '
        + 'блок «Образ жизни» в анамнезе | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_anamnesis_trauma': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Анамнез: травмы и операции — `year`, `what`, `type`, `immobilization`, `patient_user_id` | ЗАЧЕМ: '
        + 'Блок «Травмы и операции» | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_complaint': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Жалобы пациента — `patient_user_id`, `text`, `priority`, `status`, `source_visit_id`, '
        + '`resolved_at` | ЗАЧЕМ: Без неё нет списка жалоб и их закрытия | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_complaint_update': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Динамика жалобы по визитам — `complaint_id`, `visit_id`, `note`, `severity`, `resolved` | ЗАЧЕМ: '
        + 'Без неё жалоба статична, нет истории «стало лучше/хуже» | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_diagnosis': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Диагнозы пациента — `patient_user_id`, `catalog_id`, `text`, `status`, `clinical_status`, '
        + '`comment` | ЗАЧЕМ: Основной клинический артефакт карточки | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_diagnosis_catalog': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Справочник диагнозов клиники — `label`, `note`, `created_by` | ЗАЧЕМ: Врач выбирает диагноз из '
        + 'своего справочника | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_diagnosis_status_history': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Журнал смены статуса диагноза — `diagnosis_id`, `old_status`, `new_status`, `changed_by`, `note` | '
        + 'ЗАЧЕМ: Аудит: кто и когда снял/поставил диагноз | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_diagnosis_update': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Уточнения диагноза по визитам — `diagnosis_id`, `visit_id`, `refinement`, `status`, `removed` | '
        + 'ЗАЧЕМ: Без неё диагноз не уточняется от визита к визиту | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.clinical_test_measure_kinds': {
    cls: 'R', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Виды измерений для клинических тестов — `code`, `label`, `sort_order` (0 строк) | ЗАЧЕМ: Единые '
        + 'подписи измерений в тестах | evidence/14 часть 2, класс R.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'РЕШЕНИЕ D3 + D21: арендная роль имеет INSERT в пул, который сам код называет глобальным '
          + '(measureKindCode.ts:1, api.md:100 даёт врачу POST/PATCH). Тенант не пишет в глобальный шаблон — '
          + 'ему принадлежит его КОПИЯ.',
    },
    defect: ['D21-reference-write'],
    codeMustChange: ['C15'],
  },
  'public.clinical_test_regions': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Связка «клинический тест ↔ регион тела» — `clinical_test_id`, `body_region_id` | ЗАЧЕМ: Фильтр '
        + 'тестов по региону тела | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'РЕШЕНИЕ D2: пациенту гранта НЕТ и не будет — клинические тесты, снятые на приёме, ему не '
        + 'показываются. Это объявленное КОНЕЧНОЕ состояние (закрывает FINDINGS О2 / ч.2 В3), а не пробел.',
  },
  'public.clinical_visit': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Клинический визит — `patient_user_id`, `visit_type`, `visited_at`, `exam`, `manipulations`, '
        + '`recommendations`, `anamnesis_text` | ЗАЧЕМ: Приём как таковой: осмотр, манипуляции, рекомендации '
        + '| evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.comments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Комментарии к сущностям — `author_id`, `target_type`, `target_id`, `comment_type`, `body` | ЗАЧЕМ: '
        + 'Диалог врач↔пациент вокруг упражнений, тестов, программ | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient. D10: дизъюнкт target_type = ANY(exercise,test,test_set,recommendation,lesson) '
        + 'стоит БЕЗ единого условия и в USING, и в WITH CHECK — сотрудник клиники A правит и удаляет '
        + 'комментарии клиники B.',
    defect: ['D10-comments'],
  },
  'public.content_access_grants_webapp': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Выданные пациенту доступы к контенту — `platform_user_id`, `content_id`, `token_hash`, '
        + '`expires_at`, `revoked_at` | ЗАЧЕМ: Пациент теряет доступ к выданным ему материалам | evidence/14 '
        + 'часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.content_pages': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Страницы CMS — `section`, `slug`, `title`, `body_html`/`body_md`, `is_published`, `requires_auth`, '
        + '`linked_course_id` | ЗАЧЕМ: Контент, который читает пациент | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic. I5: политика c4_web_push_reminder_catalog читает организацию как '
        + '(NULLIF(current_setting(\'app.org\', true),\'\'))::uuid, все прочие политики — через '
        + 'app.current_org_id(). Свести к одному аксессору: иначе решение D6 («аксессор RAISE при отсутствии '
        + 'контекста») обходится сырым current_setting.',
    defect: ['I5-two-org-accessors'],
    codeMustChange: ['C18'],
  },
  'public.content_section_slug_history': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'История переименований разделов — `old_slug`, `new_slug`, `changed_by_user_id` | ЗАЧЕМ: Старые '
        + 'ссылки пациента не ломаются после переименования | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic + пациентское чтение. I6: политика patient_current_org_select выдана роли public вместо '
        + 'app_patient — на безопасность не влияет (PERMISSIVE, только SELECT), но расходится с шаблоном '
        + 'соседних таблиц; привести к app_patient.',
    defect: ['I6-policy-to-public'],
  },
  'public.content_sections': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Разделы CMS — `slug`, `title`, `is_visible`, `requires_auth`, `kind`, `system_parent_code`, '
        + '`cover_image_url` | ЗАЧЕМ: Навигация пациентского контента | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'то же, что content_pages (I5 / C18).',
    defect: ['I5-two-org-accessors'],
    codeMustChange: ['C18'],
  },
  'public.courses': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Курсы клиники — `title`, `program_template_id`, `intro_lesson_page_id`, `access_settings`, '
        + '`status`, `price_minor` | ЗАЧЕМ: Платный/бесплатный курс как продукт клиники | evidence/14 часть '
        + '2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.doctor_notes': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Заметки врача о пациенте — `user_id`, `author_id`, `text` | ЗАЧЕМ: Личные пометки врача по клиенту '
        + '| evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.doctor_patient_support': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Флаги сопровождения пациента — `patient_user_id`, `on_support`, `comments_enabled`, '
        + '`media_enabled`, `support_started_at` | ЗАЧЕМ: Определяет, ведёт ли врач клиента и открыты ли ему '
        + 'чат/медиа | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.email_challenges': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Коды подтверждения почты — `user_id`, `email`, `code_hash`, `expires_at`, `attempts`, `purpose`, '
        + '`pending_delivery_code`, `delivery_token` | ЗАЧЕМ: Вход и подтверждение почты | evidence/14 часть '
        + '2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.email_otp_locks': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Блокировка после неудачных попыток — `user_id`, `locked_until`, `lockout_cycle` | ЗАЧЕМ: Защита '
        + 'входа от перебора кода | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.email_send_cooldowns': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Антиспам отправки писем — `user_id`, `email_normalized`, `last_sent_at` | ЗАЧЕМ: Без неё письма '
        + 'уходят пачками | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.idempotency_keys': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Кэш ответов межсервисного API — `key`, `request_hash`, `status`, `response_body` (jsonb), '
        + '`expires_at`. 1 251 959 строк | ЗАЧЕМ: Повторный вебхук не выполняет операцию дважды | evidence/14 '
        + 'часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: response_body несёт тела ответов по обращениям пациентов и по привязке телефонов; арендной '
          + 'роли на межсервисном кэше не место.',
    },
    policyRequirement:
      'platform-role. ⚠ GAP G11: объём таблицы под вопросом (часть 2 — 1 251 959 строк по reltuples, '
        + 'evidence/15 §16 — 0 строк на TEST); нужен count(*). На сам дефект стены это не влияет.',
    defect: ['D19-operator-tables', 'I1-definer-plus-force'],
  },
  'public.integration_webhook_error_events': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Ошибки входящих вебхуков — `source`, `error_class`, `occurred_at` | ЗАЧЕМ: Диагностика молчащего '
        + 'вебхука | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: арендная роль может писать и УДАЛЯТЬ записи об ошибках интеграций платформы.',
    },
    defect: ['D19-operator-tables'],
  },
  'public.integration_webhook_last_status': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Последний статус вебхука — `source`, `received_at`, `processed_ok`, `error_class`, '
        + '`http_status_returned`, `detail` | ЗАЧЕМ: Панель здоровья интеграций | evidence/14 часть 2, класс '
        + 'S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: платформенная телеметрия входящих вебхуков.',
    },
    defect: ['D19-operator-tables'],
  },
  'public.integrator_push_outbox': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Очередь исходящих push к integrator — `kind`, `idempotency_key`, `payload` (jsonb), `status`, '
        + '`attempts_done`, `last_error` | ЗАЧЕМ: Без неё webapp не дотолкает событие до integrator при сбое '
        + '| evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: межсервисная очередь событий — стена своей роли; арендной роли здесь не место.',
    },
    defect: ['D19-operator-tables'],
  },
  'public.lfk_complex_exercises': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Строки комплекса пациента — `complex_id`, `exercise_id`, `reps`, `sets`, `max_pain_0_10`, '
        + '`comment` | ЗАЧЕМ: Сам состав назначения (что и сколько делать) | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_complex_template_exercises': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Строки шаблона — `template_id`, `exercise_id`, `reps`, `sets`, `side`, `owner_kind` | ЗАЧЕМ: '
        + 'Состав шаблонного комплекса | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_complex_templates': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Шаблоны комплексов — `title`, `description`, `status`, `created_by`, `owner_kind` | ЗАЧЕМ: '
        + 'Библиотека готовых комплексов клиники и платформы | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_complexes': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Назначенные пациенту комплексы ЛФК — `platform_user_id`, `user_id`(legacy text), `title`, '
        + '`diagnosis_text`, `region_ref_id`, `side` | ЗАЧЕМ: Без неё пациент не получает назначенных '
        + 'упражнений | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient. I12: пациентская ветка смотрит только на platform_user_id, а колонок две (есть и '
        + 'legacy user_id text) — строка с platform_user_id IS NULL пациенту невидима. Подкласс D27: стена '
        + 'fail-closed прячет данные.',
    defect: ['I12-two-patient-keys'],
  },
  'public.lfk_exercise_media': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Видео/картинки упражнения — `exercise_id`, `media_url`, `media_type`, `owner_kind` | ЗАЧЕМ: '
        + 'Пациент не видит показ упражнения | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_exercise_regions': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Упражнение ↔ регион тела — `exercise_id`, `region_ref_id`, `owner_kind` | ЗАЧЕМ: Фильтр упражнений '
        + 'по региону | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_exercises': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'Каталог упражнений — `title`, `region_ref_id`, `load_type`, `difficulty_1_10`, '
        + '`contraindications`, `owner_kind`, `catalog_scope` | ЗАЧЕМ: Без каталога упражнений нет назначений '
        + '| evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.lfk_sessions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Дневник выполнения ЛФК — `user_id`, `complex_id`, `completed_at`, `pain_0_10`, `difficulty_0_10`, '
        + '`comment` | ЗАЧЕМ: Без неё нет дневника и статистики выполнения | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.login_tokens': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'Одноразовые токены входа — `token_hash`, `user_id`, `method`, `status`, `expires_at`, '
        + '`session_issued_at` | ЗАЧЕМ: Вход по ссылке/коду | evidence/14 часть 2, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.manual_patient_commands': {
    cls: 'P', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Идемпотентность ручных команд по пациенту — `command_id`, `command_kind`, `request_fingerprint`, '
        + '`platform_user_id` | ЗАЧЕМ: Защита от двойного выполнения ручной команды (приглашение и т.п.) | '
        + 'evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.material_ratings': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Оценки материалов пациентом — `user_id`, `target_kind`, `target_id`, `stars` | ЗАЧЕМ: Обратная '
        + 'связь по материалам, отчёты врачу | evidence/14 часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.media_files': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'Файлы медиатеки — `original_name`, `s3_key`, `mime_type`, `uploaded_by`, `usage_purpose`, '
        + '`hls_master_playlist_s3_key`, `owner_kind` | ЗАЧЕМ: Хранилище всех медиа: видео упражнений, '
        + 'логотипы, файлы пациента | evidence/14 часть 2, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient. D9: в пациентской ветке saas_org_dormant_p0_8_3 нет проверки organization_id '
        + 'вообще — пациент клиники A читает метаданные и s3_key любого файла клиники B.',
    defect: ['D9-media-files'],
  },
  'public.media_folders': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'Папки медиатеки, в т.ч. личные папки пациентов — `parent_id`, `name`, `kind`, `patient_user_id`, '
        + '`created_by` | ЗАЧЕМ: Файлы клиента и библиотека клиники раскладываются по папкам | evidence/14 '
        + 'часть 2, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic. D11: дизъюнкт без условий (patient_user_id IS NULL) пропускает всю библиотеку клиники для '
        + 'любой сессии с грантом, и в USING, и в WITH CHECK.',
    defect: ['D11-media-folders'],
  },
  'public.media_hls_proxy_error_events': {
    cls: 'T', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Отказы HLS-прокси — `media_id`, `user_id`, `reason_code`, `http_status`, `artifact_kind` | ЗАЧЕМ: '
        + 'Диагностика «видео не играет» у конкретного пациента | evidence/14 часть 2, класс T.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'platform-role. I7: у app_staff есть awd, но нет r, при этом код строит SELECT-агрегаты '
        + '(playbackClientEvents.ts:113-127) — несогласованный набор привилегий.',
    defect: ['I7-privilege-mismatch'],
  },
  'public.media_playback_client_events': {
    cls: 'T', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Клиентские события плеера — `media_id`, `user_id`, `event_class`, `delivery`, `error_detail`, '
        + '`user_agent` | ЗАЧЕМ: Понять, почему у пациента не грузится видео | evidence/14 часть 2, класс T.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'platform-role. I7: тот же несогласованный набор (awd без r).',
    defect: ['I7-privilege-mismatch'],
  },
  'public.media_playback_resolution_events': {
    cls: 'T', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Как отдавалось видео — `media_id`, `user_id`, `delivery`, `fallback_used`, `resolved_at` (2100 '
        + 'строк) | ЗАЧЕМ: Оценка минут просмотра в отчётах | evidence/14 часть 2, класс T.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.media_playback_stats_hourly': {
    cls: 'T', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'Почасовой агрегат воспроизведений — `bucket_hour`, `delivery`, `resolved_count`, `fallback_count` '
        + '(529 строк) | ЗАЧЕМ: Дешёвый график вместо скана событий | evidence/14 часть 2, класс T.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D21: строка bucket_hour x delivery суммирует воспроизведения ВСЕХ клиник; у арендной роли не '
          + 'должно быть ни записи, ни чтения.',
    },
    defect: ['D21-reference-write'],
  },
  'public.media_playback_user_video_first_resolve': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'отметка «этот человек впервые досмотрел это видео»: `user_id`, `media_id`, `first_resolved_at`, '
        + '`organization_id` | ЗАЧЕМ: без неё нет метрики «первый просмотр» и админской панели здоровья '
        + 'плеера | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). I7: вставку делает ПАЦИЕНТСКАЯ сессия, а табличного гранта у '
        + 'app_patient нет, и ошибка глотается (catch -> logger.error; return false) — метрика молча пишется '
        + 'в ноль. Назвать роль, под которой реально исполняется путь, и привести грант к ней.',
    defect: ['I7-privilege-mismatch'],
    codeMustChange: ['C10'],
  },
  'public.media_transcode_jobs': {
    cls: 'T', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'очередь перекодирования видео: `media_id`, `status`, `attempts`, `locked_at/by`, `last_error`, '
        + '`next_attempt_at` | ЗАЧЕМ: без неё загруженное видео не превращается в проигрываемое | evidence/14 '
        + 'часть 3, класс T.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic + ИМЕНОВАННОЕ исключение: ветки pg_has_role(CURRENT_USER,\'app_worker\') и '
        + '...\'app_operational_media_worker\' проходят мимо org-фильтра НАМЕРЕННО — модель владельца «фильтр '
        + 'воркера на ENQUEUE, не в RLS» (I11). Без записи следующий аудит прочитает это как дефект.',
    defect: ['I11-worker-bypass'],
  },
  'public.media_upload_sessions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сессия многочастной загрузки файла: `owner_user_id`, `s3_key`, `upload_id`, `status`, '
        + '`expected_size_bytes`, `expires_at` | ЗАЧЕМ: без неё нельзя загрузить файл/видео кусками (обрывы, '
        + 'докачка) | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.message_log': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'журнал отправленных человеку сообщений: `user_id`, `text`, `category`, `channel_bindings_used`, '
        + '`outcome`, `error_message`, `platform_user_id` | ЗАЧЕМ: без неё врач не видит историю переписки с '
        + 'пациентом и не доказать факт отправки | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.motivational_quotes': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'мотивационные цитаты клиники: `body_text`, `author`, `is_active`, `archived_at`, `sort_order` | '
        + 'ЗАЧЕМ: без неё пропадает блок цитаты на главной пациента | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic. I13: контент пациентский (pgPatientHomeLegacyContent.ts:20-36 читает активные цитаты для '
        + 'главной пациента), но у app_patient нет ни гранта, ни политики — под пациентской ролью это 42501. '
        + 'Установить фактом, под какой ролью рендерится страница: либо блок мёртв, либо пациентский экран '
        + 'рендерится НЕ под пациентской ролью, и это обход стены пациента.',
    defect: ['I13-patient-content-no-path'],
  },
  'public.notification_delivery_attempts': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'попытки доставки уведомления: `user_id`, `topic_code`, `channel`, `status`, `reason`, '
        + '`endpoint_hash`, `recipient_ref`, `error_message` | ЗАЧЕМ: без неё не видно, дошло ли напоминание, '
        + 'и не работает диагностика доставки | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). I5/C18: та же форма сырого current_setting в web-push-политике. D27: '
        + '8 строк из 12 626 с organization_id IS NULL.',
    defect: ['D27-empty-org-discriminator', 'I5-two-org-accessors'],
    ownerGate: ['O3-empty-tenant-discriminator'],
    codeMustChange: ['C18'],
  },
  'public.online_intake_answers': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'ответы на анкету первичного обращения: `request_id`, `question_id`, `ordinal`, `value` | ЗАЧЕМ: '
        + 'без неё теряется содержимое онлайн-заявки пациента | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    ownerGate: ['O4-dead-tables'],
  },
  'public.online_intake_attachments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'файлы к анкете: `request_id`, `attachment_type`, `s3_key`, `url`, `mime_type`, `original_name` | '
        + 'ЗАЧЕМ: без неё не удалить файлы пациента из S3 при purge; без неё не приложить документы к заявке '
        + '| evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    ownerGate: ['O4-dead-tables'],
  },
  'public.online_intake_requests': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сама заявка: `user_id`, `type`, `status`, `summary` | ЗАЧЕМ: без неё нет входящего потока '
        + 'онлайн-обращений | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    ownerGate: ['O4-dead-tables'],
  },
  'public.online_intake_status_history': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'смена статуса заявки: `from_status`, `to_status`, `changed_by`, `note` | ЗАЧЕМ: без неё нет аудита '
        + '«кто перевёл заявку в отказ» | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    ownerGate: ['O4-dead-tables'],
  },
  'public.operator_health_alert_sent': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'отметки «алерт с таким ключом уже отправлен»: `dedup_key`, `severity`, `sent_at` | ЗАЧЕМ: без неё '
        + 'оператор получает один и тот же алерт бесконечно | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: SET ROLE app_staff даёт 56 строк с полным CRUD.',
    },
    defect: ['D19-operator-tables'],
  },
  'public.operator_health_failure_archive': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'архив разобранных отказов здоровья: `health_probe`, `source_kind`, `severity_at_archive`, '
        + '`doctor_user_id`, `archived_by_user_id`, `summary_json`, `raw_error_truncated` | ЗАЧЕМ: без неё '
        + 'админ не может «закрыть» разобранный инцидент и он висит вечно | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_platform_settings:
        'РЕШЕНИЕ D1: USING true даёт платформе архив отказов ВСЕХ клиник вместе с doctor_user_id — это '
          + 'клинические данные, вне коммерции и каркаса.',
    },
    codeMustChange: ['C1'],
  },
  'public.operator_incidents': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'реестр инцидентов интеграций: `dedup_key`, `direction`, `integration`, `error_class`, '
        + '`error_detail`, `occurrence_count`, `alert_claim_token` | ЗАЧЕМ: без неё платформа не знает, что '
        + 'интеграция сломалась; на ней стоит вся панель здоровья | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D19: SET ROLE app_staff даёт 9 строк реестра инцидентов платформы (включая alert_claim_token) с '
          + 'полным CRUD.',
    },
    defect: ['D19-operator-tables'],
  },
  'public.operator_job_status': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'состояние фоновых задач: `job_key`, `job_family`, `last_status`, `last_started_at`, `last_error`, '
        + '`meta_json` | ЗАЧЕМ: без неё не видно, живы ли крон-задачи; это корень 61 050 отказов из FACTS '
        + '§1.1 | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D12: политика saas_enforce_default_deny_p0_9_1 выдана PUBLIC с USING true — «default_deny» по '
          + 'имени и открытая по факту; SET ROLE app_staff даёт 20 строк состояния планировщика платформы с '
          + 'полным CRUD.',
    },
    policyRequirement:
      'platform-role: реальный предикат стены платформенной роли вместо USING true. Эта же таблица — '
        + 'корень 61 050 отказов FACTS §1.1.',
    defect: ['D12-operator-job-status'],
  },
  'public.org_brand_revisions': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'ревизии брендинга клиники: `status`, `display_name`, `logo_media_id`, '
        + '`created_by/published_by/archived_by_platform_user_id`, `published_at` | ЗАЧЕМ: без неё клиника не '
        + 'может менять логотип/название с версионированием | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.org_enrollments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'прикрепление человека к клинике: `organization_id`, `platform_user_id`, `status`, '
        + '`portal_activated_at`, `portal_activated_via` | ЗАЧЕМ: это и есть «пациент принадлежит клинике»; '
        + 'без неё рушится вся стена арендатора (на неё ссылаются политики `platform_users`, `reference_*`, '
        + '`patient_home_*`) | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.organization_member_invites': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'приглашения сотрудников: `invited_email`, `invited_role`, `token_hash`, `status`, `expires_at`, '
        + '`accepted_membership_id` | ЗАЧЕМ: без неё нельзя завести второго врача в клинику | evidence/14 '
        + 'часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.organization_slug_claims': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'занятые адреса клиник: `slug`, `kind`, `organization_id`, `created_by_platform_user_id` | ЗАЧЕМ: '
        + 'без неё две клиники займут один публичный адрес | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic + ОБЪЯВЛЕННЫЙ definer-шов проверки занятости (I10): реестр уникальности, где каждый видит '
        + 'только свою строку, делает проверку «свободен ли slug» невозможной в принципе — чужая занятая '
        + 'строка невидима, выглядит свободной, UNIQUE падает на вставке.',
    defect: ['I10-slug-uniqueness'],
  },
  'public.organization_slug_rename_events': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'журнал переименований: `actor_platform_user_id`, `previous_slug`, `next_slug` | ЗАЧЕМ: без неё нет '
        + 'аудита смены публичного адреса | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.outgoing_delivery_queue': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'очередь исходящих сообщений: `event_id`, `kind`, `channel`, `payload_json` (тело сообщения '
        + 'человеку), `status`, `attempt_count`, `next_retry_at`, `last_error`, `priority` | ЗАЧЕМ: без неё '
        + 'не уходит ни одно сообщение пациенту | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D18: 812 строк с payload_json (тела сообщений пациентам) читает терминал персонала любой клиники '
          + 'без принципала.',
    },
    policyRequirement:
      'platform-role сейчас; клиническая стена невозможна ДО backfill: 812 из 812 строк несут '
        + 'organization_id IS NULL (D27/O3) — включение org-стены в лоб отрежет всю доставку.',
    defect: ['D18-outgoing-delivery-queue', 'D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.password_altcha_challenges': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'одноразовые задачи-«капчи» при входе по паролю: `identifier_key`, `purpose`, `challenge_digest`, '
        + '`expires_at`, `consumed_at` | ЗАЧЕМ: без неё вход по паролю открыт для перебора | evidence/14 '
        + 'часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.password_login_identifier_protection': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'защита от перебора по идентификатору: `identifier_key`, `failed_attempts`, `next_allowed_at`, '
        + '`locked_until`, `verification_lease_token`, `leased_user_id` | ЗАЧЕМ: без неё пароль подбирается '
        + 'без ограничений | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.patient_bookings': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'старые записи на приём: `platform_user_id`, `slot_start/end`, `status`, `contact_phone`, '
        + '`contact_email`, `contact_name`, `city`, `category`, снапшоты цены/услуги | ЗАЧЕМ: легаси-таблица '
        + 'записей; без неё теряется история бронирований до перехода на `be_appointments` | evidence/14 '
        + 'часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient: RLS+FORCE. Сегодня off/off и 263 строки контактов читает app_staff без принципала '
        + '(D17). ⚠ 219 из 263 строк с organization_id IS NULL — сперва гейт O3.',
    defect: ['D17-patient-bookings', 'D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.patient_comorbidity': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сопутствующие заболевания: `patient_user_id`, `text`, `since`, `status`, `created_by`, '
        + '`removed_at` | ЗАЧЕМ: без неё врач не видит фон пациента | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_content_rating_feedback': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'оценка материала пациентом: `user_id`, `content_page_id`, `rating_value`, `reason_codes`, '
        + '`comment` | ЗАЧЕМ: без неё нет обратной связи по контенту | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_daily_warmup_presentations': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'какая «разминка дня» показана пациенту: `user_id`, `content_page_id`, `last_rotation_at`, '
        + '`skip_next_scheduled_rotation` | ЗАЧЕМ: без неё не ротируется ежедневный контент — пациент видит '
        + 'одно и то же | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_daily_warmup_video_views': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'просмотры видео-разминки: `user_id`, `content_page_id`, `viewed_at` | ЗАЧЕМ: без неё нет отметки '
        + '«сделал разминку» и админ-статистики | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.patient_diary_day_snapshots': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'слепок дня пациента: `platform_user_id`, `local_date`, `iana`, `warmup_done_count`, '
        + '`plan_item_ids`, `plan_done_mask` | ЗАЧЕМ: без неё дневник и «активность по дням» в карточке '
        + 'пациента пусты | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.patient_files': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'файлы в карте пациента: `patient_user_id`, `category`, `file_name`, `s3_key`, `mime_type`, '
        + '`size_bytes`, `visit_id`, `uploaded_by_user_id` | ЗАЧЕМ: без неё нет медицинских документов в '
        + 'карте и не считается квота хранилища клиники | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_home_block_items': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'элементы блоков: `block_code`, `target_type`, `target_ref`, `title_override`, `badge_label`, '
        + '`is_visible`, `sort_order` | ЗАЧЕМ: без неё блоки пустые | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_home_blocks': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'блоки главной пациента (настройка клиники): `code`, `title`, `description`, `is_visible`, '
        + '`sort_order`, `icon_image_url` | ЗАЧЕМ: без неё главная пациента пустая | evidence/14 часть 3, '
        + 'класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_invites': {
    cls: 'P', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'приглашение пациента в портал: `token_hash`, `invited_email_normalized`, `proof_code_hash`, '
        + '`continuation_hash`, `expires_at`, `recipient_binding` | ЗАЧЕМ: без неё врач не может пригласить '
        + 'пациента в личный кабинет | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_lfk_assignments': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'назначенные пациенту комплексы ЛФК: `patient_user_id`, `template_id`, `complex_id`, `assigned_by`, '
        + '`is_active` | ЗАЧЕМ: без неё пациент не видит назначенных упражнений | evidence/14 часть 3, класс '
        + 'P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_merge_candidates': {
    cls: 'P', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'кандидаты на слияние дублей пациента: `anchor_user_id`, `candidate_user_id`, `reason`, `status`, '
        + '`trigger_appointment_id`, `payload` | ЗАЧЕМ: без неё дубли пациентов не всплывают админу клиники | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_payment': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'платежи пациента: `amount_minor`, `currency`, `kind`, `status`, `service`, `visit_id`, `provider`, '
        + '`provider_payment_id` | ЗАЧЕМ: без неё нет финансовой истории по пациенту | evidence/14 часть 3, '
        + 'класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.patient_practice_completions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'выполненные практики и самочувствие: `user_id`, `content_page_id`, `completed_at`, `feeling`, '
        + '`notes` | ЗАЧЕМ: без неё нет календаря упражнений и трекинга самочувствия | evidence/14 часть 3, '
        + 'класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.patient_specialist_links': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'связь «пациент ↔ специалист»: `organization_id`, `patient_user_id`, `specialist_id`, `status`, '
        + '`created_via`, `ended_reason` | ЗАЧЕМ: это та самая «недоделка» из модели видимости владельца — '
        + 'без неё «свой пациент» невыразим (см. `docs/_TODO/VISIBILITY_MODEL_GAP_2026-08-04.md` §1) | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D24-dev-force-off'],
  },
  'public.phone_challenges': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'SMS-челленджи входа: `phone`, `code` (ОТП в открытом виде), `expires_at`, `channel_context`, '
        + '`verify_attempts` | ЗАЧЕМ: без неё нет входа по телефону и публичной записи на приём | evidence/14 '
        + 'часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.phone_messenger_bind_secrets': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'секреты привязки мессенджера к телефону: `token_hash`, `phone_normalized`, `channel_code`, '
        + '`purpose`, `user_id`, `status`, `expires_at` | ЗАЧЕМ: без неё нельзя привязать Telegram/MAX к '
        + 'аккаунту | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.phone_otp_locks': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'блокировки по телефону после неудачных ОТП: `phone_normalized`, `locked_until`, `lockout_cycle` | '
        + 'ЗАЧЕМ: без неё ОТП перебирается | evidence/14 часть 3, класс S.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.platform_user_contacts': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'дополнительные контакты человека: `platform_user_id`, `contact_type`, `value`, `value_normalized`, '
        + '`source` | ЗАЧЕМ: без неё нет запасных телефонов/почт пациента для связи и дедупликации | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient. D7: в предикате НЕТ ветки current_patient_user_id(), а app_patient держит SELECT, '
        + 'и первый дизъюнкт не требует app.is_staff() — пациент, открывший экран клиники, читает телефоны и '
        + 'почты всех людей этой клиники. Второй дизъюнкт отдельно открывает все строки organization_id IS '
        + 'NULL сессии вообще без принципала.',
    defect: ['D7-platform-user-contacts'],
  },
  'public.platform_users': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'единственная таблица ПДн: `phone_normalized`, `display_name`, `first_name`, `last_name`, `email`, '
        + '`birth_date`, `gender`, `patronymic`, `height_cm`, `weight_kg`, `is_blocked`, `merged_into_id` | '
        + 'ЗАЧЕМ: без неё нет ни одного человека в системе | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {
      app_patient: {
        privs: [{ kind: 'columns', priv: 'UPDATE', columns: ['calendar_timezone', 'reminder_muted_until'] }],
        why:
          'пациент правит СВОИ настройки напоминаний; колоночный грант — живой механизм (FACTS §1.4, '
            + 'evidence/13 §2.5). Табличная проверка без колоночной здесь врёт.',
      },
      app_web_push_reminder_discovery_definer: {
        privs: [{ kind: 'columns', priv: 'SELECT', columns: ['reminder_muted_until'] }],
        why:
          'discovery-шов web-push читает ровно одну колонку, чтобы не будить замьюченных (evidence/13 §2.5).',
      },
    },
    grantMatrix: 'G2-pending',
    revoke: {
      app_identity_bootstrap:
        'D5: политики bootstrap проверяют «кто ты» (pg_has_role ... \'member\') и ничего про строку; весь '
          + 'путь регистрации уезжает в definer-аксессор — рекомендация I15 вариант «в», ровно та форма, что '
          + 'уже применена ко всем остальным таблицам аутентификации (0258_bootstrap_auth_table_accessors.sql).',
      bcb_test_integrator_login:
        'D5/I2: то же; после D5 логин интегратора имеет ровно один вход — definer резолвера.',
      bcb_test_nonstaff_login:
        'D5/I2: табличный SELECT выдан ЛОГИН-роли напрямую — под ним читаются все 278 строк ПДн (доказано '
          + 'исполнением, evidence/14 часть 3). Гранты живут на рантайм-ролях, логин получает права членством.',
    },
    policyRequirement:
      'RLS+FORCE (SCHEME §I Р3 — единственная стена на 278 строк ПДн). Предикат обязан фильтровать '
        + 'СТРОКУ, а не роль.',
    defect: ['D5-identity-bootstrap', 'I2-grant-to-login', 'I15-bootstrap-form'],
    codeMustChange: ['C13'],
  },
  'public.product_analytics_events_recent': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сырые события продукта: `event_type`, `entry_channel`, `page_key`, `user_id`, `client_session_id`, '
        + '`push_tracking_id`, `metadata` | ЗАЧЕМ: без неё нет продуктовой аналитики и воронки регистрации | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_platform_settings:
        'РЕШЕНИЕ D1: политика product_analytics_registration_platform_operations_select даёт кросс-арендное '
          + 'чтение событий регистрации вместе с user_id.',
    },
    codeMustChange: ['C2'],
  },
  'public.product_analytics_hourly': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'агрегат событий по часам (без человека): `bucket_hour`, `event_type`, `entry_channel`, `page_key`, '
        + '`topic_code`, `event_count` | ЗАЧЕМ: без неё нет агрегированных графиков продукта | evidence/14 '
        + 'часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic: RLS+FORCE. Сегодня relrowsecurity=false при pol=1 — политика написана и молча не работает '
        + '(D23, «худший вид зелёного состояния»). ⚠ 5300 из 5421 строк с organization_id IS NULL — сперва '
        + 'гейт O3.',
    defect: ['D23-analytics-policy-inert', 'D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.product_analytics_user_hourly': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'почасовая активность человека: `user_id`, `app_opens`, `page_views`, `push_opens`, '
        + '`active_minutes`, `last_seen_at` | ЗАЧЕМ: без неё врач не видит, заходит ли пациент в приложение | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.product_push_notifications': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'отправленные push’и: `user_id`, `topic_code`, `push_kind`, `warmup_slogan_text`, `title`, '
        + '`open_url` | ЗАЧЕМ: без неё нельзя связать открытие приложения с конкретным push’ем | evidence/14 '
        + 'часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). I5/C18: сырой current_setting в web-push-политике.',
    defect: ['I5-two-org-accessors'],
    codeMustChange: ['C18'],
  },
  'public.program_action_log': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'действия пациента по программе лечения: `instance_id`, `instance_stage_item_id`, '
        + '`patient_user_id`, `action_type`, `payload`, `note` | ЗАЧЕМ: без неё врач не видит, что пациент '
        + 'делал по программе | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.program_item_discussion_messages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'переписка врач↔пациент по пункту программы: `patient_user_id`, `sender_role`, `origin`, `body`, '
        + '`media_file_id` | ЗАЧЕМ: без неё нет комментариев к упражнению — ключевой канал общения | '
        + 'evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.program_item_discussion_reads': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'отметки прочтения обсуждения: `patient_user_id`, `instance_stage_item_id`, `last_read_at` | ЗАЧЕМ: '
        + 'без неё счётчики непрочитанного врут | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.recommendation_regions': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'связь рекомендация↔область тела: `recommendation_id`, `body_region_id` | ЗАЧЕМ: без неё не '
        + 'работают фильтры каталога по области тела | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.recommendations': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'справочник рекомендаций клиники: `title`, `body_md`, `media`, `tags`, `body_region_id`, '
        + '`quantity_text`, `frequency_text`, `domain` | ЗАЧЕМ: без неё врачу нечего назначать | evidence/14 '
        + 'часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.reference_catalog_baselines': {
    cls: 'R', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'версионированные глобальные шаблоны справочников: `version`, `definition_json`, `created_at`. '
        + 'Комментарий таблицы дословно: *«Versioned global templates copied once into a new organization. '
        + 'Existing organization catalogs are never synchronized from this table.»* | ЗАЧЕМ: без неё новая '
        + 'клиника создаётся с пустыми справочниками | evidence/14 часть 3, класс R.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.reference_catalog_snapshot_receipts': {
    cls: 'T', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'расписка «этой клинике справочник уже засеян»: `organization_id`, `baseline_version`, `seeded_at`. '
        + 'Комментарий: *«One immutable baseline-version receipt per organization…»* | ЗАЧЕМ: без неё '
        + 'справочник клиники будет пересеян поверх правок врача | evidence/14 часть 3, класс T.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'reference-org-copy: расписка о том, что копия глобального каталога засеяна ДЛЯ ЭТОЙ организации — '
        + 'механизм решения D3. RLS+FORCE обязателен (D26), но включать надо осознанно: расписку читают '
        + 'ПОЛИТИКИ других таблиц (reference_catalog_seed_owner на reference_categories/reference_items) '
        + 'через EXISTS, и включение меняет поведение засева. Гранты — только владелец засевочного шва '
        + '(app_owner). Закрывает GAP G7: это ИСТИННАЯ org-таблица, а не глобальный справочник со случайной '
        + 'колонкой.',
    defect: ['D26-receipts-no-rls'],
  },
  'public.reference_categories': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'категории справочников клиники: `code`, `title`, `is_user_extensible`, `owner_id`, `tenant_id` | '
        + 'ЗАЧЕМ: без неё пусты все выпадающие списки каталогов | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'reference-org-copy — ЭТАЛОН решения D3: staff по org + reference_catalog_patient_select (org + '
        + 'активный org_enrollments) + reference_catalog_seed_owner для app_owner, живой только пока для этой '
        + 'организации нет расписки.',
  },
  'public.reference_items': {
    cls: 'C', wall: 'reference-org-copy', disposition: 'ACTIVE',
    why:
      'элементы справочников: `category_id`, `code`, `title`, `sort_order`, `is_active`, `meta_json`, '
        + '`deleted_at` | ЗАЧЕМ: то же | evidence/14 часть 3, класс C.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'то же, что reference_categories — эталонная форма решения D3.',
  },
  'public.reminder_delivery_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'события доставки напоминаний из интегратора: `integrator_delivery_log_id`, `integrator_user_id`, '
        + '`channel`, `status`, `error_code`, `payload_json` | ЗАЧЕМ: без неё не видно, дошло ли напоминание, '
        + 'и не считается здоровье конвейера | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient (стена стоит). ⚠ evidence/18 §6: дубль integrator.user_reminder_delivery_logs '
        + '1735/1735 — одна из двух уходит.',
  },
  'public.reminder_journal': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'действия пациента с напоминанием: `rule_id`, `occurrence_id`, `action`, `snooze_until`, '
        + '`skip_reason` | ЗАЧЕМ: без неё пациент не видит истории «отложил/пропустил» | evidence/14 часть 3, '
        + 'класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D27-empty-org-discriminator'],
    ownerGate: ['O3-empty-tenant-discriminator'],
  },
  'public.reminder_occurrence_history': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'история срабатываний напоминаний: `integrator_occurrence_id`, `integrator_user_id`, `category`, '
        + '`status`, `delivery_channel`, `seen_at`, `snoozed_until`, `skip_reason` | ЗАЧЕМ: без неё нет '
        + 'истории напоминаний и статистики соблюдения режима | evidence/14 часть 3, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.reminder_rules': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'правила напоминаний пациенту: `platform_user_id`, `category`, `schedule_type`, `days_mask`, '
        + '`quiet_hours_start_minute`, `custom_text` | ЗАЧЕМ: без неё пациент перестаёт получать напоминания '
        + '| evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    org: true,
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.saas_billing_accounts': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'платёжный профиль клиники: `billing_email`, `legal_name`, `tax_identifier`, `billing_requisites` | '
        + 'ЗАЧЕМ: без неё клиника не выставит счёт | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_billing_invoices': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'счета: `amount_minor`, `currency`, `status`, `provider_checkout_url`, `paid_at`, `tariff_snapshot` '
        + '| ЗАЧЕМ: оплата подписки | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_billing_periods': {
    cls: 'R', wall: 'reference-template', disposition: 'ACTIVE',
    why:
      'справочник периодов оплаты: `code`, `label`, `months`, `is_selectable`, `sort_order` | ЗАЧЕМ: '
        + 'выбор «месяц/год» при оплате | evidence/14 часть 4, класс R.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'reference-template: сегодня закрыто ГРАНТОМ (только app_platform_settings), а не политикой; у '
        + 'справочника того же назначения (saas_tariffs) — RLS+FORCE и четыре read-политики. Без '
        + 'read-политики на экране выбора периода оплаты будет «тихий ноль» (I9).',
    defect: ['D4-role-escalation', 'I9-grant-instead-of-policy'],
  },
  'public.saas_billing_provider_events': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'вебхуки провайдера: `provider_event_id`, `event_type`, `raw_payload`, `processed_at` | ЗАЧЕМ: '
        + 'идемпотентность оплаты | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_billing_refunds': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'возвраты: `amount_minor`, `status`, `provider_refund_ref`, `confirmed_at` | ЗАЧЕМ: возврат денег '
        + 'клинике | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'D13: у клиники нет ни гранта, ни политики — «стена клиники» на возвратах не существует как объект, '
        + 'а единственный путь (глобальная роль) достижим из тенантного рантайма (D4-role-escalation). Нужна '
        + 'пара политик по образцу invoices/subscriptions ЛИБО объявленное решение «возвраты — только '
        + 'платформа» вместе с закрытием эскалации (C16).',
    defect: ['D4-role-escalation', 'D13-billing-refunds'],
  },
  'public.saas_billing_subscriptions': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'подписка клиники: `status`, `lifecycle_state`, `current_period_ends_at`, `grace_ends_at`, '
        + '`autopay_consented_at`, `paid_additional_seats` | ЗАЧЕМ: доступ клиники к продукту | evidence/14 '
        + 'часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_isolation_coverage_runs': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'прогоны покрытия: `status`, `services_checked`, `checks_count`, `unexpected_errors_count`; 14 '
        + 'строк | ЗАЧЕМ: гейт деплоя TEST | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'saas_telemetry_owner',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.saas_isolation_event_hourly': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'почасовая агрегация: `event_id`, `bucket_start`, `occurrence_count`; 39 строк | ЗАЧЕМ: тренд '
        + 'изоляции на экране здоровья | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'saas_telemetry_owner',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.saas_isolation_events': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'события нарушения изоляции: `fingerprint`, `event_class`, `source_service`, `source_operation`, '
        + '`lifecycle_status`, `occurrence_count`; 7 строк | ЗАЧЕМ: без неё платформа не видит собственные '
        + 'утечки | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'saas_telemetry_owner',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.saas_org_entitlement_overrides': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'ручные включения механик клинике: `mechanic`, `enabled`, `seat_limit_override`, `quota`, '
        + '`expires_at` | ЗАЧЕМ: точечная выдача функций клинике | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_organization_trials': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'триал клиники: `started_at`, `ends_at`, `post_trial_behavior`, `discount_ends_at`, `created_by` | '
        + 'ЗАЧЕМ: бесплатный период | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_paid_period_policy': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'поведение после окончания оплаченного периода: `post_paid_period_behavior`, '
        + '`post_paid_period_tariff_id`, `is_active` | ЗАЧЕМ: что происходит с клиникой после неоплаты | '
        + 'evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'platform-role: у двух сестринских таблиц (saas_trial_policy, saas_registration_tariff_policy) '
        + 'RLS+FORCE и политика TO app_platform_settings, у этой — ничего, при 720 отказах permission denied '
        + 'от bcb_test_staff_login (FACTS §1.1, I8). Либо GRANT SELECT + read-политика по образцу '
        + 'saas_tariffs, либо убрать чтение из staff-пути; сейчас поведение «ни то ни сё».',
    defect: ['D4-role-escalation', 'I8-paid-period-denials'],
  },
  'public.saas_registration_tariff_policy': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'тариф по умолчанию при регистрации: `key`, `tariff_id`, `updated_by` | ЗАЧЕМ: на каком тарифе '
        + 'стартует новая клиника | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_tariffs': {
    cls: 'R', wall: 'reference-template', disposition: 'ACTIVE',
    why:
      'тарифы платформы: `name`, `price_minor`, `mechanics`, `quotas`, `included_seats`, '
        + '`system_access_policy`, `downgrade_policies`, `mailing_templates` | ЗАЧЕМ: без него клиника не '
        + 'понимает, что ей доступно | evidence/14 часть 4, класс R.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.saas_trial_policy': {
    cls: 'S', wall: 'platform-role', disposition: 'ACTIVE',
    why:
      'глобальная политика триала: `duration_days`, `start_event`, `post_trial_behavior`, '
        + '`discount_window_days` | ЗАЧЕМ: правило «сколько длится триал» | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['D4-role-escalation'],
  },
  'public.schema_migrations': {
    cls: 'T', wall: 'pending-removal', disposition: 'PENDING_REMOVAL',
    why:
      'журнал миграций integrator: `filename`, `applied_at`; 73 строки | ЗАЧЕМ: без него мигратор '
        + 'перезальёт схему | evidence/14 часть 4, класс T.',
    rls: 'n/a', owner: 'migrator',
    grants: {},
    removal: {
      verdict: 'DUP-DROP',
      source:
        'evidence/18 §4 — 73/73 в public.webapp_schema_migrations, журнал замёрз 2026-04-13, единственный '
          + 'читатель недостижим',
      blockedBy:
        'снять дамп 73 строк; удалить мёртвый drizzle-экспорт schema.ts:3420 и ветку '
          + 'backfillLedgerFromLegacyWebappTable в run-migrations.mjs. ⚠ FINDINGS К5: часть 4 описала эту '
          + 'таблицу как журнал интегратора — это РАЗНЫЕ объекты',
    },
  },
  'public.specialist_signup_intents': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'заявка на создание клиники: `email_normalized`, `specialist_full_name`, `organization_title`, '
        + '`organization_slug`, `provisioned_organization_id` | ЗАЧЕМ: самостоятельная регистрация '
        + 'специалиста | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.specialist_tasks': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'задачи врача по пациенту: `owner_user_id`, `patient_user_id`, `title`, `due_at`, `remind_at`, '
        + '`completed_at` | ЗАЧЕМ: пропадёт список задач врача и напоминания по ним | evidence/14 часть 4, '
        + 'класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.staff_security_profiles': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'второй фактор персонала: `totp_secret_ciphertext`, `recovery_code_hashes`, `session_version`, '
        + '`login_challenge_hash`, `locked_until` | ЗАЧЕМ: 2FA сотрудников | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.support_conversation_messages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сообщения диалога: `text`, `sender_role`, `media_url`, `delivery_status`, `read_at` | ЗАЧЕМ: тело '
        + 'переписки | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.support_conversations': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'диалоги поддержки: `platform_user_id`, `source`, `channel_code`, `status`, `last_message_at`, '
        + '`close_reason` | ЗАЧЕМ: без неё нет переписки врач↔пациент | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.support_delivery_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'журнал доставки сообщений: `channel_code`, `status`, `attempt`, `reason`, `payload_json` | ЗАЧЕМ: '
        + 'без него не видно, дошло ли сообщение | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.support_question_messages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'реплики внутри вопроса: `sender_role`, `text` | ЗАЧЕМ: тело вопроса | evidence/14 часть 4, класс '
        + 'P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.support_questions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'вопросы пациента из бота: `integrator_question_id`, `conversation_id`, `status`, `answered_at` | '
        + 'ЗАЧЕМ: очередь «вопрос из мессенджера → врач» | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.symptom_entries': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'замеры: `value_0_10`, `entry_type`, `recorded_at`, `notes`, `platform_user_id` | ЗАЧЕМ: динамика '
        + 'самочувствия | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.symptom_trackings': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'что пациент отслеживает: `symptom_key`, `symptom_title`, `diagnosis_text`, `region_ref_id`, '
        + '`side`, `platform_user_id` | ЗАЧЕМ: дневник симптомов | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.system_settings': {
    cls: 'S', wall: 'platform-role+clinic', disposition: 'ACTIVE',
    why:
      'настройки платформы и клиники: `key`, `scope`, `value_json`, `updated_by`; 121 из 125 строк с '
        + '`organization_id IS NULL`, среди ключей `telegram_bot_token`, `smsc_api_key`, '
        + '`google_client_secret`, `max_bot_api_key`, `rubitime_api_key`, `vk_id_client_secret`, '
        + '`auth_altcha_hmac_s... | ЗАЧЕМ: без неё не работает ни один внешний канал | evidence/14 часть 4, '
        + 'класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D3: 121 из 125 строк глобальные, среди них 17 секретов платформы (telegram_bot_token, '
          + 'smsc_api_key, google_client_secret, max_bot_api_key, rubitime_api_key, vk_id_client_secret, '
          + 'auth_altcha_hmac_secret ...) — арендной роли на глобальных строках не место ни на чтение, ни на '
          + 'запись.',
    },
    policyRequirement:
      'platform-role+clinic: ветка organization_id IS NULL ОБЯЗАНА проверять роль. Сегодня '
        + 'saas_bootstrap_hybrid_p0_8_6 выдана TO public и её первая ветка безусловна — это и есть механизм '
        + 'дефекта.',
    defect: ['D3-system-settings', 'D4-role-escalation'],
  },
  'public.system_settings_audit': {
    cls: 'S', wall: 'platform-role+clinic', disposition: 'ACTIVE',
    why:
      'история изменений настроек: `key`, `old_value_json`, `new_value_json`, `changed_by`, `source`; 52 '
        + 'строки | ЗАЧЕМ: доказательство «кто менял секрет» | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D3: значения секретов лежат в old_value_json/new_value_json (независимый аудит 28.07 нашёл там '
          + 'vk_id_client_secret открытым — api/admin/settings/route.ts:230), а у app_staff полный CRUD по '
          + 'журналу.',
    },
    policyRequirement:
      'platform-role+clinic; та же безусловная ветка organization_id IS NULL, что и у system_settings — '
        + 'снять.',
    defect: ['D3-system-settings', 'D4-role-escalation'],
  },
  'public.test_attempts': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'попытки прохождения теста: `patient_user_id`, `started_at`, `submitted_at`, `accepted_by` | ЗАЧЕМ: '
        + 'пациент не сможет сдать тест | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'РЕШЕНИЕ D2: пациентская ветка обязана резолвиться ЧЕРЕЗ ПРОГРАММУ — '
        + 'test_attempts.instance_stage_item_id -> treatment_program_instance_stage_items -> '
        + 'treatment_program_instances.patient_user_id, а не по плоской колонке patient_user_id. «Пациент '
        + 'видит ТОЛЬКО тесты, добавленные в его программу».',
    codeMustChange: ['C14'],
  },
  'public.test_results': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'результат попытки: `raw_value`, `normalized_decision`, `decided_by` | ЗАЧЕМ: оценка теста | '
        + 'evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'РЕШЕНИЕ D2: пациентская ветка — только через test_attempts, привязанную к элементу его программы '
        + '(см. test_attempts).',
    codeMustChange: ['C14'],
  },
  'public.test_set_items': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'состав набора: `test_set_id`, `test_id`, `sort_order`, `comment` | ЗАЧЕМ: наполнение набора | '
        + 'evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.test_sets': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'наборы тестов: `title`, `publication_status`, `is_archived`, `created_by` | ЗАЧЕМ: пакетное '
        + 'назначение тестов | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.tests': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'каталог клинических тестов клиники: `title`, `test_type`, `scoring`, `assessment_kind`, '
        + '`body_region_id`, `media` | ЗАЧЕМ: без него врач не назначит тест | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_events': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'журнал изменений программы: `actor_id`, `event_type`, `target_type`, `payload`, `reason` | ЗАЧЕМ: '
        + 'аудит «кто что менял в лечении» | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_instance_stage_groups': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'группы внутри этапа: `title`, `schedule_text`, `system_kind` | ЗАЧЕМ: группировка заданий | '
        + 'evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_instance_stage_items': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сами задания: `item_type`, `snapshot`, `settings`, `completed_at`, `last_viewed_at`, `status` | '
        + 'ЗАЧЕМ: что пациент делает каждый день | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_instance_stages': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'этапы программы: `title`, `goals`, `objectives`, `status`, `skip_reason`, `started_at` | ЗАЧЕМ: '
        + 'шаги лечения | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_instances': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'назначенная пациенту программа: `patient_user_id`, `template_id`, `assigned_by`, `status`, '
        + '`assignment_source` | ЗАЧЕМ: ядро лечения — без неё нет программы | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_template_stage_groups': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'группы в этапе шаблона: `title`, `schedule_text`, `system_kind` | ЗАЧЕМ: группировка в шаблоне | '
        + 'evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_template_stage_items': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'задания шаблона: `item_type`, `item_ref_id`, `settings`, `comment` | ЗАЧЕМ: содержимое шаблона | '
        + 'evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_template_stages': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'этапы шаблона: `title`, `goals`, `objectives`, `expected_duration_days` | ЗАЧЕМ: структура шаблона '
        + '| evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.treatment_program_templates': {
    cls: 'C', wall: 'clinic', disposition: 'ACTIVE',
    why:
      'шаблоны программ лечения: `title`, `status`, `created_by` | ЗАЧЕМ: без них нечего назначать '
        + 'пациенту | evidence/14 часть 4, класс C.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
  },
  'public.user_channel_bindings': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'привязка мессенджера: `user_id`, `channel_code`, `external_id`, `bot_blocked_at`; 131 строка | '
        + 'ЗАЧЕМ: вход через Telegram/MAX и рассылки | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'D20: у таблицы нет organization_id, RLS выключен, политик ноль — сотрудник любой клиники читает и '
          + 'правит external_id мессенджеров всех 131 привязки платформы.',
    },
    policyRequirement:
      'clinic+patient: RLS+FORCE и ветка «свой пациент» по user_id. Сегодня app_patient=r без единой '
        + 'политики — любой пациент читает прямые идентификаторы всех людей в Telegram/MAX.',
    defect: ['D20-notification-tables'],
  },
  'public.user_channel_preferences': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'согласия по каналам: `channel_code`, `is_enabled_for_messages`, `is_enabled_for_notifications`, '
        + '`is_preferred_for_auth`; 122 строки | ЗАЧЕМ: по какому каналу писать пациенту | evidence/14 часть '
        + '4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient: RLS+FORCE. D20: политика c4_web_push_reminder_user в каталоге ЕСТЬ, но '
        + 'relrowsecurity=false — PostgreSQL её не применяет. Это опаснее отсутствия политики: перепись по '
        + 'pol=N показывает «стена есть», а её нет.',
    defect: ['D20-notification-tables'],
  },
  'public.user_contacts': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'сводный индекс контактов: `platform_user_id`, `contact_kind`, `value_normalized`, `is_primary`, '
        + '`confirmed_at`, `source_origin`; 444 строки телефонов/почт | ЗАЧЕМ: вход по почте/телефону и поиск '
        + 'пациента | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_identity_bootstrap:
        'D5: предикат обязан фильтровать строку; bootstrap уезжает в definer (I15).',
    },
    policyRequirement:
      'clinic+patient. D2-user-contacts-write: политики UPDATE/DELETE/INSERT для staff несут предикат '
        + 'ровно app.is_staff() — БЕЗ organization_id, при том что соседняя _staff_org_select полностью '
        + 'org-скоуплена, а PERMISSIVE-политики объединяются по OR. Подмена value_normalized = '
        + 'перенаправление входа на чужой аккаунт (444 строки). D5: политики *_identity_bootstrap_* фильтруют '
        + 'роль, а не строку.',
    defect: ['D2-user-contacts-write', 'D5-identity-bootstrap'],
    ownerGate: ['O5-user-identity-cutover'],
  },
  'public.user_email_setup_tokens': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'одноразовые токены установки пароля: `token_hash`, `email_normalized`, `expires_at`, `used_at`, '
        + '`revoked_at`; 29 строк | ЗАЧЕМ: приглашение «задайте пароль» | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.user_identity': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'ФИО и дата рождения: `first_name`, `last_name`, `patronymic`, `display_name`, `birth_date`; 237 '
        + 'строк | ЗАЧЕМ: имя пациента во всех экранах | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    org: false,
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_identity_bootstrap:
        'D5: тот же дефект — «кто ты» вместо «какая строка».',
    },
    policyRequirement:
      'clinic+patient. D6: user_identity_staff_insert несёт WITH CHECK (app.is_staff()) без org — '
        + 'сотрудник любой клиники заводит строку идентичности на произвольный platform_user_id. D5: политики '
        + '*_identity_bootstrap_* фильтруют роль, а не строку.',
    defect: ['D5-identity-bootstrap', 'D6-user-identity-insert'],
    ownerGate: ['O5-user-identity-cutover'],
  },
  'public.user_notification_topic_channels': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'тема × канал: `topic_code`, `channel_code`, `is_enabled`; 290 строк | ЗАЧЕМ: тонкая настройка '
        + 'уведомлений | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient: RLS+FORCE. D20: инертная политика при выключенном RLS.',
    defect: ['D20-notification-tables'],
  },
  'public.user_notification_topics': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'подписки на темы: `user_id`, `topic_code`, `is_enabled`; 349 строк | ЗАЧЕМ: пациент перестанет '
        + 'управлять уведомлениями | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient: RLS+FORCE + ветка своего пациента. D20: app_patient=arw без единой политики — '
        + 'пациент правит чужие подписки на уведомления (349 строк).',
    defect: ['D20-notification-tables'],
  },
  'public.user_oauth_bindings': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'привязки соцвходов: `provider`, `provider_user_id`, `email`; 14 строк | ЗАЧЕМ: вход через '
        + 'Google/VK/Яндекс | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.user_passkey_accounts': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      '`user_handle` для WebAuthn | ЗАЧЕМ: вход по passkey | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.user_passkey_challenges': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'вызовы WebAuthn: `challenge`, `expected_origin`, `rp_id`, `expires_at`, `consumed_at` | ЗАЧЕМ: '
        + 'защита от повтора | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.user_passkey_credentials': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'ключи: `credential_id`, `public_key`, `counter`, `transports`, `backed_up` | ЗАЧЕМ: сам вход по '
        + 'passkey | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    defect: ['I1-definer-plus-force'],
  },
  'public.user_password_credentials': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'хэши паролей: `password_hash`, `algo`, `failed_attempts`, `locked_until`, '
        + '`verification_lease_token`; 26 строк | ЗАЧЕМ: вход по паролю | evidence/14 часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.user_phone_history': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'история телефонов: `phone_normalized`, `valid_from`, `valid_to`, `source`, `confirming_channel`; '
        + '92 строки | ЗАЧЕМ: смена номера и поиск по старому номеру | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      bcb_test_nonstaff_login:
        'I2: табличный грант arw выдан ЛОГИН-роли напрямую, минуя рантайм-роль.',
    },
    policyRequirement:
      'clinic+patient. D8: единственная политика несёт ТОЛЬКО org-ветку, а app_patient держит SELECT — '
        + 'пациент с принципалом своей организации видит историю телефонов всех 92 записей этой организации, '
        + 'а не свою. Нужна ветка «свой пациент».',
    defect: ['D8-user-phone-history', 'I2-grant-to-login'],
  },
  'public.user_pins': {
    cls: 'S', wall: 'definer-only', disposition: 'ACTIVE',
    why:
      'ПИН-коды: `pin_hash`, `attempts_failed`, `locked_until` | ЗАЧЕМ: быстрый вход по ПИН | evidence/14 '
        + 'часть 4, класс S.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    revoke: {
      app_staff:
        'FINDINGS D1: прямой табличный грант арендной роли в обход definer-шва — терминал персонала ЛЮБОЙ '
          + 'клиники читает и перезаписывает секреты входа ВСЕХ пользователей платформы. Это не утечка чтения, '
          + 'это захват учётной записи. Правильная форма уже есть в базе: staff_security_profiles и три '
          + 'user_passkey_* лежат в том же шве и не имеют НИ ОДНОГО гранта рантайм-ролям.',
    },
    policyRequirement:
      'definer-only: ноль грантов рантайм-ролям, штатный путь — перечисленные definer-аксессоры app.* '
        + '(владелец app_owner); RLS+FORCE сверху как backstop (FINDINGS I1: стена только грантом держится '
        + 'ровно до дня, когда грант однажды выдали, — и здесь таких таблиц тринадцать).',
    defect: ['D1-auth-tables'],
    codeMustChange: ['C13'],
  },
  'public.user_web_push_subscriptions': {
    cls: 'P', wall: 'clinic+patient', disposition: 'ACTIVE',
    why:
      'push-подписки браузера: `endpoint`, `p256dh`, `auth`, `user_agent`; 34 строки | ЗАЧЕМ: без неё нет '
        + 'web-push | evidence/14 часть 4, класс P.',
    rls: 'force', owner: 'migrator',
    grants: {},
    grantMatrix: 'G2-pending',
    policyRequirement:
      'clinic+patient: RLS+FORCE. D20: у app_patient полный arwd (в том числе DELETE) при инертной '
        + 'политике — пациент удаляет чужие push-подписки.',
    defect: ['D20-notification-tables'],
  },
  'public.webapp_schema_migrations': {
    cls: 'T', wall: 'closed', disposition: 'ACTIVE',
    why:
      'журнал миграций webapp: `filename`, `applied_at`; 89 строк | ЗАЧЕМ: то же для webapp | evidence/14 '
        + 'часть 4, класс T.',
    rls: 'off', owner: 'migrator',
    rlsWhy:
      'ЯВНО объявленное отсутствие RLS (SCHEME §A.4: \'off\' — объявленное отсутствие, а не молчание). '
        + 'Журнал мигратора читает и пишет сам мигратор, в том числе ВНЕ окна элевации (шаг 0 цепочки сверяет '
        + 'max(created_at) против watermark), а FORCE RLS без политики закрыл бы таблицу и от её владельца — '
        + 'цепочка деплоя перестала бы работать. Стена здесь — НУЛЕВОЙ грант рантайм-ролям: ACL пуст, кроме '
        + 'владельца.',
    grants: {},
    grantMatrix: 'G2-pending',
  },
};

/* ============================================================================================
 * SECTION 6 — DATABASE: bersoncarebot_test (managed)
 * ========================================================================================== */

const db_bersoncarebot_test: DatabaseDecl = {
  database: {
    owner: 'bersoncarebot_test', // datdba (evidence/13 §3.5)
    connect: [ // TARGET: explicit CONNECT after the PUBLIC revoke (§D.1); rendered from envMapping
      'bersoncarebot_test', 'bcb_test_integrator_login', 'bcb_test_nonstaff_login',
      'bcb_test_staff_login', 'bcb_test_worker_login', 'bcb_test_maintenance_login',
      'bcb_test_operational_delivery_login', 'bcb_test_operational_diagnostic_login',
      'bcb_test_operational_media_login', 'bcb_test_operational_scheduler_login',
      'bcb_test_operational_web_push_reminder_login', 'bcb_saas_operator_test', 'bcb_saas_diag_test',
      'app_operational_web_push_reminder', // evidence/13 §1.1: datacl grants CONNECT to this ROLE directly
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc — §D.1 REVOKE not applied
    note: 'evidence/13 §1.1: живой datacl = PUBLIC=Tc, owner=CTc, app_operational_web_push_reminder=c, '
      + 'bcb_saas_operator_test=c. Цель: снять PUBLIC, оставить явных грантополучателей. Пока PUBLIC CONNECT '
      + 'стоит, юрисдикционная проверка §F/№8 неперечислима — любая роль кластера имеет путь доступа.',
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ evidence/13 §2.1 — PUBLIC USAGE on app; §D.2 REVOKE target
        'app_staff', 'app_patient', 'bersoncarebot_test', 'app_platform_settings',
        'bcb_test_nonstaff_login', 'app_worker', 'bcb_test_integrator_login',
        'saas_telemetry_operator', 'saas_system_health_owner', 'app_clinic_billing',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_diagnostic',
        'app_operational_delivery_worker', 'app_operational_scheduler', 'app_operational_media_worker',
        'bcb_test_operational_diagnostic_login', 'bcb_test_operational_delivery_login',
        'bcb_test_operational_scheduler_login', 'bcb_test_operational_media_login',
        'app_integrator_resolver', // NEW (D5): needs USAGE to reach its one definer accessor
        'app_operational_maintenance', // NEW (D8): needs USAGE to reach app.prune_context_nonce_ledger
      ],
      create: ['app_owner'],
      publicDefect: true,
      why: 'схемный USAGE — первый рубеж 42501 (evidence/12 §1).',
    },
    app_ext: {
      owner: 'postgres', present: true, // RESOLVED G5: canonical owner = postgres on BOTH dbs (§C)
      usage: ['app_owner'], create: ['postgres'],
      why: 'pgcrypto-шов (app_ext.hmac, p2-b:94). evidence/13 §2.1: postgres=UC, app_owner=U.',
    },
    drizzle: {
      owner: 'bersoncarebot_test', present: true,
      usage: ['bersoncarebot_test'], create: ['bersoncarebot_test'],
      why: 'журнал мигратора; рантайм-ролям закрыт.',
    },
    integrator: {
      owner: 'bersoncarebot_test', present: true,
      usage: [ // evidence/13 §2.1 — TEST grants diagnostic/delivery/scheduler (differs from dev)
        'bersoncarebot_test', 'app_staff', 'app_patient', 'bcb_test_integrator_login', 'app_owner',
        'app_operational_diagnostic', 'app_operational_delivery_worker', 'app_operational_scheduler',
      ],
      create: ['bersoncarebot_test'],
      why: '⚠ USAGE у app_staff/app_patient переживёт волны сноса evidence/15 только в той части, где '
        + 'останутся живые таблицы (9 из 20); после волн 0-3 список пересматривается.',
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ PUBLIC USAGE — §D.2 REVOKE target (обе базы)
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'bcb_test_integrator_login',
        'bcb_test_nonstaff_login', 'app_clinic_billing', 'app_web_push_reminder_discovery_definer',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_delivery_worker',
        'app_operational_media_worker', 'app_operational_scheduler',
        'app_operational_maintenance', // NEW (D8): journals being pruned live in public
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ evidence/13 §2.5: absent on both — the wall is NOT installed
      usage: [], create: ['postgres'],
      why: 'схема стены (org_table_allowlist, privileges_watermark, ddl_wall_log). Строится '
        + 'wall-install каждым деплоем (SCHEME §B шаг 3); закрыта от рантайм-ролей.',
    },
  },

  tables: APP_TABLES,

  sequences: {
    rule: 'A role with INSERT/UPDATE on a table gets USAGE(+SELECT) on that table\'s *_id_seq '
      + '(serial DEFAULT needs USAGE; SCHEME §A.4). Exceptions as explicit sequence entries. '
      + 'Consequence of the revokes above: every sequence USAGE granted to a role that loses its table '
      + 'grant goes with it — a leftover sequence grant is a §F red.',
    examples: { // evidence/13 §2.5 (confirmed)
      'public.integrator_push_outbox_id_seq': { app_staff: ['USAGE', 'SELECT'] },
      'public.be_patient_packages_display_number_seq': { app_staff: ['USAGE', 'SELECT'] },
    },
  },

  functionsViews: {
    default: 'No default EXECUTE; wall-install §D.5 strips materialized PUBLIC EXECUTE. Non-definer '
      + 'function/view EXECUTE only where listed. Views MUST carry security_invoker (§G.6) — a definer '
      + 'view sees other tenants\' rows (FACTS §4).',
    views: { todo: 'TODO(census-gap): views/security_invoker not enumerated for this db' },
  },

  types: {},

  definerExceptions: {
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  creators: ['postgres', 'bersoncarebot_test', 'app_owner', 'saas_telemetry_owner',
    'saas_system_health_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // the org tables the census named as DEFECTIVE (RLS or FORCE missing) — evidence/13 §2.3
      'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts', // GAP G7 — RESOLVED: true org table
      // ⚠ public.appointment_records НЕ в списке НАМЕРЕННО: она PENDING_REMOVAL (evidence/18 §7),
      //    а таблица под снос стен не получает — иначе стена ставится на копию, которая уезжает.
    ],
    fullCountLive: 172, // evidence/13 §2.3
    todo: 'Derived set: 116 of the 239 classified tables declare org: true (the classification stated the '
      + 'flag for those). The live count is 172 org tables, and 307 relations exist in total (FACTS §1.6) — '
      + 'the difference is GAP G2 (per-table ACL/flags not enumerated) + GAP G10 (coverage of the '
      + 'classification itself). ⚠ The wall does NOT depend on this list: decision D7 walls by declared '
      + 'CLASS, and every one of the 239 tables carries one. The allowlist only feeds the event trigger §E.',
  },

  dbSettings: {
    datdba: 'bersoncarebot_test', // evidence/13 §3.5
    perRoleInDatabase: {}, // evidence/13 §3.4: no setdatabase≠0 row for this db
  },
};

/* ============================================================================================
 * SECTION 7 — DATABASE: bcb_webapp_dev (managed). DIFFERS from TEST (evidence/13 §2.2).
 *   The table set is the same schema, so it is reused; the per-db deltas the census actually
 *   measured are declared explicitly below.
 * ========================================================================================== */

/** dev-only deltas over APP_TABLES (evidence/13 §2.3, FINDINGS Д24). */
const DEV_TABLE_DELTAS: Record<string, TableDecl> = {
  'public.patient_specialist_links': {
    ...(APP_TABLES['public.patient_specialist_links'] as TableDecl),
    rls: 'force', // TARGET on both dbs
    drift: 'DEV-ONLY ДЕФЕКТ (FINDINGS Д24, evidence/13 §2.3): на dev relrowsecurity=t, '
      + 'relforcerowsecurity=f — владелец таблицы обходит политику. На TEST t/t, чисто. Вывод части 3, '
      + 'совпадающий со SCHEME §A: управляемые базы расходятся по набору дефектов, поэтому раздел на базу '
      + 'обязателен. GAP G7 закрыт: таблица связывает пациента со специалистом ВНУТРИ организации → org: true.',
  },
};

const db_bcb_webapp_dev: DatabaseDecl = {
  database: {
    owner: 'bcb_webapp_dev_user', // datdba (evidence/13 §3.5)
    connect: [
      'bcb_webapp_dev_user', 'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login',
      'bcb_saas_operator_dev',
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc
    note: 'evidence/13 §1.1: datacl = PUBLIC=Tc, owner=CTc, bcb_saas_operator_dev=c. Цель снимает PUBLIC.',
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [ // evidence/13 §2.2 — NO PUBLIC USAGE here (differs from TEST)
        'app_staff', 'app_patient', 'bcb_webapp_dev_user', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login', 'app_identity_bootstrap',
        'app_operational_delivery_worker', 'app_worker', 'saas_telemetry_operator',
        'saas_system_health_owner',
        'app_integrator_resolver', 'app_operational_maintenance', // NEW roles (D5/D8)
      ],
      create: ['app_owner'],
    },
    app_ext: {
      owner: 'postgres', // TARGET (G5 RESOLVED: canonical owner is postgres on both dbs, §C)
      present: true,
      usage: ['app_owner'], create: ['postgres'],
      ownerDrift: 'LIVE dev owner = bcb_webapp_dev_user (evidence/13 §2.2: bcb_webapp_dev_user=UC, '
        + 'app_owner=U). Приводится к postgres: extension-шов принадлежит суперпользователю (§C), TEST уже так.',
    },
    drizzle: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: ['bcb_webapp_dev_user'], create: ['bcb_webapp_dev_user'],
      why: 'evidence/13 §2.2: nspacl null (owner-only)',
    },
    integrator: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: [ // evidence/13 §2.2 — dev grants ONLY delivery among operational (TEST also diag/scheduler)
        'bcb_webapp_dev_user', 'app_staff', 'app_patient', 'app_owner', 'app_operational_delivery_worker',
      ],
      create: ['bcb_webapp_dev_user'],
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [ // evidence/13 §2.2
        '=PUBLIC',
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'app_identity_bootstrap',
        'app_operational_maintenance',
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ absent on dev too (evidence/13 §2.5)
      usage: [], create: ['postgres'],
      why: 'схема стены; строится цепочкой migrate-dev.sh (SCHEME §B, dev в контуре — §I Р1).',
    },
  },

  tables: { ...APP_TABLES, ...DEV_TABLE_DELTAS },

  sequences: {
    rule: 'Same rule as TEST (SCHEME §A.4). Per-db sequence ACLs not separately enumerated for dev.',
    examples: {},
  },

  functionsViews: {
    default: 'Same policy as TEST (§A.5): no default EXECUTE; views need security_invoker.',
    views: { todo: 'TODO(census-gap): views/security_invoker not enumerated for dev' },
  },

  types: {},

  definerExceptions: {
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  creators: ['postgres', 'bcb_webapp_dev_user', 'app_owner', 'saas_telemetry_owner',
    'saas_system_health_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // dev's defect org tables (evidence/13 §2.3), minus the one under removal
      'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts',
      'public.patient_specialist_links', // ⚠ dev-only: RLS on, FORCE off (D24-dev-force-off)
      // ⚠ public.appointment_records — PENDING_REMOVAL, см. комментарий в TEST-разделе.
    ],
    fullCountLive: 172,
    todo: 'TODO(census-gap G2): the dev org-table total was not counted separately (the census counted '
      + 'defects only for dev); ≈TEST is an assumption, not a measurement.',
  },

  dbSettings: {
    datdba: 'bcb_webapp_dev_user', // evidence/13 §3.5
    perRoleInDatabase: {
      // ⚠ НЕСУЩАЯ строка (SCHEME §A.10), НЕ дефект: role-level rolconfig dev-мигратора обязан быть NULL
      //    (dev-c0-runtime-logins.sql:130-137), поэтому (логин,база) — структурно единственный дом для его
      //    search_path. Байтово, включая пробел после запятой (evidence/13 §3.4; §F сравнивает байтово).
      bcb_webapp_dev_user: ['search_path=public, integrator'],
    },
  },
};

/* ============================================================================================
 * ASSEMBLY
 * ========================================================================================== */

export const declaration: PrivilegeDeclaration = {
  ownerDecisions: OWNER_DECISIONS,
  acceptanceInvariant: ACCEPTANCE_INVARIANT,
  platformRoleScope: PLATFORM_ROLE_SCOPE,
  patientVisibility: PATIENT_VISIBILITY,
  referenceModel: REFERENCE_MODEL,
  ports: PORTS,
  wallTemplates: WALL_TEMPLATES,
  codeMustChange: CODE_MUST_CHANGE,
  ownerGatesOpen: OWNER_GATES_OPEN,
  cluster: {
    envs: ['test', 'dev'], // TEST + dev on one shared PG16 :5432 (SCHEME §A); prod out of scope
    roles,
  },
  envMapping,
  databases: {
    bersoncarebot_test: db_bersoncarebot_test,
    bcb_webapp_dev: db_bcb_webapp_dev,
  },
};

/* ============================================================================================
 * SELF-DESCRIPTION — counted from the declaration itself, so the numbers cannot drift from it.
 * ========================================================================================== */

const allTables: TableDecl[] = Object.keys(APP_TABLES).map(
  (k: string): TableDecl => APP_TABLES[k] as TableDecl,
);

function countBy(pick: (t: TableDecl) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  allTables.forEach((t: TableDecl): void => {
    const key = pick(t);
    acc[key] = (acc[key] ?? 0) + 1;
  });
  return acc;
}

export const DECLARATION_STATS = {
  tablesClassified: allTables.length,
  withClassAndWall: allTables.filter((t: TableDecl) => t.disposition === 'ACTIVE').length,
  pendingRemoval: allTables.filter((t: TableDecl) => t.disposition === 'PENDING_REMOVAL').length,
  byClass: countBy((t: TableDecl): string => t.cls),
  byWall: countBy((t: TableDecl): string => t.wall),
  orgTablesDeclared: allTables.filter((t: TableDecl) => t.org === true).length,
  tablesWithRevokes: allTables.filter((t: TableDecl) => t.revoke !== undefined).length,
  codeChanges: CODE_MUST_CHANGE.length,
  openOwnerGates: OWNER_GATES_OPEN.length,
  /** the gaps still open at the top of this file */
  openGaps: ['G1', 'G2', 'G3', 'G8', 'G9', 'G10', 'G11'],
  resolvedGaps: ['G4', 'G5', 'G6', 'G7'],
} as const;

export default declaration;
