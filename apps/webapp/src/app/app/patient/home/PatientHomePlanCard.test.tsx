/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomePlanCard } from "./PatientHomePlanCard";
import { routePaths } from "@/app-layer/routes/paths";

describe("PatientHomePlanCard", () => {
  it("links «Начать занятие» to treatment programs (как пункт «План» в навигации)", () => {
    render(
      <PatientHomePlanCard instance={{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Plan title" }} />,
    );
    const cta = screen.getByRole("link", { name: /Начать занятие/i });
    expect(cta).toHaveAttribute("href", routePaths.patientTreatmentPrograms);
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
