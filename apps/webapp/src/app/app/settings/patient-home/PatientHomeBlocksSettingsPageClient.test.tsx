/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
}));

vi.mock("./actions", () => ({
  togglePatientHomeBlockVisibility: vi.fn().mockResolvedValue({ ok: true }),
  listPatientHomeCandidates: vi.fn().mockResolvedValue({ ok: true, items: [] }),
  addPatientHomeItem: vi.fn().mockResolvedValue({ ok: true }),
  updatePatientHomeItemVisibility: vi.fn().mockResolvedValue({ ok: true }),
  deletePatientHomeItem: vi.fn().mockResolvedValue({ ok: true }),
  reorderPatientHomeItems: vi.fn().mockResolvedValue({ ok: true }),
  reorderPatientHomeBlocks: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("PatientHomeBlocksSettingsPageClient", () => {
  it("renders blocks and menu actions by block type", async () => {
    render(
      <PatientHomeBlocksSettingsPageClient
        initialBlocks={[
          {
            code: "daily_warmup",
            title: "Разминка дня",
            description: "",
            isVisible: true,
            sortOrder: 1,
            items: [],
          },
          {
            code: "booking",
            title: "Запись на приём",
            description: "",
            isVisible: true,
            sortOrder: 2,
            items: [],
          },
        ]}
        knownRefs={{ contentPages: [], contentSections: [], courses: [] }}
      />,
    );

    expect(screen.getByText("Разминка дня")).toBeInTheDocument();
    expect(screen.getByText("Запись на приём")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поменять порядок блоков" })).toBeInTheDocument();

    expect(screen.getAllByText(/Скрыть|Показать/).length).toBeGreaterThan(0);
    expect(screen.getByText("Добавить материал")).toBeInTheDocument();
    expect(screen.getByText("Изменить")).toBeInTheDocument();
  });
});
