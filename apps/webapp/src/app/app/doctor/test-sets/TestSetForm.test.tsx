/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TestSet } from "@/modules/tests/types";
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
});
