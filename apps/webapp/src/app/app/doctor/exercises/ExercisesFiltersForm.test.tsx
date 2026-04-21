/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: ({
    name,
    value,
    onChange,
    clearOptionLabel,
  }: {
    name?: string;
    value: string | null;
    onChange: (refId: string | null, label: string) => void;
    clearOptionLabel?: string;
  }) => (
    <div>
      {name ? (
        <input type="hidden" name={name} data-testid={`ref-hidden-${name}`} value={value ?? ""} readOnly />
      ) : null}
      <button type="button" onClick={() => onChange("reg-1", "Плечо")}>
        mock-pick-{name ?? "ref"}
      </button>
      <button type="button" onClick={() => onChange(null, "")}>
        {clearOptionLabel ?? "все"}
      </button>
    </div>
  ),
}));

describe("ExercisesFiltersForm", () => {
  it("includes hidden selected when selectedId is passed", () => {
    render(
      <ExercisesFiltersForm
        q=""
        view="list"
        titleSort="asc"
        selectedId="550e8400-e29b-41d4-a716-446655440099"
      />,
    );
    const hidden = document.querySelector('input[name="selected"]') as HTMLInputElement | null;
    expect(hidden).not.toBeNull();
    expect(hidden?.value).toBe("550e8400-e29b-41d4-a716-446655440099");
  });

  it("syncs search input when q prop changes (e.g. back/forward navigation)", async () => {
    const { rerender } = render(<ExercisesFiltersForm q="first" />);
    expect(screen.getByLabelText(/поиск по названию/i)).toHaveValue("first");
    rerender(<ExercisesFiltersForm q="second" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/поиск по названию/i)).toHaveValue("second");
    });
  });
});
