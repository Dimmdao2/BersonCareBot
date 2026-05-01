/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeCoursesRow } from "./PatientHomeCoursesRow";

describe("PatientHomeCoursesRow", () => {
  it("does not render an empty-state card when there are no courses", () => {
    const { container } = render(<PatientHomeCoursesRow cards={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders course cards when provided", () => {
    render(
      <PatientHomeCoursesRow
        cards={[
          {
            itemId: "course-1",
            courseId: "course-1",
            title: "Курс для спины",
            subtitle: "Короткие практики",
            href: "/app/patient/courses/course-1",
          },
        ]}
      />,
    );

    expect(screen.getByText("Курсы")).toHaveProperty("tagName", "P");
    expect(screen.getByRole("link", { name: /Курс для спины/i })).toHaveAttribute("href", "/app/patient/courses/course-1");
  });
});
