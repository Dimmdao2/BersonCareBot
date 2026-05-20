import { describe, expect, it, vi, beforeEach } from "vitest";
import { reconcileStalePatientWebPushSubscriptions } from "./reconcilePatientWebPush";

const unsubscribeAll = vi.fn();

vi.mock("@/shared/lib/webPush/patientWebPushApi", () => ({
  unsubscribeAllPatientWebPush: () => unsubscribeAll(),
}));

describe("reconcileStalePatientWebPushSubscriptions", () => {
  beforeEach(() => {
    unsubscribeAll.mockReset();
    unsubscribeAll.mockResolvedValue(true);
  });

  it("clears server subs when permission denied", async () => {
    const ok = await reconcileStalePatientWebPushSubscriptions({
      permission: "denied",
      hasLocalSubscription: false,
      hasServerSubscription: true,
    });
    expect(ok).toBe(true);
    expect(unsubscribeAll).toHaveBeenCalledOnce();
  });

  it("clears stale server subs when default and no local sub", async () => {
    const ok = await reconcileStalePatientWebPushSubscriptions({
      permission: "default",
      hasLocalSubscription: false,
      hasServerSubscription: true,
    });
    expect(ok).toBe(true);
  });

  it("skips when no server subscription", async () => {
    const ok = await reconcileStalePatientWebPushSubscriptions({
      permission: "denied",
      hasLocalSubscription: false,
      hasServerSubscription: false,
    });
    expect(ok).toBe(false);
    expect(unsubscribeAll).not.toHaveBeenCalled();
  });

  it("skips when granted with local sub", async () => {
    const ok = await reconcileStalePatientWebPushSubscriptions({
      permission: "granted",
      hasLocalSubscription: true,
      hasServerSubscription: true,
    });
    expect(ok).toBe(false);
    expect(unsubscribeAll).not.toHaveBeenCalled();
  });

  it("clears server subs when global web push pref is off", async () => {
    const ok = await reconcileStalePatientWebPushSubscriptions({
      permission: "granted",
      hasLocalSubscription: true,
      hasServerSubscription: true,
      globalWebPushEnabled: false,
    });
    expect(ok).toBe(true);
    expect(unsubscribeAll).toHaveBeenCalledOnce();
  });
});
