/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeasureKindsTableClient } from "./MeasureKindsTableClient";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <div data-testid="sortable-wrap">{children}</div>,
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

describe("MeasureKindsTableClient", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 }))),
    );
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllGlobals();
  });

  it("does not PATCH when a label is empty and shows a dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    render(
      <MeasureKindsTableClient
        initialItems={[
          { id: "00000000-0000-4000-8000-000000000001", code: "a", label: "A", sortOrder: 0 },
          { id: "00000000-0000-4000-8000-000000000002", code: "b", label: "B", sortOrder: 1 },
        ]}
      />,
    );

    const table = screen.getByRole("table");
    const inputs = within(table).getAllByLabelText("Подпись вида измерения");
    await user.clear(inputs[1]!);

    await user.click(screen.getByRole("button", { name: "Сохранить порядок и подписи" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Подпись не может быть пустой (проверьте все строки).")).toBeInTheDocument();
  });

  it("shows JSON error body on 422 from PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Список устарел: обновите страницу и попробуйте снова" }), {
        status: 422,
      }),
    );

    render(
      <MeasureKindsTableClient
        initialItems={[{ id: "00000000-0000-4000-8000-000000000001", code: "x", label: "Alpha", sortOrder: 0 }]}
      />,
    );

    const input = screen.getByLabelText("Подпись вида измерения");
    await user.clear(input);
    await user.type(input, "Beta");

    await user.click(screen.getByRole("button", { name: "Сохранить порядок и подписи" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Список устарел: обновите страницу и попробуйте снова")).toBeInTheDocument();
  });

  it("shows non-JSON error hint when server returns plain text on error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(new Response("Gateway timeout", { status: 502, headers: { "Content-Type": "text/plain" } }));

    render(
      <MeasureKindsTableClient
        initialItems={[{ id: "00000000-0000-4000-8000-000000000001", code: "x", label: "One", sortOrder: 0 }]}
      />,
    );

    const input = screen.getByLabelText("Подпись вида измерения");
    await user.clear(input);
    await user.type(input, "Two");

    await user.click(screen.getByRole("button", { name: "Сохранить порядок и подписи" }));

    expect(await screen.findByText("Ответ не JSON (HTTP 502)")).toBeInTheDocument();
  });

  it("dispatches catalog event and refreshes router after successful PATCH", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          items: [{ id: "00000000-0000-4000-8000-000000000001", code: "x", label: "Saved", sortOrder: 0 }],
        }),
        { status: 200 },
      ),
    );

    render(
      <MeasureKindsTableClient
        initialItems={[{ id: "00000000-0000-4000-8000-000000000001", code: "x", label: "Old", sortOrder: 0 }]}
      />,
    );

    const input = screen.getByLabelText("Подпись вида измерения");
    await user.clear(input);
    await user.type(input, "Saved");

    await user.click(screen.getByRole("button", { name: "Сохранить порядок и подписи" }));

    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(dispatch).toHaveBeenCalled();
    dispatch.mockRestore();
  });
});
