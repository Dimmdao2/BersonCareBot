/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Template } from "@/modules/lfk-templates/types";
import { EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/lfk-templates/types";
import { TemplateEditor } from "./TemplateEditor";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  arrayMove: <T,>(arr: T[]) => [...arr],
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => "",
    },
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorLfkTemplateUsageSnapshot: vi.fn(async () => ({ ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT })),
  };
});

function makeTemplate(over: Partial<Template> = {}): Template {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "tpl-1",
    title: "Комплекс",
    description: null,
    status: "draft",
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    exercises: [
      {
        id: "line-1",
        templateId: "tpl-1",
        exerciseId: "ex-1",
        sortOrder: 0,
        reps: null,
        sets: null,
        side: null,
        maxPain0_10: null,
        comment: null,
        exerciseTitle: "Присед",
      },
    ],
    ...over,
  };
}

describe("TemplateEditor", () => {
  const catalog = [{ id: "ex-1", title: "Присед", firstMedia: null }];

  it("shows empty usage when snapshot has no references", () => {
    render(
      <TemplateEditor
        template={makeTemplate()}
        exerciseCatalog={catalog}
        externalUsageSnapshot={{ ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT }}
      />,
    );
    expect(screen.getByText("Где используется")).toBeInTheDocument();
    expect(screen.getByText("Пока не используется")).toBeInTheDocument();
  });

  it("shows usage section with link when program templates reference complex", () => {
    const snap = {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
      publishedTreatmentProgramTemplateRefs: [
        { kind: "treatment_program_template" as const, id: "prog-1", title: "Программа А" },
      ],
    };
    render(
      <TemplateEditor template={makeTemplate()} exerciseCatalog={catalog} externalUsageSnapshot={snap} />,
    );
    const link = screen.getByRole("link", { name: "Программа А" });
    expect(link.getAttribute("href")).toContain("/app/doctor/treatment-program-templates/prog-1");
  });

  it("passes listPreserveQuery into archive form", () => {
    const { container } = render(
      <TemplateEditor
        template={makeTemplate()}
        exerciseCatalog={catalog}
        externalUsageSnapshot={{ ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT }}
        listPreserveQuery="q=test&titleSort=desc"
      />,
    );
    const hidden = container.querySelector('input[name="listPreserveQuery"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe("q=test&titleSort=desc");
  });
});
