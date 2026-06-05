import { mapRubitimeStatusToBeAppointment } from "@bersoncare/booking-rubitime-sync";
import type { AppointmentStatus } from "@/modules/booking-engine/types";

export type LegacyAppointmentPayload = {
  durationMinutes: number;
  endAtIso: string;
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  rubitimeCooperatorId: string | null;
};

export function coercePayloadRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function coerceString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function mapLegacyStatusToCanonical(
  status: string,
  lastEvent: string,
  payloadJson?: unknown,
): AppointmentStatus {
  const mapped = mapRubitimeStatusToBeAppointment(status, lastEvent, payloadJson);
  const ev = lastEvent.toLowerCase();
  if (mapped === "cancelled_by_patient") {
    if (
      ev.includes("staff")
      || ev.includes("specialist")
      || ev.includes("admin")
      || ev.includes("manual-cancel")
    ) {
      return "cancelled_by_specialist";
    }
  }
  if (mapped === "confirmed" && (ev.includes("no_show") || ev.includes("no-show"))) {
    return "no_show";
  }
  return mapped as AppointmentStatus;
}

export function resolveDurationAndEnd(
  recordAtIso: string,
  payload: Record<string, unknown>,
): { durationMinutes: number; endAtIso: string } {
  const startMs = new Date(recordAtIso).getTime();
  const slotEnd =
    coerceString(payload.datetime_end) ??
    coerceString(payload.date_time_end) ??
    coerceString(payload.slot_end);
  if (slotEnd) {
    const endMs = new Date(slotEnd).getTime();
    if (Number.isFinite(endMs) && endMs > startMs) {
      const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
      return { durationMinutes, endAtIso: new Date(endMs).toISOString() };
    }
  }
  const durationRaw = payload.duration_minutes ?? payload.durationMinutes ?? payload.service_duration;
  const durationMinutes =
    typeof durationRaw === "number" && durationRaw > 0
      ? Math.round(durationRaw)
      : typeof durationRaw === "string" && Number(durationRaw) > 0
        ? Math.round(Number(durationRaw))
        : 60;
  return {
    durationMinutes,
    endAtIso: new Date(startMs + durationMinutes * 60_000).toISOString(),
  };
}

export function extractRubitimeExternalIds(payload: Record<string, unknown>): {
  rubitimeBranchId: string | null;
  rubitimeServiceId: string | null;
  rubitimeCooperatorId: string | null;
} {
  return {
    rubitimeBranchId:
      coerceString(payload.branch_id) ??
      coerceString(payload.rubitime_branch_id) ??
      coerceString(payload.branchId),
    rubitimeServiceId:
      coerceString(payload.service_id) ?? coerceString(payload.rubitime_service_id),
    rubitimeCooperatorId:
      coerceString(payload.cooperator_id) ??
      coerceString(payload.rubitime_cooperator_id) ??
      coerceString(payload.specialist_id),
  };
}

export function buildLegacyAppointmentPayload(
  recordAtIso: string,
  payloadJson: unknown,
): LegacyAppointmentPayload {
  const payload = coercePayloadRecord(payloadJson);
  const { durationMinutes, endAtIso } = resolveDurationAndEnd(recordAtIso, payload);
  const ids = extractRubitimeExternalIds(payload);
  return { durationMinutes, endAtIso, ...ids };
}

export type ExternalMappingLookup = {
  resolveCanonicalId(
    entityType: "branch" | "specialist" | "service" | "availability" | "appointment",
    externalId: string,
  ): string | null;
};

export function resolveAppointmentCanonicalRefs(
  lookup: ExternalMappingLookup,
  legacy: Pick<
    LegacyAppointmentPayload,
    "rubitimeBranchId" | "rubitimeServiceId" | "rubitimeCooperatorId"
  >,
): {
  branchId: string | null;
  specialistId: string | null;
  serviceId: string | null;
} {
  return {
    branchId: legacy.rubitimeBranchId
      ? lookup.resolveCanonicalId("branch", legacy.rubitimeBranchId)
      : null,
    specialistId: legacy.rubitimeCooperatorId
      ? lookup.resolveCanonicalId("specialist", legacy.rubitimeCooperatorId)
      : null,
    serviceId: legacy.rubitimeServiceId
      ? lookup.resolveCanonicalId("service", legacy.rubitimeServiceId) ??
        lookup.resolveCanonicalId("availability", legacy.rubitimeServiceId)
      : null,
  };
}
