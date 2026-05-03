/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DoctorCatalogFiltersForm } from "./DoctorCatalogFiltersForm";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doctor/exercises",
}));

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: () => <div data-testid="mock-ref-select" />,
}));

describe("DoctorCatalogFiltersForm", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    replaceStateSpy.mockRestore();
  });

  it("debounces search and preserves workspace params in URL", () => {
    vi.useFakeTimers();

    render(
      <DoctorCatalogFiltersForm
        q=""
        view="list"
        titleSort="desc"
        selectedId="row-1"
        catalogPubArch={{ arch: "archived", pub: "published" }}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Поиск по названию"), {
      target: { value: "колено" },
    });
    vi.advanceTimersByTime(350);

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    const url = String(replaceStateSpy.mock.calls[0]?.[2]);
    expect(url).toContain("q=%D0%BA%D0%BE%D0%BB%D0%B5%D0%BD%D0%BE");
    expect(url).toContain("view=list");
    expect(url).toContain("titleSort=desc");
    expect(url).toContain("selected=row-1");
    expect(url).toContain("arch=archived");
    expect(url).toContain("pub=published");
    expect(url).not.toContain("load=");
    expect(url).not.toContain("region=");
  });

  it("renders without apply button and summary line", () => {
    const { container } = render(
      <DoctorCatalogFiltersForm q="" regionCode="spine" loadType="strength" />,
    );

    expect(screen.queryByRole("button", { name: "Применить" })).toBeNull();
    expect(container).not.toHaveTextContent("Тип нагрузки:");
    expect(container).not.toHaveTextContent("Регион:");
  });
});
