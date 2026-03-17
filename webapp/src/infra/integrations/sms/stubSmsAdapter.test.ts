import { describe, expect, it } from "vitest";
import { createStubSmsAdapter } from "./stubSmsAdapter";

describe("stubSmsAdapter", () => {
  const adapter = createStubSmsAdapter();

  it("sendCode returns ok with challengeId and retryAfterSeconds", async () => {
    const result = await adapter.sendCode("+79991234567");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.challengeId).toBeDefined();
      expect(typeof result.challengeId).toBe("string");
      expect(result.retryAfterSeconds).toBe(60);
    }
  });

  it("verifyCode returns ok for code 123456", async () => {
    const send = await adapter.sendCode("+79997654321");
    expect(send.ok).toBe(true);
    if (!send.ok) return;
    const verify = await adapter.verifyCode(send.challengeId, "123456");
    expect(verify.ok).toBe(true);
  });

  it("verifyCode returns invalid_code for wrong code", async () => {
    const send = await adapter.sendCode("+79990000001");
    expect(send.ok).toBe(true);
    if (!send.ok) return;
    const verify = await adapter.verifyCode(send.challengeId, "999999");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.code).toBe("invalid_code");
  });

  it("verifyCode returns expired_code for unknown challengeId", async () => {
    const verify = await adapter.verifyCode("unknown-id", "123456");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.code).toBe("expired_code");
  });
});
