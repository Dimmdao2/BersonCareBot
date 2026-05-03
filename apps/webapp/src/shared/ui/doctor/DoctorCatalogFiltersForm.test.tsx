/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DoctorCatalogFiltersForm } from "./DoctorCatalogFiltersForm";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doctor/exercises",
}));

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: (props: { id?: string; onChange?: (code: string | null) => void }) => (
    <button
      type="button"
      data-testid={`mock-ref-${props.id ?? "unknown"}`}
      onClick={() => {
        const code = props.id?.includes("-load") ? "strength" : props.id?.includes("-region") ? "spine" : "x";
        props.onChange?.(code);
      }}
    >
      pick
    </button>
  ),
}));

describe("DoctorCatalogFiltersForm", () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/app/doctor/exercises");
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    vi.useRealTimers();
    replaceStateSpy.mockRestore();
    window.history.replaceState({}, "", "/");
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

  it("applies region and load to URL from ReferenceSelect (codes only, no UUID)", () => {
    window.history.replaceState({}, "", "/app/doctor/exercises");
    render(<DoctorCatalogFiltersForm q="" view="list" titleSort={null} idPrefix="ex" />);

    fireEvent.click(screen.getByTestId("mock-ref-ex-region"));
    expect(replaceStateSpy).toHaveBeenCalled();
    let url = String(replaceStateSpy.mock.calls.at(-1)?.[2]);
    expect(url).toContain("region=spine");
    expect(url).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(url).not.toContain("regionRefId");

    fireEvent.click(screen.getByTestId("mock-ref-ex-load"));
    url = String(replaceStateSpy.mock.calls.at(-1)?.[2]);
    expect(url).toContain("load=strength");
    expect(url).toContain("region=spine");
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
