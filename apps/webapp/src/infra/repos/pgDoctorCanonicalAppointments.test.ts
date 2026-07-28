import { describe, expect, it, vi } from "vitest";
import { createPgDoctorCanonicalAppointmentsPort } from "./pgDoctorCanonicalAppointments";
import type {
  ScheduleKpis,
  ScheduleKpisQuery,
} from "@/modules/doctor-appointments/ports";

describe("pgDoctorCanonicalAppointments schedule KPI organization gate", () => {
  it("fails closed before DB/default lookup when organization is absent at runtime", async () => {
    const getDefaultOrganizationId = vi.fn(async () => "default-organization");
    const port = createPgDoctorCanonicalAppointmentsPort(getDefaultOrganizationId);
    const unsafeGetScheduleKpis = port.getScheduleKpis as unknown as (
      query: ScheduleKpisQuery,
      audience?: { excludedUserIds?: string[]; organizationId?: string },
    ) => Promise<ScheduleKpis>;

    await expect(
      unsafeGetScheduleKpis({ from: "2026-06-01T00:00:00Z", to: "2026-06-02T00:00:00Z" }),
    ).rejects.toThrow("schedule_kpis_organization_required");
    expect(getDefaultOrganizationId).not.toHaveBeenCalled();
  });
});
