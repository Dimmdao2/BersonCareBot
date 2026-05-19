import { describe, expect, it, vi, beforeEach } from "vitest";
import { runContactEmailSetupEnqueue } from "./enqueueContactEmailSetup";

describe("runContactEmailSetupEnqueue", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not warn when enqueue succeeds", async () => {
    const requestContactEmailSetup = vi.fn().mockResolvedValue({ ok: true, status: "enqueued" });
    await runContactEmailSetupEnqueue(
      { requestContactEmailSetup },
      { userId: "u1", emailNormalized: "a@b.com", source: "rubitime" },
      { hook: "test" },
    );
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs warn when port returns not_configured", async () => {
    const requestContactEmailSetup = vi.fn().mockResolvedValue({ ok: false, reason: "not_configured" });
    await runContactEmailSetupEnqueue(
      { requestContactEmailSetup },
      { userId: "u1", emailNormalized: "a@b.com", source: "doctor_profile" },
      { hook: "admin_client_profile_patch" },
    );
    expect(console.warn).toHaveBeenCalledWith(
      "[emailSetupAccess:enqueue_failed]",
      expect.objectContaining({
        hook: "admin_client_profile_patch",
        userId: "u1",
        reason: "not_configured",
      }),
    );
  });

  it("logs error when port throws", async () => {
    const requestContactEmailSetup = vi.fn().mockRejectedValue(new Error("smtp down"));
    await runContactEmailSetupEnqueue(
      { requestContactEmailSetup },
      { userId: "u1", emailNormalized: "a@b.com", source: "manual_resend" },
      { hook: "auth_forgot_needs_email_setup" },
    );
    expect(console.error).toHaveBeenCalledWith(
      "[emailSetupAccess:enqueue_error]",
      expect.objectContaining({
        hook: "auth_forgot_needs_email_setup",
        message: "smtp down",
      }),
    );
  });
});
