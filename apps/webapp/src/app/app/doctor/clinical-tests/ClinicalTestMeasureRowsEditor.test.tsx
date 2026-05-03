/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClinicalTestMeasureRowsEditor } from "./ClinicalTestMeasureRowsEditor";

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

describe("ClinicalTestMeasureRowsEditor", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "server boom" }), { status: 500 })),
    );
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllGlobals();
  });

  it("shows load error and retry when GET measure-kinds fails", async () => {
    const user = userEvent.setup();
    const setRows = vi.fn();
    render(
      <ClinicalTestMeasureRowsEditor
        disabled={false}
        rows={[{ id: "r1", measureKind: "", value: "", unit: "", comment: "" }]}
        setRows={setRows}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("server boom");
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, items: [{ code: "pain", label: "Боль" }] }), { status: 200 }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
