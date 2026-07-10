import { describe, expect, it } from "vitest";
import {
  decideFio,
  formatDoctorFio,
  formatPatientGreetingName,
  normalizeFioPart,
  parseFioCandidate,
  type RussianNameDictionaries,
} from "./fio";

const dictionaries: RussianNameDictionaries = {
  firstNames: new Set(["иван", "карина", "мария", "анна", "дмитрий", "александр", "анна-мария"]),
  patronymics: new Set(["иванович", "викторовна", "петровна", "сергеевич"]),
};

describe("fio helpers", () => {
  it("parses canonical Russian last first patronymic", () => {
    const candidate = parseFioCandidate("Иванов Иван Иванович", "rubitime", dictionaries);

    expect(candidate.value).toEqual({ lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" });
    expect(candidate.confidence).toBe("high");
  });

  it("parses non-canonical first patronymic last order", () => {
    const candidate = parseFioCandidate("Карина Викторовна Прокопенкова", "rubitime", dictionaries);

    expect(candidate.value).toEqual({
      lastName: "Прокопенкова",
      firstName: "Карина",
      patronymic: "Викторовна",
    });
    expect(candidate.reasons).toContain("non_canonical_order");
    expect(candidate.confidence).toBe("high");
  });

  it("parses two-token last first names", () => {
    const candidate = parseFioCandidate("Петрова Мария", "booking", dictionaries);

    expect(candidate.value).toEqual({ lastName: "Петрова", firstName: "Мария", patronymic: null });
    expect(candidate.confidence).toBe("high");
  });

  it("keeps one-token provider names low confidence", () => {
    const candidate = parseFioCandidate("Дмитрий", "telegram", dictionaries);

    expect(candidate.value).toEqual({ lastName: null, firstName: "Дмитрий", patronymic: null });
    expect(candidate.confidence).toBe("low");
    expect(candidate.reasons).toContain("one_token");
  });

  it("marks Latin provider names as weak hints", () => {
    const candidate = parseFioCandidate("Dmitry", "oauth", dictionaries);

    expect(candidate.value.firstName).toBe("Dmitry");
    expect(candidate.confidence).toBe("low");
    expect(candidate.reasons).toContain("latin_or_mixed");
  });

  it("normalizes hyphenated names", () => {
    expect(normalizeFioPart("  анна-мария  ")).toBe("Анна-Мария");
    const candidate = parseFioCandidate("Иванова Анна-Мария Петровна", "booking", dictionaries);

    expect(candidate.value).toEqual({ lastName: "Иванова", firstName: "Анна-Мария", patronymic: "Петровна" });
  });

  it("recognizes patronymics by suffix without dictionary entry", () => {
    const candidate = parseFioCandidate("Сидоров Александр Сергеевич", "rubitime", {
      firstNames: dictionaries.firstNames,
      patronymics: new Set(),
    });

    expect(candidate.value).toEqual({ lastName: "Сидоров", firstName: "Александр", patronymic: "Сергеевич" });
    expect(candidate.confidence).toBe("high");
  });

  it("chooses strong booking FIO over weak provider conflict", () => {
    const booking = parseFioCandidate("Иванов Иван Иванович", "booking", dictionaries);
    const provider = parseFioCandidate("Dmitry", "telegram", dictionaries);
    const decision = decideFio([provider, booking]);

    expect(decision.selected).toBe(booking);
    expect(decision.conflicts).toContain("source_weaker_than_winner");
    expect(decision.conflicts).toContain("candidate_disagrees_with_winner");
  });

  it("formats doctor and patient labels from structured values", () => {
    const fio = { lastName: "Иванов", firstName: "Иван", patronymic: "Иванович" };

    expect(formatDoctorFio(fio)).toBe("Иванов Иван Иванович");
    expect(formatPatientGreetingName(fio)).toBe("Иван");
    expect(formatPatientGreetingName({ lastName: null, firstName: null, patronymic: null }, "Мария Петрова")).toBe(
      "Мария",
    );
  });
});
