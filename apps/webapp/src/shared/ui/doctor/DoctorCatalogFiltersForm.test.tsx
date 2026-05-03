/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DoctorCatalogFiltersForm } from "./DoctorCatalogFiltersForm";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/app/doctor/exercises",
  useSearchParams: () => new URLSearchParams("status=active"),
}));

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: () => <div data-testid="mock-ref-select" />,
}));

describe("DoctorCatalogFiltersForm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces search and preserves workspace params in URL", () => {
    vi.useFakeTimers();
    replace.mockClear();

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

    expect(replace).toHaveBeenCalledTimes(1);
    const url = String(replace.mock.calls[0]?.[0]);
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
