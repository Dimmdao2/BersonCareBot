/**
 * declaration.ts — DB privilege-layer DECLARATION (single source of truth for privileges).
 *
 * ⚠️ DRAFT (Ф2.2). NOT wired into any deploy. NOT applied. No generator (Ф2.3) consumes it yet.
 *    Nothing here has run any DDL/DML/GRANT/REVOKE. It is a typed transcription of the LIVE
 *    census (evidence/13-f2-census.md, read-only, 2026-08-08) minus known defects (SCHEME §H.1
 *    "снятое состояние минус дефекты"), shaped per SCHEME §A (ten sections) and reconcilable per
 *    SCHEME §F (every field declared here has a catalog side the two-way diff can compare against).
 *
 * Provenance rule (SCHEME discipline, FACTS §0): every value below traces to the census
 *   (cited as `evidence/13 §N`) or to repo code (`file:line`). No invented literals — a guessed
 *   proconfig/grant is a byte-level false-red under §F and already cost 3 review rounds.
 *
 * Refuted approaches NOT reintroduced (FACTS §9): capability-only as norm (§9.4), "always throw"
 *   (§9.2), AST analysis (§9.3), EXPLAIN-proofs (§4). definer functions are ENUMERATED EXCEPTIONS,
 *   not a design (SCHEME §A.7).
 *
 * Scoping (SCHEME §A): `cluster` (roles + scope) is CLUSTER-level; `databases.<db>` (schemas,
 *   tables, functions, types, definerExceptions, creators, orgTableAllowlist, dbSettings) is
 *   per-database. The two managed DBs (bersoncarebot_test, bcb_webapp_dev) DIFFER — both are
 *   encoded truthfully. Login records live in `envMapping` (SCHEME §A.1), not in `cluster.roles`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * // GAPS — census gaps this file could NOT resolve (input to Ф2.3 generator + owner triage).
 *   Each maps to evidence/13 §6 (the census's own open-questions list). Search `TODO(census-gap)`
 *   and `TODO(owner?)` in-file for the exact sites.
 *
 *   G1. Exact list of the 11 tenant-bypassable roles (FACTS §1.5 "11 строк"). The SET ROLE ×
 *       principal sweep of 1892 cells was NOT re-run (heavy, out of read-only census; evidence/13
 *       §6.1). Every role in `cluster.roles` still carries a `scope`, but the canonical 11-row
 *       visibility set §H.5 renders against is unconfirmed. One scope left `TODO(owner?)` below.
 *   G2. Full per-table grant matrix (~235 app tables). Census enumerated ACLs for only a handful
 *       of representative tables (be_appointments, be_organization_members, platform_users +
 *       sample sequences; evidence/13 §2.5). `tables` below carries exactly those; the remainder
 *       is `TODO(census-gap)` — the full Ф2 census fills it, this draft must not guess (§F byte-red).
 *   G3. Which of the 38 migrator-owned + 1 app_platform_settings-owned definer functions are
 *       INTENTIONALLY non-app_owner vs ownership drift (evidence/13 §3.2, §6.3). Only 1 of the 38
 *       is named in the census (app.read_outbound_provider_incident_health). The other 37 names,
 *       and the exact names of the 7 saas_telemetry_owner / 4 saas_system_health_owner intentional
 *       owners, are `TODO(census-gap)`.
 *   G4. NOINHERIT drift: bcb_test_staff_login, bcb_test_worker_login, bcb_webapp_dev_user carry
 *       rolinherit=t against SCHEME §A.1 pin NOINHERIT (evidence/13 §1.2, §6.4). Pinned to LIVE
 *       value here (inherit:true) with the divergence flagged; reconciliation (bring-to-NOINHERIT
 *       vs declare-exception) is `TODO(census-gap)`.
 *   G5. app_ext schema owner differs per db: TEST=postgres, dev=bcb_webapp_dev_user (evidence/13
 *       §2.1/§2.2/§6.5). Both encoded truthfully; canonical dev owner is `TODO(census-gap)`.
 *   G6. platform_users Ф6 red baseline: now RLS+FORCE (drift, evidence/13 §2.4/§6.6); red→green
 *       proof needs a red start (a0 snapshot vs temporary RLS-off). Declared target rls:'force'
 *       (§I R3); baseline choice is an owner gate at Ч1.3, not a declaration value.
 *   G7. Classification of reference_catalog_snapshot_receipts (both dbs) and dev-only
 *       patient_specialist_links: true org tables vs false-positive (global catalog with an
 *       incidental organization_id column) — evidence/13 §6.7. Declared org:true here (they carry
 *       organization_id, evidence/13 §2.3) so the wall admits them once RLS lands; `TODO(owner?)`
 *       if a later pass proves one is a global reference table.
 *   G8. Nine policies on platform_users + the 4 on admin_audit_log etc. — names/bodies not
 *       enumerated in census (evidence/13 §2.4). `policies` references are `TODO(census-gap)`.
 *   G9. Exact env-secret variable names + per-login CONNECT/VALID UNTIL/conn-limit are not in a
 *       read-only catalog census (they live in the deploy secret store). `passwordEnv` values are
 *       convention placeholders marked `TODO(census-gap)` — NEVER literals (SCHEME §A.1).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================================
 * SECTION 0 — TYPES (SCHEME §A grammar; closed enumerations so the compiler catches typos)
 * ========================================================================================== */

/** SCHEME §A.2 — one scope per role of section 1. */
export type Scope = 'ORG' | 'OWN' | 'GLOBAL' | 'NONE';

/** SCHEME §A.1 — closed role grammar. `service` = infra cluster roles (marker app_migration_phase §E). */
export type RoleKind = 'terminal' | 'capability' | 'owner' | 'service' | 'operator' | 'superuser';

/** SCHEME §A.4 — RLS mode grammar. 'force'=RLS+FORCE (org tables MUST), 'on'=RLS w/o FORCE
 *  (only with a justification string), 'off'=explicitly declared absence (not silence). */
export type RlsMode = 'force' | 'on' | 'off';

export type Privilege =
  | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  | 'REFERENCES' | 'TRIGGER' | 'TRUNCATE';

/** A column-scoped grant (SCHEME §A.4 — app_patient holds UPDATE(calendar_timezone,…) on
 *  platform_users, FACTS §1.4; table-only checks lie without this). */
export interface ColumnGrant {
  kind: 'columns';
  priv: Privilege;
  columns: string[];
}

/** A table/sequence grant target: either whole-table privileges or column-scoped grants.
 *  `grantable` defaults false and that default IS part of the expected side (SCHEME §A.4,
 *  c5a:1300 compares is_grantable). */
export type GrantSet = Array<Privilege | ColumnGrant>;

/** Membership on the GRANTED side (grantee → this role), options per pg_auth_members
 *  (admin_option/inherit_option/set_option). Mirrors SCHEME §A.1 example `grantedTo`. */
export interface Membership {
  role: string;
  admin: boolean;
  inherit: boolean;
  set: boolean;
}

export interface RoleDecl {
  kind: RoleKind;
  scope: Scope;
  /** pinned pg_roles attributes (SCHEME §A.1 / §F rolcanlogin·rolsuper·rolbypassrls·rolinherit·rolcreaterole) */
  login: boolean;
  superuser: boolean;
  bypassrls: boolean;
  inherit: boolean;
  createrole: boolean;
  /** role-level rolconfig (setdatabase=0). Canonical NOLOGIN roles: null. */
  rolconfig: string[] | null;
  /** roles/logins granted THIS role, with options. Login members live in envMapping, not here. */
  grantedTo?: Membership[];
  /** owner/service roles: assert zero members in steady state (SCHEME §C, §E). */
  members?: string[];
  why?: string;
}

/** SCHEME §A.1 — a per-env login record (the env-dependent truth; lives in env/<env>.json). */
export interface LoginRecord {
  /** canonical role this login is a member of (with options); null = no canonical membership. */
  canonicalRole: string | null;
  membership?: Membership; // the pg_auth_members options for canonicalRole
  login: true;
  superuser: false;
  bypassrls: false;
  createrole: false;
  inherit: boolean; // pinned; SCHEME §A.1 wants NOINHERIT — drift flagged (GAP G4)
  /** env-secret VARIABLE NAME, never a literal password (SCHEME §A.1). */
  passwordEnv: string;
  /** role-level rolconfig (setdatabase=0). SCHEME §A.1 default NULL; exceptions explicit. */
  rolconfig: string[] | null;
  /** managed db(s) this login may CONNECT to (SCHEME §D.1 — explicit CONNECT after PUBLIC revoke). */
  connect: string[];
  validUntil?: string | null; // pinned; default: not set
  connectionLimit?: number | null; // pinned; default: not set (-1)
  why?: string;
}

export interface SchemaDecl {
  owner: string;
  /** USAGE grantees (roles/logins; '=PUBLIC' encodes a PUBLIC USAGE ACL entry). */
  usage: string[];
  /** CREATE grantees (SCHEME §A.3 — CREATE only to owners/creators §C). */
  create: string[];
  /** true where the census recorded a PUBLIC USAGE/CREATE entry that §D.2 REVOKE must remove. */
  publicDefect?: boolean;
  present: boolean; // false = declared target but absent in live catalog (e.g. app_control)
  why?: string;
}

export interface PolicyDecl {
  name: string;
  as: 'PERMISSIVE' | 'RESTRICTIVE';
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  to: string[]; // [] / ['PUBLIC'] encodes a PUBLIC/empty-role policy (dormant pattern §G.4)
  using?: string;
  withCheck?: string;
  note?: string;
}

export interface TableDecl {
  org: boolean; // carries organization_id (SCHEME §A.4 / §A.9 — feeds orgTableAllowlist)
  rls: RlsMode;
  rlsWhy?: string; // required when rls==='on'
  owner: string; // 'migrator' = per-env migrator-login (resolved from envMapping)
  grants: Record<string, GrantSet>;
  policies?: Array<PolicyDecl | { todo: string }>;
  /** live-vs-target deltas (defects removed) noted here so reconciliation is auditable. */
  drift?: string;
}

export interface SequenceRuleDecl {
  /** SCHEME §A.4 rule: a role with INSERT/UPDATE on a table gets USAGE(+SELECT) on its *_id_seq. */
  rule: string;
  examples: Record<string, Record<string, Array<'USAGE' | 'SELECT' | 'UPDATE'>>>;
}

export interface DefinerException {
  owner: string;
  /** expected pg_proc.proconfig, BYTE-EXACT (SCHEME §A.7/§F compares byte-for-byte). Applied by
   *  the function BODY in migration, NOT by the generator (SCHEME §B — one authority, dbt #6238). */
  searchPath: string[];
  execute?: string[]; // EXECUTE grantees (SCHEME §A.7)
  why: string;
}

export interface DefinerExceptionsSection {
  /** DEFAULT rule for the 235 functions with pg_catalog + app_owner (SCHEME §A.7 / evidence/13 §3.1). */
  defaults: {
    schema: 'app';
    securityDefiner: true;
    owner: 'app_owner';
    searchPath: string[]; // ['search_path=pg_catalog']
    publicExecute: false; // §D.5 revokes materialized PUBLIC EXECUTE
    coveredCount: number; // 235
    rule: string;
  };
  /** The 9 functions whose proconfig ≠ ['search_path=pg_catalog'] (evidence/13 §3.1), byte-exact. */
  proconfigExceptions: Record<string, DefinerException>;
  /** Ownership ≠ app_owner (evidence/13 §3.2). intentional vs drift; names largely a census-gap (G3). */
  ownershipExceptions: {
    intentional: Record<string, { count: number; why: string; functions: string[] | { todo: string } }>;
    drift: Record<string, { count: number; targetOwner: string; why: string; known: string[]; todo: string }>;
  };
}

export interface DbSettingsSection {
  /** pg_database.datdba (SCHEME §A.10 / evidence/13 §3.5). */
  datdba: string;
  /** database-level ALTER DATABASE … SET (pg_db_role_setting where setrole=0). Census: none for managed dbs. */
  databaseLevel?: Record<string, string[]>;
  /** per-(login,db) ALTER ROLE … IN DATABASE … SET (setdatabase≠0), byte-exact setconfig
   *  (SCHEME §A.10 — space after comma; §F compares byte-for-byte). */
  perRoleInDatabase: Record<string, string[]>;
}

export interface DatabaseDecl {
  /** database ACL: CONNECT/TEMP/CREATE (SCHEME §A.3 / §D.1; evidence/13 §1.1 datacl). */
  database: {
    owner: string;
    connect: string[]; // explicit CONNECT grantees (target — after PUBLIC revoke)
    publicConnectTempDefect: boolean; // evidence/13 §1.1: PUBLIC=Tc present (§D.1 not applied)
    note?: string;
  };
  schemas: Record<string, SchemaDecl>;
  tables: Record<string, TableDecl>;
  sequences: SequenceRuleDecl;
  /** non-definer function / view ACLs (SCHEME §A.5). Default: nothing; views need security_invoker. */
  functionsViews: {
    default: string; // policy statement
    views: Record<string, { securityInvoker: true; execute?: string[] }> | { todo: string };
  };
  /** user-type USAGE grants (SCHEME §A.6). Empty today: zero CREATE TYPE in migrations. */
  types: Record<string, { usage: string[] }>;
  definerExceptions: DefinerExceptionsSection;
  /** closed list of creating roles (SCHEME §A.8) — defaults live per-creator, not inherited. */
  creators: string[];
  /** derived: tables where org===true (SCHEME §A.9 — no separate list; feeds event trigger §E). */
  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true';
    /** org tables the census actually named for this db (evidence/13 §2.3/§2.5). Full 172 = G2. */
    named: string[];
    fullCountLive: number; // evidence/13 §2.3 (org tables total in this db)
    todo: string;
  };
  dbSettings: DbSettingsSection;
}

export interface PrivilegeDeclaration {
  cluster: {
    /** managed environments on this shared PG16 cluster (SCHEME §A / §A.1). */
    envs: string[];
    /** canonical (non-login) roles; the ~3 BYPASSRLS ones justified inline. */
    roles: Record<string, RoleDecl>;
  };
  /** per-env login records (SCHEME §A.1). TEST and dev kept separate. */
  envMapping: Record<string, Record<string, LoginRecord>>;
  databases: Record<string, DatabaseDecl>;
}

/* ============================================================================================
 * SECTION 1+2 — CLUSTER: roles (kind, scope, pinned attributes, memberships) — SCHEME §A.1/§A.2
 *   All attributes from evidence/13 §1.2 (the pg_roles dump). BYPASSRLS=true declared for
 *   EXACTLY 3 (evidence/13 §1.2 "BYPASSRLS в кластере — ровно 3"): postgres, app_owner,
 *   saas_system_health_owner — each justified. NOSUPERUSER/NOCREATEROLE for all but postgres.
 * ========================================================================================== */

const roles: Record<string, RoleDecl> = {
  // ── terminal runtime roles (evidence/13 §1.2 tag "declared-runtime terminal"; scope §4) ──
  app_staff: {
    kind: 'terminal', scope: 'ORG', // evidence/13 §4: own-org; RLS org-filters; 167/172 clean
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
  },
  app_patient: {
    kind: 'terminal', scope: 'OWN', // evidence/13 §4: own-data wall; wrong ORG rule = 65 false silent-zeros (FACTS §1.5)
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
  },
  app_platform_settings: {
    kind: 'terminal', scope: 'GLOBAL', // evidence/13 §4: platform role; §I R4 narrows surface (definer, not table SELECT)
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false,
    rolconfig: null,
  },
  app_worker: {
    kind: 'terminal', scope: 'ORG', // decided (not census-?): filters at ENQUEUE per staff/patient session RLS
    // (memory "walls worker infra role and enqueue filter") + holds EXECUTE app.current_org_id (evidence/13 §3.3).
    login: false, superuser: false, bypassrls: false, inherit: true, createrole: false,
    rolconfig: null,
  },

  // ── operational roles: table-level everything denied; access ONLY via definer (FACTS §6). ──
  //    scope NONE (evidence/13 §4). Note: current_org_id EXECUTE NOT granted to 4 of these →
  //    root of the 61k/day denials (FACTS §1.1, evidence/13 §3.3) — a DEFECT, target grants it.
  app_operational_delivery_worker: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
  },
  app_operational_diagnostic: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
  },
  app_operational_media_worker: {
    kind: 'terminal', scope: 'NONE', // holds EXECUTE current_org_id (evidence/13 §3.3) but no direct org table read
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
  },
  app_operational_scheduler: {
    kind: 'terminal', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
  },
  app_operational_web_push_reminder: {
    kind: 'terminal', scope: 'NONE', // discovery goes through app_web_push_reminder_discovery_definer
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    why: 'evidence/13 §1.1: also holds a direct CONNECT on bersoncarebot_test.datacl (env-map material)',
  },
  app_web_push_reminder_discovery_definer: {
    kind: 'owner', scope: 'NONE', // definer-seam owner, NOT a runtime table reader (evidence/13 §4)
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [], // owns app.list_web_push_reminder_organization_ids (evidence/13 §3.1/§3.2); no members
  },

  // ── capability roles (evidence/13 §1.2 tag "capability"; SET-granted, not INHERIT — §A) ──
  app_clinic_billing: {
    kind: 'capability', scope: 'ORG', // billing within org; SCHEME §A example = ORG
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    grantedTo: [{ role: 'app_staff', admin: false, inherit: false, set: true }], // evidence/13 §1.3
  },
  app_identity_bootstrap: {
    kind: 'capability',
    scope: 'OWN', // TODO(owner?): evidence/13 §4/§6.1 left OWN-vs-NONE open; depends on whether the
    // role reads any org table directly (no table-grant census for it). OWN chosen (registration
    // bootstrap on the registrant's own identity row, d15b4-…-identity-bootstrap-role.sql) — confirm.
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    // grantedTo (nonstaff/integrator/dev-nonstaff logins + dev migrator) lives in envMapping (login members).
  },

  // ── owner roles (NOLOGIN definer owners; evidence/13 §1.2 tag "owner"; §C) ──
  app_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // ⬅ 1 of exactly-3. NOLOGIN definer seam; deploy HARD-asserts rolbypassrls
    // (deploy-test-saas.sh:907, deploy-test.sh:174). Keep-and-declare = SCHEME §I R5.
    inherit: true, createrole: false, rolconfig: null,
    members: [], // zero members outside the migration window (SCHEME §C; evidence/13 §1.3 confirms)
  },
  saas_system_health_owner: {
    kind: 'owner', scope: 'NONE',
    login: false, superuser: false,
    bypassrls: true, // ⬅ 2 of exactly-3. NOLOGIN health-aggregation definer owner; live chain sets
    // BYPASSRLS (saas-system-health-diagnostics.sql:166-173). Keep-and-declare = SCHEME §I R9.
    inherit: false, createrole: false, rolconfig: null,
    members: [],
  },
  saas_telemetry_owner: {
    kind: 'owner', scope: 'NONE', // owns saas_isolation_* tables + 7 definer fns (evidence/13 §3.2; §C)
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [],
  },

  // ── operator role (NOLOGIN canonical; operator LOGINS live in envMapping) ──
  saas_telemetry_operator: {
    kind: 'operator', scope: 'GLOBAL', // decided: reads isolation telemetry cross-org
    // (saas-isolation-telemetry.sql; evidence/13 §4). bcb_saas_operator_test is a member (envMapping).
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
  },

  // ── service role: migration-phase marker (SCHEME §A.1/§E). DOES NOT EXIST YET in the live
  //    catalog (not among evidence/13 §1.2's 45 roles). roles-install (§B step 1) creates it. ──
  app_migration_phase: {
    kind: 'service', scope: 'NONE',
    login: false, superuser: false, bypassrls: false, inherit: false, createrole: false, rolconfig: null,
    members: [], // zero members in steady state; the deploy elevation bracket adds/removes membership (§E)
    why: 'NEW — not in live census; NOLOGIN marker read by the event trigger to detect migration phase (SCHEME §E)',
  },

  // ── cluster superuser (evidence/13 §1.2) — declared for reconciliation; not created by this
  //    declaration. 3 of exactly-3 BYPASSRLS. Also event-trigger owner (§C) + a creator (§A.8). ──
  postgres: {
    kind: 'superuser', scope: 'GLOBAL', // scope not RLS-enforced (superuser/bypassrls); GLOBAL for shape only
    login: true, superuser: true, bypassrls: true, inherit: true, createrole: true,
    rolconfig: null,
    why: 'cluster superuser; owns app_ext on TEST + the event trigger (§C); BYPASSRLS by nature',
  },
};

/* ============================================================================================
 * SECTION — ENV-MAPPING (SCHEME §A.1). Per-env login records; TEST and dev kept SEPARATE.
 *   Attributes from evidence/13 §1.2; memberships from §1.3; role-level rolconfig from §3.4;
 *   CONNECT from §1.1 datacl. passwordEnv = convention placeholder (GAP G9), NEVER a literal.
 *   inherit pinned to the LIVE value (GAP G4: SCHEME §A.1 wants NOINHERIT — drift flagged).
 * ========================================================================================== */

const SEARCH_PATH_PUBLIC_INTEGRATOR = 'search_path=public, integrator'; // byte-exact, evidence/13 §3.4 (space after comma)

const envMapping: Record<string, Record<string, LoginRecord>> = {
  test: {
    // migrator / datdba of bersoncarebot_test (evidence/13 §3.5). Carries role-level search_path (§3.4).
    bersoncarebot_test: {
      canonicalRole: null, // steady state; gains app_owner + BYPASSRLS only inside the migrate bracket (§C, §B step 5)
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: true, // datdba, inherit=t (evidence/13 §1.2)
      passwordEnv: 'PGPASSWORD_BERSONCAREBOT_TEST', // TODO(census-gap G9): exact secret var from deploy env
      rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // evidence/13 §3.4 (setdatabase=0)
      connect: ['bersoncarebot_test'],
      why: 'TEST migrator-login = datdba of bersoncarebot_test (evidence/13 §3.5)',
    },
    bcb_test_integrator_login: {
      canonicalRole: 'app_staff', // member of 4 terminals; app_staff shown as primary (see membership note)
      membership: { role: 'app_staff', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_INTEGRATOR', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // §3.4
      connect: ['bersoncarebot_test'],
      why: 'broad integrator login — member of app_identity_bootstrap, app_patient, app_staff, app_worker '
        + '(evidence/13 §1.3; 4 rows in the machine dump — census prose "пяти" is a typo, GAP: use the 4 rows)',
    },
    bcb_test_nonstaff_login: {
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_NONSTAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // §3.4
      connect: ['bersoncarebot_test'],
      why: 'also member of app_identity_bootstrap (evidence/13 §1.3)',
    },
    bcb_test_staff_login: {
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: true, set: true }, // inherit=t (evidence/13 §1.3)
      login: true, superuser: false, bypassrls: false, createrole: false,
      inherit: true, // ⚠ GAP G4: rolinherit=t vs SCHEME §A.1 NOINHERIT pin (evidence/13 §1.2/§6.4)
      passwordEnv: 'PGPASSWORD_BCB_TEST_STAFF', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // §3.4
      connect: ['bersoncarebot_test'],
    },
    bcb_test_worker_login: {
      canonicalRole: 'app_worker',
      membership: { role: 'app_worker', admin: false, inherit: true, set: true }, // inherit=t (evidence/13 §1.3)
      login: true, superuser: false, bypassrls: false, createrole: false,
      inherit: true, // ⚠ GAP G4: rolinherit=t vs SCHEME §A.1 NOINHERIT pin
      passwordEnv: 'PGPASSWORD_BCB_TEST_WORKER', rolconfig: [SEARCH_PATH_PUBLIC_INTEGRATOR], // §3.4
      connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_delivery_login: {
      canonicalRole: 'app_operational_delivery_worker',
      membership: { role: 'app_operational_delivery_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DELIVERY',
      rolconfig: null, // evidence/13 §3.4: operational logins carry NO role-level search_path
      connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_diagnostic_login: {
      canonicalRole: 'app_operational_diagnostic',
      membership: { role: 'app_operational_diagnostic', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_DIAGNOSTIC', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_media_login: {
      canonicalRole: 'app_operational_media_worker',
      membership: { role: 'app_operational_media_worker', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_MEDIA', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_scheduler_login: {
      canonicalRole: 'app_operational_scheduler',
      membership: { role: 'app_operational_scheduler', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_SCHEDULER', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    bcb_test_operational_web_push_reminder_login: {
      canonicalRole: 'app_operational_web_push_reminder',
      membership: { role: 'app_operational_web_push_reminder', admin: false, inherit: false, set: true },
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_TEST_OP_WEBPUSH', rolconfig: null, connect: ['bersoncarebot_test'],
    },
    // saas-operator logins on TEST (evidence/13 §1.2 tag "saas-operator"; §1.1 datacl grants CONNECT).
    bcb_saas_operator_test: {
      canonicalRole: 'saas_telemetry_operator',
      membership: { role: 'saas_telemetry_operator', admin: false, inherit: true, set: true }, // evidence/13 §1.3
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: true, // rolinherit=t (evidence/13 §1.2)
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'], // evidence/13 §1.1 datacl: bcb_saas_operator_test=c
    },
    bcb_saas_diag_test: {
      canonicalRole: null, // no membership row in evidence/13 §1.3
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: true, // rolinherit=t (evidence/13 §1.2)
      passwordEnv: 'PGPASSWORD_BCB_SAAS_DIAG_TEST', rolconfig: null,
      connect: ['bersoncarebot_test'],
      why: 'saas diagnostic login; no canonical membership in census (evidence/13 §1.3) — TODO(census-gap): intended role',
    },
  },

  dev: {
    // migrator / datdba of bcb_webapp_dev (evidence/13 §3.5). Role-level rolconfig NULL; the
    // search_path lives at the (login,db) level (setdatabase≠0) — see databases.bcb_webapp_dev.dbSettings.
    bcb_webapp_dev_user: {
      canonicalRole: 'app_identity_bootstrap',
      membership: { role: 'app_identity_bootstrap', admin: false, inherit: true, set: true }, // evidence/13 §1.3
      login: true, superuser: false, bypassrls: false, createrole: false,
      inherit: true, // ⚠ GAP G4: rolinherit=t vs SCHEME §A.1 NOINHERIT (also datdba, evidence/13 §1.2)
      passwordEnv: 'PGPASSWORD_BCB_WEBAPP_DEV_USER',
      rolconfig: null, // evidence/13 §3.4: role-level NULL; per-(login,db) search_path in dbSettings (§A.10)
      connect: ['bcb_webapp_dev'],
      why: 'dev migrator-login = datdba of bcb_webapp_dev (evidence/13 §3.5); its search_path is the NECESSARY '
        + 'setdatabase≠0 row (SCHEME §A.10), not a defect',
    },
    bcb_dev_runtime_nonstaff_login: {
      canonicalRole: 'app_patient',
      membership: { role: 'app_patient', admin: false, inherit: false, set: true }, // evidence/13 §1.3
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_NONSTAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
      why: 'also member of app_identity_bootstrap (evidence/13 §1.3)',
    },
    bcb_dev_runtime_staff_login: {
      canonicalRole: 'app_staff',
      membership: { role: 'app_staff', admin: false, inherit: false, set: true }, // evidence/13 §1.3
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: false,
      passwordEnv: 'PGPASSWORD_BCB_DEV_STAFF', rolconfig: null, connect: ['bcb_webapp_dev'],
    },
    bcb_saas_operator_dev: {
      canonicalRole: null, // no membership row (evidence/13 §1.3)
      login: true, superuser: false, bypassrls: false, createrole: false, inherit: true, // rolinherit=t (evidence/13 §1.2)
      passwordEnv: 'PGPASSWORD_BCB_SAAS_OPERATOR_DEV', rolconfig: null,
      connect: ['bcb_webapp_dev'], // evidence/13 §1.1 datacl: bcb_saas_operator_dev=c
      why: 'saas operator login on dev; no canonical membership in census — TODO(census-gap): intended role',
    },
  },
};

/* ============================================================================================
 * SHARED — definer defaults + the 9 proconfig exceptions (identical function set across dbs;
 *   evidence/13 §3.1/§3.2 taken on bersoncarebot_test). Reused by both database sections below.
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

/** The 9 non-`pg_catalog` proconfig functions (evidence/13 §3.1), searchPath byte-exact. */
const PROCONFIG_EXCEPTIONS: Record<string, DefinerException> = {
  'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)': {
    owner: 'app_owner',
    searchPath: ['search_path=app, app_ext, pg_catalog'], // body calls app_ext.hmac (p2-b:231)
    execute: ['app_owner', 'app_staff', 'app_patient', 'app_clinic_billing'], // evidence/13 §3.3
    why: 'principal entry: HMAC signature verified before GUC install (evidence/13 §3.1; SCHEME §A.7)',
  },
  'app.current_integrator_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'principal-context accessor (evidence/13 §3.1)',
  },
  'app.current_org_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [ // evidence/13 §3.3 — LIVE grantees
      'app_owner', 'app_staff', 'app_patient', 'app_worker', 'app_operational_media_worker',
      'app_platform_settings', 'app_clinic_billing', 'app_identity_bootstrap',
      // login grantee (env): bcb_test_nonstaff_login — rendered from envMapping
    ],
    why: 'org-id accessor. ⚠ DEFECT (evidence/13 §3.3 / FACTS §1.1): EXECUTE NOT granted to '
      + 'app_operational_scheduler/delivery_worker/diagnostic/web_push_reminder → root of 61k/day 42501. '
      + 'Target adds those 4 grants.',
  },
  'app.current_patient_user_id()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'principal-context accessor (evidence/13 §3.1)',
  },
  'app.release_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    execute: [ // evidence/13 §3.3: 14 grantees (owner+staff+patient+4 TEST logins+4 operational+integrator/nonstaff logins+clinic_billing)
      'app_owner', 'app_staff', 'app_patient', 'app_clinic_billing',
      'app_operational_delivery_worker', 'app_operational_diagnostic',
      'app_operational_media_worker', 'app_operational_scheduler',
      // login grantees (env) rendered from envMapping: bcb_test_* (4) + integrator/nonstaff
    ],
    why: 'principal teardown; broad EXECUTE (evidence/13 §3.3). TODO(census-gap): exact login grantees',
  },
  'app.reset_principal_context()': {
    owner: 'app_owner', searchPath: ['search_path=app, pg_catalog'],
    why: 'principal reset accessor (evidence/13 §3.1)',
  },
  'app.close_active_user_phone_history(uuid)': {
    owner: 'app_owner', searchPath: ['search_path=app, public, pg_catalog'],
    why: 'phone-history maintenance; body reaches public (evidence/13 §3.1)',
  },
  'app.list_web_push_reminder_organization_ids(timestamp with time zone)': {
    owner: 'app_web_push_reminder_discovery_definer', // intentional non-app_owner owner (seam, §C)
    searchPath: ['search_path=pg_catalog, public'],
    why: 'web-push discovery seam; owned by discovery-definer role (evidence/13 §3.1/§3.2)',
  },
  'app.read_outbound_provider_incident_health()': {
    owner: 'bersoncarebot_test', // ⚠ owned by migrator-login — BOTH a proconfig AND an ownership exception
    searchPath: ['search_path=pg_catalog, public'],
    why: 'outbound-incident health read. ⚠ DRIFT (evidence/13 §3.2): owner=migrator-login, not app_owner. '
      + 'TODO(census-gap G3): intentional or bring to app_owner?',
  },
};

/** Ownership ≠ app_owner (evidence/13 §3.2): 244 = 193 app_owner + 38 migrator + 7 saas_telemetry_owner
 *  + 4 saas_system_health_owner + 1 app_platform_settings + 1 discovery_definer. */
const OWNERSHIP_EXCEPTIONS: DefinerExceptionsSection['ownershipExceptions'] = {
  intentional: {
    saas_telemetry_owner: {
      count: 7, why: 'owns saas_isolation telemetry definer fns (§C; evidence/13 §3.2)',
      functions: { todo: 'TODO(census-gap G3): 7 function names not enumerated in read-only census' },
    },
    saas_system_health_owner: {
      count: 4, why: 'owns health-aggregation definer fns; BYPASSRLS owner (§I R9; evidence/13 §3.2)',
      functions: { todo: 'TODO(census-gap G3): 4 function names not enumerated' },
    },
    app_web_push_reminder_discovery_definer: {
      count: 1, why: 'owns its discovery seam (§C; evidence/13 §3.2)',
      functions: ['app.list_web_push_reminder_organization_ids(timestamp with time zone)'],
    },
  },
  drift: {
    bersoncarebot_test: {
      count: 38, targetOwner: 'app_owner',
      why: 'migrator-login owns 38 definer fns vs §C canon app_owner (evidence/13 §3.2). Candidates for '
        + 'ALTER FUNCTION … OWNER TO app_owner unless intentional.',
      known: ['app.read_outbound_provider_incident_health()'], // the only one named in census
      todo: 'TODO(census-gap G3): 37 remaining function names + which (if any) are intentionally migrator-owned',
    },
    app_platform_settings: {
      count: 1, targetOwner: 'app_owner',
      why: 'a runtime role must not OWN a definer function (evidence/13 §3.2) — drift, bring to app_owner',
      known: [],
      todo: 'TODO(census-gap G3): the 1 function name owned by app_platform_settings',
    },
  },
};

/* ============================================================================================
 * SECTION 3-10 — DATABASE: bersoncarebot_test (managed). Schemas/ACLs from evidence/13 §2.1/§2.4/§2.5;
 *   definer from §3.1/§3.2; dbSettings from §3.4/§3.5. The two managed dbs DIFFER — see §2.1 vs §2.2.
 * ========================================================================================== */

const db_bersoncarebot_test: DatabaseDecl = {
  database: {
    owner: 'bersoncarebot_test', // datdba (evidence/13 §3.5)
    connect: [ // TARGET: explicit CONNECT for TEST logins (envMapping) after PUBLIC revoke (§D.1)
      'bersoncarebot_test', 'bcb_test_integrator_login', 'bcb_test_nonstaff_login',
      'bcb_test_staff_login', 'bcb_test_worker_login', 'bcb_test_operational_delivery_login',
      'bcb_test_operational_diagnostic_login', 'bcb_test_operational_media_login',
      'bcb_test_operational_scheduler_login', 'bcb_test_operational_web_push_reminder_login',
      'bcb_saas_operator_test', 'bcb_saas_diag_test',
      'app_operational_web_push_reminder', // evidence/13 §1.1: datacl grants CONNECT to this ROLE directly
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc — §D.1 REVOKE not applied
    note: 'evidence/13 §1.1: current datacl = PUBLIC=Tc, owner=CTc, app_operational_web_push_reminder=c, '
      + 'bcb_saas_operator_test=c. Target revokes PUBLIC, keeps explicit grantees.',
  },

  // ── Section 3: schemas (evidence/13 §2.1). USAGE lists verbatim; '=PUBLIC' = a PUBLIC ACL entry. ──
  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ evidence/13 §2.1: `=U/app_owner` = PUBLIC USAGE on app (§D.2 REVOKE target)
        'app_staff', 'app_patient', 'bersoncarebot_test', 'app_platform_settings',
        'bcb_test_nonstaff_login', 'app_worker', 'bcb_test_integrator_login',
        'saas_telemetry_operator', 'saas_system_health_owner', 'app_clinic_billing',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_diagnostic',
        'app_operational_delivery_worker', 'app_operational_scheduler', 'app_operational_media_worker',
        'bcb_test_operational_diagnostic_login', 'bcb_test_operational_delivery_login',
        'bcb_test_operational_scheduler_login', 'bcb_test_operational_media_login',
      ],
      create: ['app_owner'],
      publicDefect: true, // PUBLIC USAGE present — §D.2
    },
    app_ext: {
      owner: 'postgres', present: true, // ⚠ GAP G5: TEST owner=postgres (dev=bcb_webapp_dev_user)
      usage: ['app_owner'], create: ['postgres'],
      why: 'pgcrypto seam (app_ext.hmac, p2-b:94). evidence/13 §2.1: postgres=UC, app_owner=U',
    },
    drizzle: {
      owner: 'bersoncarebot_test', present: true,
      usage: ['bersoncarebot_test'], create: ['bersoncarebot_test'], // migrator journal
    },
    integrator: {
      owner: 'bersoncarebot_test', present: true,
      usage: [ // evidence/13 §2.1 — TEST grants diagnostic/delivery/scheduler (differs from dev)
        'bersoncarebot_test', 'app_staff', 'app_patient', 'bcb_test_integrator_login', 'app_owner',
        'app_operational_diagnostic', 'app_operational_delivery_worker', 'app_operational_scheduler',
      ],
      create: ['bersoncarebot_test'],
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [
        '=PUBLIC', // ⚠ evidence/13 §2.1/§2.2: PUBLIC USAGE on public (§D.2 REVOKE target — both dbs)
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'bcb_test_integrator_login',
        'bcb_test_nonstaff_login', 'app_clinic_billing', 'app_web_push_reminder_discovery_definer',
        'app_operational_web_push_reminder', 'app_identity_bootstrap', 'app_operational_delivery_worker',
        'app_operational_media_worker', 'app_operational_scheduler',
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ evidence/13 §2.5: absent on both — wall not installed (§B step 3)
      usage: [], create: ['postgres'],
      why: 'the wall schema (org_table_allowlist, privileges_watermark, ddl_wall_log). Built by wall-install '
        + 'each deploy (SCHEME §B step 3); closed to runtime roles.',
    },
  },

  // ── Section 4: tables — ONLY those the census enumerated (evidence/13 §2.4/§2.5). Rest = GAP G2. ──
  tables: {
    'public.be_appointments': {
      org: true, rls: 'force', owner: 'migrator', // clean org table; not in §2.3 defect list ⇒ has RLS+FORCE
      grants: {
        app_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        app_patient: ['SELECT'],
        app_owner: ['SELECT'],
        // migrator (bersoncarebot_test) holds all 7 — implied by ownership
      },
      policies: [{
        name: 'saas_org_dormant_p0_8_3', as: 'PERMISSIVE', cmd: 'ALL', to: [], // roles empty/PUBLIC: dormant
        note: 'evidence/13 §2.5: dormant pattern (roles empty) — swept by §G.4; target = org-scoped staff policy',
      }],
    },
    'public.be_organization_members': {
      org: true,
      rls: 'force', // ⚠ TARGET. LIVE relrowsecurity=false (evidence/13 §2.4) — the live 2-cell leak (FACTS §1.2)
      owner: 'migrator',
      grants: {
        app_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], // org-filtered once RLS lands
        app_owner: ['SELECT', 'INSERT', 'UPDATE'],
        // ⚠ app_platform_settings SELECT REMOVED in target (§I R4): platform membership read → definerException,
        //   not a table SELECT. LIVE has app_platform_settings=SELECT (evidence/13 §2.4) = the leak.
        // login grantees (env): bcb_test_nonstaff_login=SELECT, bcb_test_integrator_login=SELECT (evidence/13 §2.4)
      },
      policies: [{ todo: 'TODO(census-gap G8): org-scoped staff policy body not enumerated' }],
      drift: 'LIVE: RLS off + app_platform_settings SELECT (2-cell leak FACTS §1.2). TARGET: rls force + drop '
        + 'app_platform_settings table SELECT (§I R4). Ф6 red→green closes it via generator RLS statements (§B).',
    },
    'public.platform_users': {
      org: false, // no organization_id; single PII wall (FACTS §1.4)
      rls: 'force', // §I R3. LIVE now RLS+FORCE (drift, evidence/13 §2.4) — Ф6 red baseline is GAP G6
      owner: 'migrator',
      grants: {
        app_patient: [{ kind: 'columns', priv: 'UPDATE', columns: ['calendar_timezone', 'reminder_muted_until'] }], // evidence/13 §2.5/FACTS §1.4
        app_web_push_reminder_discovery_definer: [{ kind: 'columns', priv: 'SELECT', columns: ['reminder_muted_until'] }], // §2.5
        app_owner: [{ kind: 'columns', priv: 'SELECT', columns: ['id', 'email' /* + …: full col list = GAP G2 */] }], // §2.5
        // login grantee (env): bcb_test_integrator_login INSERT/UPDATE(display_name,first_name,last_name,phone_normalized,…) (§2.5)
      },
      policies: [{ todo: 'TODO(census-gap G8): 9 policies present (evidence/13 §2.4) — names/bodies not enumerated' }],
      drift: 'LIVE RLS+FORCE now (was off, FACTS §1.4). Target keeps force (§I R3).',
    },
  },

  // ── Section (SCHEME §A.4 sequence rule) ──
  sequences: {
    rule: 'A role with INSERT/UPDATE on a table gets USAGE(+SELECT) on that table\'s *_id_seq '
      + '(serial DEFAULT needs USAGE; SCHEME §A.4). Exceptions as explicit sequence entries.',
    examples: { // evidence/13 §2.5 (confirmed)
      'public.integrator_push_outbox_id_seq': { app_staff: ['USAGE', 'SELECT'] },
      'public.be_patient_packages_display_number_seq': { app_staff: ['USAGE', 'SELECT'] },
    },
  },

  // ── Section 5: non-definer functions / views (SCHEME §A.5) ──
  functionsViews: {
    default: 'No default EXECUTE; wall-install §D.5 strips materialized PUBLIC EXECUTE. Non-definer '
      + 'function/view EXECUTE only where listed. Views MUST carry security_invoker (§G.6).',
    views: { todo: 'TODO(census-gap): census did not enumerate views/security_invoker for this db' },
  },

  // ── Section 6: types (SCHEME §A.6) — empty: zero CREATE TYPE in migrations ──
  types: {},

  // ── Section 7: definerExceptions (shared defaults + 9 proconfig + ownership drift) ──
  definerExceptions: {
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  // ── Section 8: creators (SCHEME §A.8; defaults live per-creator, not inherited) ──
  creators: ['postgres', 'bersoncarebot_test', 'app_owner', 'saas_telemetry_owner', 'saas_system_health_owner'],

  // ── Section 9: orgTableAllowlist (derived: tables[*].org===true; SCHEME §A.9) ──
  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // org tables the census named for TEST (evidence/13 §2.3/§2.5): the 6 defect + be_appointments
      'public.appointment_records', 'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts', // ⚠ new defect not in FACTS §1.3 (evidence/13 §2.3); GAP G7
      'public.be_appointments', // clean org table (has RLS+FORCE)
    ],
    fullCountLive: 172, // evidence/13 §2.3: 172 org tables total on bersoncarebot_test
    todo: 'TODO(census-gap G2): remaining 165 org-table names not enumerated in read-only census',
  },

  // ── Section 10: dbSettings (SCHEME §A.10; evidence/13 §3.4/§3.5) ──
  dbSettings: {
    datdba: 'bersoncarebot_test', // evidence/13 §3.5
    // No ALTER DATABASE … SET and no per-(login,db) row for bersoncarebot_test (evidence/13 §3.4 dump).
    perRoleInDatabase: {},
  },
};

/* ============================================================================================
 * SECTION 3-10 — DATABASE: bcb_webapp_dev (managed). DIFFERS from TEST (evidence/13 §2.2 "⚠ Две
 *   managed-базы НЕ идентичны"): app_ext owner, integrator/app USAGE lists, +patient_specialist_links.
 * ========================================================================================== */

const db_bcb_webapp_dev: DatabaseDecl = {
  database: {
    owner: 'bcb_webapp_dev_user', // datdba (evidence/13 §3.5)
    connect: [ // TARGET explicit CONNECT for dev logins (envMapping) after PUBLIC revoke
      'bcb_webapp_dev_user', 'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login',
      'bcb_saas_operator_dev',
    ],
    publicConnectTempDefect: true, // evidence/13 §1.1: datacl PUBLIC=Tc
    note: 'evidence/13 §1.1: datacl = PUBLIC=Tc, owner=CTc, bcb_saas_operator_dev=c. Target revokes PUBLIC.',
  },

  schemas: {
    app: {
      owner: 'app_owner', present: true,
      usage: [ // evidence/13 §2.2 — NO PUBLIC USAGE here (differs from TEST app schema)
        'app_staff', 'app_patient', 'bcb_webapp_dev_user', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'bcb_dev_runtime_staff_login', 'app_identity_bootstrap',
        'app_operational_delivery_worker', 'app_worker', 'saas_telemetry_operator', 'saas_system_health_owner',
      ],
      create: ['app_owner'],
      // no publicDefect: dev app schema carries no PUBLIC USAGE entry (evidence/13 §2.2)
    },
    app_ext: {
      owner: 'bcb_webapp_dev_user', present: true, // ⚠ GAP G5: dev owner=bcb_webapp_dev_user (TEST=postgres)
      usage: ['app_owner'], create: ['bcb_webapp_dev_user'],
      why: 'evidence/13 §2.2: bcb_webapp_dev_user=UC, app_owner=U. §C canon says postgres for app_ext seam — dev drifts (G5)',
    },
    drizzle: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: ['bcb_webapp_dev_user'], create: ['bcb_webapp_dev_user'],
      why: 'evidence/13 §2.2: nspacl null (owner-only)',
    },
    integrator: {
      owner: 'bcb_webapp_dev_user', present: true,
      usage: [ // evidence/13 §2.2 — dev grants ONLY delivery among operational (TEST also diagnostic/scheduler)
        'bcb_webapp_dev_user', 'app_staff', 'app_patient', 'app_owner', 'app_operational_delivery_worker',
      ],
      create: ['bcb_webapp_dev_user'],
    },
    public: {
      owner: 'pg_database_owner', present: true,
      usage: [ // evidence/13 §2.2
        '=PUBLIC', // PUBLIC USAGE (§D.2 target)
        'app_staff', 'app_patient', 'app_owner', 'app_platform_settings', 'app_clinic_billing',
        'bcb_dev_runtime_nonstaff_login', 'app_identity_bootstrap',
      ],
      create: ['pg_database_owner'],
      publicDefect: true,
    },
    app_control: {
      owner: 'postgres', present: false, // ⚠ evidence/13 §2.5: absent on dev too
      usage: [], create: ['postgres'],
      why: 'wall schema, built by migrate-dev.sh chain (SCHEME §B — dev is in-scope, §I R1)',
    },
  },

  tables: {
    // Same enumerated set as TEST (org table grants are per-db but census enumerated them on TEST;
    // the be_* grant sets are treated as shared unless the census showed a dev-specific value — GAP G2).
    'public.be_organization_members': {
      org: true, rls: 'force', owner: 'migrator',
      grants: {
        app_staff: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
        app_owner: ['SELECT', 'INSERT', 'UPDATE'],
      },
      policies: [{ todo: 'TODO(census-gap G8): dev policy body not enumerated' }],
      drift: 'LIVE relrowsecurity=false (evidence/13 §2.3). Target rls force.',
    },
    'public.platform_users': {
      org: false, rls: 'force', owner: 'migrator',
      grants: {
        app_patient: [{ kind: 'columns', priv: 'UPDATE', columns: ['calendar_timezone', 'reminder_muted_until'] }],
      },
      policies: [{ todo: 'TODO(census-gap G2/G8): dev column grants + policies not fully enumerated' }],
      drift: 'LIVE RLS+FORCE (evidence/13 §2.4). Same as TEST.',
    },
    'public.patient_specialist_links': {
      org: true, // carries organization_id (evidence/13 §2.3)
      rls: 'on', // ⚠ DEV-SPECIFIC (evidence/13 §2.3): relrowsecurity=t but relforcerowsecurity=f
      rlsWhy: 'LIVE dev state: RLS on, FORCE off (evidence/13 §2.3). Target = force; declared \'on\' to record '
        + 'the live defect truthfully. Not present as a defect on TEST.',
      owner: 'migrator',
      grants: {}, // TODO(census-gap G2): dev grants for this table not enumerated in read-only census
      drift: 'dev-only org defect (FORCE off); TEST does not have this table in the §2.3 defect set.',
    },
  },

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
    // definer function set is cluster-wide (schema app); census took it on TEST. Same defaults +
    // exceptions apply to dev unless a dev-specific proconfig/owner is later found (GAP G3).
    defaults: DEFINER_DEFAULTS,
    proconfigExceptions: PROCONFIG_EXCEPTIONS,
    ownershipExceptions: OWNERSHIP_EXCEPTIONS,
  },

  creators: ['postgres', 'bcb_webapp_dev_user', 'app_owner', 'saas_telemetry_owner', 'saas_system_health_owner'],

  orgTableAllowlist: {
    derivedFrom: 'tables[*].org === true',
    named: [ // dev's 7 defect org tables (evidence/13 §2.3) — TEST's 6 + patient_specialist_links
      'public.appointment_records', 'public.be_organization_members', 'public.outgoing_delivery_queue',
      'public.patient_bookings', 'public.product_analytics_hourly',
      'public.reference_catalog_snapshot_receipts', // GAP G7
      'public.patient_specialist_links', // ⚠ dev-only (RLS on, FORCE off; evidence/13 §2.3); GAP G7
    ],
    fullCountLive: 172, // TODO(census-gap G2): dev org-table total not separately counted in census; assume ≈TEST
    todo: 'TODO(census-gap G2): full dev org-table list + exact count (census counted defects only for dev)',
  },

  dbSettings: {
    datdba: 'bcb_webapp_dev_user', // evidence/13 §3.5
    perRoleInDatabase: {
      // ⚠ NECESSARY carrying row (SCHEME §A.10), NOT a defect: dev migrator's search_path lives here
      //    because its role-level rolconfig must be NULL (dev-c0-runtime-logins.sql:130-137).
      //    Byte-exact incl. the space after the comma (evidence/13 §3.4; §F compares byte-for-byte).
      bcb_webapp_dev_user: ['search_path=public, integrator'],
    },
  },
};

/* ============================================================================================
 * ASSEMBLY — the exported declaration (SCHEME §A ten sections, both managed dbs).
 * ========================================================================================== */

export const declaration: PrivilegeDeclaration = {
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

export default declaration;
