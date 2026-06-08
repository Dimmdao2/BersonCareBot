import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_TOPICS,
  isValidNotificationTopicId,
  isValidNotificationTopicTitle,
  normalizeNotificationsTopicsForAdminPatch,
  notificationsTopicsDefaultValueJsonString,
  parseNotificationsTopics,
} from "./notificationsTopics";

/** Литерал value_json для миграции 0108 — при изменении дефолта править migration + DEFAULT_NOTIFICATION_TOPICS. */
const MIGRATION_0108_NOTIFICATIONS_TOPICS_VALUE_JSON =
  '{"value":[{"id":"warmup_reminders","title":"Напоминания о разминках"},{"id":"training_reminders","title":"Напоминания о тренировках"},{"id":"appointment_reminders","title":"Напоминания о записях"},{"id":"patient_news","title":"Новости и уведомления"},{"id":"specialist_messages","title":"Сообщения специалиста"},{"id":"support_messages","title":"Сообщения поддержки"},{"id":"important_broadcasts","title":"Важные рассылки"}]}';

describe("notificationsTopicsDefaultValueJsonString", () => {
  it("matches migration 0108 default value_json literal", () => {
    expect(notificationsTopicsDefaultValueJsonString()).toBe(MIGRATION_0108_NOTIFICATIONS_TOPICS_VALUE_JSON);
  });

  it("round-trips with parseNotificationsTopics", () => {
    const json = notificationsTopicsDefaultValueJsonString();
    const parsed = JSON.parse(json) as { value: unknown };
    expect(parseNotificationsTopics(parsed)).toEqual([...DEFAULT_NOTIFICATION_TOPICS.map((r) => ({ ...r }))]);
  });
});

describe("isValidNotificationTopicId / isValidNotificationTopicTitle", () => {
  it("accepts canonical codes", () => {
    expect(isValidNotificationTopicId("warmup_reminders")).toBe(true);
    expect(isValidNotificationTopicTitle("Разминки")).toBe(true);
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
          { id: "patient_news", title: "One" },
          { id: "patient_news", title: "Two" },
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
