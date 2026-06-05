import type { BeAppointment } from "@/modules/booking-engine/types";
import { buildCanonicalInboundSnapshot } from "./buildCanonicalSnapshot";
import { buildRubitimeOutboundPatchFromAppointment } from "./buildRubitimeOutboundPatch";
import { mergeRubitimeFanoutIntoPayload } from "./mergeRubitimeEventPayload";
import type { AppointmentMirrorSyncDeps, AppointmentMirrorSyncService } from "./ports";
import type { RubitimeInboundEventInput } from "./types";

export function createAppointmentMirrorSyncService(deps: AppointmentMirrorSyncDeps): AppointmentMirrorSyncService {
  return {
    async applyInboundFromRubitime(input: RubitimeInboundEventInput) {
      const mergedPayload = mergeRubitimeFanoutIntoPayload(input.payloadJson, input.fanout);
      if (!input.recordAt) {
        const result = await deps.bridge.upsertCanonicalFromRubitimeRecord({
          organizationId: input.organizationId,
          externalId: input.externalId,
          platformUserId: input.platformUserId,
          phoneNormalized: input.phoneNormalized,
          recordAt: input.recordAt,
          legacyStatus: input.legacyStatus,
          lastEvent: input.lastEvent,
          payloadJson: mergedPayload,
        });
        return result;
      }
      const lookup = await deps.loadForwardMapping(input.organizationId);
      const built = buildCanonicalInboundSnapshot({
        organizationId: input.organizationId,
        externalId: input.externalId,
        platformUserId: input.platformUserId,
        phoneNormalized: input.phoneNormalized,
        recordAt: input.recordAt,
        legacyStatus: input.legacyStatus,
        lastEvent: input.lastEvent,
        payloadJson: mergedPayload,
        lookup,
        updatedAt: new Date().toISOString(),
      });
      const result = await deps.bridge.upsertCanonicalFromRubitimeRecord(built.bridgeInput);
      return { ...result, appointmentRecordProjection: built.appointmentRecordProjection };
    },

    async pushRescheduleToRubitime(appointment, rubitimeId) {
      if (!deps.syncPort.updateRecord) {
        throw new Error("rubitime_update_unavailable");
      }
      const organizationId = await deps.getDefaultOrganizationId();
      const reverse = await deps.loadReverseMapping(organizationId);
      const patch = buildRubitimeOutboundPatchFromAppointment(appointment, reverse);
      await deps.syncPort.updateRecord({
        rubitimeId,
        slotStart: appointment.startAt,
        slotEnd: appointment.endAt,
        rubitimePatch: patch,
      });
    },

    async pushCancelToRubitime(rubitimeId) {
      if (!deps.syncPort.cancelRecord) {
        throw new Error("rubitime_cancel_unavailable");
      }
      await deps.syncPort.cancelRecord(rubitimeId);
    },

    async stampCanonicalOutbound(appointmentId) {
      await deps.stampCanonicalOutbound(appointmentId);
    },
  };
}
