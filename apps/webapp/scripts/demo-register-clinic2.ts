#!/usr/bin/env tsx
/**
 * ONE-OFF DEMO: provision a SECOND clinic (organization) + its owner specialist on the TEST database,
 * via the real organization-provisioning path (`provisionSpecialistOwner`), so a second doctor account
 * can log in on test.bersoncare.ru and see a separate clinic.
 *
 * WHY a bootstrap platform_users row instead of full OTP/email signup UI: `provisionSpecialistOwner`
 * only requires (a) a `platform_users` row with `email_verified_at` set and (b) a pending
 * `specialist_signup_intents` row — exactly what the real `/api/auth/specialist-signup/confirm` route
 * consumes after email OTP verification. This script creates that platform_users row directly (account
 * bootstrap only — NOT the org/specialist tables) and then drives the SAME service/port code
 * (`createOrganizationProvisioningService` + `createPgOrganizationProvisioningPort`) that route uses, so
 * `be_organizations` / `be_specialists` / `be_organization_members` are created by the real transaction,
 * not by hand-rolled INSERTs.
 *
 * SAFETY: refuses to run unless DATABASE_URL points at a database named `bersoncarebot_test`.
 * IDEMPOTENT: re-running detects an existing org by title (skip) and an existing platform_user by phone
 * (reuse), so it never creates duplicate organizations/specialists.
 *
 * Usage (as `deploy`, with the test env sourced):
 *   pnpm --dir apps/webapp exec tsx scripts/demo-register-clinic2.ts
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { enterStaffSecuritySelfPrincipal } from "@/app-layer/principal/staffSecuritySelfPrincipal";
import { createPgOrganizationProvisioningPort } from "@/infra/repos/pgOrganizationProvisioning";
import { createOrganizationProvisioningService } from "@/modules/organization-provisioning/service";
import {
  platformUsers,
  beOrganizations,
  beOrganizationMembers,
  beSpecialists,
} from "../db/schema";

const ORG_TITLE = "Демо Клиника 2";
const SPECIALIST_NAME = "Демо Доктор Второй";
const PHONE_NORMALIZED = "+79005553311";
const EMAIL = "demo2clinic@example.com";
const EMAIL_NORMALIZED = EMAIL.trim().toLowerCase();

function redactedUrl(url: string): string {
  return url.replace(/:[^:@/]+@/, ":***@");
}

async function reportExisting(db: ReturnType<typeof getDrizzle>, organizationId: string) {
  const specialists = await db.select().from(beSpecialists).where(eq(beSpecialists.organizationId, organizationId));
  const members = await db
    .select()
    .from(beOrganizationMembers)
    .where(eq(beOrganizationMembers.organizationId, organizationId));
  console.log("[demo2] specialists:", JSON.stringify(specialists, null, 2));
  console.log("[demo2] members:", JSON.stringify(members, null, 2));
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/\/bersoncarebot_test(\?|$)/.test(dbUrl)) {
    throw new Error(
      `refusing to run: DATABASE_URL does not look like the bersoncarebot_test database: ${redactedUrl(dbUrl)}`,
    );
  }

  const db = getDrizzle();

  // 1. Idempotency gate: organization already provisioned by title -> report and stop (no writes).
  const existingOrgs = await db.select().from(beOrganizations).where(eq(beOrganizations.title, ORG_TITLE));
  if (existingOrgs[0]) {
    console.log(`[demo2] organization already exists, skipping provisioning: ${existingOrgs[0].id}`);
    await reportExisting(db, existingOrgs[0].id);
    return;
  }

  // 2. Bootstrap the owner's platform_users row (account identity only — NOT org/specialist tables).
  //    This mirrors what email-OTP verification would have produced: a verified, not-yet-provisioned user.
  const existingUsers = await db
    .select()
    .from(platformUsers)
    .where(eq(platformUsers.phoneNormalized, PHONE_NORMALIZED));

  let userId: string;
  if (existingUsers[0]) {
    userId = existingUsers[0].id;
    console.log(`[demo2] reusing existing platform_user by phone: ${userId}`);
    if (existingUsers[0].mergedIntoId) {
      throw new Error(`refusing: platform_user ${userId} has merged_into_id set (not canonical)`);
    }
    if (!existingUsers[0].emailVerifiedAt) {
      await db
        .update(platformUsers)
        .set({ emailVerifiedAt: new Date().toISOString(), email: EMAIL, emailNormalized: EMAIL_NORMALIZED })
        .where(eq(platformUsers.id, userId));
      console.log(`[demo2] backfilled email_verified_at on existing platform_user ${userId}`);
    }
  } else {
    const now = new Date().toISOString();
    const inserted = await db
      .insert(platformUsers)
      .values({
        phoneNormalized: PHONE_NORMALIZED,
        displayName: SPECIALIST_NAME,
        role: "client",
        email: EMAIL,
        emailNormalized: EMAIL_NORMALIZED,
        emailVerifiedAt: now,
      })
      .returning({ id: platformUsers.id });
    userId = inserted[0]!.id;
    console.log(`[demo2] created platform_user: ${userId}`);
  }

  // 3. Drive the REAL provisioning service/port — same code the specialist-signup confirm route uses.
  const provisioningPort = createPgOrganizationProvisioningPort();
  const service = createOrganizationProvisioningService({ provisioningPort });
  enterStaffSecuritySelfPrincipal(userId, "scripts/demo-register-clinic2:self");

  const challengeId = randomUUID();
  await service.createSpecialistSignupIntent({
    challengeId,
    emailNormalized: EMAIL_NORMALIZED,
    organizationTitle: ORG_TITLE,
    specialistFullName: SPECIALIST_NAME,
  });
  console.log(`[demo2] created specialist_signup_intents row (challengeId=${challengeId})`);

  const result = await service.provisionSpecialistOwner({ challengeId });
  console.log("[demo2] provisioned:", JSON.stringify(result, null, 2));
  console.log(
    `[demo2] DONE. organizationId=${result.organizationId} specialistId=${result.specialistId} membershipId=${result.membershipId} platformUserId=${userId} phone=${PHONE_NORMALIZED} email=${EMAIL}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[demo2] FAILED:", err);
    process.exit(1);
  });
