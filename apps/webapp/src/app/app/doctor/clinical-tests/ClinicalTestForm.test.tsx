/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ClinicalTest } from "@/modules/tests/types";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "@/modules/tests/types";
import type { ArchiveClinicalTestState, SaveClinicalTestState } from "./actionsShared";
import { ClinicalTestForm } from "./ClinicalTestForm";

vi.mock("@/app/app/doctor/content/MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: () => <div data-testid="media-picker" />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorClinicalTestUsageSnapshot: vi.fn(async () => ({ ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT })),
  };
});

function makeClinicalTest(over: Partial<ClinicalTest>): ClinicalTest {
  return {
    id: "ct-1",
    title: "Title",
    description: null,
    testType: null,
    scoringConfig: null,
    media: [],
    tags: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("ClinicalTestForm", () => {
  it("resets controlled fields when test id changes without remount key", () => {
    const saveAction = vi.fn(
      async (_prev: SaveClinicalTestState | null): Promise<SaveClinicalTestState> => ({ ok: true }),
    );
    const archiveAction = vi.fn(
      async (_prev: ArchiveClinicalTestState | null, _fd: FormData): Promise<ArchiveClinicalTestState> => ({
        ok: true,
      }),
    );

    const a = makeClinicalTest({
      id: "a",
      title: "Alpha",
      description: "Desc A",
      tags: ["knee"],
    });
    const b = makeClinicalTest({
      id: "b",
      title: "Beta",
      description: "Desc B",
      tags: ["back"],
    });

    const { rerender } = render(
      <ClinicalTestForm test={a} saveAction={saveAction} archiveAction={archiveAction} />,
    );

    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Alpha");
    expect(screen.getByLabelText(/^описание$/i)).toHaveValue("Desc A");
    expect(screen.getByLabelText(/теги/i)).toHaveValue("knee");

    rerender(<ClinicalTestForm test={b} saveAction={saveAction} archiveAction={archiveAction} />);

    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Beta");
    expect(screen.getByLabelText(/^описание$/i)).toHaveValue("Desc B");
    expect(screen.getByLabelText(/теги/i)).toHaveValue("back");
  });
});
