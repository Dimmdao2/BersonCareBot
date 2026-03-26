import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIntegratorSmsAdapter } from "./integratorSmsAdapter";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { assertPhoneCanStartChallenge } from "@/modules/auth/phoneOtpLimits";

const phone = "+79997776655";

describe("createIntegratorSmsAdapter sendCode", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (inMemoryPhoneChallengeStore.deleteByPhone) {
      await inMemoryPhoneChallengeStore.deleteByPhone(phone);
    }
  });

  it("does not write challenge before integrator success (no phantom resend cooldown)", async () => {
    const adapter = createIntegratorSmsAdapter({
      challengeStore: inMemoryPhoneChallengeStore,
      integratorBaseUrl: "http://integrator.test",
      sharedSecret: "test-secret",
    });

    const fail = await adapter.sendCode(phone, 600);
    expect(fail.ok).toBe(false);

    const gate = await assertPhoneCanStartChallenge(phone);
    expect(gate.ok).toBe(true);

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    const ok = await adapter.sendCode(phone, 600);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.challengeId.length).toBeGreaterThan(0);
    }
  });
});
