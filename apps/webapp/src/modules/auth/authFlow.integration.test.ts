/**
 * EXEC H.1.6: цепочка модулей auth без UI — эквивалент phone → check → (неверный PIN) → OTP → confirm.
 */
import { describe, expect, it } from "vitest";
import { createStubSmsAdapter } from "@/infra/integrations/sms/stubSmsAdapter";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { inMemoryOAuthBindingsPort } from "@/infra/repos/inMemoryOAuthBindings";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { resolveAuthMethodsForPhone } from "./checkPhoneMethods";
import { hashPin } from "./pinHash";
import { verifyPinForLogin } from "./pinAuth";
import { confirmPhoneAuth, startPhoneAuth } from "./phoneAuth";

const webCtx = { channel: "web" as const, chatId: "auth-flow-int-web" };

describe("auth flow integration (H.1.6)", () => {
  it("phone → check → неверный PIN → startPhoneAuth (канал SMS) → confirmPhoneAuth", async () => {
    const phone = `+7999${Date.now().toString().slice(-7)}`;
    await inMemoryUserByPhonePort.createOrBind(phone, webCtx);
    const u = await inMemoryUserByPhonePort.findByPhone(phone);
    expect(u).not.toBeNull();
    const h = await hashPin("4242");
    await inMemoryUserPinsPort.upsertPinHash(u!.userId, h);

    const check = await resolveAuthMethodsForPhone(phone, {
      userByPhonePort: inMemoryUserByPhonePort,
      userPinsPort: inMemoryUserPinsPort,
      oauthBindingsPort: inMemoryOAuthBindingsPort,
    });
    expect(check.exists).toBe(true);
    expect(check.methods.pin).toBe(true);

    const badPin = await verifyPinForLogin(u!.userId, "0000", inMemoryUserPinsPort);
    expect(badPin.ok).toBe(false);

    const deps = {
      smsPort: createStubSmsAdapter({ challengeStore: inMemoryPhoneChallengeStore }),
      challengeStore: inMemoryPhoneChallengeStore,
      userByPhonePort: inMemoryUserByPhonePort,
    };

    const start = await startPhoneAuth(phone, webCtx, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;

    const stored = await inMemoryPhoneChallengeStore.get(start.challengeId);
    expect(stored?.code).toBeDefined();

    const confirm = await confirmPhoneAuth(start.challengeId, stored!.code!, deps);
    expect(confirm.ok).toBe(true);
    if (confirm.ok) {
      expect(confirm.user.phone).toBe(phone);
      expect(confirm.redirectTo).toBe("/app/patient");
    }
  });
});
