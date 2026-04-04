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
    if (!fail.ok) {
      expect(fail.code).toBe("delivery_failed");
    }

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

  it("returns delivery_failed when fetch throws (transport error)", async () => {
    const phoneOther = "+79998887766";
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));
    const adapter = createIntegratorSmsAdapter({
      challengeStore: inMemoryPhoneChallengeStore,
      integratorBaseUrl: "http://integrator.test",
      sharedSecret: "test-secret",
    });
    const fail = await adapter.sendCode(phoneOther, 600);
    expect(fail.ok).toBe(false);
    if (!fail.ok) {
      expect(fail.code).toBe("delivery_failed");
    }
    if (inMemoryPhoneChallengeStore.deleteByPhone) {
      await inMemoryPhoneChallengeStore.deleteByPhone(phoneOther);
    }
  });

  it("emits phone_otp_delivery JSON log on successful SMS (operational, masked phone)", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    const adapter = createIntegratorSmsAdapter({
      challengeStore: inMemoryPhoneChallengeStore,
      integratorBaseUrl: "http://integrator.test",
      sharedSecret: "test-secret",
    });

    const p = "+79991112233";
    const ok = await adapter.sendCode(p, 600);
    expect(ok.ok).toBe(true);

    const payload = logSpy.mock.calls.map((c) => c[0]).find((line) => typeof line === "string" && line.includes("phone_otp_delivery"));
    expect(payload).toBeDefined();
    const parsed = JSON.parse(payload as string) as {
      event: string;
      channel: string;
      outcome: string;
      phoneMask: string;
    };
    expect(parsed.event).toBe("phone_otp_delivery");
    expect(parsed.channel).toBe("sms");
    expect(parsed.outcome).toBe("success");
    expect(parsed.phoneMask).toContain("2233");
    expect(parsed.phoneMask).not.toContain("79991112233");

    logSpy.mockRestore();
    if (inMemoryPhoneChallengeStore.deleteByPhone) {
      await inMemoryPhoneChallengeStore.deleteByPhone(p);
    }
  });
});
