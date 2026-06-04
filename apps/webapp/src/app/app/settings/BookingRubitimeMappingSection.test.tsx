/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingRubitimeMappingSection } from "./BookingRubitimeMappingSection";

function jsonFetchResponse(body: unknown, ok = true) {
  const text = JSON.stringify(body);
  return {
    ok,
    text: async () => text,
    json: async () => body,
  };
}

describe("BookingRubitimeMappingSection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("/rubitime-mapping/duplicates")) {
          return Promise.resolve(
            jsonFetchResponse({
              ok: true,
              totalGroups: 1,
              groups: [
                {
                  branchId: "550e8400-e29b-41d4-a716-446655440001",
                  branchTitle: "Москва",
                  serviceId: "550e8400-e29b-41d4-a716-446655440002",
                  serviceTitle: "Приём",
                  specialistId: "550e8400-e29b-41d4-a716-446655440007",
                  specialistName: "Дмитрий Берсон",
                  recommendedKeepSsaId: "550e8400-e29b-41d4-a716-446655440008",
                  rows: [
                    {
                      ssaId: "550e8400-e29b-41d4-a716-446655440008",
                      specialistId: "550e8400-e29b-41d4-a716-446655440007",
                      specialistName: "Дмитрий Берсон",
                      isActive: true,
                      createdAt: "2026-06-04T12:20:38.758Z",
                      cityCode: "moscow",
                      hasMapping: true,
                      rubitimeServiceId: "67452",
                      legacyBranchServiceId: "22e2e533-858c-41d1-bef9-4c2cd43bb527",
                    },
                    {
                      ssaId: "550e8400-e29b-41d4-a716-446655440009",
                      specialistId: "550e8400-e29b-41d4-a716-446655440007",
                      specialistName: "Дмитрий Берсон",
                      isActive: true,
                      createdAt: "2026-06-04T12:11:46.927Z",
                      cityCode: "moscow",
                      hasMapping: false,
                      rubitimeServiceId: null,
                      legacyBranchServiceId: null,
                    },
                  ],
                },
              ],
            }),
          );
        }
        if (typeof url === "string" && url.includes("/rubitime-mapping")) {
          return Promise.resolve(
            jsonFetchResponse({
              ok: true,
              total: 2,
              mappedOk: 0,
              problems: 2,
              rows: [
                {
                  branchId: "550e8400-e29b-41d4-a716-446655440001",
                  branchTitle: "Москва",
                  serviceId: "550e8400-e29b-41d4-a716-446655440002",
                  serviceTitle: "Сеанс 60 мин",
                  rubitimeBranchTitle: "Москва",
                  rubitimeSpecialistName: "Берсон",
                  rubitimeServiceTitle: "Сеанс 60 мин",
                  status: "mapped_ok",
                  issues: ["price_mismatch"],
                  issueDetails: {
                    priceMismatch: { canonicalPriceMinor: 700_000, legacyPriceMinor: 600_000 },
                  },
                  branchServiceId: "22e2e533-858c-41d1-bef9-4c2cd43bb527",
                },
                {
                  branchId: "550e8400-e29b-41d4-a716-446655440003",
                  branchTitle: "Санкт-Петербург",
                  serviceId: "550e8400-e29b-41d4-a716-446655440002",
                  serviceTitle: "Сеанс 60 мин",
                  rubitimeBranchTitle: "СПб",
                  rubitimeSpecialistName: "Берсон",
                  rubitimeServiceTitle: "Сеанс 60 мин",
                  status: "unmapped",
                  issues: [],
                  branchServiceId: null,
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          jsonFetchResponse({
            ok: true,
            branches: [],
            services: [],
            specialists: [],
            branchServices: [],
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders mapping section with summary and configure action", async () => {
    render(<BookingRubitimeMappingSection />);
    expect(await screen.findByText("Связи локация × услуга")).toBeInTheDocument();
    expect(await screen.findByText("Повторяющиеся связи локация × услуга")).toBeInTheDocument();
    expect(await screen.findByText("1 группа")).toBeInTheDocument();
    expect(await screen.findByText("2 строки для одной пары")).toBeInTheDocument();
    expect(screen.getByText("Всего пар")).toBeInTheDocument();
    expect(screen.getByText("Проблемы")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Настроить" }).length).toBeGreaterThanOrEqual(1);
  });

  it("opens link dialog on configure", async () => {
    const user = userEvent.setup();
    render(<BookingRubitimeMappingSection />);
    const configureButtons = await screen.findAllByRole("button", { name: "Настроить" });
    await user.click(configureButtons[0]!);
    expect(await screen.findByText("Настроить связь Rubitime")).toBeInTheDocument();
  });

  it("shows explicit problem messages for price mismatch and blockers", async () => {
    render(<BookingRubitimeMappingSection />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/2 связи требуют исправления/);
    expect(await screen.findByText(/Конфликт цены: в кабинете/)).toBeInTheDocument();
    expect(screen.getAllByText("Не настроено").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Нужно исправить").length).toBeGreaterThanOrEqual(1);
  });
});
