import type { BeAppointment } from "@/modules/booking-engine/types";
import type { RubitimeBridgePort, RubitimeCanonicalProjectionResult } from "@/modules/booking-rubitime-bridge/ports";
import type { BookingSyncPort } from "@/modules/patient-booking/ports";
import type { AppointmentRecordProjectionInput } from "./buildCanonicalSnapshot";
import type { RubitimeInboundEventInput } from "./types";
import type { ExternalMappingLookup } from "@/modules/booking-rubitime-bridge/legacyProjection";

export type InboundMirrorApplyResult = RubitimeCanonicalProjectionResult & {
  appointmentRecordProjection?: AppointmentRecordProjectionInput;
};

export type AppointmentMirrorSyncDeps = {
  bridge: Pick<RubitimeBridgePort, "upsertCanonicalFromRubitimeRecord">;
  syncPort: Pick<BookingSyncPort, "cancelRecord" | "updateRecord">;
  getDefaultOrganizationId: () => Promise<string>;
  loadForwardMapping: (organizationId: string) => Promise<ExternalMappingLookup>;
  loadReverseMapping: (organizationId: string) => Promise<import("./reverseMapping").ReverseMappingLookup>;
  stampCanonicalOutbound: (appointmentId: string) => Promise<void>;
};

export type AppointmentMirrorSyncService = {
  applyInboundFromRubitime(input: RubitimeInboundEventInput): Promise<InboundMirrorApplyResult>;
  pushRescheduleToRubitime(appointment: BeAppointment, rubitimeId: string): Promise<void>;
  pushCancelToRubitime(rubitimeId: string): Promise<void>;
  stampCanonicalOutbound(appointmentId: string): Promise<void>;
};
