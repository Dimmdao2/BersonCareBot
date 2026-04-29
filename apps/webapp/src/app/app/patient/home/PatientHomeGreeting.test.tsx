/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientHomeGreeting, greetingPrefixFromHour } from "./PatientHomeGreeting";

describe("greetingPrefixFromHour", () => {
  it("maps day parts for the patient greeting", () => {
    expect(greetingPrefixFromHour(5)).toBe("Доброе утро");
    expect(greetingPrefixFromHour(11)).toBe("Доброе утро");
    expect(greetingPrefixFromHour(12)).toBe("Добрый день");
    expect(greetingPrefixFromHour(17)).toBe("Добрый день");
    expect(greetingPrefixFromHour(18)).toBe("Добрый вечер");
    expect(greetingPrefixFromHour(22)).toBe("Добрый вечер");
    expect(greetingPrefixFromHour(23)).toBe("Доброй ночи");
    expect(greetingPrefixFromHour(4)).toBe("Доброй ночи");
  });
});

describe("PatientHomeGreeting", () => {
  it("renders time-of-day title without name", () => {
    render(<PatientHomeGreeting personalizedName={null} timeOfDayPrefix="Добрый день" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Добрый день!");
    expect(screen.getByText("Сегодня — короткие практики в удобном темпе")).toBeInTheDocument();
  });

  it("renders patient name only when provided by the caller", () => {
    render(<PatientHomeGreeting personalizedName="Анна" timeOfDayPrefix="Доброе утро" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Доброе утро, Анна!");
    expect(screen.getByText("А")).toBeInTheDocument();
  });

  it("keeps legacy title when time-of-day prefix is not provided", () => {
    render(<PatientHomeGreeting personalizedName="Анна" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Здравствуйте, Анна");
  });
});
