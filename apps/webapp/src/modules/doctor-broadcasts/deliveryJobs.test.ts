import { describe, expect, it } from "vitest";
import { buildDoctorBroadcastDeliveryJobs, buildBroadcastMessageText } from "./deliveryJobs";
import type { BroadcastNotificationPrefsFlags } from "./ports";
import type { ClientListItem } from "@/modules/doctor-clients/ports";

const auditId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function cl(partial: Partial<ClientListItem> & Pick<ClientListItem, "userId">): ClientListItem {
  return {
    displayName: "X",
    phone: "+79990001122",
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
    ...partial,
  };
}

describe("buildDoctorBroadcastDeliveryJobs", () => {
  it("creates telegram job per client when bot_message selected", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: null, bindings: { telegramId: "111" } }),
      ],
      channels: ["bot_message"],
      messageText: "Hello",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("telegram");
    expect(jobs[0].payloadJson.broadcastAuditId).toBe(auditId);
  });

  it("creates telegram and max jobs when prefs allow both", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "all",
      eligibleClients: [
        cl({
          userId: "u1",
          bindings: { telegramId: "111", maxId: "mx1" },
        }),
      ],
      channels: ["bot_message"],
      messageText: "Hi",
      notificationPrefsByUserId: new Map<string, BroadcastNotificationPrefsFlags>([
        ["u1", { telegram: true, max: true, sms: true }],
      ]),
    });
    expect(jobs.length).toBe(2);
    expect(jobs.map((j) => j.channel).sort()).toEqual(["max", "telegram"]);
  });

  it("with_telegram audience sends only telegram even if max binding exists", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "with_telegram",
      eligibleClients: [
        cl({
          userId: "u1",
          bindings: { telegramId: "111", maxId: "mx1" },
        }),
      ],
      channels: ["bot_message"],
      messageText: "Hi",
      notificationPrefsByUserId: new Map([["u1", { telegram: false, max: false, sms: true }]]),
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("telegram");
  });

  it("with_max audience sends only max", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "with_max",
      eligibleClients: [
        cl({
          userId: "u1",
          bindings: { telegramId: "111", maxId: "mx1" },
        }),
      ],
      channels: ["bot_message"],
      messageText: "Hi",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("max");
  });

  it("drops telegram job when prefs disabled in general segment", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "all",
      eligibleClients: [cl({ userId: "u1", bindings: { telegramId: "111", maxId: "m2" } })],
      channels: ["bot_message"],
      messageText: "Hi",
      notificationPrefsByUserId: new Map([["u1", { telegram: false, max: true, sms: true }]]),
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("max");
  });

  it("sets attachMenu on payload when attachMenu true", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: null, bindings: { telegramId: "111" } }),
      ],
      channels: ["bot_message"],
      messageText: "Hello",
      attachMenu: true,
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].payloadJson.attachMenu).toBe(true);
  });

  it("respect_prefs: skips sms when sms notifications off", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "all",
      eligibleClients: [cl({ userId: "u1", bindings: {} })],
      channels: ["sms"],
      messageText: "SMS text",
      notificationPrefsByUserId: new Map([["u1", { telegram: true, max: true, sms: false }]]),
    });
    expect(jobs.length).toBe(0);
  });

  it("sms_only forces sms ignoring prefs when phone valid", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      audienceFilter: "sms_only",
      eligibleClients: [cl({ userId: "u1", bindings: {} })],
      channels: ["sms"],
      messageText: "SMS text",
      notificationPrefsByUserId: new Map([["u1", { telegram: true, max: true, sms: false }]]),
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("sms");
  });

  it("includes sms when phone valid and sms channel selected", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [cl({ userId: "u1", bindings: {}, phone: "+79990001122" })],
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
