import { describe, expect, it } from "vitest";
import { inMemoryAppointmentProjectionPort } from "./inMemoryAppointmentProjection";

describe("AppointmentProjectionPort (in-memory contract)", () => {
  it("upsert then get returns same data", async () => {
    const port = inMemoryAppointmentProjectionPort;
    const params = {
      integratorRecordId: "rec-upsert-get-1",
      phoneNormalized: "+79991234567",
      recordAt: "2025-06-01T10:00:00.000Z",
      status: "created",
      payloadJson: { link: "https://example.com/1" },
      lastEvent: "event-create",
      updatedAt: "2025-05-01T12:00:00.000Z",
    };
    await port.upsertRecordFromProjection(params);
    const row = await port.getRecordByIntegratorId("rec-upsert-get-1");
    expect(row).not.toBeNull();
    expect(row!.integratorRecordId).toBe(params.integratorRecordId);
    expect(row!.phoneNormalized).toBe(params.phoneNormalized);
    expect(row!.recordAt).toBe(params.recordAt);
    expect(row!.status).toBe(params.status);
    expect(row!.payloadJson).toEqual(params.payloadJson);
    expect(row!.lastEvent).toBe(params.lastEvent);
  });

  it("listActiveByPhoneNormalized returns only matching phone and non-canceled", async () => {
    const port = inMemoryAppointmentProjectionPort;
    await port.upsertRecordFromProjection({
      integratorRecordId: "rec-list-a-1",
      phoneNormalized: "+79991111111",
      recordAt: "2025-06-01T09:00:00.000Z",
      status: "created",
      payloadJson: {},
      lastEvent: "create",
      updatedAt: new Date().toISOString(),
    });
    await port.upsertRecordFromProjection({
      integratorRecordId: "rec-list-b-1",
      phoneNormalized: "+79992222222",
      recordAt: "2025-06-01T10:00:00.000Z",
      status: "updated",
      payloadJson: {},
      lastEvent: "update",
      updatedAt: new Date().toISOString(),
    });
    const listA = await port.listActiveByPhoneNormalized("+79991111111");
    expect(listA.length).toBe(1);
    expect(listA[0].integratorRecordId).toBe("rec-list-a-1");
    const listB = await port.listActiveByPhoneNormalized("+79992222222");
    expect(listB.length).toBe(1);
    expect(listB[0].integratorRecordId).toBe("rec-list-b-1");
  });

  it("canceled does not appear in listActiveByPhoneNormalized", async () => {
    const port = inMemoryAppointmentProjectionPort;
    await port.upsertRecordFromProjection({
      integratorRecordId: "rec-canceled-1",
      phoneNormalized: "+79993333333",
      recordAt: "2025-06-01T11:00:00.000Z",
      status: "canceled",
      payloadJson: {},
      lastEvent: "cancel",
      updatedAt: new Date().toISOString(),
    });
    const list = await port.listActiveByPhoneNormalized("+79993333333");
    expect(list.length).toBe(0);
    const row = await port.getRecordByIntegratorId("rec-canceled-1");
    expect(row).not.toBeNull();
    expect(row!.status).toBe("canceled");
  });
});
