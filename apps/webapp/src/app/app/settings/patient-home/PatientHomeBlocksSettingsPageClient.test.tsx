/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
} from "@/modules/patient-home/patientHomeRuntimeStatus";
import { emptyPatientHomeRefDisplayTitles } from "@/modules/patient-home/patientHomeBlockItemDisplayTitle";
import { PatientHomeBlocksSettingsPageClient } from "./PatientHomeBlocksSettingsPageClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
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
  listPatientHomeCandidates: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  retargetPatientHomeItem: vi.fn().mockResolvedValue({ ok: true }),
  addPatientHomeItem: vi.fn().mockResolvedValue({ ok: true }),
  updatePatientHomeItemVisibility: vi.fn().mockResolvedValue({ ok: true }),
  deletePatientHomeItem: vi.fn().mockResolvedValue({ ok: true }),
  reorderPatientHomeItems: vi.fn().mockResolvedValue({ ok: true }),
  reorderPatientHomeBlocks: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("PatientHomeBlocksSettingsPageClient", () => {
  const knownRefs = { contentPages: [] as string[], contentSections: [] as string[], courses: [] as string[] };
  const resolverSync = buildPatientHomeResolverSyncContext({ sections: [], pages: [], courses: [] });

  function statusesForBlocks(blocks: PatientHomeBlock[]) {
    return blocks.reduce(
      (acc, b) => {
        acc[b.code] = computePatientHomeBlockRuntimeStatus(b, { knownRefs, resolverSync });
        return acc;
      },
      {} as Record<PatientHomeBlock["code"], ReturnType<typeof computePatientHomeBlockRuntimeStatus>>,
    );
  }

  it("renders blocks and menu actions by block type", async () => {
    const initialBlocks: PatientHomeBlock[] = [
      {
        code: "daily_warmup",
        title: "Разминка дня",
        description: "",
        isVisible: true,
        sortOrder: 1,
        iconImageUrl: null,
        items: [],
      },
      {
        code: "booking",
        title: "Запись на приём",
        description: "",
        isVisible: true,
        sortOrder: 2,
        iconImageUrl: null,
        items: [],
      },
    ];
    render(
      <PatientHomeBlocksSettingsPageClient
        initialBlocks={initialBlocks}
        knownRefs={knownRefs}
        refDisplayTitles={emptyPatientHomeRefDisplayTitles}
        blockRuntimeStatuses={statusesForBlocks(initialBlocks)}
      />,
    );

    expect(screen.getByText("Разминка дня")).toBeInTheDocument();
    expect(screen.getByText("Запись на приём")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поменять порядок блоков" })).toBeInTheDocument();

    expect(screen.getAllByText(/Скрыть|Показать/).length).toBeGreaterThan(0);
    expect(screen.getByText("Добавить материал")).toBeInTheDocument();
    expect(screen.getAllByText("Изменить").length).toBeGreaterThanOrEqual(1);
  });
});
