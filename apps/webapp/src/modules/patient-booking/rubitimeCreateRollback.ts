import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { BookingSyncPort } from "./ports";

type BookingEngineService = ReturnType<typeof createBookingEngineService>;

const DEFAULT_MAPPING_ATTEMPTS = 5;
const DEFAULT_MAPPING_DELAY_MS = 100;

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRubitimeProjectionMapping(
  bookingEngine: BookingEngineService | null | undefined,
  opts: {
    organizationId: string;
    rubitimeId: string;
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<string | null> {
  if (!bookingEngine?.getAppointmentIdByRubitimeExternalId) return null;
  const attempts = opts.attempts ?? DEFAULT_MAPPING_ATTEMPTS;
  const delayMs = opts.delayMs ?? DEFAULT_MAPPING_DELAY_MS;
  const sleep = opts.sleep ?? sleepMs;
  for (let i = 0; i < attempts; i++) {
    const projectedId = await bookingEngine.getAppointmentIdByRubitimeExternalId({
      organizationId: opts.organizationId,
      rubitimeId: opts.rubitimeId,
    });
    if (projectedId) return projectedId;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return null;
}

/** Hard-remove Rubitime record (GCal delete on integrator) + cancel orphan canonical row. */
export async function rollbackFailedRubitimeCreate(opts: {
  syncPort: BookingSyncPort;
  bookingEngine?: BookingEngineService | null;
  organizationId: string;
  rubitimeId: string;
  appointmentId?: string;
  rollbackSource?: string;
}): Promise<void> {
  if (!opts.bookingEngine) {
    try {
      await opts.syncPort.deleteRecord(opts.rubitimeId);
    } catch {
      // Best-effort Rubitime rollback.
    }
    return;
  }
  let appointmentId = opts.appointmentId;
  if (!appointmentId) {
    appointmentId =
      (await opts.bookingEngine.getAppointmentIdByRubitimeExternalId?.({
        organizationId: opts.organizationId,
        rubitimeId: opts.rubitimeId,
      })) ?? undefined;
  }
  try {
    await opts.syncPort.deleteRecord(opts.rubitimeId);
  } catch {
    // Best-effort Rubitime rollback (remove-record + GCal delete on integrator).
  }
  if (appointmentId) {
    try {
      await opts.bookingEngine.transitionAppointmentStatus({
        appointmentId,
        toStatus: "cancelled_by_specialist",
        payload: { source: opts.rollbackSource ?? "rubitime_first_create_rollback" },
      });
    } catch {
      // Best-effort orphan canonical cleanup.
    }
  }
}
