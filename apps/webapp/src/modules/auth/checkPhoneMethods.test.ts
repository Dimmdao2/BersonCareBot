import { describe, expect, it } from "vitest";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import {
  __testSetOauthProviders,
  inMemoryOAuthBindingsPort,
} from "@/infra/repos/inMemoryOAuthBindings";
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
  });

  it("returns pin and channels when user has data", async () => {
    const phone = "+79990000222";
    await inMemoryUserByPhonePort.createOrBind(phone, {
      channel: "telegram",
      chatId: "tg-1",
      displayName: "T",
    });
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    expect(u).not.toBeNull();
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, "dummy-hash-not-verified");
    __testSetOauthProviders(u!.userId, ["yandex"]);

    const r = await resolveAuthMethodsForPhone(phone, {
      userByPhonePort: inMemoryUserByPhonePort,
      userPinsPort: inMemoryUserPinsPort,
      oauthBindingsPort: inMemoryOAuthBindingsPort,
    });
    expect(r.exists).toBe(true);
    expect(r.methods.pin).toBe(true);
    expect(r.methods.telegram).toBe(true);
    expect(r.methods.oauth?.yandex).toBe(true);
  });
});
