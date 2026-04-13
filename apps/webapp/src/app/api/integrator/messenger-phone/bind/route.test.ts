import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdempotencyStoreForTests } from "@/infra/idempotency/store";

const { verifySignatureMock, executeMessengerPhoneHttpBindMock, getPoolMock } = vi.hoisted(() => ({
  verifySignatureMock: vi.fn(),
  executeMessengerPhoneHttpBindMock: vi.fn(),
  getPoolMock: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  })),
}));

vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifySignatureMock,
}));

vi.mock("@/modules/integrator/messengerPhoneHttpBindExecute", () => ({
  executeMessengerPhoneHttpBind: (...args: unknown[]) => executeMessengerPhoneHttpBindMock(...args),
}));

vi.mock("@/infra/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/db/client")>();
  return {
    ...actual,
    getPool: () => getPoolMock(),
  };
});

import { POST } from "./route";

const TEST_SECRET = "test-integrator-webhook-secret";

function sign(timestamp: string, rawBody: string): string {
  return createHmac("sha256", TEST_SECRET).update(`${timestamp}.${rawBody}`).digest("base64url");
}

function baseBody() {
  return {
    channelCode: "telegram" as const,
    externalId: "12345",
    phoneNormalized: "+79990001122",
  };
}

describe("POST /api/integrator/messenger-phone/bind", () => {
  beforeEach(async () => {
    process.env.IDEMPOTENCY_STORE_PATH = "/tmp/bersoncare-webapp-idempotency-messenger-bind-test.json";
    await resetIdempotencyStoreForTests();
    verifySignatureMock.mockReset();
    verifySignatureMock.mockReturnValue(true);
    executeMessengerPhoneHttpBindMock.mockReset();
  });

  it("returns 401 for invalid signature without calling bind", async () => {
    verifySignatureMock.mockReturnValue(false);
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": "invalid",
          "x-bersoncare-idempotency-key": "idem-bind-401",
        },
        body,
      }),
    );

    expect(res.status).toBe(401);
    expect(executeMessengerPhoneHttpBindMock).not.toHaveBeenCalled();
  });

  it("returns 200 with platformUserId on success", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: true, platformUserId: "pu-uuid-1" });
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
          "x-bersoncare-idempotency-key": "idem-bind-ok",
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; platformUserId?: string };
    expect(json.ok).toBe(true);
    expect(json.platformUserId).toBe("pu-uuid-1");
    expect(executeMessengerPhoneHttpBindMock).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when there is no channel binding (strict)", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: false, reason: "no_channel_binding" });
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
          "x-bersoncare-idempotency-key": "idem-bind-422",
        },
        body,
      }),
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("no_channel_binding");
  });

  it("returns 422 on phone conflict", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: false, reason: "phone_owned_by_other_user" });
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
          "x-bersoncare-idempotency-key": "idem-bind-conflict",
        },
        body,
      }),
    );

    expect(res.status).toBe(422);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.reason).toBe("phone_owned_by_other_user");
  });

  it("returns 400 when idempotency header is missing", async () => {
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      }),
    );

    expect(res.status).toBe(400);
    expect(executeMessengerPhoneHttpBindMock).not.toHaveBeenCalled();
  });

  it("returns 503 with indeterminate flag on transient db failure", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({
      ok: false,
      reason: "db_transient_failure",
      phoneLinkIndeterminate: true,
    });
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
          "x-bersoncare-idempotency-key": "idem-bind-503",
        },
        body,
      }),
    );

    expect(res.status).toBe(503);
    const json = (await res.json()) as { ok: boolean; reason?: string; indeterminate?: boolean };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("db_transient_failure");
    expect(json.indeterminate).toBe(true);
  });

  it("returns 422 for no_integrator_identity and integrator_id_mismatch", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: false, reason: "no_integrator_identity" });
    const b = JSON.stringify(baseBody());
    const ts = String(Math.floor(Date.now() / 1000));
    let res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": ts,
          "x-bersoncare-signature": sign(ts, b),
          "x-bersoncare-idempotency-key": "idem-no-id",
        },
        body: b,
      }),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { reason?: string }).reason).toBe("no_integrator_identity");

    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: false, reason: "integrator_id_mismatch" });
    const b2 = JSON.stringify(baseBody());
    const ts2 = String(Math.floor(Date.now() / 1000));
    res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": ts2,
          "x-bersoncare-signature": sign(ts2, b2),
          "x-bersoncare-idempotency-key": "idem-mismatch",
        },
        body: b2,
      }),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { reason?: string }).reason).toBe("integrator_id_mismatch");
  });

  it("accepts channelCode=max with valid signature", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValueOnce({ ok: true, platformUserId: "pu-max" });
    const body = JSON.stringify({
      channelCode: "max",
      externalId: "max-ext-1",
      phoneNormalized: "+79990001122",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
          "x-bersoncare-idempotency-key": "idem-bind-max",
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
    expect(executeMessengerPhoneHttpBindMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelCode: "max", externalId: "max-ext-1" }),
    );
  });

  it("returns 409 when idempotency key is reused with different semantic payload", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValue({ ok: true, platformUserId: "pu-1" });
    const key = "idem-conflict-payload";
    const body1 = JSON.stringify({ ...baseBody(), phoneNormalized: "+79990001122" });
    const ts1 = String(Math.floor(Date.now() / 1000));
    const headers1 = {
      "content-type": "application/json",
      "x-bersoncare-timestamp": ts1,
      "x-bersoncare-signature": sign(ts1, body1),
      "x-bersoncare-idempotency-key": key,
    };
    const res1 = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: headers1,
        body: body1,
      }),
    );
    expect(res1.status).toBe(200);

    const body2 = JSON.stringify({ ...baseBody(), phoneNormalized: "+79990001199" });
    const ts2 = String(Math.floor(Date.now() / 1000));
    const res2 = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": ts2,
          "x-bersoncare-signature": sign(ts2, body2),
          "x-bersoncare-idempotency-key": key,
        },
        body: body2,
      }),
    );
    expect(res2.status).toBe(409);
    expect(executeMessengerPhoneHttpBindMock).toHaveBeenCalledTimes(1);
  });

  it("returns cached 200 on idempotent replay with same key and payload", async () => {
    executeMessengerPhoneHttpBindMock.mockResolvedValue({ ok: true, platformUserId: "pu-cached" });
    const body = JSON.stringify(baseBody());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);
    const headers = {
      "content-type": "application/json",
      "x-bersoncare-timestamp": timestamp,
      "x-bersoncare-signature": signature,
      "x-bersoncare-idempotency-key": "idem-bind-idem",
    };

    const res1 = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers,
        body,
      }),
    );
    expect(res1.status).toBe(200);
    expect(executeMessengerPhoneHttpBindMock).toHaveBeenCalledTimes(1);

    const res2 = await POST(
      new Request("http://localhost/api/integrator/messenger-phone/bind", {
        method: "POST",
        headers,
        body,
      }),
    );
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { platformUserId?: string };
    expect(json2.platformUserId).toBe("pu-cached");
    expect(executeMessengerPhoneHttpBindMock).toHaveBeenCalledTimes(1);
  });
});
