import { describe, expect, it } from "vitest";
import { scheduleInvalidFromError } from "./reminderFormAria";

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
