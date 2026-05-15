import { describe, expect, it } from "vitest";
import { buildDoctorBroadcastDeliveryJobs, buildBroadcastMessageText } from "./deliveryJobs";

describe("buildDoctorBroadcastDeliveryJobs", () => {
  const auditId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("creates telegram job per client when bot_message selected", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      effectiveClients: [
        {
          userId: "u1",
          displayName: "A",
          phone: null,
          bindings: { telegramId: "111" },
          nextAppointmentLabel: null,
          activeTreatmentProgram: false,
          activeTreatmentProgramInstanceId: null,
          cancellationCount30d: 0,
        },
      ],
      channels: ["bot_message"],
      messageText: "Hello",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("telegram");
    expect(jobs[0].payloadJson.broadcastAuditId).toBe(auditId);
  });

  it("includes sms when phone valid and sms channel selected", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      effectiveClients: [
        {
          userId: "u1",
          displayName: "A",
          phone: "+79990001122",
          bindings: {},
          nextAppointmentLabel: null,
          activeTreatmentProgram: false,
          activeTreatmentProgramInstanceId: null,
          cancellationCount30d: 0,
        },
      ],
      channels: ["sms"],
      messageText: "SMS text",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("sms");
  });
});

describe("buildBroadcastMessageText", () => {
  it("joins title and body", () => {
    expect(buildBroadcastMessageText("T", "B")).toBe("T\n\nB");
  });
});
