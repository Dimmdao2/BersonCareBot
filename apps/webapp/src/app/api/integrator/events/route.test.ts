import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyStoreForTests } from "@/infra/idempotency/store";

const { verifySignatureMock, handleIntegratorEventMock } = vi.hoisted(() => ({
  verifySignatureMock: vi.fn(),
  handleIntegratorEventMock: vi.fn(),
}));

vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifySignatureMock,
}));

vi.mock("@/modules/integrator/events", () => ({
  handleIntegratorEvent: handleIntegratorEventMock,
}));

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
