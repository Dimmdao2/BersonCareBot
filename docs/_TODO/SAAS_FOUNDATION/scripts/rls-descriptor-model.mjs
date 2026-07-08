import { readFileSync } from "node:fs";

const root = "docs/_TODO/SAAS_FOUNDATION";

export const paths = {
  tiers: `${root}/scope-derivation/tiers-218.tsv`,
  batches: `${root}/scope-derivation/p0-4-batches.tsv`,
  beFkPaths: `${root}/scope-derivation/p0-4-be-fk-paths.tsv`,
};

export const tiers = new Set(["SCOPED", "BOOTSTRAP", "INFRA", "LEGACY", "TELEMETRY"]);

export const scopedKinds = new Set([
  "direct_org_column",
  "denorm_org_column",
  "fk_path",
  "self_org_id",
  "polymorphic_resolver",
]);

const denormResolutions = new Set([
  "attempt_parent_denorm",
  "audit_parent_denorm",
  "content_parent_denorm",
  "media_parent_denorm",
  "parent_denorm_copy",
  "parent_or_patient_org",
  "program_parent_denorm",
  "reference_parent_denorm",
]);

const polymorphicResolutions = new Set(["polymorphic_resolver"]);

const bootstrapHybridTables = new Set([
  "integrator.system_settings",
  "public.platform_user_contacts",
  "public.system_settings",
  "public.user_phone_history",
]);

function readLines(path) {
  return readFileSync(path, "utf8").trimEnd().split("\n").filter(Boolean);
}

function readTsv(path, expectedHeader) {
  const lines = readLines(path);
  const header = lines.shift();

  if (header !== expectedHeader.join("\t")) {
    throw new Error(`Unexpected header in ${path}: ${header}`);
  }

  return lines.map((line, index) => {
    const fields = line.split("\t");

    if (fields.length !== expectedHeader.length) {
      throw new Error(
        `Expected ${expectedHeader.length} fields in ${path}:${index + 2}, got ${fields.length}`,
      );
    }

    return Object.fromEntries(expectedHeader.map((key, fieldIndex) => [key, fields[fieldIndex]]));
  });
}

export function readTierRows() {
  return readLines(paths.tiers).map((line, index) => {
    const [tier, table] = line.split("|");

    if (!tiers.has(tier) || !table) {
      throw new Error(`Invalid tier row in ${paths.tiers}:${index + 1}`);
    }

    return { tier, table };
  });
}

export function readBatchRows() {
  return readTsv(paths.batches, ["batch", "table", "org_resolution", "implementation_note"]);
}

export function readBeFkPathRows() {
  return readTsv(paths.beFkPaths, [
    "table",
    "parent_table",
    "local_fk",
    "parent_pk",
    "parent_org_column",
    "cross_check_table",
    "cross_check_local_fk",
    "cross_check_pk",
    "cross_check_org_column",
  ]);
}

function scopedDescriptorFromBatch(row) {
  if (denormResolutions.has(row.org_resolution)) {
    return {
      tier: "SCOPED",
      scopingKind: "denorm_org_column",
      predicateTemplate: "org_column_matches_app_org",
      orgColumn: "organization_id",
      source: row.org_resolution,
      sourceStage: row.batch,
    };
  }

  if (polymorphicResolutions.has(row.org_resolution)) {
    return {
      tier: "SCOPED",
      scopingKind: "polymorphic_resolver",
      predicateTemplate: "org_column_matches_app_org",
      orgColumn: "organization_id",
      source: row.org_resolution,
      sourceStage: row.batch,
      requiresFollowupStage: "P0.12.1",
    };
  }

  return {
    tier: "SCOPED",
    scopingKind: "direct_org_column",
    predicateTemplate: "org_column_matches_app_org",
    orgColumn: "organization_id",
    source: row.org_resolution,
    sourceStage: row.batch,
  };
}

function scopedDescriptorForBeTable(table) {
  if (table === "public.be_organizations") {
    return {
      tier: "SCOPED",
      scopingKind: "self_org_id",
      predicateTemplate: "self_id_matches_app_org",
      orgColumn: "id",
      source: "be_organization_self_scope",
    };
  }

  return {
    tier: "SCOPED",
    scopingKind: "direct_org_column",
    predicateTemplate: "org_column_matches_app_org",
    orgColumn: "organization_id",
    source: "be_direct_org",
  };
}

function bootstrapDescriptor(table) {
  if (bootstrapHybridTables.has(table)) {
    return {
      tier: "BOOTSTRAP",
      scopingKind: "bootstrap_hybrid",
      predicateTemplate: "organization_id_is_null_or_matches_app_org",
      orgColumn: "organization_id",
      source: "bootstrap_global_or_tenant_row",
    };
  }

  return {
    tier: "BOOTSTRAP",
    scopingKind: "bootstrap_global",
    predicateTemplate: "bootstrap_readable",
    source: "identity_or_pre_context_runtime",
  };
}

function exemptionDescriptor(tier) {
  const sourceByTier = {
    INFRA: "infra_queue_ledger_or_operator_state",
    LEGACY: "legacy_frozen_until_sunset",
    TELEMETRY: "userless_aggregate_rollup",
  };

  return {
    tier,
    scopingKind: "explicit_exemption",
    predicateTemplate: "explicit_tier_exemption",
    source: sourceByTier[tier],
  };
}

export function buildRlsDescriptors() {
  const tierRows = readTierRows();
  const batchRowsByTable = new Map(readBatchRows().map((row) => [row.table, row]));
  const beFkRowsByTable = new Map(readBeFkPathRows().map((row) => [row.table, row]));
  const descriptors = new Map();

  for (const { tier, table } of tierRows) {
    if (tier === "SCOPED") {
      const batchRow = batchRowsByTable.get(table);
      const beFkRow = beFkRowsByTable.get(table);

      if (batchRow) {
        descriptors.set(table, { table, ...scopedDescriptorFromBatch(batchRow) });
        continue;
      }

      if (beFkRow) {
        descriptors.set(table, {
          table,
          tier,
          scopingKind: "fk_path",
          predicateTemplate: "fk_path_parent_org_matches_app_org",
          source: "be_fk_path",
          sourceStage: "P0.4.BE",
          fkPath: {
            parentTable: beFkRow.parent_table,
            localFk: beFkRow.local_fk,
            parentPk: beFkRow.parent_pk,
            parentOrgColumn: beFkRow.parent_org_column,
            crossCheckTable: beFkRow.cross_check_table,
            crossCheckLocalFk: beFkRow.cross_check_local_fk,
            crossCheckPk: beFkRow.cross_check_pk,
            crossCheckOrgColumn: beFkRow.cross_check_org_column,
          },
        });
        continue;
      }

      if (table.startsWith("public.be_")) {
        descriptors.set(table, { table, ...scopedDescriptorForBeTable(table) });
        continue;
      }

      throw new Error(`No SCOPED descriptor source for ${table}`);
    }

    if (tier === "BOOTSTRAP") {
      descriptors.set(table, { table, ...bootstrapDescriptor(table) });
      continue;
    }

    descriptors.set(table, { table, ...exemptionDescriptor(tier) });
  }

  return descriptors;
}
