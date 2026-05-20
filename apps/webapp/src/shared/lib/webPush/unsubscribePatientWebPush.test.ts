import { beforeEach, describe, expect, it, vi } from "vitest";
import { unsubscribePatientWebPush } from "./unsubscribePatientWebPush";

const unsubscribeAll = vi.fn();
const getExistingPushSubscription = vi.fn();

vi.mock("@/shared/lib/webPush/patientWebPushApi", () => ({
  unsubscribeAllPatientWebPush: () => unsubscribeAll(),
}));

vi.mock("@/shared/lib/webPush/pushCapability", () => ({
  getExistingPushSubscription: () => getExistingPushSubscription(),
}));

describe("unsubscribePatientWebPush", () => {
  beforeEach(() => {
    unsubscribeAll.mockReset();
    getExistingPushSubscription.mockReset();
    unsubscribeAll.mockResolvedValue(true);
  });

  it("always clears server subs via unsubscribe all", async () => {
    getExistingPushSubscription.mockResolvedValue(null);
    await expect(unsubscribePatientWebPush()).resolves.toBe(true);
    expect(unsubscribeAll).toHaveBeenCalledOnce();
  });

  it("unsubscribes locally after server all", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    getExistingPushSubscription.mockResolvedValue({ endpoint: "e1", unsubscribe });
    await expect(unsubscribePatientWebPush()).resolves.toBe(true);
    expect(unsubscribeAll).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("returns false when server unsubscribe fails", async () => {
    unsubscribeAll.mockResolvedValue(false);
    getExistingPushSubscription.mockResolvedValue(null);
    await expect(unsubscribePatientWebPush()).resolves.toBe(false);
  });
});
