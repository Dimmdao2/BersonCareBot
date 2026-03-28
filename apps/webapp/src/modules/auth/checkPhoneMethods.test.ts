import { describe, expect, it } from "vitest";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import { resolveAuthMethodsForPhone } from "./checkPhoneMethods";

describe("resolveAuthMethodsForPhone", () => {
  it("returns exists false for unknown phone", async () => {
    const r = await resolveAuthMethodsForPhone("+79990000111", {
      userByPhonePort: inMemoryUserByPhonePort,
      userPinsPort: inMemoryUserPinsPort,
      oauthBindingsPort: inMemoryOAuthBindingsPort,
    });
    expect(r.exists).toBe(false);
    expect(r.methods.sms).toBe(true);
    // OAuth не включается в методы (скрыт до production-готовности)
    expect(r.methods.oauth).toBeUndefined();
  });

  it("returns pin and messenger channels when user has data (no oauth in response)", async () => {
    const phone = "+79990000222";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "telegram",
      chatId: "tg-1",
      displayName: "T",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    expect(u).not.toBeNull();
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, "dummy-hash-not-verified");

    const r = await resolveAuthMethodsForPhone(phone, {
      userByPhonePort: inMemoryUserByPhonePort,
      userPinsPort: inMemoryUserPinsPort,
      oauthBindingsPort: inMemoryOAuthBindingsPort,
    });
    expect(r.exists).toBe(true);
    expect(r.methods.pin).toBe(true);
    expect(r.methods.telegram).toBe(true);
    // OAuth не включается в UI-методы (скрыт до production-готовности)
    expect(r.methods.oauth).toBeUndefined();
  });

  it("returns emailAddress when verified email exists (port override)", async () => {
    const phone = "+79990000333";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "web",
      chatId: "web-email-1",
      displayName: "E",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    expect(u).not.toBeNull();

    const userByPhoneWithEmail = {
      ...inMemoryUserByPhonePort,
      async getVerifiedEmailForUser(userId: string) {
        return userId === u!.userId ? "user@test.example" : null;
      },
    };

    const r = await resolveAuthMethodsForPhone(phone, {
      userByPhonePort: userByPhoneWithEmail,
      userPinsPort: inMemoryUserPinsPort,
      oauthBindingsPort: inMemoryOAuthBindingsPort,
    });
    expect(r.exists).toBe(true);
    expect(r.methods.email).toBe(true);
    expect(r.methods.emailAddress).toBe("user@test.example");
  });
});
