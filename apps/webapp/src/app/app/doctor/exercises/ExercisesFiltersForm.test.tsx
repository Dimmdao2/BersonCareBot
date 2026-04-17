/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";

/** Первый пункт списка «Все регионы» / «Все типы» — как в ReferenceSelect + clearOptionLabel. */
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it("«Все регионы» сбрасывает скрытое поле региона", async () => {
    const user = userEvent.setup();
    const regionId = "550e8400-e29b-41d4-a716-446655440001";
    render(<ExercisesFiltersForm q="squat" regionRefId={regionId} loadType="strength" />);

    expect(screen.getByTestId("ref-hidden-region")).toHaveValue(regionId);

    await user.click(screen.getByRole("button", { name: /^Все регионы$/ }));

    expect(screen.getByTestId("ref-hidden-region")).toHaveValue("");
  });

  it("«Все типы» сбрасывает скрытое поле типа нагрузки", async () => {
    const user = userEvent.setup();
    render(<ExercisesFiltersForm q="" loadType="strength" />);

    expect(screen.getByTestId("ref-hidden-load")).toHaveValue("strength");

    await user.click(screen.getByRole("button", { name: /^Все типы$/ }));

    expect(screen.getByTestId("ref-hidden-load")).toHaveValue("");
  });

  it("syncs search input when q prop changes (e.g. back/forward navigation)", async () => {
    const { rerender } = render(<ExercisesFiltersForm q="first" />);
    expect(screen.getByLabelText(/поиск по названию/i)).toHaveValue("first");
    rerender(<ExercisesFiltersForm q="second" />);
    await waitFor(() => {
      expect(screen.getByLabelText(/поиск по названию/i)).toHaveValue("second");
    });
  });

  it("syncs region hidden value when regionRefId prop changes", async () => {
    const idA = "550e8400-e29b-41d4-a716-446655440010";
    const idB = "550e8400-e29b-41d4-a716-446655440011";
    const { rerender } = render(<ExercisesFiltersForm q="" regionRefId={idA} />);
    expect(screen.getByTestId("ref-hidden-region")).toHaveValue(idA);
    rerender(<ExercisesFiltersForm q="" regionRefId={idB} />);
    await waitFor(() => {
      expect(screen.getByTestId("ref-hidden-region")).toHaveValue(idB);
    });
  });

  it("syncs load hidden value when loadType prop changes", async () => {
    const { rerender } = render(<ExercisesFiltersForm q="" loadType="strength" />);
    expect(screen.getByTestId("ref-hidden-load")).toHaveValue("strength");
    rerender(<ExercisesFiltersForm q="" loadType="cardio" />);
    await waitFor(() => {
      expect(screen.getByTestId("ref-hidden-load")).toHaveValue("cardio");
    });
  });
});
