import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryStaffSecurityPort,
  resetInMemoryStaffSecurityForTests,
} from "@/infra/repos/inMemoryStaffSecurity";
import { createStaffSecurityCrypto } from "./crypto";
import { createStaffSecurityService } from "./service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_CODE = "287082";
const crypto = createStaffSecurityCrypto({
  activeKeyId: "test-2026-07",
  keys: { "test-2026-07": Buffer.alloc(32, 7).toString("base64") },
});

describe("staff security state machine", () => {
  beforeEach(() => {
    resetInMemoryStaffSecurityForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(59_000));
  });

  afterEach(() => vi.useRealTimers());

  async function enrolledFixture() {
    const port = createInMemoryStaffSecurityPort(USER_ID);
    const service = createStaffSecurityService(port, crypto);
    await port.ensureProfile();
    const encryptedSecret = crypto.encryptTotpSecret(RFC_SECRET);
    await port.savePendingTotp(encryptedSecret);
    const verified = await service.verifyTotpEnrollment({ code: RFC_CODE });
    if (!verified.ok) throw new Error("fixture enrollment failed");
    return { port, service, recoveryCodes: verified.recoveryCodes, sessionVersion: verified.sessionVersion };
  }

  it("requires a verified factor and explicit recovery-code confirmation", async () => {
    const { port, service, recoveryCodes, sessionVersion } = await enrolledFixture();
    expect(recoveryCodes).toHaveLength(10);
    expect(sessionVersion).toBe(1);
    await expect(service.getStatus()).resolves.toMatchObject({
      enrolled: true,
      recoveryConfirmed: false,
      replacementRequired: false,
    });
    await expect(service.confirmRecoveryCodes()).resolves.toBe(true);
    await expect(service.getStatus()).resolves.toMatchObject({ recoveryConfirmed: true });
    const profile = await port.getProfile();
    await expect(port.completeTotpEnrollment({
      encryptedSecret: profile!.totpSecretCiphertext!,
      recoveryCodeHashes: ["concurrent-overwrite"],
    })).rejects.toThrow("staff_security_enrollment_conflict");
  });

  it("carries recovery acknowledgement from the stored profile into every TOTP login", async () => {
    const { service } = await enrolledFixture();
    const beforeAcknowledgement = await service.beginLogin();
    if (!beforeAcknowledgement.required) throw new Error("factor challenge missing");
    await expect(
      service.completeLogin({ token: beforeAcknowledgement.token, code: RFC_CODE }),
    ).resolves.toMatchObject({ ok: true, recoveryMode: false, recoveryConfirmed: false });

    await service.confirmRecoveryCodes();
    const afterAcknowledgement = await service.beginLogin();
    if (!afterAcknowledgement.required) throw new Error("factor challenge missing");
    await expect(
      service.completeLogin({ token: afterAcknowledgement.token, code: RFC_CODE }),
    ).resolves.toMatchObject({ ok: true, recoveryMode: false, recoveryConfirmed: true });
  });

  it("locks repeated bad factor attempts and does not accept a correct code while locked", async () => {
    const { service } = await enrolledFixture();
    const challenge = await service.beginLogin();
    if (!challenge.required) throw new Error("factor challenge missing");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.completeLogin({ token: challenge.token, code: "000000" }),
      ).resolves.toMatchObject({ ok: false, error: "invalid_factor" });
    }
    await expect(
      service.completeLogin({ token: challenge.token, code: "000000" }),
    ).resolves.toMatchObject({ ok: false, error: "factor_locked" });
    await expect(
      service.completeLogin({ token: challenge.token, code: RFC_CODE }),
    ).resolves.toMatchObject({ ok: false, error: "factor_locked" });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    const afterCooldown = await service.beginLogin();
    if (!afterCooldown.required) throw new Error("factor challenge missing after cooldown");
    await expect(
      service.completeLogin({ token: afterCooldown.token, code: "000000" }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_factor" });
  });

  it("consumes a recovery code exactly once and forces factor replacement", async () => {
    const { service, recoveryCodes } = await enrolledFixture();
    await service.confirmRecoveryCodes();
    const first = await service.beginLogin();
    if (!first.required) throw new Error("factor challenge missing");
    await expect(
      service.completeLogin({ token: first.token, recoveryCode: recoveryCodes[0] }),
    ).resolves.toMatchObject({ ok: true, recoveryMode: true, sessionVersion: 2 });
    await expect(service.getStatus()).resolves.toMatchObject({ replacementRequired: true });

    const second = await service.beginLogin();
    if (!second.required) throw new Error("factor challenge missing");
    await expect(
      service.completeLogin({ token: second.token, recoveryCode: recoveryCodes[0] }),
    ).resolves.toMatchObject({ ok: false, error: "invalid_recovery_code" });
    await expect(
      service.completeLogin({ token: second.token, code: RFC_CODE }),
    ).resolves.toMatchObject({ ok: false, error: "factor_replacement_required" });
  });

  it("keeps the active factor and remaining recovery codes until replacement is verified", async () => {
    const { port, service, recoveryCodes } = await enrolledFixture();
    await service.confirmRecoveryCodes();
    const challenge = await service.beginLogin();
    if (!challenge.required) throw new Error("factor challenge missing");
    const recovered = await service.completeLogin({
      token: challenge.token,
      recoveryCode: recoveryCodes[0],
    });
    if (!recovered.ok) throw new Error("recovery login failed");

    const before = await port.getProfile();
    const replacement = await service.startTotpEnrollment({ email: "owner@example.test" });
    if (!replacement.ok) throw new Error("replacement did not start");
    const pending = await port.getProfile();

    expect(pending?.totpSecretCiphertext).toBe(before?.totpSecretCiphertext);
    expect(pending?.recoveryCodeHashes).toEqual(before?.recoveryCodeHashes);
    expect(pending?.pendingTotpSecretCiphertext).not.toBeNull();
  });

  it("revokes prior sessions by advancing the server-side version", async () => {
    const { service, sessionVersion } = await enrolledFixture();
    await expect(service.revokeSessions()).resolves.toBe(sessionVersion + 1);
    await expect(service.getStatus()).resolves.toMatchObject({ sessionVersion: sessionVersion + 1 });
  });

  it("stores only recovery-code hashes in the repository", async () => {
    const { port, recoveryCodes } = await enrolledFixture();
    const profile = await port.getProfile();
    expect(crypto.matchRecoveryCodeHash(recoveryCodes[0]!, profile?.recoveryCodeHashes ?? [])).not.toBeNull();
    expect(profile?.recoveryCodeHashes).not.toContain(recoveryCodes[0]);
  });
});
