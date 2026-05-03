/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/doctor/exercises",
  useSearchParams: () => new URLSearchParams(),
}));

vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, items: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ),
);

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: () => <div data-testid="mock-ref-select" />,
}));

describe("ExercisesFiltersForm", () => {
  it("writes debounced q and workspace params via history.replaceState", async () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    try {
      render(
        <ExercisesFiltersForm
          q=""
          view="list"
          titleSort="asc"
          selectedId="550e8400-e29b-41d4-a716-446655440099"
        />,
      );
      fireEvent.change(screen.getByPlaceholderText("Поиск по названию"), {
        target: { value: "присед" },
      });
      vi.advanceTimersByTime(350);
      expect(replaceState).toHaveBeenCalled();
      const url = String(replaceState.mock.calls[0]?.[2]);
      expect(url).toContain("q=");
      expect(url).toContain("view=list");
      expect(url).toContain("titleSort=asc");
      expect(url).toContain("selected=550e8400-e29b-41d4-a716-446655440099");
    } finally {
      replaceState.mockRestore();
      vi.useRealTimers();
    }
  });

  it("syncs search input when q prop changes (e.g. back/forward navigation)", async () => {
    const { rerender } = render(<ExercisesFiltersForm q="first" />);
    expect(screen.getByPlaceholderText("Поиск по названию")).toHaveValue("first");
    rerender(<ExercisesFiltersForm q="second" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Поиск по названию")).toHaveValue("second");
    });
  });
});
