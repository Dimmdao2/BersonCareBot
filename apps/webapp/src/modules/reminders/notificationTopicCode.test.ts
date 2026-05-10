import { describe, expect, it } from "vitest";
import {
  REMINDER_NOTIFICATION_TOPIC_APPOINTMENT,
  REMINDER_NOTIFICATION_TOPIC_EXERCISE,
  notificationTopicCodeFromReminderRule,
} from "./notificationTopicCode";

describe("notificationTopicCodeFromReminderRule", () => {
  it("maps appointment category", () => {
    expect(
      notificationTopicCodeFromReminderRule({
        category: "appointment",
        linkedObjectType: null,
      }),
    ).toBe(REMINDER_NOTIFICATION_TOPIC_APPOINTMENT);
  });

  it("maps lfk category", () => {
    expect(
      notificationTopicCodeFromReminderRule({
        category: "lfk",
        linkedObjectType: "lfk_complex",
      }),
    ).toBe(REMINDER_NOTIFICATION_TOPIC_EXERCISE);
  });

  it("maps linked content types when category is chat", () => {
    expect(
      notificationTopicCodeFromReminderRule({
        category: "chat",
        linkedObjectType: "content_section",
      }),
    ).toBe(REMINDER_NOTIFICATION_TOPIC_EXERCISE);
  });

  it("returns null for important even if linked object looks like rehab", () => {
    expect(
      notificationTopicCodeFromReminderRule({
        category: "important",
        linkedObjectType: "rehab_program",
      }),
    ).toBeNull();
    expect(
      notificationTopicCodeFromReminderRule({
        category: "important",
        linkedObjectType: null,
      }),
    ).toBeNull();
  });

  it("returns null for categories without topic mapping (e.g. broadcast; symptom_reminders reserved)", () => {
    expect(
      notificationTopicCodeFromReminderRule({
        category: "broadcast",
        linkedObjectType: null,
      }),
    ).toBeNull();
  });
});
