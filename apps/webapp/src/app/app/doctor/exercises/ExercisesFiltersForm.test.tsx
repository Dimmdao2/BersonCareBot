/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExercisesFiltersForm } from "./ExercisesFiltersForm";

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: ({
    name,
    value,
    onChange,
  }: {
    name?: string;
    value: string | null;
    onChange: (refId: string | null, label: string) => void;
  }) => (
    <div>
      {name ? <input type="hidden" name={name} data-testid="region-hidden" value={value ?? ""} readOnly /> : null}
      <button type="button" onClick={() => onChange("reg-1", "Плечо")}>
        mock-pick-region
      </button>
    </div>
  ),
}));

describe("ExercisesFiltersForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reset region clears hidden input and submits the form", async () => {
    const user = userEvent.setup();
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});

    const regionId = "550e8400-e29b-41d4-a716-446655440001";
    render(<ExercisesFiltersForm q="squat" regionRefId={regionId} loadType="strength" />);

    expect(screen.getByTestId("region-hidden")).toHaveValue(regionId);

    await user.click(screen.getByRole("button", { name: /сбросить область/i }));

    expect(screen.getByTestId("region-hidden")).toHaveValue("");
    expect(requestSubmitSpy).toHaveBeenCalledTimes(1);
  });
});
