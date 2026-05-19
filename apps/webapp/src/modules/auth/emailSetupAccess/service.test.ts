import { describe, expect, it, vi } from "vitest";
import { createEmailSetupAccessService } from "./service";
import type { EmailSetupAccessPort } from "./ports";

describe("emailSetupAccess service", () => {
  it("rejects invalid email before port", async () => {
    const port: EmailSetupAccessPort = {
      requestContactEmailSetup: vi.fn(),
    };
    const svc = createEmailSetupAccessService(port);
    const r = await svc.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "not-email",
      source: "doctor_profile",
    });
    expect(r).toEqual({ ok: false, reason: "invalid_email" });
    expect(port.requestContactEmailSetup).not.toHaveBeenCalled();
  });

  it("normalizes email and delegates to port", async () => {
    const port: EmailSetupAccessPort = {
      requestContactEmailSetup: vi.fn().mockResolvedValue({ ok: true, status: "stub_pending_phase3" }),
    };
    const svc = createEmailSetupAccessService(port);
    await svc.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "  User@Example.COM ",
      source: "rubitime",
    });
    expect(port.requestContactEmailSetup).toHaveBeenCalledWith({
      userId: "u1",
      emailNormalized: "user@example.com",
      source: "rubitime",
    });
  });
});
