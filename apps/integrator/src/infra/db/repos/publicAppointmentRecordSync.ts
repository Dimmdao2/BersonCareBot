import { getIntegratorDrizzleSession } from '../drizzle.js';
import { appointmentRecords } from '../schema/integratorDomainRepos.js';
import type { DbPort } from '../../../kernel/contracts/index.js';

/** Upsert `public.appointment_records` — семантика как webapp `pgAppointmentProjection`. */
export async function upsertAppointmentRecordFromBookingMutation(
  db: DbPort,
  params: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    updatedAt: string;
    branchId?: string | null;
  },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(appointmentRecords)
    .values({
      integratorRecordId: params.integratorRecordId,
      phoneNormalized: params.phoneNormalized,
      recordAt: params.recordAt,
      status: params.status,
      payloadJson: params.payloadJson,
      lastEvent: params.lastEvent,
      updatedAt: params.updatedAt,
      branchId: params.branchId ?? null,
    })
    .onConflictDoUpdate({
      target: appointmentRecords.integratorRecordId,
      set: {
        phoneNormalized: params.phoneNormalized,
        recordAt: params.recordAt,
        status: params.status,
        payloadJson: params.payloadJson,
        lastEvent: params.lastEvent,
        updatedAt: params.updatedAt,
        branchId: params.branchId ?? null,
      },
    });
}
