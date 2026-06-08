import { describe, expect, it } from "vitest";
import {
  defaultDoctorTopicFallbackChannels,
  isDoctorTopicChannelEnabled,
  resolveConfiguredDoctorTopicChannels,
} from "./doctorTopicChannelDefaults";

describe("doctorTopicChannelDefaults", () => {
  it("defaults patient communication topics to web_push first", () => {
    expect(defaultDoctorTopicFallbackChannels("doctor_patient_messages")).toEqual([
      "web_push",
      "telegram",
      "max",
    ]);
    expect(defaultDoctorTopicFallbackChannels("doctor_patient_program_notes")).toEqual([
      "web_push",
      "telegram",
      "max",
    ]);
  });

  it("uses global fallback when no pref rows exist", () => {
    expect(
      isDoctorTopicChannelEnabled([], "doctor_specialist_task_reminders", "telegram", [
        "telegram",
        "max",
      ]),
    ).toBe(true);
    expect(
      isDoctorTopicChannelEnabled([], "doctor_specialist_task_reminders", "web_push", [
        "telegram",
        "max",
      ]),
    ).toBe(false);
  });

  it("partial prefs inherit global fallback for channels without rows", () => {
    const rows = [
      {
        topicCode: "doctor_specialist_task_reminders",
        channelCode: "web_push" as const,
        isEnabled: true,
      },
    ];
    expect(
      resolveConfiguredDoctorTopicChannels("doctor_specialist_task_reminders", rows, [
        "telegram",
        "max",
      ]),
    ).toEqual(["telegram", "max", "web_push"]);
    expect(
      resolveConfiguredDoctorTopicChannels("doctor_specialist_task_reminders", rows, [
        "telegram",
      ]),
    ).toEqual(["telegram", "web_push"]);
  });

  it("explicit disabled row overrides global fallback", () => {
    const rows = [
      {
        topicCode: "doctor_patient_messages",
        channelCode: "telegram" as const,
        isEnabled: false,
      },
    ];
    expect(
      resolveConfiguredDoctorTopicChannels("doctor_patient_messages", rows, ["telegram", "max"]),
    ).toEqual(["max"]);
  });
});
