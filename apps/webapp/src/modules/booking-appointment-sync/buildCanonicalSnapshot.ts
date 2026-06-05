import {
  buildLegacyAppointmentPayload,
  mapLegacyStatusToCanonical,
  resolveAppointmentCanonicalRefs,
  type ExternalMappingLookup,
} from "@/modules/booking-rubitime-bridge/legacyProjection";
import type { RubitimeCanonicalProjectionInput } from "@/modules/booking-rubitime-bridge/ports";
import { mergeCanonicalRefsPreserveExisting, type CanonicalScopeRefs } from "./mergeCanonicalRefs";
import type { AppointmentMirrorSnapshot } from "./types";
import { warnUnmappedScopeRefs } from "./warnUnmappedScope";

export type AppointmentRecordProjectionInput = {
  integratorRecordId: string;
  phoneNormalized: string | null;
  recordAt: string;
  status: string;
  payloadJson: Record<string, unknown>;
  lastEvent: string;
  updatedAt: string;
  branchId: string | null;
};

export type BuildCanonicalInboundSnapshotInput = {
  organizationId: string;
  externalId: string;
  platformUserId: string | null;
  phoneNormalized: string | null;
  recordAt: string;
  legacyStatus: string;
  lastEvent: string;
  payloadJson: Record<string, unknown>;
  lookup: ExternalMappingLookup;
  existingScope?: CanonicalScopeRefs;
  updatedAt?: string;
};

export type BuiltCanonicalInboundSnapshot = {
  snapshot: AppointmentMirrorSnapshot;
  bridgeInput: RubitimeCanonicalProjectionInput;
  appointmentRecordProjection: AppointmentRecordProjectionInput;
  mergedRefs: CanonicalScopeRefs;
  resolvedRefs: CanonicalScopeRefs;
};

export function buildCanonicalInboundSnapshot(
  input: BuildCanonicalInboundSnapshotInput,
): BuiltCanonicalInboundSnapshot {
  const legacy = buildLegacyAppointmentPayload(input.recordAt, input.payloadJson);
  const resolvedRefs = resolveAppointmentCanonicalRefs(input.lookup, legacy);
  const mergedRefs = input.existingScope
    ? mergeCanonicalRefsPreserveExisting(input.existingScope, resolvedRefs)
    : resolvedRefs;

  warnUnmappedScopeRefs({
    externalRubitimeId: input.externalId,
    rubitimeBranchId: legacy.rubitimeBranchId,
    rubitimeServiceId: legacy.rubitimeServiceId,
    rubitimeCooperatorId: legacy.rubitimeCooperatorId,
    resolved: resolvedRefs,
    merged: mergedRefs,
    existing: input.existingScope,
  });

  const status = mapLegacyStatusToCanonical(
    input.legacyStatus,
    input.lastEvent,
    input.payloadJson,
  );
  const updatedAt = input.updatedAt ?? new Date().toISOString();

  const snapshot: AppointmentMirrorSnapshot = {
    organizationId: input.organizationId,
    externalRubitimeId: input.externalId,
    startAt: input.recordAt,
    endAt: legacy.endAtIso,
    durationMinutes: legacy.durationMinutes,
    branchId: mergedRefs.branchId,
    specialistId: mergedRefs.specialistId,
    serviceId: mergedRefs.serviceId,
    status,
    phoneNormalized: input.phoneNormalized,
    platformUserId: input.platformUserId,
  };

  return {
    snapshot,
    mergedRefs,
    resolvedRefs,
    bridgeInput: {
      organizationId: input.organizationId,
      externalId: input.externalId,
      platformUserId: input.platformUserId,
      phoneNormalized: input.phoneNormalized,
      recordAt: input.recordAt,
      legacyStatus: input.legacyStatus,
      lastEvent: input.lastEvent,
      payloadJson: input.payloadJson,
    },
    appointmentRecordProjection: {
      integratorRecordId: input.externalId,
      phoneNormalized: input.phoneNormalized,
      recordAt: input.recordAt,
      status: input.legacyStatus,
      payloadJson: input.payloadJson,
      lastEvent: input.lastEvent,
      updatedAt,
      branchId: mergedRefs.branchId,
    },
  };
}
