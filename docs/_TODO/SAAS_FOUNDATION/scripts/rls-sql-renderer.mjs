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

function renderUuidColumnMatchesGuc({ column, gucName, mode }) {
  assertMode(mode);

  const columnSql = quoteSqlIdentifier(column);
  const gucSql = renderNullableTextGuc(gucName);

  if (mode === "dormant_permissive") {
    return `(${gucSql} IS NULL OR ${columnSql} = ${gucSql}::uuid)`;
  }

  return `(${gucSql} IS NOT NULL AND ${columnSql} = ${gucSql}::uuid)`;
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

export function renderPatientPredicate({ patientColumn = "platform_user_id", mode = "enforce" } = {}) {
  return renderUuidColumnMatchesGuc({
    column: patientColumn,
    gucName: "app.patient_user_id",
    mode,
  });
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

  const predicate = renderOrgPredicate(descriptor, { mode: "dormant_permissive" });

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

  const predicate = renderOrgPredicate(descriptor, { mode: "dormant_permissive" });

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

export function renderFkPathDormantPolicyStatements(descriptor, { policyName }) {
  if (descriptor?.scopingKind !== "fk_path") {
    throw new Error(`FK-path policy requires fk_path descriptor for ${descriptor?.table ?? "<unknown>"}`);
  }

  if (typeof policyName !== "string" || policyName.length === 0) {
    throw new Error("Policy name must be a non-empty string");
  }

  const predicate = renderFkPathPredicate(descriptor, { mode: "dormant_permissive" });

  return [
    renderEnableRowLevelSecurity(descriptor.table),
    renderForceRowLevelSecurity(descriptor.table),
    renderDropPolicy({ policyName, target: descriptor.table }),
    renderCreatePolicy({ policyName, target: descriptor.table, predicate }),
  ];
}
