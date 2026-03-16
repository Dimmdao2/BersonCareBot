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

  it("returns explicit non-accepted status and caches by idempotency key", async () => {
    const body = JSON.stringify({ eventType: "appointment.updated", eventId: "evt-1" });
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-cache-1",
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
    expect(handleIntegratorEventMock).toHaveBeenCalledTimes(1);
  });
});
