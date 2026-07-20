import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDb } from "@/app-layer/db/drizzle";
import { platformUsers, userPhoneHistory } from "../../../db/schema/schema";

export type ResolveOrCreateDoctorClientByPhoneInput = {
  phoneNormalized: string;
  displayName: string;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type ResolveOrCreateDoctorClientByPhoneResult = {
  userId: string;
  displayName: string;
  phoneNormalized: string;
  created: boolean;
};

export class DoctorClientIdentityError extends Error {
  constructor(readonly code: "email_conflict" | "identity_conflict" | "create_failed") {
    super(code);
  }
}

/** Canonical staff-entered phone identity writer. The caller owns the outer Drizzle transaction. */
export async function resolveOrCreateDoctorClientByPhoneInTransaction(
  tx: DrizzleDb,
  organizationId: string,
  input: ResolveOrCreateDoctorClientByPhoneInput,
): Promise<ResolveOrCreateDoctorClientByPhoneResult> {
  const findByPhone = async () => {
    const [row] = await tx
      .select({
        id: platformUsers.id,
        role: platformUsers.role,
        displayName: platformUsers.displayName,
        phoneNormalized: platformUsers.phoneNormalized,
      })
      .from(platformUsers)
      .where(
        and(
          eq(platformUsers.phoneNormalized, input.phoneNormalized),
          isNull(platformUsers.mergedIntoId),
        ),
      )
      .limit(1);
    return row ?? null;
  };

  const existing = await findByPhone();
  if (existing && existing.role !== "client") {
    throw new DoctorClientIdentityError("identity_conflict");
  }

  if (input.emailNormalized) {
    const [emailOwner] = await tx
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(
        and(
          eq(platformUsers.emailNormalized, input.emailNormalized),
          isNull(platformUsers.mergedIntoId),
        ),
      )
      .limit(1);
    if (emailOwner && emailOwner.id !== existing?.id) {
      throw new DoctorClientIdentityError("email_conflict");
    }
  }

  if (existing) {
    return {
      userId: existing.id,
      displayName: existing.displayName,
      phoneNormalized: existing.phoneNormalized ?? input.phoneNormalized,
      created: false,
    };
  }

  const [inserted] = await tx
    .insert(platformUsers)
    .values({
      phoneNormalized: input.phoneNormalized,
      displayName: input.displayName,
      email: input.emailRaw,
      emailNormalized: input.emailNormalized,
      role: "client",
      patientPhoneTrustAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: platformUsers.phoneNormalized })
    .returning({ id: platformUsers.id, displayName: platformUsers.displayName });

  if (!inserted) {
    const concurrent = await findByPhone();
    if (!concurrent || concurrent.role !== "client") {
      throw new DoctorClientIdentityError("identity_conflict");
    }
    return {
      userId: concurrent.id,
      displayName: concurrent.displayName,
      phoneNormalized: concurrent.phoneNormalized ?? input.phoneNormalized,
      created: false,
    };
  }

  await tx.insert(userPhoneHistory).values({
    platformUserId: inserted.id,
    organizationId,
    phoneNormalized: input.phoneNormalized,
    source: "admin",
  });

  return {
    userId: inserted.id,
    displayName: inserted.displayName,
    phoneNormalized: input.phoneNormalized,
    created: true,
  };
}
