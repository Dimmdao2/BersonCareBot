import type { BridgeProjectionStats } from "@/modules/booking-engine/types";

export type BridgeMappingSummary = {
  branches: number;
  specialists: number;
  services: number;
  availabilities: number;
  appointments: number;
};

export type RubitimeCanonicalProjectionInput = {
  organizationId: string;
  externalId: string;
  platformUserId: string | null;
  phoneNormalized: string | null;
  recordAt: string | null;
  legacyStatus: string;
  lastEvent: string;
  payloadJson: unknown;
};

export type RubitimeCanonicalProjectionAction =
  | "inserted"
  | "updated"
  | "recovered"
  | "skipped_native_integrator_id"
  | "skipped_no_record_at"
  | "skipped_echo_guard";

export type RubitimeCanonicalProjectionResult = {
  action: RubitimeCanonicalProjectionAction;
  appointmentId?: string;
};

/** Rubitime ↔ canonical bridge: batch backfill + live projection into `be_appointments`. */
export type RubitimeBridgePort = {
  isBridgeEnabled(): Promise<boolean>;
  upsertCanonicalFromRubitimeRecord(
    input: RubitimeCanonicalProjectionInput,
  ): Promise<RubitimeCanonicalProjectionResult>;
  projectAppointmentRecords(organizationId: string): Promise<BridgeProjectionStats>;
  projectRubitimeRecords(organizationId: string): Promise<BridgeProjectionStats>;
  getMappingSummary(organizationId: string): Promise<BridgeMappingSummary>;
};
