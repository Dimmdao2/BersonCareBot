/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeBlockPreview } from "./PatientHomeBlockPreview";

describe("PatientHomeBlockPreview", () => {
  it("renders non-clickable preview items", () => {
    render(
      <PatientHomeBlockPreview
        items={[
          {
            id: "1",
            blockCode: "daily_warmup",
            targetType: "content_page",
            targetRef: "warmup-1",
            titleOverride: "Разминка",
            subtitleOverride: null,
            imageUrlOverride: null,
            badgeLabel: null,
            isVisible: true,
            sortOrder: 1,
          },
        ]}
        knownRefs={{ contentPages: ["warmup-1"], contentSections: [], courses: [] }}
      />,
    );

    expect(screen.getByText("Разминка")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
