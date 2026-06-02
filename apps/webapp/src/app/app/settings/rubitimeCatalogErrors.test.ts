import { describe, expect, it } from "vitest";
import { mapBookingCatalogApiError } from "./rubitimeCatalogErrors";

describe("mapBookingCatalogApiError", () => {
  it("maps unique_violation for edit", () => {
    expect(mapBookingCatalogApiError("unique_violation", "edit")).toBe(
      "Услуга с таким названием и длительностью уже существует.",
    );
  });

  it("maps unique_violation for create", () => {
    expect(mapBookingCatalogApiError("unique_violation", "create")).toBe(
      "Услуга с таким названием и длительностью уже есть — измените существующую выше.",
    );
  });

  it("maps invalid_input and not_found", () => {
    expect(mapBookingCatalogApiError("invalid_input")).toBe("Проверьте введённые значения.");
    expect(mapBookingCatalogApiError("not_found")).toBe("Запись не найдена. Обновите страницу.");
  });

  it("returns code or fallback", () => {
    expect(mapBookingCatalogApiError("custom_code")).toBe("custom_code");
    expect(mapBookingCatalogApiError(undefined)).toBe("Не удалось сохранить.");
  });
});
