import { describe, expect, it } from "vitest";
import {
  buildAppointmentLifecyclePushCopy,
  buildAppointmentReminderPushCopy,
  buildCustomReminderPushCopy,
  buildMessagePushCopy,
  buildReminderWebPushCopy,
  buildTrainingPushCopy,
  buildWarmupPushCopy,
  classifyReminderPushKind,
  formatWarmupsRemainingPhrase,
  stablePoolIndex,
  WARMUP_PUSH_TITLE,
} from "./pushNotificationCopy";

describe("classifyReminderPushKind", () => {
  it("maps warmups section to warmup", () => {
    expect(
      classifyReminderPushKind({
        linkedObjectType: "content_section",
        linkedObjectId: "warmups",
      }),
    ).toBe("warmup");
  });

  it("maps rehab program to training", () => {
    expect(
      classifyReminderPushKind({
        linkedObjectType: "rehab_program",
        linkedObjectId: "p1",
      }),
    ).toBe("training");
  });

  it("skips legacy water category", () => {
    expect(classifyReminderPushKind({ occurrenceCategory: "water" })).toBe("skip");
  });

  it("maps custom linked object to custom", () => {
    expect(classifyReminderPushKind({ linkedObjectType: "custom" })).toBe("custom");
  });
});

describe("buildWarmupPushCopy", () => {
  it("uses fixed title", () => {
    expect(buildWarmupPushCopy("occ-1").title).toBe(WARMUP_PUSH_TITLE);
  });

  it("includes daily warmup title when pool selects it", () => {
    const key = Array.from({ length: 512 }, (_, i) => `warmup-menu-${i}`).find(
      (k) => buildWarmupPushCopy(k, { dailyWarmupTitle: "Шея и плечи" }).body.includes("Шея и плечи"),
    );
    expect(key).toBeTruthy();
  });

  it("formats remaining warmups phrase", () => {
    expect(formatWarmupsRemainingPhrase(1)).toBe("Ещё 1 разминка, и цель выполнена!");
    expect(formatWarmupsRemainingPhrase(3)).toBe("Ещё 3 разминки, и цель выполнена!");
    expect(formatWarmupsRemainingPhrase(5)).toBe("Ещё 5 разминок, и цель выполнена!");
  });
});

describe("buildTrainingPushCopy", () => {
  it("is stable for the same key", () => {
    const a = buildTrainingPushCopy("occ-stable");
    const b = buildTrainingPushCopy("occ-stable");
    expect(a).toEqual(b);
    expect(a.title).toBe("Время тренировки");
  });
});

describe("buildCustomReminderPushCopy", () => {
  it("uses custom title and text", () => {
    expect(buildCustomReminderPushCopy("Пить воду", "Стакан утром")).toEqual({
      title: "Пить воду",
      body: "Стакан утром",
    });
  });
});

describe("buildMessagePushCopy", () => {
  it("uses Сообщение title and preview", () => {
    expect(buildMessagePushCopy("  Привет   мир  ")).toEqual({
      title: "Сообщение",
      body: "Привет мир",
    });
  });
});

describe("buildReminderWebPushCopy", () => {
  it("returns null for legacy skip categories", () => {
    expect(
      buildReminderWebPushCopy({
        stableKey: "x",
        occurrenceCategory: "breathing",
      }),
    ).toBeNull();
  });
});

describe("appointment push copy", () => {
  it("formats lifecycle created copy", () => {
    const copy = buildAppointmentLifecyclePushCopy(
      "created",
      "2026-05-20T11:00:00+03:00",
      "Europe/Moscow",
    );
    expect(copy.title).toBe("Запись на приём");
    expect(copy.body).toContain("Вы записаны на приём");
  });

  it("formats reminder with days", () => {
    const copy = buildAppointmentReminderPushCopy(
      "2026-05-22T11:00:00+03:00",
      "2026-05-20T11:00:00+03:00",
      "Europe/Moscow",
    );
    expect(copy.body).toContain("Дмитрию");
    expect(copy.body).toMatch(/2 дня/);
  });

  it("formats reminder with hours", () => {
    const copy = buildAppointmentReminderPushCopy(
      "2026-05-20T13:00:00+03:00",
      "2026-05-20T11:00:00+03:00",
      "Europe/Moscow",
    );
    expect(copy.body).toMatch(/2 часа/);
  });
});

describe("stablePoolIndex", () => {
  it("is deterministic", () => {
    expect(stablePoolIndex("abc", 7)).toBe(stablePoolIndex("abc", 7));
  });
});
