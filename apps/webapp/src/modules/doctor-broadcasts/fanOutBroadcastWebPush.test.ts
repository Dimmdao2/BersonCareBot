import { describe, expect, it, vi } from "vitest";
import { fanOutBroadcastWebPush } from "./fanOutBroadcastWebPush";

const runPatientWebPushNotify = vi.hoisted(() => vi.fn());

vi.mock("@/modules/patient-notifications/patientWebPushNotify", () => ({
  runPatientWebPushNotify,
}));

describe("fanOutBroadcastWebPush", () => {
  it("sends news push for eligible clients", async () => {
    runPatientWebPushNotify.mockResolvedValue({ ok: true, webPushDelivered: 1, webPushErrors: 0 });

    const result = await fanOutBroadcastWebPush(
      {
        auditId: "audit-1",
        broadcastCategory: "marketing",
        broadcastTitle: "Акция",
        eligibleClients: [{ userId: "u1" } as never, { userId: "u2" } as never],
        webPushEligibleUserIds: new Set(["u1"]),
      },
      {} as never,
    );

    expect(runPatientWebPushNotify).toHaveBeenCalledTimes(1);
    expect(runPatientWebPushNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId: "u1",
        intentType: "news",
        topicCode: "patient_news",
        broadcastTitle: "Акция",
        openUrl: expect.stringContaining("/app/patient/messages"),
      }),
      {},
    );
    expect(result).toMatchObject({ attempted: 1, delivered: 1, errors: 0 });
  });
});
