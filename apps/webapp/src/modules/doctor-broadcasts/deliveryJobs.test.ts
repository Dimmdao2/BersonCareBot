import { describe, expect, it } from "vitest";
import {
  buildBroadcastMessengerHtml,
  buildBroadcastMessageText,
  buildDoctorBroadcastDeliveryJobs,
  markdownToTelegramHtml,
  splitBroadcastPlainCombined,
  stripMarkdownToPlain,
} from "./deliveryJobs";
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
      messageTitle: "T",
      messageBodyPlain: "Hello",
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
      messageTitle: "T",
      messageBodyPlain: "Hi",
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
      messageTitle: "T",
      messageBodyPlain: "Hi",
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
      messageTitle: "T",
      messageBodyPlain: "Hi",
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
      messageTitle: "T",
      messageBodyPlain: "Hi",
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
      messageTitle: "T",
      messageBodyPlain: "Hello",
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
      messageTitle: "T",
      messageBodyPlain: "SMS text",
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
      messageTitle: "T",
      messageBodyPlain: "SMS text",
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
      messageTitle: "T",
      messageBodyPlain: "SMS text",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("sms");
  });

  it("telegram channel (explicit, not bot_message) sends only telegram", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: null, bindings: { telegramId: "111", maxId: "mx1" } }),
      ],
      channels: ["telegram"],
      messageTitle: "T",
      messageBodyPlain: "Hello",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("telegram");
  });

  it("max channel (explicit) sends only max", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: null, bindings: { telegramId: "111", maxId: "mx1" } }),
      ],
      channels: ["max"],
      messageTitle: "T",
      messageBodyPlain: "Hello",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].channel).toBe("max");
  });

  it("telegram+max explicit sends both jobs", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: null, bindings: { telegramId: "111", maxId: "mx1" } }),
      ],
      channels: ["telegram", "max"],
      messageTitle: "T",
      messageBodyPlain: "Hello",
    });
    expect(jobs.length).toBe(2);
    expect(jobs.map((j) => j.channel).sort()).toEqual(["max", "telegram"]);
  });
});

describe("buildBroadcastMessageText", () => {
  it("joins title and body", () => {
    expect(buildBroadcastMessageText("T", "B")).toBe("T\n\nB");
  });

  it("truncates combined text at MESSAGE_TEXT_MAX", () => {
    const body = "x".repeat(4000);
    const combined = buildBroadcastMessageText("T", body);
    expect(combined.length).toBe(3500);
    expect(combined.endsWith("…")).toBe(true);
  });
});

describe("splitBroadcastPlainCombined", () => {
  it("splits title and body after truncation", () => {
    const combined = buildBroadcastMessageText("Head", "y".repeat(4000));
    const parts = splitBroadcastPlainCombined(combined);
    expect(parts.title).toBe("Head");
    expect(parts.body.length).toBeGreaterThan(0);
    expect(parts.body.endsWith("…")).toBe(true);
  });
});

describe("markdownToTelegramHtml", () => {
  it("passes plain text through unchanged", () => {
    expect(markdownToTelegramHtml("Hello world")).toBe("Hello world");
  });
  it("HTML-escapes user content", () => {
    expect(markdownToTelegramHtml("a < b")).toBe("a &lt; b");
  });
  it("converts bold", () => {
    expect(markdownToTelegramHtml("say **hello** now")).toBe("say <b>hello</b> now");
  });
  it("converts italic", () => {
    expect(markdownToTelegramHtml("say _hello_ now")).toBe("say <i>hello</i> now");
  });
  it("does not italicise snake_case", () => {
    expect(markdownToTelegramHtml("use my_var_name")).toBe("use my_var_name");
  });
  it("converts strikethrough", () => {
    expect(markdownToTelegramHtml("~~old~~")).toBe("<s>old</s>");
  });
  it("converts inline code", () => {
    expect(markdownToTelegramHtml("`GET /api`")).toBe("<code>GET /api</code>");
  });
  it("converts bullet list", () => {
    expect(markdownToTelegramHtml("- item one\n- item two")).toBe("• item one\n• item two");
  });
});

describe("stripMarkdownToPlain", () => {
  it("removes bold markers, keeps text", () => {
    expect(stripMarkdownToPlain("say **hello** now")).toBe("say hello now");
  });
  it("removes italic markers but not snake_case", () => {
    expect(stripMarkdownToPlain("a _x_ my_var_name")).toBe("a x my_var_name");
  });
  it("removes strikethrough and inline code markers", () => {
    expect(stripMarkdownToPlain("~~old~~ `GET /api`")).toBe("old GET /api");
  });
  it("bulletises lists and preserves line breaks", () => {
    expect(stripMarkdownToPlain("- one\n- two")).toBe("• one\n• two");
  });
  it("strips bold inside a bullet line", () => {
    expect(stripMarkdownToPlain("* **важно** тут")).toBe("• важно тут");
  });
});

describe("sms plain rendition", () => {
  it("sms job strips markdown markers from the body", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [cl({ userId: "u1", bindings: {}, phone: "+79990001122" })],
      channels: ["sms"],
      messageTitle: "Заголовок",
      messageBodyPlain: "Текст **жирный** и\n- пункт",
    });
    const intent = jobs[0].payloadJson.intent as { payload: { message: { text: string } } };
    expect(intent.payload.message.text).toBe("Заголовок\n\nТекст жирный и\n• пункт");
  });
});

describe("buildBroadcastMessengerHtml", () => {
  it("wraps title in bold and converts markdown body", () => {
    expect(buildBroadcastMessengerHtml("News", "a < b")).toBe("<b>News</b>\n\na &lt; b");
  });
  it("renders markdown bold in body", () => {
    expect(buildBroadcastMessengerHtml("T", "**важно**")).toBe("<b>T</b>\n\n<b>важно</b>");
  });
});

describe("messenger delivery intent", () => {
  it("telegram job uses HTML parse_mode and messenger html text", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [cl({ userId: "u1", phone: null, bindings: { telegramId: "111" } })],
      channels: ["bot_message"],
      messageTitle: "Title",
      messageBodyPlain: "Body",
    });
    const intent = jobs[0].payloadJson.intent as { payload: { parse_mode?: string; message: { text: string } } };
    expect(intent.payload.parse_mode).toBe("HTML");
    expect(intent.payload.message.text).toBe("<b>Title</b>\n\nBody");
  });

  it("sms job uses plain combined text without parse_mode", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [cl({ userId: "u1", bindings: {}, phone: "+79990001122" })],
      channels: ["sms"],
      messageTitle: "Title",
      messageBodyPlain: "Body",
    });
    const intent = jobs[0].payloadJson.intent as { payload: { parse_mode?: string; message: { text: string } } };
    expect(intent.payload.parse_mode).toBeUndefined();
    expect(intent.payload.message.text).toBe("Title\n\nBody");
  });

  it("threads imageUrl into telegram intent payload but not sms", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: "+79990001122", bindings: { telegramId: "111" } }),
      ],
      channels: ["telegram", "sms"],
      messageTitle: "Title",
      messageBodyPlain: "Body",
      imageUrl: "https://x/y.jpg",
    });
    const tg = jobs.find((j) => j.channel === "telegram")!;
    const sms = jobs.find((j) => j.channel === "sms")!;
    const tgIntent = tg.payloadJson.intent as { payload: { imageUrl?: string } };
    const smsIntent = sms.payloadJson.intent as { payload: { imageUrl?: string } };
    expect(tgIntent.payload.imageUrl).toBe("https://x/y.jpg");
    expect(smsIntent.payload.imageUrl).toBeUndefined();
  });

  it("still enqueues telegram job when binding is marked bot-blocked", () => {
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({
          userId: "u-blocked",
          bindings: { telegramId: "111", telegramBotBlocked: true },
        }),
      ],
      channels: ["bot_message"],
      messageTitle: "T",
      messageBodyPlain: "Hello",
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0]?.channel).toBe("telegram");
  });

  it("telegram and sms share the same truncated plain cap for long body", () => {
    const longBody = "z".repeat(4000);
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId,
      eligibleClients: [
        cl({ userId: "u1", phone: "+79990001122", bindings: { telegramId: "111" } }),
      ],
      channels: ["bot_message", "sms"],
      messageTitle: "Long",
      messageBodyPlain: longBody,
    });
    const tg = jobs.find((j) => j.channel === "telegram")!;
    const sms = jobs.find((j) => j.channel === "sms")!;
    const tgIntent = tg.payloadJson.intent as { payload: { message: { text: string } } };
    const smsIntent = sms.payloadJson.intent as { payload: { message: { text: string } } };
    const plainCap = buildBroadcastMessageText("Long", longBody);
    expect(smsIntent.payload.message.text).toBe(plainCap);
    expect(tgIntent.payload.message.text.length).toBeLessThanOrEqual(plainCap.length + 20);
    expect(tgIntent.payload.message.text).toContain("<b>Long</b>");
  });
});
