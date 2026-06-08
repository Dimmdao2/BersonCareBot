import { describe, expect, it } from "vitest";
import { doctorTreatmentProgramInstanceRouteErrorStatus } from "./doctorInstanceRouteErrorStatus";

describe("doctorTreatmentProgramInstanceRouteErrorStatus", () => {
  it("returns 404 for entity not found", () => {
    expect(doctorTreatmentProgramInstanceRouteErrorStatus("Элемент не найден")).toBe(404);
    expect(doctorTreatmentProgramInstanceRouteErrorStatus("Группа не найдена")).toBe(404);
  });

  it("returns 400 for catalog unavailable", () => {
    expect(
      doctorTreatmentProgramInstanceRouteErrorStatus(
        "Объект для типа «exercise» не найден или недоступен",
      ),
    ).toBe(400);
  });

  it("returns 400 for validation errors", () => {
    expect(doctorTreatmentProgramInstanceRouteErrorStatus("Некорректный порядок: элементов этапа")).toBe(
      400,
    );
  });
});
