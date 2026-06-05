import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentRecords } from "../../../db/schema/schema";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  beExternalEntityMappings,
} from "../../../db/schema/bookingEngine";

const executeMock = vi.hoisted(() => vi.fn());
const txInsert = vi.hoisted(() => vi.fn());
const txUpdate = vi.hoisted(() => vi.fn());
const mappingSelectLimit = vi.hoisted(() => vi.fn());
const appointmentSelectLimit = vi.hoisted(() => vi.fn());

const sampleLegacyRow = {
  integratorRecordId: "rubitime-ext-1",
  platformUserId: null,
  phoneNormalized: "+79055157922",
  recordAt: "2026-04-10 10:00:00+02",
  status: "created",
  lastEvent: "event-create-record",
  payloadJson: {
    cooperator_id: "34729",
    service_id: "67591",
    branch_id: "17356",
    duration_minutes: 60,
  },
  deletedAt: null,
};

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    execute: executeMock,
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === appointmentRecords) {
          return {
            where: vi.fn(() => Promise.resolve([sampleLegacyRow])),
          };
        }
        if (table === beAppointments) {
          return {
            where: vi.fn(() => ({
              limit: appointmentSelectLimit,
            })),
          };
        }
        if (table === beExternalEntityMappings) {
          return {
            where: vi.fn(() => ({
              limit: mappingSelectLimit,
              then(
                onFulfilled?: (value: unknown[]) => unknown,
                onRejected?: (reason: unknown) => unknown,
              ) {
                return Promise.resolve([]).then(onFulfilled, onRejected);
              },
            })),
          };
        }
        return {
          where: vi.fn(() => ({
            limit: mappingSelectLimit,
          })),
        };
      }),
    })),
    transaction: async (fn: (tx: { insert: typeof txInsert; update: typeof txUpdate }) => unknown) =>
      fn({ insert: txInsert, update: txUpdate }),
  })),
}));

import { createPgBookingRubitimeBridgePort } from "./pgBookingRubitimeBridge";

const ORG = "a0000000-0000-4000-8000-000000000001";

describe("createPgBookingRubitimeBridgePort projection idempotency", () => {
  beforeEach(() => {
    executeMock.mockReset();
    txInsert.mockReset();
    txUpdate.mockReset();
    mappingSelectLimit.mockReset();
    appointmentSelectLimit.mockReset();
    mappingSelectLimit.mockResolvedValue([]);
    appointmentSelectLimit.mockResolvedValue([]);
    let executeCalls = 0;
    executeMock.mockImplementation(async (query) => {
      const sqlText = String(query);
      if (sqlText.includes("system_settings")) {
        return { rows: [{ value_json: { value: true } }] };
      }
      executeCalls += 1;
      if (executeCalls === 1) {
        return { rows: [{ id: "existing-appt-id" }] };
      }
      return { rows: [] };
    });
    txUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    });
    txInsert.mockImplementation((table: unknown) => {
      if (table === beExternalEntityMappings) {
        return {
          values: vi.fn(() => ({
            onConflictDoUpdate: vi.fn(async () => undefined),
          })),
        };
      }
      if (table === beAppointmentHistoryEvents || table === beAppointmentEvents) {
        return { values: vi.fn(async () => undefined) };
      }
      if (table === beAppointments) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: "new-appt-id" }]),
          })),
        };
      }
      return { values: vi.fn(async () => undefined) };
    });
  });

  it("recovers mapping for existing rubitime_projection appointment instead of inserting duplicate", async () => {
    const port = createPgBookingRubitimeBridgePort();
    const result = await port.projectAppointmentRecords(ORG);

    expect(result.projectedAppointments).toBe(0);
    expect(result.updatedAppointments).toBe(0);
    expect(result.skippedExisting).toBe(0);
    expect(result.recoveredMappings).toBe(1);
    expect(txInsert.mock.calls.filter(([table]) => table === beAppointments)).toHaveLength(0);
    expect(txInsert.mock.calls.filter(([table]) => table === beExternalEntityMappings).length).toBeGreaterThan(0);
    expect(
      txInsert.mock.calls.filter(([table]) => table === beAppointmentHistoryEvents).length,
    ).toBeGreaterThan(0);
  });

  it("updates when appointment mapping already exists", async () => {
    mappingSelectLimit.mockResolvedValue([{ canonicalId: "already-mapped" }]);
    appointmentSelectLimit.mockResolvedValue([
      {
        id: "already-mapped",
        source: "rubitime_projection",
        startAt: "2026-04-10T08:00:00.000Z",
        originalStartAt: "2026-04-10T08:00:00.000Z",
        rescheduleCount: 0,
        platformUserId: null,
        branchId: null,
        specialistId: null,
        serviceId: null,
        attributionJson: {},
      },
    ]);
    executeMock.mockImplementation(async (query) => {
      const sqlText = String(query);
      if (sqlText.includes("FROM system_settings")) {
        return { rows: [{ value_json: { value: true } }] };
      }
      return { rows: [] };
    });
    const port = createPgBookingRubitimeBridgePort();
    const result = await port.projectAppointmentRecords(ORG);
    expect(result.updatedAppointments).toBe(1);
    expect(result.projectedAppointments).toBe(0);
    expect(txUpdate).toHaveBeenCalled();
    expect(txInsert.mock.calls.filter(([table]) => table === beAppointments)).toHaveLength(0);
  });

  it("updates admin_manual mapped appointment (bidirectional inbound)", async () => {
    mappingSelectLimit.mockResolvedValue([{ canonicalId: "native-mapped" }]);
    appointmentSelectLimit.mockResolvedValue([
      {
        id: "native-mapped",
        source: "admin_manual",
        startAt: "2026-04-10T08:00:00.000Z",
        originalStartAt: "2026-04-10T08:00:00.000Z",
        rescheduleCount: 0,
        platformUserId: "user-1",
        branchId: "branch-1",
        specialistId: "spec-1",
        serviceId: "svc-1",
        attributionJson: {},
      },
    ]);
    executeMock.mockImplementation(async (query) => {
      const sqlText = String(query);
      if (sqlText.includes("system_settings")) {
        return { rows: [{ value_json: { value: true } }] };
      }
      return { rows: [] };
    });
    const port = createPgBookingRubitimeBridgePort();
    const result = await port.upsertCanonicalFromRubitimeRecord({
      organizationId: ORG,
      externalId: "rubitime-native-mapped",
      platformUserId: "user-1",
      phoneNormalized: "+79055157922",
      recordAt: "2026-04-10T10:00:00.000Z",
      legacyStatus: "updated",
      lastEvent: "event-update-record",
      payloadJson: { datetime_end: "2026-04-10T11:00:00.000Z", service_id: "67591" },
    });
    expect(result.action).toBe("updated");
    expect(txUpdate).toHaveBeenCalled();
  });

  it("skips native be: integrator ids on live upsert", async () => {
    const port = createPgBookingRubitimeBridgePort();
    const result = await port.upsertCanonicalFromRubitimeRecord({
      organizationId: ORG,
      externalId: "be:a0000000-0000-4000-8000-000000000001",
      platformUserId: null,
      phoneNormalized: "+79055157922",
      recordAt: "2026-04-10T08:00:00.000Z",
      legacyStatus: "created",
      lastEvent: "native.created",
      payloadJson: {},
    });
    expect(result.action).toBe("skipped_native_integrator_id");
  });
});
