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
  it("returns new content page title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/new")).toBe("Новая страница");
  });
  it("returns edit content title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/edit/abc")).toBe("Редактировать страницу");
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
  it("returns lfk template titles", () => {
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates")).toBe("Шаблоны ЛФК");
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates/new")).toBe("Новый шаблон ЛФК");
    expect(getDoctorScreenTitle("/app/doctor/lfk-templates/abc")).toBe("Конструктор шаблона ЛФК");
  });
  it("normalizes trailing slash on overview", () => {
    expect(getDoctorScreenTitle("/app/doctor/")).toBe("Обзор");
  });
  it("returns fallback for unknown doctor path", () => {
    expect(getDoctorScreenTitle("/app/doctor/unknown-section")).toBe("Кабинет");
  });
});
