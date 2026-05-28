import { describe, expect, it } from "vitest";
import {
  formatRegistrationAuthMethodLabel,
  formatRegistrationErrorCodeLabel,
  formatRegistrationEventTypeLabel,
} from "./registrationEventPresentation";

describe("registrationEventPresentation", () => {
  it("maps known auth methods and error codes to Russian labels", () => {
    expect(formatRegistrationAuthMethodLabel("oauth_yandex")).toBe("Яндекс ID");
    expect(formatRegistrationErrorCodeLabel("db_error")).toBe("Ошибка БД");
    expect(formatRegistrationEventTypeLabel("auth_register_failure")).toBe("Ошибка");
  });

  it("falls back to raw code for unknown values", () => {
    expect(formatRegistrationAuthMethodLabel("custom_provider")).toBe("custom_provider");
    expect(formatRegistrationErrorCodeLabel("weird_code")).toBe("weird_code");
  });
});
