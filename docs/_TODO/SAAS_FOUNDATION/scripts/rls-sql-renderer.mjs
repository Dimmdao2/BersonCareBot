const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const gucNamePattern = /^app\.[a-z0-9_]+$/;

export const rlsPredicateModes = new Set(["dormant_permissive", "enforce"]);

export function quoteSqlIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.length === 0) {
    throw new Error("SQL identifier must be a non-empty string");
  }

  if (!identifierPattern.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

export function quoteQualifiedName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("SQL qualified name must be a non-empty string");
  }

  return name.split(".").map(quoteSqlIdentifier).join(".");
}

export function renderNullableTextGuc(gucName) {
  if (typeof gucName !== "string" || !gucNamePattern.test(gucName)) {
    throw new Error(`Unsafe GUC name: ${gucName}`);
  }

  return `NULLIF(current_setting('${gucName}', true), '')`;
}

function assertMode(mode) {
  if (!rlsPredicateModes.has(mode)) {
    throw new Error(`Unsupported RLS predicate mode: ${mode}`);
  }
}

const patientCastTypes = new Set(["uuid", "bigint"]);

function renderUuidColumnMatchesGuc({ column, gucName, mode, castType = "uuid" }) {
  assertMode(mode);

  if (!patientCastTypes.has(castType)) {
    throw new Error(`Unsupported predicate cast type: ${castType}`);
  }

  const columnSql = quoteSqlIdentifier(column);
  const gucSql = renderNullableTextGuc(gucName);

  if (mode === "dormant_permissive") {
    return `(${gucSql} IS NULL OR ${columnSql} = ${gucSql}::${castType})`;
  }

  return `(${gucSql} IS NOT NULL AND ${columnSql} = ${gucSql}::${castType})`;
}

export function renderOrgPredicate(descriptor, { mode = "dormant_permissive" } = {}) {
  const orgColumn = descriptor?.orgColumn;

  if (typeof orgColumn !== "string" || orgColumn.length === 0) {
    throw new Error("Org predicate requires descriptor.orgColumn");
  }

  return renderUuidColumnMatchesGuc({
    column: orgColumn,
    gucName: "app.org",
    mode,
  });
}

// B4-core (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md): patient predicates are ALWAYS
// fail-closed ("enforce" semantics for the patient branch itself), regardless of whether the
// surrounding org predicate is rendered dormant_permissive or enforce. There is no
// "dormant_permissive" patient mode — unset/empty app.patient_user_id never widens visibility.
export function renderPatientPredicate({ patientColumn = "platform_user_id", mode = "enforce", castType = "uuid" } = {}) {
  return renderUuidColumnMatchesGuc({
    column: patientColumn,
    gucName: "app.patient_user_id",
    mode,
    castType,
  });
}

export function renderStaffActorCheck() {
  return `${renderNullableTextGuc("app.actor")} = 'staff'`;
}

// Owner decision 2026-07-11 (B4-core): doctor/staff visibility is org-wide (variant A, no
// assignment predicate); the patient wall is absolute — a patient session (app.actor='patient' +
// app.patient_user_id) sees ONLY its own rows, and an unset/empty context denies (fail-closed).
// A patient session can never set app.actor='staff' (separate authenticated code path — enforced
// at the app layer, out of scope here / B4-fanout).
export function renderStaffOrPatientPredicate({ patientColumn, castType = "uuid" } = {}) {
  if (typeof patientColumn !== "string" || patientColumn.length === 0) {
    throw new Error("Staff-or-patient predicate requires a patientColumn");
  }

  const patientPredicate = renderPatientPredicate({ patientColumn, mode: "enforce", castType });

  return `(${renderStaffActorCheck()} OR ${patientPredicate})`;
}

// For patient-owned columns that are NULLABLE because NULL means "not an individual patient's
// row" (org-shared/catalog row, e.g. public.media_folders standard/root folders) rather than
// "unknown/unlinked patient" — those rows must stay visible to everyone in the org (patients
// included), same as bootstrap-hybrid does for organization_id. Do not use this for ordinary
// nullable owner columns where NULL just means "not yet linked to a patient" (e.g.
// be_appointments.platform_user_id): those correctly fall through to deny-for-patients via the
// plain renderStaffOrPatientPredicate fail-closed semantics.
export function renderNullableSharedStaffOrPatientPredicate({ patientColumn, castType = "uuid" } = {}) {
  if (typeof patientColumn !== "string" || patientColumn.length === 0) {
    throw new Error("Nullable shared staff-or-patient predicate requires a patientColumn");
  }

  const columnSql = quoteSqlIdentifier(patientColumn);

  return `(${columnSql} IS NULL OR ${renderStaffOrPatientPredicate({ patientColumn, castType })})`;
}

export function renderStaffOrPatientPredicateForDescriptor(descriptor) {
  const render = descriptor.patientColumnNullableShared
    ? renderNullableSharedStaffOrPatientPredicate
    : renderStaffOrPatientPredicate;

  return render({
    patientColumn: descriptor.patientColumn,
    castType: descriptor.patientColumnCastType ?? "uuid",
  });
}

// Combines an org predicate (dormant or enforce) with the (always fail-closed) patient wall for
// direct_org_column / denorm_org_column / self_org_id descriptors that declare patientColumn.
export function renderOrgAndPatientPredicate(descriptor, { mode = "dormant_permissive" } = {}) {
  const orgPredicate = renderOrgPredicate(descriptor, { mode });

  return `(${orgPredicate} AND ${renderStaffOrPatientPredicateForDescriptor(descriptor)})`;
}

export function renderBootstrapHybridPredicate({ orgColumn = "organization_id" } = {}) {
  const columnSql = quoteSqlIdentifier(orgColumn);
  const gucSql = renderNullableTextGuc("app.org");

  return `(${columnSql} IS NULL OR (${gucSql} IS NOT NULL AND ${columnSql} = ${gucSql}::uuid))`;
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

  if (typeof predicate !== "string" || predicate.length === 0) {
    throw new Error("Policy predicate must be a non-empty string");
  }

  return `CREATE POLICY ${policySql} ON ${targetSql} FOR ALL USING (${predicate}) WITH CHECK (${predicate});`;
}

export function renderOrgDormantPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== "direct_org_column") {
    throw new Error(`Direct-org policy requires direct_org_column descriptor for ${descriptor?.table ?? "<unknown>"}`);
  }

  if (typeof policyName !== "string" || policyName.length === 0) {
    throw new Error("Policy name must be a non-empty string");
  }

  const predicate = descriptor.patientColumn
    ? renderOrgAndPatientPredicate(descriptor, { mode: "dormant_permissive" })
    : renderOrgPredicate(descriptor, { mode: "dormant_permissive" });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderForceRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

export function renderOrgColumnDormantPolicyStatements(descriptor, { policyName, scopingKinds }) {
  const allowedKinds = new Set(scopingKinds);

  if (!allowedKinds.has(descriptor?.scopingKind)) {
    throw new Error(
      `Org-column policy requires ${Array.from(allowedKinds).join("/")} descriptor for ${
        descriptor?.table ?? "<unknown>"
      }`,
    );
  }

  if (typeof policyName !== "string" || policyName.length === 0) {
    throw new Error("Policy name must be a non-empty string");
  }

  const predicate = descriptor.patientColumn
    ? renderOrgAndPatientPredicate(descriptor, { mode: "dormant_permissive" })
    : renderOrgPredicate(descriptor, { mode: "dormant_permissive" });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderForceRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

export function renderBootstrapHybridPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== "bootstrap_hybrid") {
    throw new Error(`Bootstrap hybrid policy requires bootstrap_hybrid descriptor for ${descriptor?.table ?? "<unknown>"}`);
  }

  if (typeof policyName !== "string" || policyName.length === 0) {
    throw new Error("Policy name must be a non-empty string");
  }

  const predicate = renderBootstrapHybridPredicate({ orgColumn: descriptor.orgColumn });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderForceRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}

function renderFkPathExists({ table, alias, parentPk, localFk, parentOrgColumn, gucSql }) {
  return [
    "EXISTS (",
    `SELECT 1 FROM ${renderPolicyTarget(table)} AS ${quoteSqlIdentifier(alias)}`,
    `WHERE ${quoteSqlIdentifier(alias)}.${quoteSqlIdentifier(parentPk)} = ${quoteSqlIdentifier(localFk)}`,
    `AND ${quoteSqlIdentifier(alias)}.${quoteSqlIdentifier(parentOrgColumn)} = ${gucSql}::uuid`,
    ")",
  ].join(" ");
}

export function renderFkPathPredicate(descriptor, { mode = "dormant_permissive" } = {}) {
  assertMode(mode);

  if (descriptor?.scopingKind !== "fk_path") {
    throw new Error(`FK-path predicate requires fk_path descriptor for ${descriptor?.table ?? "<unknown>"}`);
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

  const gucSql = renderNullableTextGuc("app.org");
  const pathPredicate = `(${renderFkPathExists({
    table: fkPath.parentTable,
    alias: "p0_8_4_parent",
    parentPk: fkPath.parentPk,
    localFk: fkPath.localFk,
    parentOrgColumn: fkPath.parentOrgColumn,
    gucSql,
  })} AND ${renderFkPathExists({
    table: fkPath.crossCheckTable,
    alias: "p0_8_4_cross",
    parentPk: fkPath.crossCheckPk,
    localFk: fkPath.crossCheckLocalFk,
    parentOrgColumn: fkPath.crossCheckOrgColumn,
    gucSql,
  })})`;

  if (mode === "dormant_permissive") {
    return `(${gucSql} IS NULL OR ${pathPredicate})`;
  }

  return `(${gucSql} IS NOT NULL AND ${pathPredicate})`;
}

// fk_path patient wall: the patient-owner column lives on the SAME immediate FK parent already
// used for the org fk_path predicate (e.g. public.be_patient_package_items -> parent
// public.be_patient_packages.platform_user_id), so this reuses the same parent-lookup shape as
// renderFkPathExists above, just checking the patient column instead of the org column.
export function renderFkPathPatientPredicate(descriptor) {
  if (descriptor?.scopingKind !== "fk_path") {
    throw new Error(`FK-path patient predicate requires fk_path descriptor for ${descriptor?.table ?? "<unknown>"}`);
  }

  const fkPath = descriptor.fkPath;
  const patientColumn = descriptor.patientColumn;
  const castType = descriptor.patientColumnCastType ?? "uuid";

  if (!fkPath?.parentTable || !fkPath?.parentPk || !fkPath?.localFk) {
    throw new Error(`FK-path patient predicate for ${descriptor.table} is missing parent path metadata`);
  }

  if (typeof patientColumn !== "string" || patientColumn.length === 0) {
    throw new Error(`FK-path patient predicate for ${descriptor.table} requires a patientColumn`);
  }

  const patientGucSql = renderNullableTextGuc("app.patient_user_id");
  const parentAlias = quoteSqlIdentifier("p0_8_4_patient_parent");
  const existsSql = [
    "EXISTS (",
    `SELECT 1 FROM ${renderPolicyTarget(fkPath.parentTable)} AS ${parentAlias}`,
    `WHERE ${parentAlias}.${quoteSqlIdentifier(fkPath.parentPk)} = ${quoteSqlIdentifier(fkPath.localFk)}`,
    `AND ${parentAlias}.${quoteSqlIdentifier(patientColumn)} = ${patientGucSql}::${castType}`,
    ")",
  ].join(" ");

  return `(${patientGucSql} IS NOT NULL AND ${existsSql})`;
}

export function renderFkPathAndPatientPredicate(descriptor, { mode = "dormant_permissive" } = {}) {
  const orgPredicate = renderFkPathPredicate(descriptor, { mode });
  const staffOrPatient = `(${renderStaffActorCheck()} OR ${renderFkPathPatientPredicate(descriptor)})`;

  return `(${orgPredicate} AND ${staffOrPatient})`;
}

export function renderFkPathDormantPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== "fk_path") {
    throw new Error(`FK-path policy requires fk_path descriptor for ${descriptor?.table ?? "<unknown>"}`);
  }

  if (typeof policyName !== "string" || policyName.length === 0) {
    throw new Error("Policy name must be a non-empty string");
  }

  const predicate = descriptor.patientColumn
    ? renderFkPathAndPatientPredicate(descriptor, { mode: "dormant_permissive" })
    : renderFkPathPredicate(descriptor, { mode: "dormant_permissive" });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderForceRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}
