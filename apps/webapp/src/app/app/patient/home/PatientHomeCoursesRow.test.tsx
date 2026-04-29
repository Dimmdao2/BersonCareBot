/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeCoursesRow } from "./PatientHomeCoursesRow";

describe("PatientHomeCoursesRow", () => {
  it("renders course links", () => {
    render(
      <PatientHomeCoursesRow
        items={[
          { id: "1", title: "Курс А", subtitle: "Описание", href: "/app/patient/courses" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Курс А/i })).toHaveAttribute("href", "/app/patient/courses");
  });

  it("returns null when empty", () => {
    const { container } = render(<PatientHomeCoursesRow items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
