import { describe, expect, it } from "vitest";
import { validateReminderDispatchPayload } from "./service";

describe("reminders service", () => {
  describe("validateReminderDispatchPayload", () => {
    it("accepts valid payload", () => {
      const payload = {
        idempotencyKey: "uuid-1",
        userId: "user-1",
        message: { title: "T", body: "B" },
      };
      expect(validateReminderDispatchPayload(payload)).toBe(true);
    });

    it("rejects null", () => {
      expect(validateReminderDispatchPayload(null)).toBe(false);
    });

    it("rejects missing idempotencyKey", () => {
      expect(
        validateReminderDispatchPayload({
          userId: "u",
          message: { title: "T", body: "B" },
        })
      ).toBe(false);
    });

    it("rejects missing message.body", () => {
      expect(
        validateReminderDispatchPayload({
          idempotencyKey: "k",
          userId: "u",
          message: { title: "T" },
        })
      ).toBe(false);
    });
  });
});
