import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleDb } from "@/app-layer/db/drizzle";
import { formatDoctorFio, normalizeFioPart } from "@/shared/lib/fio";
import { platformUsers, userPhoneHistory } from "../../../db/schema/schema";

export type ResolveOrCreateDoctorClientByPhoneInput = {
  phoneNormalized: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type ResolveOrCreateDoctorClientByPhoneResult = {
  userId: string;
  displayName: string;
  lastName: string | null;
  firstName: string | null;
  patronymic: string | null;
  phoneNormalized: string;
  created: boolean;
};

export class DoctorClientIdentityError extends Error {
  constructor(readonly code: "email_conflict" | "identity_conflict" | "create_failed") {
    super(code);
  }
}

function pgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

/** Canonical staff-entered phone identity writer. The caller owns the outer Drizzle transaction. */
export async function resolveOrCreateDoctorClientByPhoneInTransaction(
  tx: DrizzleDb,
  organizationId: string,
  input: ResolveOrCreateDoctorClientByPhoneInput,
): Promise<ResolveOrCreateDoctorClientByPhoneResult> {
  const lastName = normalizeFioPart(input.lastName);
  const firstName = normalizeFioPart(input.firstName);
  const patronymic = normalizeFioPart(input.patronymic);
  if (!lastName || !firstName) {
    throw new DoctorClientIdentityError("create_failed");
  }
  const displayName = formatDoctorFio({ lastName, firstName, patronymic });

  const findByPhone = async () => {
    const [row] = await tx
      .select({
        id: platformUsers.id,
        role: platformUsers.role,
        displayName: platformUsers.displayName,
        lastName: platformUsers.lastName,
        firstName: platformUsers.firstName,
        patronymic: platformUsers.patronymic,
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
      lastName: existing.lastName,
      firstName: existing.firstName,
      patronymic: existing.patronymic,
      phoneNormalized: existing.phoneNormalized ?? input.phoneNormalized,
      created: false,
    };
  }

  let inserted: {
    id: string;
    displayName: string;
    lastName: string | null;
    firstName: string | null;
    patronymic: string | null;
  } | null = null;
  try {
    inserted = await tx.transaction(async (savepointTx) => {
      const [row] = await savepointTx
        .insert(platformUsers)
        .values({
          phoneNormalized: input.phoneNormalized,
          displayName,
          lastName,
          firstName,
          patronymic,
          email: input.emailRaw,
          emailNormalized: input.emailNormalized,
          role: "client",
          patientPhoneTrustAt: new Date().toISOString(),
        })
        .returning({
          id: platformUsers.id,
          displayName: platformUsers.displayName,
          lastName: platformUsers.lastName,
          firstName: platformUsers.firstName,
          patronymic: platformUsers.patronymic,
        });
      return row ?? null;
    });
  } catch (error) {
    // Strong identifiers intentionally use DEFERRABLE uniqueness for canonical merge transactions.
    // PostgreSQL therefore cannot use phone_normalized as an ON CONFLICT arbiter. The nested
    // transaction is a savepoint: a concurrent phone insert rolls back only this attempt, leaving
    // the outer patient/enrollment/appointment transaction usable for the canonical re-read below.
    if (pgErrorCode(error) !== "23505") throw error;
    const concurrent = await findByPhone();
    if (!concurrent) throw error;
    if (concurrent.role !== "client") {
      throw new DoctorClientIdentityError("identity_conflict");
    }
    return {
      userId: concurrent.id,
      displayName: concurrent.displayName,
      lastName: concurrent.lastName,
      firstName: concurrent.firstName,
      patronymic: concurrent.patronymic,
      phoneNormalized: concurrent.phoneNormalized ?? input.phoneNormalized,
      created: false,
    };
  }

  if (!inserted) throw new DoctorClientIdentityError("create_failed");

  await tx.insert(userPhoneHistory).values({
    platformUserId: inserted.id,
    organizationId,
    phoneNormalized: input.phoneNormalized,
    source: "admin",
  });

  return {
    userId: inserted.id,
    displayName: inserted.displayName,
    lastName: inserted.lastName,
    firstName: inserted.firstName,
    patronymic: inserted.patronymic,
    phoneNormalized: input.phoneNormalized,
    created: true,
  };
}
