import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const completeChannelLinkFromIntegratorMock = vi.fn();

vi.mock("@/modules/auth/channelLink", () => ({
  completeChannelLinkFromIntegrator: (...args: unknown[]) =>
    completeChannelLinkFromIntegratorMock(...args),
}));

import { POST } from "./route";

const TEST_SECRET = "test-integrator-webhook-secret";

function sign(timestamp: string, rawBody: string): string {
  return createHmac("sha256", TEST_SECRET).update(`${timestamp}.${rawBody}`).digest("base64url");
}

describe("POST /api/integrator/channel-link/complete", () => {
  it("returns 401 for invalid signature", async () => {
    const body = JSON.stringify({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "123456",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": "invalid-signature",
        },
        body,
      })
    );

    expect(res.status).toBe(401);
    expect(completeChannelLinkFromIntegratorMock).not.toHaveBeenCalled();
  });

  it("returns 200 for valid signature and body", async () => {
    completeChannelLinkFromIntegratorMock.mockResolvedValueOnce({
      ok: true,
      userId: "pu-1",
      needsPhone: false,
      phoneNormalized: "+79990001122",
    });
    const body = JSON.stringify({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "123456",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; needsPhone?: boolean; phoneNormalized?: string };
    expect(json.ok).toBe(true);
    expect(json.needsPhone).toBe(false);
    expect(json.phoneNormalized).toBe("+79990001122");
    expect(completeChannelLinkFromIntegratorMock).toHaveBeenCalledTimes(1);
  });

  it("accepts channelCode=max with valid signature", async () => {
    completeChannelLinkFromIntegratorMock.mockResolvedValueOnce({
      ok: true,
      userId: "pu-1",
      needsPhone: false,
    });
    const body = JSON.stringify({
      linkToken: "link_max123",
      channelCode: "max",
      externalId: "89002800",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(200);
    expect(completeChannelLinkFromIntegratorMock).toHaveBeenCalledWith({
      linkToken: "link_max123",
      channelCode: "max",
      externalId: "89002800",
    });
  });

  it("returns 409 when binding conflicts with another user", async () => {
    completeChannelLinkFromIntegratorMock.mockResolvedValueOnce({ ok: false, code: "conflict" });
    const body = JSON.stringify({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "123456",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "conflict" });
  });

  it("returns 409 with mergeReason when merge conflict supplies a reason code", async () => {
    completeChannelLinkFromIntegratorMock.mockResolvedValueOnce({
      ok: false,
      code: "conflict",
      mergeReason: "phone_owned_by_other_user",
    });
    const body = JSON.stringify({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "123456",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: "conflict",
      mergeReason: "phone_owned_by_other_user",
    });
  });

  it("returns 200 already_used when token was already completed", async () => {
    completeChannelLinkFromIntegratorMock.mockResolvedValueOnce({
      ok: false,
      code: "used_token",
      needsPhone: true,
    });
    const body = JSON.stringify({
      linkToken: "link_abc123",
      channelCode: "telegram",
      externalId: "123456",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, body);

    const res = await POST(
      new Request("http://localhost/api/integrator/channel-link/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "already_used", needsPhone: true });
  });
});
