/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
} from "@/modules/patient-home/patientHomeRuntimeStatus";
import { PatientHomeBlockSettingsCard } from "./PatientHomeBlockSettingsCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
}));

vi.mock("./actions", () => ({
  togglePatientHomeBlockVisibility: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("./PatientHomeAddItemDialog", () => ({
  PatientHomeAddItemDialog: () => null,
}));
vi.mock("./PatientHomeBlockItemsDialog", () => ({
  PatientHomeBlockItemsDialog: () => null,
}));
vi.mock("./PatientHomeRepairTargetsDialog", () => ({
  PatientHomeRepairTargetsDialog: () => null,
}));

vi.mock("./PatientHomeCreateSectionInlineDialog", () => ({
  PatientHomeCreateSectionInlineDialog: () => null,
}));

const knownRefs = { contentPages: ["ok-page"], contentSections: ["ok-sec"], courses: [] as string[] };
const resolverSync = buildPatientHomeResolverSyncContext({
  sections: [{ slug: "ok-sec", isVisible: true, requiresAuth: false }],
  pages: [{ slug: "ok-page", requiresAuth: false }],
  courses: [],
});

describe("PatientHomeBlockSettingsCard", () => {
  it("shows hidden-only broken CMS notice when unresolved items are not visible", () => {
    const block: PatientHomeBlock = {
      code: "situations",
      title: "Ситуации",
      description: "",
      isVisible: true,
      sortOrder: 1,
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          blockCode: "situations",
          targetType: "content_section",
          targetRef: "missing-section",
          titleOverride: null,
          subtitleOverride: null,
          imageUrlOverride: null,
          badgeLabel: null,
          isVisible: false,
          sortOrder: 1,
        },
      ],
    };
    const runtimeStatus = computePatientHomeBlockRuntimeStatus(block, { knownRefs, resolverSync });
    render(
      <PatientHomeBlockSettingsCard
        block={block}
        knownRefs={knownRefs}
        runtimeStatus={runtimeStatus}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/Есть битые связи CMS у скрытых элементов/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Исправить связи CMS…" })).toBeInTheDocument();
    expect(screen.queryByText("Исправить связь CMS…")).toBeNull();
  });

  it("shows create section action for situations block", () => {
    const block: PatientHomeBlock = {
      code: "situations",
      title: "Ситуации",
      description: "",
      isVisible: true,
      sortOrder: 1,
      items: [],
    };
    const runtimeStatus = computePatientHomeBlockRuntimeStatus(block, { knownRefs, resolverSync });
    render(
      <PatientHomeBlockSettingsCard block={block} knownRefs={knownRefs} runtimeStatus={runtimeStatus} onChanged={vi.fn()} />,
    );
    expect(screen.getByText("Создать раздел и добавить")).toBeInTheDocument();
  });

  it("hides create section action for daily_warmup block", () => {
    const block: PatientHomeBlock = {
      code: "daily_warmup",
      title: "Разминка",
      description: "",
      isVisible: true,
      sortOrder: 1,
      items: [],
    };
    const runtimeStatus = computePatientHomeBlockRuntimeStatus(block, { knownRefs, resolverSync });
    render(
      <PatientHomeBlockSettingsCard block={block} knownRefs={knownRefs} runtimeStatus={runtimeStatus} onChanged={vi.fn()} />,
    );
    expect(screen.queryByText("Создать раздел и добавить")).toBeNull();
  });
});
