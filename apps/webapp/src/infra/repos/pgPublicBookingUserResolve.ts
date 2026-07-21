import { and, eq, isNull } from "drizzle-orm";
import { getDrizzleOrMutationTx } from "@/infra/db/drizzleMutationTx";
import { platformUsers } from "../../../db/schema/schema";

export async function resolveOrCreateTrustedPatientUserByPhone(
  phoneNormalized: string,
  displayName: string,
): Promise<{ userId: string | null; created: boolean }> {
  const db = getDrizzleOrMutationTx();
  const existing = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        eq(platformUsers.phoneNormalized, phoneNormalized),
        isNull(platformUsers.mergedIntoId),
      ),
    )
    .limit(2);
  if (existing.length > 1) return { userId: null, created: false };
  if (existing[0]) return { userId: existing[0].id, created: false };

  const inserted = await db
    .insert(platformUsers)
    .values({
      phoneNormalized,
      displayName,
      role: "client",
      patientPhoneTrustAt: new Date().toISOString(),
    })
    .returning({ id: platformUsers.id });
  return { userId: inserted[0]?.id ?? null, created: inserted[0] != null };
}
