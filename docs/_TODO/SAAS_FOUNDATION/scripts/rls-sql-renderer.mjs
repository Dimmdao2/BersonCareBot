const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const rlsPredicateModes = new Set(['dormant_permissive', 'enforce']);
export const patientPredicateModes = new Set(['dormant_symmetric', 'enforce']);

export function quoteSqlIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new Error('SQL identifier must be a non-empty string');
  }

  if (!identifierPattern.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

export function quoteQualifiedName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('SQL qualified name must be a non-empty string');
  }

  return name.split('.').map(quoteSqlIdentifier).join('.');
}

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): the conditional/
// polymorphic predicates below need to embed a literal SQL string value (a discriminator column
// value, a polymorphic target_type tag) — quoteSqlIdentifier/quoteQualifiedName are for identifiers
// only (double-quoted), this is for VALUES (single-quoted, doubled-quote escaping).
export function quoteSqlLiteral(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('SQL literal must be a non-empty string');
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function assertMode(mode) {
  if (!rlsPredicateModes.has(mode)) {
    throw new Error(`Unsupported RLS predicate mode: ${mode}`);
  }
}

function assertPatientMode(mode) {
  if (!patientPredicateModes.has(mode)) {
    throw new Error(`Unsupported patient predicate mode: ${mode}`);
  }
}

const patientCastTypes = new Set(['uuid', 'bigint']);
const orgContextSql = 'app.current_org_id()';

export const dormantCompatibilityPredicate = [
  'app.current_org_id() IS NULL',
  'app.current_patient_user_id() IS NULL',
  'app.current_integrator_user_id() IS NULL',
  'NOT app.is_staff()',
].join(' AND ');

// Phase 2 (TASK_FOR_SOL_multitenant_flip.md): trusted org/patient/integrator identity is read only
// through helper functions backed by the protected backend-context table. Raw custom GUCs remain
// useful as legacy proof inputs, but generated RLS predicates must not trust current_setting('app.*').
// castType selects which protected identity helper a predicate reads — never cast the UUID helper to
// bigint or the bigint helper to UUID.
const patientContextSqlByCastType = {
  uuid: 'app.current_patient_user_id()',
  bigint: 'app.current_integrator_user_id()',
};

function patientContextSqlForCastType(castType) {
  const contextSql = patientContextSqlByCastType[castType];

  if (!contextSql) {
    throw new Error(`Unsupported patient cast type for context selection: ${castType}`);
  }

  return contextSql;
}

function renderOrgColumnMatchesContext({ column, contextSql, mode }) {
  assertMode(mode);

  const columnSql = quoteSqlIdentifier(column);

  if (mode === 'dormant_permissive') {
    return `(${contextSql} IS NULL OR ${columnSql} = ${contextSql})`;
  }

  return `(${contextSql} IS NOT NULL AND ${columnSql} = ${contextSql})`;
}

function renderPatientColumnMatchesContext({ column, contextSql, mode }) {
  assertPatientMode(mode);

  const columnSql = quoteSqlIdentifier(column);

  if (mode === 'dormant_symmetric') {
    return `(${contextSql} IS NULL OR ${columnSql} = ${contextSql})`;
  }

  return `(${contextSql} IS NOT NULL AND ${columnSql} = ${contextSql})`;
}

export function renderOrgPredicate(descriptor, { mode = 'dormant_permissive' } = {}) {
  const orgColumn = descriptor?.orgColumn;

  if (typeof orgColumn !== 'string' || orgColumn.length === 0) {
    throw new Error('Org predicate requires descriptor.orgColumn');
  }

  return renderOrgColumnMatchesContext({
    column: orgColumn,
    contextSql: orgContextSql,
    mode,
  });
}

// Phase 2 separates org mode from patient mode. Dormant rollout keeps the patient wall symmetric:
// if no patient/integrator helper is installed, the patient branch permits so compatibility deploys
// do not break legacy unlabelled reads. Enforce mode is fail-closed.
export function renderPatientPredicate({
  patientColumn = 'platform_user_id',
  mode = 'enforce',
  castType = 'uuid',
} = {}) {
  assertPatientMode(mode);

  if (!patientCastTypes.has(castType)) {
    throw new Error(`Unsupported predicate cast type: ${castType}`);
  }

  return renderPatientColumnMatchesContext({
    column: patientColumn,
    contextSql: patientContextSqlForCastType(castType),
    mode,
  });
}

// B4-roles-1 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #662): the staff bypass used to be a GUC
// flag (`app.actor='staff'`) — settable by ANY session (patient sessions included), i.e. provably
// spoofable by injection. It is now a DB ROLE-MEMBERSHIP check via the canonical helper function
// `app.is_staff()` (SECURITY INVOKER, STABLE — created by migration 0175, right before the patient-
// wall policies it is used in). `app.is_staff()` is the SINGLE source of the staff role's name
// (canonical: `app_staff`, created by deploy/postgres/p0-5b-role-split-staff-patient.sql) — no
// predicate here or anywhere else duplicates that name. Unlike a GUC, role membership cannot be
// forged by the session that holds it: `SET ROLE app_staff` / `SET SESSION AUTHORIZATION app_staff`
// issued by a session authenticated as `app_patient` is rejected by Postgres itself, because
// `app_patient` is deliberately NOT granted membership in `app_staff` — proven live by
// docs/_TODO/SAAS_FOUNDATION/scripts/smoke-b4-roles-1-staff-role-boundary.mjs.
export function renderStaffActorCheck() {
  return 'app.is_staff()';
}

// ⛔ ЛОЖНАЯ АТРИБУЦИЯ, ИСПРАВЛЕНО 04.08. Здесь стояло «Owner decision 2026-07-11: doctor/staff
// visibility is org-wide (variant A, no assignment predicate)». Владелец 04.08, увидев эту цитату:
// «Я так сказать не мог. Это язык агента». Первичной формулировки владельца нет ни в одном его
// тексте — строка написана агентом. По ФАКТУ предикат назначения здесь действительно не рендерится,
// и это агентский выбор («без него политика короче»), который обессмыслил названную владельцем
// 17.06 функцию «Передача пациента между специалистами» (OWNER_VISION_BRAINDUMP_2026-06-17.md:55-56).
// Решение владельца 04.08 — IDENTITY_AND_MERGE_SCHEME.md §2e: межклиниковая стена остаётся в RLS,
// а видимость ВНУТРИ клиники («свои + переданные») фильтруется в порту идентичности, не здесь.
//
// Ниже — то, что этот рендерер делает по факту: пациентская стена абсолютна в enforce-режиме —
// a patient session
// (app_patient role + app.current_patient_user_id()) sees ONLY its own rows.
// A patient session can never become a member of app_staff (role membership is deploy-time DDL,
// not something a runtime session can grant itself — enforced by Postgres, not app code).
export function renderStaffOrPatientPredicate({
  patientColumn,
  castType = 'uuid',
  patientMode = 'enforce',
} = {}) {
  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error('Staff-or-patient predicate requires a patientColumn');
  }

  const patientPredicate = renderPatientPredicate({ patientColumn, mode: patientMode, castType });

  return `(${renderStaffActorCheck()} OR ${patientPredicate})`;
}

// For patient-owned columns that are NULLABLE because NULL means "not an individual patient's
// row" (org-shared/catalog row, e.g. public.media_folders standard/root folders) rather than
// "unknown/unlinked patient" — those rows must stay visible to everyone in the org (patients
// included), same as bootstrap-hybrid does for organization_id. Do not use this for ordinary
// nullable owner columns where NULL just means "not yet linked to a patient" (e.g.
// be_appointments.platform_user_id): those correctly fall through to deny-for-patients via the
// plain renderStaffOrPatientPredicate fail-closed semantics.
export function renderNullableSharedStaffOrPatientPredicate({
  patientColumn,
  castType = 'uuid',
  patientMode = 'enforce',
} = {}) {
  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error('Nullable shared staff-or-patient predicate requires a patientColumn');
  }

  const columnSql = quoteSqlIdentifier(patientColumn);

  return `(${columnSql} IS NULL OR ${renderStaffOrPatientPredicate({ patientColumn, castType, patientMode })})`;
}

export function renderNullableSharedPatientPredicate({
  patientColumn,
  castType = 'uuid',
  patientMode = 'enforce',
} = {}) {
  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error('Nullable shared patient predicate requires a patientColumn');
  }

  const columnSql = quoteSqlIdentifier(patientColumn);

  return `(${columnSql} IS NULL OR ${renderPatientPredicate({ patientColumn, mode: patientMode, castType })})`;
}

// B4-fanout gap closure (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #656):
// chain-only patient ownership — tables with NO direct patient-identifying column, where the
// owning patient is only reachable by walking one or more FK hops to a table that DOES carry one
// (e.g. integrator.user_reminder_delivery_logs -> integrator.user_reminder_occurrences ->
// public.reminder_rules, or public.support_delivery_events -> public.support_conversation_messages
// -> public.support_conversations).
// Rendered as a single EXISTS with a chain of INNER JOINs (not nested EXISTS) so a broken/NULL hop
// anywhere in the chain naturally fails the join and denies (fail-closed), matching the shape
// already proven live in smoke-p0-13-db-isolation.mjs for user_reminder_delivery_logs.
//
// `hops` is ordered from the OUTER (policy) row down to the terminal identity-owning table:
//   hops[0].localFk is a column on the OUTER row that equals hops[0].alias.parentPk.
//   hops[i>0].localFk is a column on hops[i-1].alias that equals hops[i].alias.parentPk.
// `terminalColumn` lives on the LAST hop's alias and is matched against the protected helper selected
// by `castType` (uuid -> app.current_patient_user_id(), bigint -> app.current_integrator_user_id()).
export function renderPatientChainPredicate({
  hops,
  terminalColumn,
  castType = 'uuid',
  mode = 'enforce',
} = {}) {
  assertPatientMode(mode);

  if (!Array.isArray(hops) || hops.length === 0) {
    throw new Error('Patient chain predicate requires at least one hop');
  }

  if (typeof terminalColumn !== 'string' || terminalColumn.length === 0) {
    throw new Error('Patient chain predicate requires a terminalColumn');
  }

  if (!patientCastTypes.has(castType)) {
    throw new Error(`Unsupported predicate cast type: ${castType}`);
  }

  const contextSql = patientContextSqlForCastType(castType);
  const fromParts = [];
  let previousAlias = null;

  hops.forEach((hop, index) => {
    if (
      typeof hop.table !== 'string' ||
      typeof hop.alias !== 'string' ||
      typeof hop.parentPk !== 'string' ||
      typeof hop.localFk !== 'string'
    ) {
      throw new Error(`Patient chain hop ${index} is missing table/alias/parentPk/localFk`);
    }

    const aliasSql = quoteSqlIdentifier(hop.alias);
    const tableSql = renderPolicyTarget(hop.table);

    if (index === 0) {
      fromParts.push(`FROM ${tableSql} AS ${aliasSql}`);
    } else {
      const previousAliasSql = quoteSqlIdentifier(previousAlias);
      fromParts.push(
        `JOIN ${tableSql} AS ${aliasSql} ON ${aliasSql}.${quoteSqlIdentifier(hop.parentPk)} = ${previousAliasSql}.${quoteSqlIdentifier(hop.localFk)}`,
      );
    }

    previousAlias = hop.alias;
  });

  const firstHop = hops[0];
  // Corrected 2026-07-26 (taskdb #1018): hops[0].localFk is meant to reference the OUTER (policy)
  // row, but left bare it is parsed inside the EXISTS subquery's own scope -- if hops[0]'s parent
  // table (hops[0].alias) happens to carry a column with the SAME NAME as localFk (e.g. bridging
  // through a shared bigint identity column like integrator_user_id, present verbatim on both sides
  // of the bridge), standard SQL name resolution binds the bare reference to the INNER subquery
  // scope instead of the outer row, turning the join into a self-referential tautology (b4f_x.col =
  // b4f_x.col, always true) and silently opening the table to every session with ANY matching
  // terminal identity -- exactly the isolation failure this predicate exists to prevent. Proven live
  // on a throwaway DB while building the public.reminder_occurrence_history <-> platform_users
  // bridge (both tables really do have a column named integrator_user_id). `outerQualifier` is
  // opt-in (only hops[0] can carry it) and defaults to unset, so every hop that doesn't need it
  // renders byte-identical SQL to before this fix.
  const outerLocalFkSql =
    typeof firstHop.outerQualifier === 'string' && firstHop.outerQualifier.length > 0
      ? `${quoteQualifiedName(firstHop.outerQualifier)}.${quoteSqlIdentifier(firstHop.localFk)}`
      : quoteSqlIdentifier(firstHop.localFk);
  const outerJoinCondition = `${quoteSqlIdentifier(firstHop.alias)}.${quoteSqlIdentifier(firstHop.parentPk)} = ${outerLocalFkSql}`;
  const lastAlias = hops[hops.length - 1].alias;
  const terminalSql = `${quoteSqlIdentifier(lastAlias)}.${quoteSqlIdentifier(terminalColumn)} = ${contextSql}`;
  const ownPredicate = `EXISTS ( SELECT 1 ${fromParts.join(' ')} WHERE ${outerJoinCondition} AND ${terminalSql} )`;

  if (mode === 'dormant_symmetric') {
    return `(${contextSql} IS NULL OR ${ownPredicate})`;
  }

  return `(${contextSql} IS NOT NULL AND ${ownPredicate})`;
}

export function renderStaffOrPatientChainPredicate({
  hops,
  terminalColumn,
  castType = 'uuid',
  patientMode = 'enforce',
} = {}) {
  return `(${renderStaffActorCheck()} OR ${renderPatientChainPredicate({ hops, terminalColumn, castType, mode: patientMode })})`;
}

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): dual-role owner
// column — a row is visible to a patient session if EITHER it is a shared/library row (the
// discriminator column is NOT the excluded "individual submission" tag — IS DISTINCT FROM is used
// instead of <> so a NULL discriminator value, which also means "shared", is not silently excluded
// by 3-valued NULL logic) OR the row's owner column matches the patient's own identity. Used for
// public.media_files (uploaded_by / usage_purpose <> 'program_item_submission').
export function renderConditionalPatientPredicate({
  patientColumn,
  castType = 'uuid',
  discriminatorColumn,
  discriminatorExcludedValue,
  mode = 'enforce',
} = {}) {
  assertPatientMode(mode);

  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error('Conditional patient predicate requires a patientColumn');
  }

  if (typeof discriminatorColumn !== 'string' || discriminatorColumn.length === 0) {
    throw new Error('Conditional patient predicate requires a discriminatorColumn');
  }

  if (typeof discriminatorExcludedValue !== 'string' || discriminatorExcludedValue.length === 0) {
    throw new Error('Conditional patient predicate requires a discriminatorExcludedValue');
  }

  const patientContextSql = patientContextSqlForCastType(castType);
  const sharedBranch = `${quoteSqlIdentifier(discriminatorColumn)} IS DISTINCT FROM ${quoteSqlLiteral(discriminatorExcludedValue)}`;
  const ownBranch = `${quoteSqlIdentifier(patientColumn)} = ${patientContextSql}`;
  const ownOrSharedPredicate = `(${sharedBranch} OR ${ownBranch})`;

  if (mode === 'dormant_symmetric') {
    return `(${patientContextSql} IS NULL OR ${ownOrSharedPredicate})`;
  }

  return `(${patientContextSql} IS NOT NULL AND ${ownOrSharedPredicate})`;
}

export function renderStaffOrConditionalPatientPredicate(config, { patientMode = 'enforce' } = {}) {
  return `(${renderStaffActorCheck()} OR ${renderConditionalPatientPredicate({ ...config, mode: patientMode })})`;
}

// B4-core-4: same dual-role shape as renderConditionalPatientPredicate, but the owner/discriminator
// columns live on a SINGLE parent row reached via one FK hop (e.g. public.media_transcode_jobs ->
// public.media_files via media_id), not on the policy row itself.
export function renderConditionalChainPatientPredicate({
  hop,
  patientColumn,
  castType = 'uuid',
  discriminatorColumn,
  discriminatorExcludedValue,
  mode = 'enforce',
} = {}) {
  assertPatientMode(mode);

  if (
    !hop ||
    typeof hop.table !== 'string' ||
    typeof hop.alias !== 'string' ||
    typeof hop.parentPk !== 'string' ||
    typeof hop.localFk !== 'string'
  ) {
    throw new Error(
      'Conditional chain patient predicate requires a hop with table/alias/parentPk/localFk',
    );
  }

  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error('Conditional chain patient predicate requires a patientColumn');
  }

  if (typeof discriminatorColumn !== 'string' || discriminatorColumn.length === 0) {
    throw new Error('Conditional chain patient predicate requires a discriminatorColumn');
  }

  if (typeof discriminatorExcludedValue !== 'string' || discriminatorExcludedValue.length === 0) {
    throw new Error('Conditional chain patient predicate requires a discriminatorExcludedValue');
  }

  const patientContextSql = patientContextSqlForCastType(castType);
  const aliasSql = quoteSqlIdentifier(hop.alias);
  const sharedBranch = `${aliasSql}.${quoteSqlIdentifier(discriminatorColumn)} IS DISTINCT FROM ${quoteSqlLiteral(discriminatorExcludedValue)}`;
  const ownBranch = `${aliasSql}.${quoteSqlIdentifier(patientColumn)} = ${patientContextSql}`;
  const existsSql = [
    'EXISTS (',
    `SELECT 1 FROM ${renderPolicyTarget(hop.table)} AS ${aliasSql}`,
    `WHERE ${aliasSql}.${quoteSqlIdentifier(hop.parentPk)} = ${quoteSqlIdentifier(hop.localFk)}`,
    `AND (${sharedBranch} OR ${ownBranch})`,
    ')',
  ].join(' ');

  if (mode === 'dormant_symmetric') {
    return `(${patientContextSql} IS NULL OR ${existsSql})`;
  }

  return `(${patientContextSql} IS NOT NULL AND ${existsSql})`;
}

export function renderStaffOrConditionalChainPatientPredicate(
  config,
  { patientMode = 'enforce' } = {},
) {
  return `(${renderStaffActorCheck()} OR ${renderConditionalChainPatientPredicate({ ...config, mode: patientMode })})`;
}

// B4-core-4: polymorphic ownership (e.g. public.comments.target_type/target_id) — some target_type
// values are shared/catalog rows (visible to any org member, patients included, no extra check
// beyond org); others resolve to a per-patient instance (a chain predicate keyed by that specific
// target_type value). A row matches if EITHER its target_type is one of the shared/catalog values
// OR its target_type is a registered patient-instance variant AND that variant's chain resolves to
// the requesting patient. Reuses renderPatientChainPredicate per variant (hops[0].localFk is the
// polymorphic id column on the policy row itself, e.g. "target_id").
export function renderPolymorphicPatientPredicate({
  typeColumn,
  sharedTypeValues = [],
  variants = [],
  mode = 'enforce',
} = {}) {
  assertPatientMode(mode);

  if (typeof typeColumn !== 'string' || typeColumn.length === 0) {
    throw new Error('Polymorphic patient predicate requires a typeColumn');
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Polymorphic patient predicate requires at least one variant');
  }

  const typeColumnSql = quoteSqlIdentifier(typeColumn);
  const branches = [];

  if (sharedTypeValues.length > 0) {
    const list = sharedTypeValues.map(quoteSqlLiteral).join(', ');
    branches.push(`${typeColumnSql} = ANY (ARRAY[${list}]::text[])`);
  }

  for (const variant of variants) {
    if (typeof variant.typeValue !== 'string' || variant.typeValue.length === 0) {
      throw new Error('Polymorphic patient predicate variant requires a typeValue');
    }

    const chainPredicate = renderPatientChainPredicate({
      hops: variant.hops,
      terminalColumn: variant.terminalColumn,
      castType: variant.castType ?? 'uuid',
      mode: 'enforce',
    });

    branches.push(
      `(${typeColumnSql} = ${quoteSqlLiteral(variant.typeValue)} AND ${chainPredicate})`,
    );
  }

  const ownOrSharedPredicate = `(${branches.join(' OR ')})`;
  if (mode === 'dormant_symmetric') {
    const dormantContextUnsetPredicate = Array.from(
      new Set(variants.map((variant) => patientContextSqlForCastType(variant.castType ?? 'uuid'))),
    )
      .map((contextSql) => `${contextSql} IS NULL`)
      .join(' AND ');

    return `(${dormantContextUnsetPredicate} OR ${ownOrSharedPredicate})`;
  }

  return ownOrSharedPredicate;
}

export function renderStaffOrPolymorphicPatientPredicate(config, { patientMode = 'enforce' } = {}) {
  return `(${renderStaffActorCheck()} OR ${renderPolymorphicPatientPredicate({ ...config, mode: patientMode })})`;
}

export function renderStaffOrPatientPredicateForDescriptor(
  descriptor,
  { patientMode = 'enforce' } = {},
) {
  if (descriptor.patientPolymorphic) {
    return renderStaffOrPolymorphicPatientPredicate(descriptor.patientPolymorphic, { patientMode });
  }

  if (descriptor.patientConditionalChain) {
    return renderStaffOrConditionalChainPatientPredicate(descriptor.patientConditionalChain, {
      patientMode,
    });
  }

  if (descriptor.patientConditional) {
    return renderStaffOrConditionalPatientPredicate(descriptor.patientConditional, { patientMode });
  }

  if (descriptor.patientChain) {
    return renderStaffOrPatientChainPredicate({ ...descriptor.patientChain, patientMode });
  }

  const render = descriptor.patientColumnNullableShared
    ? renderNullableSharedStaffOrPatientPredicate
    : renderStaffOrPatientPredicate;

  return render({
    patientColumn: descriptor.patientColumn,
    castType: descriptor.patientColumnCastType ?? 'uuid',
    patientMode,
  });
}

export function renderPatientPredicateForDescriptor(descriptor, { patientMode = 'enforce' } = {}) {
  if (descriptor.patientPolymorphic) {
    return renderPolymorphicPatientPredicate(descriptor.patientPolymorphic, { mode: patientMode });
  }

  if (descriptor.patientConditionalChain) {
    return renderConditionalChainPatientPredicate({
      ...descriptor.patientConditionalChain,
      mode: patientMode,
    });
  }

  if (descriptor.patientConditional) {
    return renderConditionalPatientPredicate({
      ...descriptor.patientConditional,
      mode: patientMode,
    });
  }

  if (descriptor.patientChain) {
    return renderPatientChainPredicate({ ...descriptor.patientChain, mode: patientMode });
  }

  const render = descriptor.patientColumnNullableShared
    ? renderNullableSharedPatientPredicate
    : renderPatientPredicate;

  return render({
    patientColumn: descriptor.patientColumn,
    castType: descriptor.patientColumnCastType ?? 'uuid',
    patientMode,
    mode: patientMode,
  });
}

// B4-core-4: true if the descriptor declares ANY patient-ownership shape (direct column, chain,
// conditional/dual-role, conditional chain, or polymorphic) — single chokepoint so callers don't
// have to keep an ever-growing `descriptor.patientColumn || descriptor.patientChain || ...` list in
// sync across every render*PolicyStatements function.
export function hasAnyPatientOwnership(descriptor) {
  return Boolean(
    descriptor?.patientColumn ||
    descriptor?.patientChain ||
    descriptor?.patientConditional ||
    descriptor?.patientConditionalChain ||
    descriptor?.patientPolymorphic,
  );
}

// Combines an org predicate (dormant or enforce) with the (always fail-closed) patient wall for
// direct_org_column / denorm_org_column / self_org_id descriptors that declare patientColumn.
export function renderOrgAndPatientPredicate(
  descriptor,
  { mode = 'dormant_permissive', patientMode = 'enforce' } = {},
) {
  const orgPredicate = renderOrgPredicate(descriptor, { mode });

  return `(${orgPredicate} AND ${renderStaffOrPatientPredicateForDescriptor(descriptor, { patientMode })})`;
}

export function renderBootstrapHybridPredicate({ orgColumn = 'organization_id' } = {}) {
  const columnSql = quoteSqlIdentifier(orgColumn);

  return `(${columnSql} IS NULL OR (${orgContextSql} IS NOT NULL AND ${columnSql} = ${orgContextSql}))`;
}

export function renderBootstrapHybridOrgGatedPredicate({ orgColumn = 'organization_id' } = {}) {
  const columnSql = quoteSqlIdentifier(orgColumn);

  return `((${orgContextSql} IS NOT NULL AND ${columnSql} = ${orgContextSql}) OR (${columnSql} IS NULL AND ${dormantCompatibilityPredicate}))`;
}

export function renderBootstrapRuntimeAudiencePredicate({
  orgColumn = 'organization_id',
  audienceColumn = 'audience',
  safeAudiences = ['public', 'authenticated_client'],
} = {}) {
  if (
    !Array.isArray(safeAudiences) ||
    safeAudiences.length === 0 ||
    safeAudiences.some((audience) => !['public', 'authenticated_client'].includes(audience))
  ) {
    throw new Error(
      'Runtime audience predicate accepts only public/authenticated_client audiences',
    );
  }

  const audienceSql = quoteSqlIdentifier(audienceColumn);
  const safeAudienceSql = safeAudiences.map(quoteSqlLiteral).join(', ');
  const orgPredicate = renderBootstrapHybridPredicate({ orgColumn });

  return `(NOT pg_has_role(current_user, 'app_worker', 'member') AND ${audienceSql} IN (${safeAudienceSql}) AND ${orgPredicate})`;
}

export function renderPolicyTarget(table) {
  return quoteQualifiedName(table);
}

export function renderEnableRowLevelSecurity(target) {
  return `ALTER TABLE ${renderPolicyTarget(target)} ENABLE ROW LEVEL SECURITY;`;
}

export function renderForceRowLevelSecurity(target) {
  return `ALTER TABLE ${renderPolicyTarget(target)} FORCE ROW LEVEL SECURITY;`;
}

export function renderDropPolicy({ policyName, target }) {
  return `DROP POLICY IF EXISTS ${quoteSqlIdentifier(policyName)} ON ${renderPolicyTarget(target)};`;
}

export function renderCreatePolicy({ policyName, target, predicate }) {
  const policySql = quoteSqlIdentifier(policyName);
  const targetSql = renderPolicyTarget(target);

  if (typeof predicate !== 'string' || predicate.length === 0) {
    throw new Error('Policy predicate must be a non-empty string');
  }

  return `CREATE POLICY ${policySql} ON ${targetSql} FOR ALL USING (${predicate}) WITH CHECK (${predicate});`;
}

export function renderOrgDormantPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== 'direct_org_column') {
    throw new Error(
      `Direct-org policy requires direct_org_column descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const predicate = hasAnyPatientOwnership(descriptor)
    ? renderOrgAndPatientPredicate(descriptor, {
        mode: 'dormant_permissive',
        patientMode: 'dormant_symmetric',
      })
    : renderOrgPredicate(descriptor, { mode: 'dormant_permissive' });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

export function renderOrgColumnDormantPolicyStatements(descriptor, { policyName, scopingKinds }) {
  const allowedKinds = new Set(scopingKinds);

  if (!allowedKinds.has(descriptor?.scopingKind)) {
    throw new Error(
      `Org-column policy requires ${Array.from(allowedKinds).join('/')} descriptor for ${
        descriptor?.table ?? '<unknown>'
      }`,
    );
  }

  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const predicate = hasAnyPatientOwnership(descriptor)
    ? renderOrgAndPatientPredicate(descriptor, {
        mode: 'dormant_permissive',
        patientMode: 'dormant_symmetric',
      })
    : renderOrgPredicate(descriptor, { mode: 'dormant_permissive' });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

export function renderBootstrapHybridPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== 'bootstrap_hybrid') {
    throw new Error(
      `Bootstrap hybrid policy requires bootstrap_hybrid descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const predicate = renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

export function renderBootstrapHybridOrgGatedPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== 'bootstrap_hybrid_org_gated') {
    throw new Error(
      `Bootstrap hybrid org-gated policy requires bootstrap_hybrid_org_gated descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const strictPredicate = renderBootstrapHybridOrgGatedPredicate({
    orgColumn: descriptor.orgColumn,
  });
  const predicate = `((${dormantCompatibilityPredicate}) OR ${strictPredicate})`;

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

function renderFkPathExists({ table, alias, parentPk, localFk, parentOrgColumn }) {
  return [
    'EXISTS (',
    `SELECT 1 FROM ${renderPolicyTarget(table)} AS ${quoteSqlIdentifier(alias)}`,
    `WHERE ${quoteSqlIdentifier(alias)}.${quoteSqlIdentifier(parentPk)} = ${quoteSqlIdentifier(localFk)}`,
    `AND ${quoteSqlIdentifier(alias)}.${quoteSqlIdentifier(parentOrgColumn)} = ${orgContextSql}`,
    ')',
  ].join(' ');
}

export function renderFkPathPredicate(descriptor, { mode = 'dormant_permissive' } = {}) {
  assertMode(mode);

  if (descriptor?.scopingKind !== 'fk_path') {
    throw new Error(
      `FK-path predicate requires fk_path descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  const fkPath = descriptor.fkPath;

  if (
    !fkPath?.parentTable ||
    !fkPath?.localFk ||
    !fkPath?.parentPk ||
    !fkPath?.parentOrgColumn ||
    !fkPath?.crossCheckTable ||
    !fkPath?.crossCheckLocalFk ||
    !fkPath?.crossCheckPk ||
    !fkPath?.crossCheckOrgColumn
  ) {
    throw new Error(`FK-path descriptor ${descriptor.table} is missing path metadata`);
  }

  const pathPredicate = `(${renderFkPathExists({
    table: fkPath.parentTable,
    alias: 'p0_8_4_parent',
    parentPk: fkPath.parentPk,
    localFk: fkPath.localFk,
    parentOrgColumn: fkPath.parentOrgColumn,
  })} AND ${renderFkPathExists({
    table: fkPath.crossCheckTable,
    alias: 'p0_8_4_cross',
    parentPk: fkPath.crossCheckPk,
    localFk: fkPath.crossCheckLocalFk,
    parentOrgColumn: fkPath.crossCheckOrgColumn,
  })})`;

  if (mode === 'dormant_permissive') {
    return `(${orgContextSql} IS NULL OR ${pathPredicate})`;
  }

  return `(${orgContextSql} IS NOT NULL AND ${pathPredicate})`;
}

// fk_path patient wall: the patient-owner column lives on the SAME immediate FK parent already
// used for the org fk_path predicate (e.g. public.be_patient_package_items -> parent
// public.be_patient_packages.platform_user_id), so this reuses the same parent-lookup shape as
// renderFkPathExists above, just checking the patient column instead of the org column.
export function renderFkPathPatientPredicate(descriptor) {
  if (descriptor?.scopingKind !== 'fk_path') {
    throw new Error(
      `FK-path patient predicate requires fk_path descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  const fkPath = descriptor.fkPath;
  const patientColumn = descriptor.patientColumn;
  const castType = descriptor.patientColumnCastType ?? 'uuid';

  if (!fkPath?.parentTable || !fkPath?.parentPk || !fkPath?.localFk) {
    throw new Error(
      `FK-path patient predicate for ${descriptor.table} is missing parent path metadata`,
    );
  }

  if (typeof patientColumn !== 'string' || patientColumn.length === 0) {
    throw new Error(`FK-path patient predicate for ${descriptor.table} requires a patientColumn`);
  }

  const patientContextSql = patientContextSqlForCastType(castType);
  const parentAlias = quoteSqlIdentifier('p0_8_4_patient_parent');
  const existsSql = [
    'EXISTS (',
    `SELECT 1 FROM ${renderPolicyTarget(fkPath.parentTable)} AS ${parentAlias}`,
    `WHERE ${parentAlias}.${quoteSqlIdentifier(fkPath.parentPk)} = ${quoteSqlIdentifier(fkPath.localFk)}`,
    `AND ${parentAlias}.${quoteSqlIdentifier(patientColumn)} = ${patientContextSql}`,
    ')',
  ].join(' ');

  return `(${patientContextSql} IS NOT NULL AND ${existsSql})`;
}

export function renderFkPathAndPatientPredicate(
  descriptor,
  { mode = 'dormant_permissive', patientMode = 'enforce' } = {},
) {
  assertPatientMode(patientMode);

  const orgPredicate = renderFkPathPredicate(descriptor, { mode });
  const patientContextSql = patientContextSqlForCastType(
    descriptor.patientColumnCastType ?? 'uuid',
  );
  const patientPredicate = renderFkPathPatientPredicate(descriptor);
  const staffOrPatient =
    patientMode === 'dormant_symmetric'
      ? `(${renderStaffActorCheck()} OR ${patientContextSql} IS NULL OR ${patientPredicate})`
      : `(${renderStaffActorCheck()} OR ${patientPredicate})`;

  return `(${orgPredicate} AND ${staffOrPatient})`;
}

export function renderFkPathDormantPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== 'fk_path') {
    throw new Error(
      `FK-path policy requires fk_path descriptor for ${descriptor?.table ?? '<unknown>'}`,
    );
  }

  if (typeof policyName !== 'string' || policyName.length === 0) {
    throw new Error('Policy name must be a non-empty string');
  }

  const predicate = descriptor.patientColumn
    ? renderFkPathAndPatientPredicate(descriptor, {
        mode: 'dormant_permissive',
        patientMode: 'dormant_symmetric',
      })
    : renderFkPathPredicate(descriptor, { mode: 'dormant_permissive' });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}
