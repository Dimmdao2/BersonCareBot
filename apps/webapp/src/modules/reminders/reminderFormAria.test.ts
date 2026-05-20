import { describe, expect, it } from "vitest";
import { customReminderFieldsInvalid, scheduleInvalidFromError } from "./reminderFormAria";

describe("scheduleInvalidFromError", () => {
  it("flags interval window for legacy and period wording", () => {
    expect(scheduleInvalidFromError("Начало окна должно быть раньше конца.").intervalWindow).toBe(true);
    expect(scheduleInvalidFromError("Начало периода должно быть раньше конца.").intervalWindow).toBe(true);
    expect(scheduleInvalidFromError("Начало периода должно быть меньше конца").intervalWindow).toBe(true);
  });

  it("flags slot times separately from interval window", () => {
    expect(scheduleInvalidFromError("Проверьте время напоминаний (ЧЧ:ММ).").slotTimes).toBe(true);
    expect(scheduleInvalidFromError("Проверьте время напоминаний (ЧЧ:ММ).").intervalWindow).toBe(false);
  });
});

describe("customReminderFieldsInvalid", () => {
  it("flags title and text errors", () => {
    expect(customReminderFieldsInvalid("Заголовок: от 1 до 140 символов.").title).toBe(true);
    expect(customReminderFieldsInvalid("Текст не длиннее 2000 символов.").text).toBe(true);
  });
});
