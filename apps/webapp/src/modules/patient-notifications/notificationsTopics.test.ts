import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_TOPICS,
  isValidNotificationTopicId,
  isValidNotificationTopicTitle,
  normalizeNotificationsTopicsForAdminPatch,
  notificationsTopicsDefaultValueJsonString,
  parseNotificationsTopics,
} from "./notificationsTopics";

/** Литерал `value_json` в `083_notifications_topics.sql` и зеркале integrator — при изменении дефолта править все три места или сломается тест ниже. */
const MIGRATION_083_NOTIFICATIONS_TOPICS_VALUE_JSON =
  '{"value":[{"id":"exercise_reminders","title":"Напоминания об упражнениях"},{"id":"symptom_reminders","title":"Напоминания о симптомах"},{"id":"appointment_reminders","title":"Напоминания о записях"},{"id":"news","title":"Новости и обновления"}]}';

describe("notificationsTopicsDefaultValueJsonString", () => {
  it("matches migration 083_notifications_topics.sql default value_json literal", () => {
    expect(notificationsTopicsDefaultValueJsonString()).toBe(MIGRATION_083_NOTIFICATIONS_TOPICS_VALUE_JSON);
  });

  it("round-trips with parseNotificationsTopics", () => {
    const json = notificationsTopicsDefaultValueJsonString();
    const parsed = JSON.parse(json) as { value: unknown };
    expect(parseNotificationsTopics(parsed)).toEqual([...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))]);
  });
});

describe("isValidNotificationTopicId / isValidNotificationTopicTitle", () => {
  it("accepts canonical codes", () => {
    expect(isValidNotificationTopicId("exercise_reminders")).toBe(true);
    expect(isValidNotificationTopicTitle("Напоминания об упражнениях")).toBe(true);
  });

  it("rejects invalid id charset and empty title", () => {
    expect(isValidNotificationTopicId("BAD-ID")).toBe(false);
    expect(isValidNotificationTopicTitle("")).toBe(false);
    expect(isValidNotificationTopicTitle("   ")).toBe(false);
  });
});

describe("parseNotificationsTopics", () => {
  it("returns defaults when value is null", () => {
    expect(parseNotificationsTopics(null)).toEqual([...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))]);
  });

  it("accepts wrapped valid array", () => {
    const v = {
      value: [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    };
    expect(parseNotificationsTopics(v)).toEqual([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ]);
  });

  it("returns defaults on duplicate id", () => {
    expect(
      parseNotificationsTopics({
        value: [
          { id: "news", title: "One" },
          { id: "news", title: "Two" },
        ],
      }),
    ).toEqual([...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))]);
  });

  it("returns defaults on invalid id charset", () => {
    expect(parseNotificationsTopics({ value: [{ id: "BAD-ID", title: "x" }] })).toEqual(
      [...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))],
    );
  });
});

describe("normalizeNotificationsTopicsForAdminPatch", () => {
  it("accepts when knownTopicCodes is empty (structural only)", () => {
    const inner = DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }));
    const r = normalizeNotificationsTopicsForAdminPatch(inner, { knownTopicCodes: new Set() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(inner);
  });

  it("rejects unknown id when projection non-empty", () => {
    const r = normalizeNotificationsTopicsForAdminPatch([{ id: "only_this", title: "T" }], {
      knownTopicCodes: new Set(["other"]),
    });
    expect(r.ok).toBe(false);
  });

  it("accepts subset when all ids are known", () => {
    const r = normalizeNotificationsTopicsForAdminPatch(
      [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
      { knownTopicCodes: new Set(["a", "b", "c"]) },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const r = normalizeNotificationsTopicsForAdminPatch(
      [
        { id: "a", title: "A" },
        { id: "a", title: "B" },
      ],
      { knownTopicCodes: new Set() },
    );
    expect(r.ok).toBe(false);
  });
});
