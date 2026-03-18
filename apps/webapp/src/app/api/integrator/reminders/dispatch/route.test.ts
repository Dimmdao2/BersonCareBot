import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyStoreForTests } from "@/infra/idempotency/store";

const { verifySignatureMock, handleReminderDispatchMock } = vi.hoisted(() => ({
  verifySignatureMock: vi.fn(),
  handleReminderDispatchMock: vi.fn(),
}));

vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifySignatureMock,
}));

vi.mock("@/modules/integrator/reminderDispatch", () => ({
  handleReminderDispatch: handleReminderDispatchMock,
}));

import { POST } from "./route";

describe("POST /api/integrator/reminders/dispatch", () => {
  beforeEach(async () => {
    process.env.IDEMPOTENCY_STORE_PATH = "/tmp/bersoncare-webapp-idempotency-reminders-test.json";
    await resetIdempotencyStoreForTests();
    verifySignatureMock.mockReset();
    verifySignatureMock.mockReturnValue(true);
    handleReminderDispatchMock.mockReset();
    handleReminderDispatchMock.mockResolvedValue({
      accepted: false,
      reason: "durable reminder dispatch is not implemented",
    });
  });

  it("returns 400 for malformed JSON instead of 500", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrator/reminders/dispatch", {
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
    expect(await response.json()).toMatchObject({ ok: false, error: "invalid payload" });
    expect(handleReminderDispatchMock).not.toHaveBeenCalled();
  });

  it("returns 400 on header/body idempotency mismatch", async () => {
    const response = await POST(
      new Request("http://localhost/api/integrator/reminders/dispatch", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "x-bersoncare-idempotency-key": "idem-header",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idempotencyKey: "idem-body",
          userId: "u-1",
          message: { title: "t", body: "b" },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(handleReminderDispatchMock).not.toHaveBeenCalled();
  });

  it("returns explicit non-accepted status and caches duplicate responses", async () => {
    const headers = {
      "x-bersoncare-timestamp": "1700000000",
      "x-bersoncare-signature": "sig",
      "x-bersoncare-idempotency-key": "idem-cache-1",
      "content-type": "application/json",
    };
    const body = JSON.stringify({
      idempotencyKey: "idem-cache-1",
      userId: "u-1",
      message: { title: "t", body: "b" },
    });

    const first = await POST(
      new Request("http://localhost/api/integrator/reminders/dispatch", {
        method: "POST",
        headers,
        body,
      }),
    );
    const firstJson = await first.json();

    const second = await POST(
      new Request("http://localhost/api/integrator/reminders/dispatch", {
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
    expect(handleReminderDispatchMock).toHaveBeenCalledTimes(1);
  });
});
