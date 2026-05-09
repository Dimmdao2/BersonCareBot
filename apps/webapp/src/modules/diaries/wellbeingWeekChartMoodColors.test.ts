import { describe, expect, it } from "vitest";
import { wellbeingValue10ToRgb } from "./wellbeingWeekChartMoodColors";

describe("wellbeingWeekChartMoodColors", () => {
  it("wellbeingValue10ToRgb: шкала цвета 1–5 (вход может быть шире)", () => {
    expect(wellbeingValue10ToRgb(-1)).toMatch(/^rgb\(/);
    expect(wellbeingValue10ToRgb(11)).toMatch(/^rgb\(/);
    expect(wellbeingValue10ToRgb(0)).toBe(wellbeingValue10ToRgb(1));
    expect(wellbeingValue10ToRgb(1)).toBe("rgb(220,38,38)");
    expect(wellbeingValue10ToRgb(5)).toBe("rgb(22,163,74)");
    expect(wellbeingValue10ToRgb(10)).toBe(wellbeingValue10ToRgb(5));
  });

  it("wellbeingValue10ToRgb: дробное среднее → тот же цвет, что у ближайшей целой иконки (не интерполяция 2↔3)", () => {
    expect(wellbeingValue10ToRgb(2.7)).toBe(wellbeingValue10ToRgb(3));
    expect(wellbeingValue10ToRgb(2.7)).toBe("rgb(245,158,11)");
    expect(wellbeingValue10ToRgb(2.4)).toBe(wellbeingValue10ToRgb(2));
    expect(wellbeingValue10ToRgb(2.5)).toBe(wellbeingValue10ToRgb(3));
  });
});
