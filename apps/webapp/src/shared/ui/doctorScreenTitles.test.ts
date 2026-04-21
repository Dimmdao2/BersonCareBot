import { describe, expect, it } from "vitest";
import { getDoctorScreenTitle } from "./doctorScreenTitles";

describe("getDoctorScreenTitle", () => {
  it("returns overview for /app/doctor", () => {
    expect(getDoctorScreenTitle("/app/doctor")).toBe("Обзор");
  });
  it("returns clients for list", () => {
    expect(getDoctorScreenTitle("/app/doctor/clients")).toBe("Клиенты");
  });
  it("returns client for detail", () => {
    expect(getDoctorScreenTitle("/app/doctor/clients/u1")).toBe("Клиент");
  });
  it("returns treatment program title for patient program detail", () => {
    expect(
      getDoctorScreenTitle(
        "/app/doctor/clients/11111111-1111-4111-8111-111111111111/treatment-programs/22222222-2222-4222-8222-222222222222",
      ),
    ).toBe("Программа пациента");
  });
  it("returns new content page title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/new")).toBe("Новая страница");
  });
  it("returns edit content title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/edit/abc")).toBe("Редактировать страницу");
  });
  it("returns news and motivation titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/news")).toBe("Новости");
    expect(getDoctorScreenTitle("/app/doctor/content/motivation")).toBe("Мотивация");
  });
  it("returns content sections titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/sections")).toBe("Разделы контента");
    expect(getDoctorScreenTitle("/app/doctor/content/sections/new")).toBe("Новый раздел");
    expect(getDoctorScreenTitle("/app/doctor/content/sections/edit/warmups")).toBe("Редактировать раздел");
  });
  it("returns exercises titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/exercises")).toBe("Упражнения ЛФК");
    expect(getDoctorScreenTitle("/app/doctor/exercises/new")).toBe("Новое упражнение");
    expect(getDoctorScreenTitle("/app/doctor/exercises/abc")).toBe("Редактирование упражнения");
  });
  it("returns treatment block library titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/clinical-tests")).toBe("Клинические тесты");
    expect(getDoctorScreenTitle("/app/doctor/clinical-tests/new")).toBe("Новый тест");
    expect(getDoctorScreenTitle("/app/doctor/clinical-tests/abc")).toBe("Редактирование теста");
    expect(getDoctorScreenTitle("/app/doctor/test-sets")).toBe("Наборы тестов");
    expect(getDoctorScreenTitle("/app/doctor/test-sets/new")).toBe("Новый набор тестов");
    expect(getDoctorScreenTitle("/app/doctor/test-sets/abc")).toBe("Набор тестов");
    expect(getDoctorScreenTitle("/app/doctor/recommendations")).toBe("Рекомендации");
    expect(getDoctorScreenTitle("/app/doctor/recommendations/new")).toBe("Новая рекомендация");
    expect(getDoctorScreenTitle("/app/doctor/recommendations/abc")).toBe("Редактирование рекомендации");
    expect(getDoctorScreenTitle("/app/doctor/treatment-program-templates")).toBe("Шаблоны программ");
    expect(getDoctorScreenTitle("/app/doctor/treatment-program-templates/new")).toBe("Новый шаблон программы");
    expect(getDoctorScreenTitle("/app/doctor/treatment-program-templates/abc")).toBe("Конструктор программы");
  });
  it("returns lfk template titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates")).toBe("Комплексы");
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates/new")).toBe("Новый комплекс");
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates/abc")).toBe("Конструктор комплекса");
  });
  it("normalizes trailing slash on overview", () => {
    expect(getDoctorScreenTitle("/app/doctor/")).toBe("Обзор");
  });
  it("returns fallback for unknown doctor path", () => {
    expect(getDoctorScreenTitle("/app/doctor/unknown-section")).toBe("Кабинет");
  });
});
