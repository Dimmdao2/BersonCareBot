/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeTodayLayout } from "./PatientHomeTodayLayout";

describe("PatientHomeTodayLayout", () => {
  it("renders greeting and optional slots", () => {
    render(
      <PatientHomeTodayLayout
        greeting={<p>Greet</p>}
        hero={<p>Hero</p>}
        booking={<p>Book</p>}
        situations={null}
      />,
    );
    expect(screen.getByText("Greet")).toBeInTheDocument();
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Book")).toBeInTheDocument();
  });

  it("adds grid classes when situations present", () => {
    const { container } = render(
      <PatientHomeTodayLayout
        greeting={<span>g</span>}
        hero={null}
        booking={null}
        situations={<span>sit</span>}
      />,
    );
    const section = container.querySelector("#patient-home-today-layout");
    expect(section?.className).toMatch(/lg:grid/);
    expect(screen.getByText("sit")).toBeInTheDocument();
  });
});
