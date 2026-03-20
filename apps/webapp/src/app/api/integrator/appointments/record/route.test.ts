import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

const mockGetRecord = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const appointmentProjectionAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    appointmentProjectionAvailable.current
      ? {
          appointmentProjection: {
            getRecordByIntegratorId: mockGetRecord,
            listActiveByPhoneNormalized: vi.fn(),
            upsertRecordFromProjection: vi.fn(),
          },
        }
      : { appointmentProjection: undefined },
}));

import { GET } from "./route";

describe("GET /api/integrator/appointments/record", () => {
  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/appointments/record"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 401 when signature invalid", async () => {
    verifyGetMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/record?integratorRecordId=rec-1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorRecordId missing", async () => {
    verifyGetMock.mockReturnValue(true);
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/record", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("integratorRecordId");
  });

  it("returns 200 with record null when not found", async () => {
    verifyGetMock.mockReturnValue(true);
    mockGetRecord.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/record?integratorRecordId=rec-1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, record: null });
  });

  it("returns 503 when appointment projection not available", async () => {
    appointmentProjectionAvailable.current = false;
    verifyGetMock.mockReturnValue(true);
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/appointments/record?integratorRecordId=rec-1", {
          headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
        })
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toMatchObject({ ok: false, error: expect.stringContaining("projection") });
    } finally {
      appointmentProjectionAvailable.current = true;
    }
  });

  it("returns 200 with record on happy path", async () => {
    verifyGetMock.mockReturnValue(true);
    mockGetRecord.mockResolvedValue({
      id: "uuid-1",
      integratorRecordId: "rec-1",
      phoneNormalized: "+79991234567",
      recordAt: "2025-06-01T10:00:00.000Z",
      status: "created",
      payloadJson: { link: "https://example.com/rec" },
      lastEvent: "event-create-record",
      createdAt: "2025-05-01T00:00:00.000Z",
      updatedAt: "2025-05-01T00:00:00.000Z",
    });
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/record?integratorRecordId=rec-1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, record: expect.any(Object) });
    expect(json.record.externalRecordId).toBe("rec-1");
    expect(json.record.phoneNormalized).toBe("+79991234567");
    expect(json.record.status).toBe("created");
  });
});
