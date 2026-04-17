import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListActive = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const appointmentProjectionAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    appointmentProjectionAvailable.current
      ? {
          appointmentProjection: {
            getRecordByIntegratorId: vi.fn(),
            listActiveByPhoneNormalized: mockListActive,
            upsertRecordFromProjection: vi.fn(),
          },
        }
      : { appointmentProjection: undefined },
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/appointments/active-by-user", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/appointments/active-by-user"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/active-by-user?phoneNormalized=%2B79991234567", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when appointment projection not available", async () => {
    appointmentProjectionAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/appointments/active-by-user?phoneNormalized=%2B79991234567", {
          headers: integratorGetSignedHeadersOk,
        })
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toMatchObject({ ok: false, error: expect.stringContaining("projection") });
    } finally {
      appointmentProjectionAvailable.current = true;
    }
  });

  it("returns 400 when phoneNormalized missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/active-by-user", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("phoneNormalized");
  });

  it("returns 200 with empty records on happy path", async () => {
    mockListActive.mockResolvedValue([]);
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/active-by-user?phoneNormalized=%2B79991234567", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, records: [] });
  });

  it("returns 200 with records on happy path", async () => {
    mockListActive.mockResolvedValue([
      {
        id: "uuid-1",
        integratorRecordId: "rec-1",
        phoneNormalized: "+79991234567",
        recordAt: "2025-06-01T10:00:00.000Z",
        status: "created",
        payloadJson: { link: "https://example.com/rec" },
        lastEvent: "event-create-record",
        createdAt: "2025-05-01T00:00:00.000Z",
        updatedAt: "2025-05-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/appointments/active-by-user?phoneNormalized=%2B79991234567", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, records: expect.any(Array) });
    expect(json.records).toHaveLength(1);
    expect(json.records[0].rubitimeRecordId).toBe("rec-1");
    expect(json.records[0].status).toBe("created");
    expect(json.records[0].link).toBe("https://example.com/rec");
  });
});
