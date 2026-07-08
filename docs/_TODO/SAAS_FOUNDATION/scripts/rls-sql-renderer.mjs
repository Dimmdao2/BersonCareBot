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

