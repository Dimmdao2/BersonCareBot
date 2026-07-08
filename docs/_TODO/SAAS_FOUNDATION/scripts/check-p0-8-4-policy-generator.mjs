#!/usr/bin/env node

import {
  expectedP084BlockedPolymorphicTargets,
  expectedP084PublicDenormTargets,
  expectedP084PublicFkPathTargets,
  getP084PublicPathDescriptors,
  p084PolicyName,
  renderP084PolicyStatements,
} from "./p0-8-4-policy-targets.mjs";

function fail(message) {
  throw new Error(message);
}

const descriptors = getP084PublicPathDescriptors();
const statements = renderP084PolicyStatements({ descriptors });
const sql = statements.join("\n");

if (descriptors.length !== 37) {
  fail(`Expected 37 P0.8.4 descriptors, got ${descriptors.length}`);
}

if (expectedP084PublicFkPathTargets.length !== 2) {
  fail(`Expected 2 explicit FK-path targets, got ${expectedP084PublicFkPathTargets.length}`);
}

if (expectedP084PublicDenormTargets.length !== 35) {
  fail(`Expected 35 explicit denorm targets, got ${expectedP084PublicDenormTargets.length}`);
}

if (expectedP084BlockedPolymorphicTargets.join(",") !== "public.comments") {
  fail("P0.8.4 must keep public.comments blocked behind P0.12.1");
}

if (statements.length !== descriptors.length * 4) {
  fail(`Expected ${descriptors.length * 4} policy statements, got ${statements.length}`);
}

for (const descriptor of descriptors) {
  if (!["fk_path", "denorm_org_column"].includes(descriptor.scopingKind)) {
    fail(`Unexpected P0.8.4 scoping kind for ${descriptor.table}: ${descriptor.scopingKind}`);
  }

  const quotedTarget = descriptor.table
    .split(".")
    .map((part) => `"${part}"`)
    .join(".");

  if (!sql.includes(`ALTER TABLE ${quotedTarget} ENABLE ROW LEVEL SECURITY;`)) {
    fail(`Missing ENABLE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`ALTER TABLE ${quotedTarget} FORCE ROW LEVEL SECURITY;`)) {
    fail(`Missing FORCE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`DROP POLICY IF EXISTS "${p084PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p084PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }
}

if (sql.includes('"public"."comments"')) {
  fail("P0.8.4 generated SQL must not target public.comments before P0.12.1");
}

for (const table of expectedP084PublicFkPathTargets) {
  const descriptor = descriptors.find((candidate) => candidate.table === table);

  if (!descriptor?.fkPath) {
    fail(`FK-path target ${table} is missing fkPath metadata`);
  }

  for (const token of [descriptor.fkPath.parentTable, descriptor.fkPath.crossCheckTable]) {
    const quotedQualified = token
      .split(".")
      .map((part) => `"${part}"`)
      .join(".");

    if (!sql.includes(quotedQualified)) {
      fail(`FK-path target ${table} generated SQL is missing quoted table ${quotedQualified}`);
    }
  }

  for (const token of [
    descriptor.fkPath.localFk,
    descriptor.fkPath.parentPk,
    descriptor.fkPath.parentOrgColumn,
    descriptor.fkPath.crossCheckLocalFk,
    descriptor.fkPath.crossCheckPk,
    descriptor.fkPath.crossCheckOrgColumn,
  ]) {
    if (!sql.includes(`"${token}"`)) {
      fail(`FK-path target ${table} generated SQL is missing quoted column ${token}`);
    }
  }
}

console.log(
  `P0.8.4 policy generator OK: 37 targets (${expectedP084PublicFkPathTargets.length} FK-path, ${expectedP084PublicDenormTargets.length} denorm), public.comments blocked for P0.12.1.`,
);
