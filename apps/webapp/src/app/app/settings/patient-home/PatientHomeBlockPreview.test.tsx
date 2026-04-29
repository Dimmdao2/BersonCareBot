/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
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

  it("shows repair control for visible unresolved item when onRepairClick is provided", () => {
    const onRepair = vi.fn();
    render(
      <PatientHomeBlockPreview
        items={[
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            blockCode: "daily_warmup",
            targetType: "content_page",
            targetRef: "missing",
            titleOverride: "Разминка",
            subtitleOverride: null,
            imageUrlOverride: null,
            badgeLabel: null,
            isVisible: true,
            sortOrder: 1,
          },
        ]}
        knownRefs={{ contentPages: ["other"], contentSections: [], courses: [] }}
        onRepairClick={onRepair}
      />,
    );
    expect(screen.getByRole("button", { name: "Исправить связь CMS…" })).toBeInTheDocument();
  });

  it("does not show repair button for visible unresolved item without onRepairClick", () => {
    render(
      <PatientHomeBlockPreview
        items={[
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            blockCode: "daily_warmup",
            targetType: "content_page",
            targetRef: "missing",
            titleOverride: "Разминка",
            subtitleOverride: null,
            imageUrlOverride: null,
            badgeLabel: null,
            isVisible: true,
            sortOrder: 1,
          },
        ]}
        knownRefs={{ contentPages: ["other"], contentSections: [], courses: [] }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Исправить связь CMS…" })).toBeNull();
  });
});
