import { describe, expect, it, vi } from "vitest";
import { enableStaffWebPushNotificationDefaults } from "./enableStaffWebPushNotificationDefaults";

describe("enableStaffWebPushNotificationDefaults", () => {
  it("upserts web_push only for topics without existing row", async () => {
    const upsert = vi.fn();
    const enabled = await enableStaffWebPushNotificationDefaults({
      userId: "doc-1",
      topicChannelPrefs: {
        listByUserId: async () => [
          {
            topicCode: "doctor_specialist_task_reminders",
            channelCode: "telegram",
            isEnabled: true,
          },
        ],
        upsert,
      },
    });
    expect(enabled).toEqual([
      "doctor_specialist_task_reminders",
      "doctor_patient_messages",
      "doctor_patient_program_notes",
    ]);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledWith("doc-1", "doctor_specialist_task_reminders", "web_push", true);
    expect(upsert).toHaveBeenCalledWith("doc-1", "doctor_patient_messages", "web_push", true);
    expect(upsert).toHaveBeenCalledWith("doc-1", "doctor_patient_program_notes", "web_push", true);
  });
});
