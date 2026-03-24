import { describe, expect, it } from "vitest";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { POST } from "./route";

describe("POST /api/auth/check-phone", () => {
  it("returns 400 on invalid body", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns exists false for unknown phone", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: "+79993456789" }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; exists: boolean; methods: { sms: boolean } };
    expect(data.ok).toBe(true);
    expect(data.exists).toBe(false);
    expect(data.methods.sms).toBe(true);
  });

  it("returns exists true when user is in store", async () => {
    const phone = "+79997654321";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "web-check-phone-1",
      displayName: "Test",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    expect(u).not.toBeNull();
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, "argon2-hash-placeholder");

    const res = await POST(
      new Request("http://localhost/api/auth/check-phone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; exists: boolean; methods: { pin?: boolean } };
    expect(data.exists).toBe(true);
    expect(data.methods.pin).toBe(true);
  });
});
