/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { createPgPatientMaintenanceHistoryPort } from "@/infra/repos/pgPatientMaintenanceHistory";

const { runWebappPgTextMock } = vi.hoisted(() => ({ runWebappPgTextMock: vi.fn() }));

vi.mock("@/infra/db/runWebappSql", () => ({ runWebappPgText: runWebappPgTextMock }));

describe("createPgPatientMaintenanceHistoryPort", () => {
  beforeEach(() => runWebappPgTextMock.mockReset());

  it("uses the no-argument current-patient projection with bounded diagnostic attribution", async () => {
    runWebappPgTextMock.mockImplementationOnce(async (sql: string, params?: unknown[]) => {
      expect(getCurrentWebappDbOperationFamily()).toBe("patient_booking_history");
      expect(sql).toBe("SELECT * FROM app.read_current_patient_appointment_history()");
      expect(params).toBeUndefined();
      return {
        rows: [{
          appointment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          start_at: "2026-07-20T10:00:00.000Z",
          end_at: "2026-07-20T11:00:00.000Z",
          status: "confirmed",
          subtitle: "Услуга · Филиал",
          specialist_name: "Специалист",
          branch_title: "Филиал",
          room_title: "Кабинет",
          service_title: "Услуга",
        }],
      };
    });

    const rows = await createPgPatientMaintenanceHistoryPort().listCurrentPatientHistory();
    expect(rows).toEqual([{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      startAt: "2026-07-20T10:00:00.000Z",
      endAt: "2026-07-20T11:00:00.000Z",
      status: "confirmed",
      subtitle: "Услуга · Филиал",
      specialistName: "Специалист",
      branchTitle: "Филиал",
      roomTitle: "Кабинет",
      serviceTitle: "Услуга",
    }]);
    expect(getCurrentWebappDbOperationFamily()).toBeUndefined();
  });
});
