/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomePlanCard } from "./PatientHomePlanCard";
import { routePaths } from "@/app-layer/routes/paths";

describe("PatientHomePlanCard", () => {
  it("renders empty state when instance is null (guest CTA uses login+next)", () => {
    render(<PatientHomePlanCard instance={null} anonymousGuest personalTierOk={false} />);
    expect(screen.getByText(/Нет активного плана/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Войти и открыть планы/i });
    expect(cta.getAttribute("href")).toContain(`${routePaths.root}?next=`);
    expect(cta.getAttribute("href")).toContain(encodeURIComponent(routePaths.patientTreatmentPrograms));
  });

  it("renders custom leading icon when blockIconImageUrl is set", () => {
    const { container } = render(
      <PatientHomePlanCard
        instance={{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Plan title" }}
        blockIconImageUrl="/api/media/ffffffff-ffff-4fff-8fff-ffffffffffff"
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/media/ffffffff-ffff-4fff-8fff-ffffffffffff");
  });
});
