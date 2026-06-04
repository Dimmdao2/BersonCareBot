/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientContentMaterialRating } from "./PatientContentMaterialRating";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440099";

vi.mock("@/shared/ui/patient/material-rating/MaterialRatingBlock", () => ({
  MaterialRatingBlock: (props: {
    onLowRatingSaved?: (stars: number) => void;
  }) => (
    <div>
      <button type="button" onClick={() => props.onLowRatingSaved?.(2)}>
        rate-low
      </button>
      <button type="button" onClick={() => {}}>
        rate-high
      </button>
    </div>
  ),
}));

describe("PatientContentMaterialRating", () => {
  it("opens feedback dialog after low rating on daily warmup", async () => {
    const user = userEvent.setup();
    render(
      <PatientContentMaterialRating
        contentPageId={PAGE_ID}
        guest={false}
        needsActivation={false}
        isDailyWarmup
      />,
    );
    expect(screen.queryByText(/Расскажите, что было не так/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "rate-low" }));
    expect(screen.getByText(/Расскажите, что было не так/)).toBeInTheDocument();
  });

  it("does not open feedback dialog after high rating", async () => {
    const user = userEvent.setup();
    render(
      <PatientContentMaterialRating
        contentPageId={PAGE_ID}
        guest={false}
        needsActivation={false}
        isDailyWarmup
      />,
    );
    await user.click(screen.getByRole("button", { name: "rate-high" }));
    expect(screen.queryByText(/Расскажите, что было не так/)).not.toBeInTheDocument();
  });
});
