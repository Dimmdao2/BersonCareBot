/** Wave 3 phase 15F — webapp prod raw SQL tail gate (Class B/C only). */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEBAPP_SRC = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const RAW_SQL_INVENTORY = join(
  WEBAPP_SRC,
  "../../../docs/INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md",
);

/** Class B: intentional raw `pool.query` transport / documented pg workaround. */
const CLASS_B_POOL_QUERY_REL = [
  "infra/db/runWebappSql.ts",
  "infra/repos/pgAdminPlatformUserStats.ts",
  // Added wave3 phase 15G: pool.query for Drizzle ANY-array workaround (broadcast count by user subset)
  "infra/repos/broadcastChannelCounts.ts",
] as const;

/** Class B: healthcheck on dedicated PoolClient. */
const CLASS_B_CLIENT_QUERY_REL = ["infra/db/client.ts"] as const;

/** Class C: `client.query` only for TX control / advisory on dedicated PoolClient. */
const CLASS_C_CLIENT_QUERY_REL = [
  "infra/adminAuditLog.ts",
  "infra/integratorPlatformUserMerge.ts",
  "infra/multipartSessionLock.ts",
  "infra/platformUserFullPurge.ts",
  "infra/strictPlatformUserPurge.ts",
  "infra/userLifecycleLock.ts",
  "infra/repos/mediaPreviewWorker.ts",
  "infra/repos/mediaUploadSessionsRepo.ts",
  "infra/repos/pgAppointmentProjection.ts",
  "infra/repos/pgChannelPreferences.ts",
  "infra/repos/pgChannelLinkClaim.ts",
  "infra/repos/pgDoctorClientCreate.ts",
  "infra/repos/pgDoctorBroadcastDelivery.ts",
  "infra/repos/pgDoctorMotivationQuotesEditor.ts",
  "infra/repos/pgIdentityResolution.ts",
  "infra/repos/pgOnlineIntake.ts",
  "infra/repos/pgPhoneMessengerBind.ts",
  "infra/repos/pgSupportCommunication.ts",
  "infra/repos/pgUserByPhone.ts",
  "infra/repos/pgUserProjection.ts",
  "infra/repos/pgWebPushSubscriptions.ts",
  "infra/repos/s3MediaStorage.ts",
] as const;

/** Migrated in 15A–15E: runtime domain `pool.query`/`client.query` must stay 0. */
const PHASE_15_MIGRATED_REL = [
  "infra/repos/pgReferences.ts",
  "infra/repos/pgSystemSettings.ts",
  "infra/repos/pgSymptomDiary.ts",
  "infra/repos/pgEmailSetupFlowPort.ts",
  "infra/repos/pgEmailPasswordLookup.ts",
  "infra/repos/pgUserPasswordCredentials.ts",
  "infra/repos/pgOAuthBindings.ts",
  "infra/repos/pgLoginTokens.ts",
  "infra/repos/pgPhoneChallengeStore.ts",
  "infra/repos/pgEmailSetupTokens.ts",
  "infra/repos/pgTreatmentProgram.ts",
  "infra/repos/pgTreatmentProgramItemSnapshot.ts",
  "infra/repos/pgMaterialRating.ts",
  "infra/repos/pgUserPins.ts",
  "infra/repos/pgPhoneHistory.ts",
  "infra/integrator-push/integratorPushOutbox.ts",
  "app-layer/integrator/messengerPhoneHttpBindExecute.ts",
  "infra/repos/pgAdminClientProfileConflicts.ts",
  "infra/repos/pgMediaFolderLookup.ts",
  "app/api/media/upload/route.ts",
  "app/api/admin/users/[userId]/profile/route.ts",
] as const;

function listProdTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...listProdTsFiles(path));
      continue;
    }
    if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.includes(".devDb.")) {
      out.push(path);
    }
  }
  return out;
}

function isCommentOrDocLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.includes("no direct `pool.query`") ||
    t.includes("no direct pool.query")
  );
}

function countRuntimeMatches(src: string, pattern: RegExp): number {
  return src
    .split("\n")
    .filter((line) => !isCommentOrDocLine(line) && pattern.test(line)).length;
}

function relFromWebappSrc(absPath: string): string {
  return relative(WEBAPP_SRC, absPath).replace(/\\/g, "/");
}

describe("Wave3 phase 15F webapp prod tail (Class B/C gate)", () => {
  const rawSqlDoc = readFileSync(RAW_SQL_INVENTORY, "utf8");
  const prodFiles = listProdTsFiles(WEBAPP_SRC);

  it("domain pool.query only in Class B allowlist (3 files)", () => {
    const offenders: string[] = [];
    for (const abs of prodFiles) {
      const rel = relFromWebappSrc(abs);
      const src = readFileSync(abs, "utf8");
      const poolCount = countRuntimeMatches(src, /\bpool\.query\b/);
      if (poolCount === 0) continue;
      if (!(CLASS_B_POOL_QUERY_REL as readonly string[]).includes(rel)) {
        offenders.push(`${rel} (${poolCount}× pool.query)`);
      }
    }
    expect(offenders).toEqual([]);
    expect(CLASS_B_POOL_QUERY_REL).toHaveLength(3);
  });

  it("client.query only in Class B health + Class C allowlist (23 files)", () => {
    const allowed = new Set<string>([...CLASS_B_CLIENT_QUERY_REL, ...CLASS_C_CLIENT_QUERY_REL]);
    const offenders: string[] = [];
    for (const abs of prodFiles) {
      const rel = relFromWebappSrc(abs);
      const src = readFileSync(abs, "utf8");
      const clientCount = countRuntimeMatches(src, /\bclient\.query\b/);
      if (clientCount === 0) continue;
      if (!allowed.has(rel)) {
        offenders.push(`${rel} (${clientCount}× client.query)`);
      }
    }
    expect(offenders).toEqual([]);
    expect(allowed.size).toBe(23);
  });

  it("every Class B/C tail file is documented in RAW_SQL_INVENTORY.md", () => {
    const tail = [
      ...CLASS_B_POOL_QUERY_REL,
      ...CLASS_B_CLIENT_QUERY_REL,
      ...CLASS_C_CLIENT_QUERY_REL,
    ];
    const missing = tail.filter((rel) => {
      const base = rel.split("/").pop()!;
      return !rawSqlDoc.includes(base);
    });
    expect(missing).toEqual([]);
  });

  it("15A–15E migrated scope stays at 0 runtime pool.query/client.query", () => {
    const offenders: string[] = [];
    for (const rel of PHASE_15_MIGRATED_REL) {
      const src = readFileSync(join(WEBAPP_SRC, rel), "utf8");
      const poolCount = countRuntimeMatches(src, /\bpool\.query\b/);
      const clientCount = countRuntimeMatches(src, /\bclient\.query\b/);
      if (poolCount + clientCount > 0) {
        offenders.push(`${rel} pool=${poolCount} client=${clientCount}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("post-15 prod tail size is 26 runtime files", () => {
    const runtimeTail = new Set<string>();
    for (const abs of prodFiles) {
      const rel = relFromWebappSrc(abs);
      const src = readFileSync(abs, "utf8");
      if (
        countRuntimeMatches(src, /\bpool\.query\b/) +
          countRuntimeMatches(src, /\bclient\.query\b/) >
        0
      ) {
        runtimeTail.add(rel);
      }
    }
    expect(runtimeTail.size).toBe(26);
    expect([...runtimeTail].sort()).toEqual(
      [...CLASS_B_POOL_QUERY_REL, ...CLASS_B_CLIENT_QUERY_REL, ...CLASS_C_CLIENT_QUERY_REL].sort(),
    );
  });
});
