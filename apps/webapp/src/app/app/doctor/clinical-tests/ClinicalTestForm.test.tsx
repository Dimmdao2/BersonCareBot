/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClinicalTest, ClinicalTestUsageSnapshot } from "@/modules/tests/types";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "@/modules/tests/types";
import type { ArchiveClinicalTestState, SaveClinicalTestState } from "./actionsShared";
import { ClinicalTestForm } from "./ClinicalTestForm";

vi.mock("@/app/app/doctor/content/MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: () => <div data-testid="media-picker" />,
}));

vi.mock("./ClinicalTestMeasureRowsEditor", () => ({
  ClinicalTestMeasureRowsEditor: () => <div data-testid="measure-rows" />,
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (u.includes("/api/references/body_region")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: false, items: [] }), { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeUsageWithTemplateRef(): ClinicalTestUsageSnapshot {
  return {
    ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
    publishedTreatmentProgramTemplateCount: 1,
    publishedTreatmentProgramTemplateRefs: [
      {
        kind: "treatment_program_template",
        id: "11111111-1111-4111-8111-111111111111",
        title: "Шаблон тест",
      },
    ],
  };
}

function makeClinicalTest(over: Partial<ClinicalTest>): ClinicalTest {
  return {
    id: "ct-1",
    title: "Title",
    description: null,
    testType: null,
    scoringConfig: null,
    scoring: null,
    rawText: null,
    assessmentKind: null,
    bodyRegionId: null,
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

  it("opens archive warning on USAGE_CONFIRMATION_REQUIRED and resubmits with acknowledgeUsageWarning", async () => {
    const user = userEvent.setup();
    const usageHeavy = makeUsageWithTemplateRef();
    const archiveAction = vi.fn(
      async (_prev: ArchiveClinicalTestState | null, fd: FormData): Promise<ArchiveClinicalTestState> => {
        const ack = fd.get("acknowledgeUsageWarning");
        if (ack === "1" || ack === "true" || ack === "on") {
          return { ok: true };
        }
        return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: usageHeavy };
      },
    );

    render(
      <ClinicalTestForm
        test={makeClinicalTest({ id: "ct-1" })}
        saveAction={vi.fn(async () => ({ ok: true }))}
        archiveAction={archiveAction}
        externalUsageSnapshot={usageHeavy}
      />,
    );

    await user.click(screen.getByRole("button", { name: /архивировать/i }));
    expect(await screen.findByRole("heading", { name: /элемент уже используется/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /архивировать всё равно/i }));

    await waitFor(() => expect(archiveAction).toHaveBeenCalledTimes(2));
    const secondFd = archiveAction.mock.calls[1][1] as FormData;
    expect(secondFd.get("acknowledgeUsageWarning")).toBe("1");
  });
});
