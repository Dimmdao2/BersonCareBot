/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RubitimeSection } from "./RubitimeSection";

const sampleService = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  title: "Приём",
  description: null,
  durationMinutes: 60,
  priceMinor: 400000,
  isActive: true,
  sortOrder: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleBranchService = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  branchId: "550e8400-e29b-41d4-a716-446655440001",
  serviceId: sampleService.id,
  specialistId: "550e8400-e29b-41d4-a716-446655440002",
  rubitimeServiceId: "rt-svc-1",
  isActive: true,
  sortOrder: 0,
};

function catalogPayload(overrides?: {
  services?: typeof sampleService[];
  branchServices?: typeof sampleBranchService[];
}) {
  return {
    ok: true,
    cities: [],
    branches: [],
    services: overrides?.services ?? [],
    specialists: [],
    branchServices: overrides?.branchServices ?? [],
  };
}

describe("RubitimeSection (catalog v2)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => catalogPayload(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders catalog v2 title and section headings", async () => {
    render(<RubitimeSection />);
    expect(await screen.findByText("Каталог записи (v2)")).toBeInTheDocument();
    expect(await screen.findByText("Города")).toBeInTheDocument();
    expect(screen.getByText("Филиалы")).toBeInTheDocument();
    expect(screen.getByText(/Услуги \(глобальный каталог\)/)).toBeInTheDocument();
    expect(screen.getByText("Специалисты")).toBeInTheDocument();
    expect(screen.getByText(/Связки филиал — услуга/)).toBeInTheDocument();
  });

  it("does not reference legacy booking profiles", () => {
    render(<RubitimeSection />);
    expect(screen.queryByText(/профил/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/bookingType/)).not.toBeInTheDocument();
    expect(screen.queryByText(/categoryCode/)).not.toBeInTheDocument();
  });

  it("PATCHes service after expand and save", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/services/") && init?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, service: { ...sampleService, durationMinutes: 90 } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => catalogPayload({ services: [sampleService] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RubitimeSection />);
    expect(await screen.findByText(/Приём · 60 мин/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));

    const serviceCard = document.getElementById(`rubitime-catalog-service-${sampleService.id}`)!;
    const durationInput = within(serviceCard).getByPlaceholderText("Длительность (мин)");
    await userEvent.clear(durationInput);
    await userEvent.type(durationInput, "90");

    await within(serviceCard).getByRole("button", { name: "Сохранить" }).click();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/booking-catalog/services/${sampleService.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Приём",
          description: null,
          durationMinutes: 90,
          priceMinor: 400000,
        }),
      }),
    );
  });

  it("does not render a second service save editor in branch-service block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          catalogPayload({
            services: [sampleService],
            branchServices: [sampleBranchService],
          }),
      }),
    );

    render(<RubitimeSection />);
    await screen.findByRole("button", { name: "К услуге" });

    expect(screen.queryAllByRole("button", { name: "Сохранить" })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Сохранить услугу" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Изменить" })).toHaveLength(1);
  });

  it("«К услуге» scrolls to service anchor and expands editor", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          catalogPayload({
            services: [sampleService],
            branchServices: [sampleBranchService],
          }),
      }),
    );

    render(<RubitimeSection />);
    await screen.findByRole("button", { name: "К услуге" });

    const serviceCardBefore = document.getElementById(`rubitime-catalog-service-${sampleService.id}`)!;
    expect(within(serviceCardBefore).queryByRole("button", { name: "Отмена" })).not.toBeInTheDocument();

    const focusSpy = vi.spyOn(HTMLInputElement.prototype, "focus");
    await userEvent.click(screen.getByRole("button", { name: "К услуге" }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
    });
    const serviceCardAfter = document.getElementById(`rubitime-catalog-service-${sampleService.id}`)!;
    expect(within(serviceCardAfter).getByRole("button", { name: "Отмена" })).toBeInTheDocument();
    expect(within(serviceCardAfter).getByPlaceholderText("Длительность (мин)")).toBeInTheDocument();
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });
    focusSpy.mockRestore();
  });

  it("shows link impact when price or duration changes and branch links exist", async () => {
    const secondLink = {
      ...sampleBranchService,
      id: "550e8400-e29b-41d4-a716-446655440021",
      specialistId: "550e8400-e29b-41d4-a716-446655440003",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          catalogPayload({
            services: [sampleService],
            branchServices: [sampleBranchService, secondLink],
          }),
      }),
    );

    render(<RubitimeSection />);
    await screen.findByRole("button", { name: "Изменить" });
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));

    expect(
      screen.queryByText(/Изменение затронет 2 связок с Rubitime/),
    ).not.toBeInTheDocument();

    const serviceCard = document.getElementById(`rubitime-catalog-service-${sampleService.id}`)!;
    const durationInput = within(serviceCard).getByPlaceholderText("Длительность (мин)");
    await userEvent.clear(durationInput);
    await userEvent.type(durationInput, "90");

    expect(
      await screen.findByText("Изменение затронет 2 связок с Rubitime (branch-service)."),
    ).toBeInTheDocument();
  });

  it("does not show link impact when only title changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          catalogPayload({
            services: [sampleService],
            branchServices: [sampleBranchService],
          }),
      }),
    );

    render(<RubitimeSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Изменить" }));

    const serviceCard = document.getElementById(`rubitime-catalog-service-${sampleService.id}`)!;
    await userEvent.clear(within(serviceCard).getByPlaceholderText("Название"));
    await userEvent.type(within(serviceCard).getByPlaceholderText("Название"), "Консультация");

    expect(screen.queryByText(/Изменение затронет/)).not.toBeInTheDocument();
  });

  it("shows create-specific message on unique_violation from POST", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/admin/booking-catalog/services" && init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ ok: false, error: "unique_violation" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => catalogPayload({ services: [sampleService] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RubitimeSection />);
    const createBlock = (await screen.findByText("Добавить услугу")).closest("div")!;

    await userEvent.type(within(createBlock).getByPlaceholderText("Название"), "Дубликат");
    await userEvent.click(within(createBlock).getByRole("button", { name: "Создать услугу" }));

    expect(
      await screen.findByText(
        "Услуга с таким названием и длительностью уже есть — измените существующую выше.",
      ),
    ).toBeInTheDocument();
  });

  it("shows Russian message on unique_violation from PATCH", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/services/") && init?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ ok: false, error: "unique_violation" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => catalogPayload({ services: [sampleService] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RubitimeSection />);
    await screen.findByRole("button", { name: "Изменить" });
    await userEvent.click(screen.getByRole("button", { name: "Изменить" }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      await screen.findByText("Услуга с таким названием и длительностью уже существует."),
    ).toBeInTheDocument();
  });
});
