/** @vitest-environment jsdom */

/**
 * Mounts `PatientHomeBlockSettingsCard` without stubbing `MediaLibraryPickerDialog`
 * (closes AUDIT_BLOCK_ICON_ADMIN_RUNTIME gap: real MediaPickerShell + MediaPickerPanel tree).
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PatientHomeBlock } from "@/modules/patient-home/ports";
import {
  buildPatientHomeResolverSyncContext,
  computePatientHomeBlockRuntimeStatus,
} from "@/modules/patient-home/patientHomeRuntimeStatus";
import { PatientHomeBlockSettingsCard } from "./PatientHomeBlockSettingsCard";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
}));

vi.mock("./actions", () => ({
  togglePatientHomeBlockVisibility: vi.fn().mockResolvedValue({ ok: true }),
  setPatientHomeBlockIcon: vi.fn().mockResolvedValue({ ok: true }),
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

const knownRefs = { contentPages: [] as string[], contentSections: [] as string[], courses: [] as string[] };
const resolverSync = buildPatientHomeResolverSyncContext({ sections: [], pages: [], courses: [] });

describe("PatientHomeBlockSettingsCard (real MediaLibraryPickerDialog)", () => {
  it("mounts shared media picker UI for whitelist booking block", () => {
    const block: PatientHomeBlock = {
      code: "booking",
      title: "Запись на приём",
      description: "",
      isVisible: true,
      sortOrder: 1,
      iconImageUrl: null,
      items: [],
    };
    const runtimeStatus = computePatientHomeBlockRuntimeStatus(block, { knownRefs, resolverSync });
    render(
      <PatientHomeBlockSettingsCard block={block} knownRefs={knownRefs} runtimeStatus={runtimeStatus} onChanged={vi.fn()} />,
    );

    expect(screen.getByText("Иконка блока")).toBeInTheDocument();
    expect(screen.queryByTestId("media-library-picker-stub")).toBeNull();
    expect(screen.queryByText("Файл не выбран")).toBeNull();
    expect(screen.getByText("Выбрать изображение")).toBeInTheDocument();
  });
});
