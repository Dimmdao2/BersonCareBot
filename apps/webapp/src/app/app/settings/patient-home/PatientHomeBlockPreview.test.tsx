/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { emptyPatientHomeRefDisplayTitles } from "@/modules/patient-home/patientHomeBlockItemDisplayTitle";
import { PatientHomeBlockPreview } from "./PatientHomeBlockPreview";

const emptyPreview = "После выбора материалов и разделов ниже блок появится на главной.";

describe("PatientHomeBlockPreview", () => {
  it("renders non-clickable preview items", () => {
    render(
      <PatientHomeBlockPreview
        emptyPreviewText={emptyPreview}
        refDisplayTitles={emptyPatientHomeRefDisplayTitles}
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
        emptyPreviewText={emptyPreview}
        refDisplayTitles={emptyPatientHomeRefDisplayTitles}
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
        emptyPreviewText={emptyPreview}
        refDisplayTitles={emptyPatientHomeRefDisplayTitles}
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

  it("shows emptyPreviewText when there are no visible items", () => {
    const copy = "Краткое описание блока без технических отсылок.";
    render(
      <PatientHomeBlockPreview
        emptyPreviewText={copy}
        refDisplayTitles={emptyPatientHomeRefDisplayTitles}
        items={[
          {
            id: "1",
            blockCode: "booking",
            targetType: "static_action",
            targetRef: "x",
            titleOverride: null,
            subtitleOverride: null,
            imageUrlOverride: null,
            badgeLabel: null,
            isVisible: false,
            sortOrder: 0,
          },
        ]}
        knownRefs={{ contentPages: [], contentSections: [], courses: [] }}
      />,
    );
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("shows CMS page title from ref map when override is absent", () => {
    render(
      <PatientHomeBlockPreview
        emptyPreviewText={emptyPreview}
        refDisplayTitles={{
          contentPages: { "my-slug": "Человеческое название" },
          contentSections: {},
          courses: {},
        }}
        items={[
          {
            id: "1",
            blockCode: "useful_post",
            targetType: "content_page",
            targetRef: "my-slug",
            titleOverride: null,
            subtitleOverride: null,
            imageUrlOverride: null,
            badgeLabel: null,
            isVisible: true,
            sortOrder: 0,
          },
        ]}
        knownRefs={{ contentPages: ["my-slug"], contentSections: [], courses: [] }}
      />,
    );
    expect(screen.getByText("Человеческое название")).toBeInTheDocument();
  });
});
