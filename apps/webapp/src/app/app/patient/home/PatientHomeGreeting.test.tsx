/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PatientHomeGreeting,
  greetingPrefixFromHour,
  getHourInTimeZone,
} from "./PatientHomeGreeting";

describe("greetingPrefixFromHour", () => {
  it("maps four time-of-day branches", () => {
    expect(greetingPrefixFromHour(5)).toBe("Доброе утро");
    expect(greetingPrefixFromHour(11)).toBe("Доброе утро");
    expect(greetingPrefixFromHour(12)).toBe("Добрый день");
    expect(greetingPrefixFromHour(17)).toBe("Добрый день");
    expect(greetingPrefixFromHour(18)).toBe("Добрый вечер");
    expect(greetingPrefixFromHour(22)).toBe("Добрый вечер");
    expect(greetingPrefixFromHour(23)).toBe("Доброй ночи");
    expect(greetingPrefixFromHour(4)).toBe("Доброй ночи");
    expect(greetingPrefixFromHour(0)).toBe("Доброй ночи");
  });
});

describe("getHourInTimeZone", () => {
  it("returns expected hour in Europe/Moscow for fixed UTC instant", () => {
    const d = new Date("2024-01-15T09:00:00.000Z");
    const h = getHourInTimeZone(d, "Europe/Moscow");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });
});

describe("PatientHomeGreeting", () => {
  it("renders guest title without name", () => {
    render(
      <PatientHomeGreeting
        timeOfDayPrefix="Добрый день"
        displayName={null}
        personalTierOk={false}
        subtitle="Готовы к разминке?"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Добрый день!");
    expect(screen.getByText("Готовы к разминке?")).toBeInTheDocument();
  });

  it("does not show name when personalTierOk is false even if displayName is set", () => {
    render(
      <PatientHomeGreeting
        timeOfDayPrefix="Доброе утро"
        displayName="Анна"
        personalTierOk={false}
        subtitle="Готовы к разминке?"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Доброе утро!");
    expect(screen.queryByText(/Анна/)).not.toBeInTheDocument();
  });

  it("shows name when personalTierOk and displayName", () => {
    render(
      <PatientHomeGreeting
        timeOfDayPrefix="Доброе утро"
        displayName="Анна"
        personalTierOk
        subtitle="Готовы к разминке?"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Доброе утро, Анна!");
  });

  it("renders four prefix variants in titles", () => {
    const prefixes = [
      "Доброе утро",
      "Добрый день",
      "Добрый вечер",
      "Доброй ночи",
    ] as const;
    for (const p of prefixes) {
      const { unmount } = render(
        <PatientHomeGreeting timeOfDayPrefix={p} displayName={null} personalTierOk={false} subtitle="S" />,
      );
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${p}!`);
      unmount();
    }
  });
});
