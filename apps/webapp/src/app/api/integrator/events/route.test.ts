import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyStoreForTests } from "@/infra/idempotency/store";

const { verifySignatureMock, handleIntegratorEventMock, getPoolMock } = vi.hoisted(() => ({
  verifySignatureMock: vi.fn(),
  handleIntegratorEventMock: vi.fn(),
  getPoolMock: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  })),
}));

vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifySignatureMock,
}));

vi.mock("@/modules/integrator/events", () => ({
  handleIntegratorEvent: handleIntegratorEventMock,
}));

vi.mock("@/infra/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/client")>();
  return {
    ...actual,
    getPool: () => getPoolMock(),
  };
});

import { POST } from "./route";

describe("POST /api/integrator/events", () => {
  beforeEach(async () => {
    process.env.IDEMPOTENCY_STORE_PATH = "/tmp/bersoncare-webapp-idempotency-events-test.json";
    await resetIdempotencyStoreForTests();
    verifySignatureMock.mockReset();
    verifySignatureMock.mockReturnValue(true);
    handleIntegratorEventMock.mockReset();
    handleIntegratorEventMock.mockResolvedValue({
      accepted: false,
      reason: "durable ingest is not implemented",
    });
  });

  it("returns 400 for malformed JSON instead of 500", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "x-bersoncare-idempotency-key": "idem-1",
          "content-type": "application/json",
        },
        body: "{bad-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(handleIntegratorEventMock).not.toHaveBeenCalled();
  });

  it("returns 422 when handler marks non-retryable semantic failure", async () => {
    handleIntegratorEventMock.mockResolvedValueOnce({
      accepted: false,
      reason: "duplicate key",
      retryable: false,
    });
    const response = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "x-bersoncare-idempotency-key": "idem-422",
          "content-type": "application/json",
        },
        body: JSON.stringify({ eventType: "contact.linked", payload: { integratorUserId: "1", phoneNormalized: "+79990001122" } }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, accepted: false });
  });

  it("returns 400 on header/body idempotency mismatch", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "x-bersoncare-idempotency-key": "idem-header",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          eventType: "appointment.updated",
          idempotencyKey: "idem-body",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(handleIntegratorEventMock).not.toHaveBeenCalled();
  });

  it("out-of-order retry converges: first 503 then same key succeeds 202", async () => {
    handleIntegratorEventMock
      .mockResolvedValueOnce({ accepted: false, reason: "transient" })
      .mockResolvedValueOnce({ accepted: true });
    const body = JSON.stringify({ eventType: "user.upserted", payload: { integratorUserId: "1" } });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-converge",
      "content-type": "application/json",
    };

    const first = await POST(
      new Request("http://localhost/api/integrator/events", { method: "POST", headers, body }),
    );
    const second = await POST(
      new Request("http://localhost/api/integrator/events", { method: "POST", headers, body }),
    );

    expect(first.status).toBe(503);
    expect(second.status).toBe(202);
    expect(await second.json()).toMatchObject({ ok: true, accepted: true });
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache 503 so retry with same key re-runs handler", async () => {
    const body = JSON.stringify({ eventType: "appointment.updated", eventId: "evt-1" });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-retry-1",
      "content-type": "application/json",
    };

    const first = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body,
      }),
    );
    const firstJson = await first.json();

    const second = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body,
      }),
    );
    const secondJson = await second.json();

    expect(first.status).toBe(503);
    expect(firstJson).toMatchObject({ ok: false, accepted: false });
    expect(second.status).toBe(503);
    expect(secondJson).toEqual(firstJson);
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(2);
  });

  it("caches 202 and second attempt with same key returns cached without re-running handler", async () => {
    handleIntegratorEventMock.mockResolvedValueOnce({ accepted: true });
    const body = JSON.stringify({ eventType: "user.upserted", payload: { integratorUserId: "42" } });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-success-1",
      "content-type": "application/json",
    };

    const first = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body,
      }),
    );
    const firstJson = await first.json();

    const second = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body,
      }),
    );
    const secondJson = await second.json();

    expect(first.status).toBe(202);
    expect(firstJson).toMatchObject({ ok: true, accepted: true });
    expect(second.status).toBe(202);
    expect(secondJson).toEqual(firstJson);
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(1);
  });

  it("same idempotency key and business payload with different occurredAt does not 409 and caches once", async () => {
    handleIntegratorEventMock.mockResolvedValueOnce({ accepted: true });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-same-payload-diff-at",
      "content-type": "application/json",
    };
    const bodyA = JSON.stringify({
      eventType: "user.upserted",
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { integratorUserId: "1" },
    });
    const bodyB = JSON.stringify({
      eventType: "user.upserted",
      occurredAt: "2026-01-02T00:00:00.000Z",
      payload: { integratorUserId: "1" },
    });

    const first = await POST(
      new Request("http://localhost/api/integrator/events", { method: "POST", headers, body: bodyA }),
    );
    const second = await POST(
      new Request("http://localhost/api/integrator/events", { method: "POST", headers, body: bodyB }),
    );

    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(secondJson).toEqual(firstJson);
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when same idempotency key is reused with different payload", async () => {
    handleIntegratorEventMock.mockResolvedValue({ accepted: true });
    const bodyA = JSON.stringify({ eventType: "user.upserted", payload: { integratorUserId: "1" } });
    const bodyB = JSON.stringify({ eventType: "user.upserted", payload: { integratorUserId: "2" } });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-conflict",
      "content-type": "application/json",
    };

    const first = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body: bodyA,
      }),
    );
    expect(first.status).toBe(202);

    const second = await POST(
      new Request("http://localhost/api/integrator/events", {
        method: "POST",
        headers,
        body: bodyB,
      }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ ok: false, error: "idempotency key reused with different payload" });
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(1);
  });
});
