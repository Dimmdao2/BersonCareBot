/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TestSet, TestSetUsageSnapshot } from "@/modules/tests/types";
import { EMPTY_TEST_SET_USAGE_SNAPSHOT } from "@/modules/tests/types";
import type { ArchiveTestSetState, SaveTestSetState } from "./actionsShared";
import { TestSetForm } from "./TestSetForm";

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorTestSetUsageSnapshot: vi.fn(async () => ({ ...EMPTY_TEST_SET_USAGE_SNAPSHOT })),
  };
});

function makeUsageWithTemplateRef(): TestSetUsageSnapshot {
  return {
    ...EMPTY_TEST_SET_USAGE_SNAPSHOT,
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

function makeTestSet(over: Partial<TestSet>): TestSet {
  return {
    id: "ts-1",
    title: "Set",
    description: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: [],
    ...over,
  };
}

describe("TestSetForm", () => {
  it("resets title when test set id changes", () => {
    const saveAction = vi.fn(async (_prev: SaveTestSetState | null): Promise<SaveTestSetState> => ({ ok: true }));
    const archiveAction = vi.fn(
    async (_prev: ArchiveTestSetState | null, _fd: FormData): Promise<ArchiveTestSetState> => ({ ok: true }),
  );

    const a = makeTestSet({ id: "a", title: "Alpha" });
    const b = makeTestSet({ id: "b", title: "Beta" });

    const { rerender } = render(
      <TestSetForm testSet={a} saveAction={saveAction} archiveAction={archiveAction} />,
    );
    expect(screen.getByLabelText(/название набора/i)).toHaveValue("Alpha");

    rerender(<TestSetForm testSet={b} saveAction={saveAction} archiveAction={archiveAction} />);
    expect(screen.getByLabelText(/название набора/i)).toHaveValue("Beta");
  });

  it("opens archive warning on USAGE_CONFIRMATION_REQUIRED and resubmits with acknowledgeUsageWarning", async () => {
    const user = userEvent.setup();
    const usageHeavy = makeUsageWithTemplateRef();
    const archiveAction = vi.fn(
      async (_prev: ArchiveTestSetState | null, fd: FormData): Promise<ArchiveTestSetState> => {
        const ack = fd.get("acknowledgeUsageWarning");
        if (ack === "1" || ack === "true" || ack === "on") {
          return { ok: true };
        }
        return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: usageHeavy };
      },
    );

    render(
      <TestSetForm
        testSet={makeTestSet({ id: "ts-1" })}
        saveAction={vi.fn(async () => ({ ok: true }))}
        archiveAction={archiveAction}
        externalUsageSnapshot={usageHeavy}
      />,
    );

    await user.click(screen.getByRole("button", { name: /архивировать набор/i }));
    expect(await screen.findByRole("heading", { name: /набор уже используется/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /архивировать всё равно/i }));

    await waitFor(() => expect(archiveAction).toHaveBeenCalledTimes(2));
    const secondFd = archiveAction.mock.calls[1][1] as FormData;
    expect(secondFd.get("acknowledgeUsageWarning")).toBe("1");
  });
});
