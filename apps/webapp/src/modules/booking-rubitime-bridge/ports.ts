import type { BridgeProjectionStats } from "@/modules/booking-engine/types";

export type BridgeMappingSummary = {
  branches: number;
  specialists: number;
  services: number;
  availabilities: number;
  appointments: number;
};

/** Read-only Rubitime ↔ canonical bridge (этап 1). */
export type RubitimeBridgePort = {
  isBridgeEnabled(): Promise<boolean>;
  projectAppointmentRecords(organizationId: string): Promise<BridgeProjectionStats>;
  projectRubitimeRecords(organizationId: string): Promise<BridgeProjectionStats>;
  getMappingSummary(organizationId: string): Promise<BridgeMappingSummary>;
};
