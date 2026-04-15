/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaLibraryInsertDialog } from "./MediaLibraryInsertDialog";
import { MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS } from "@/shared/ui/media/mediaLibrarySearchDebounceMs";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MediaLibraryInsertDialog", () => {
  it("debounces library search while dialog is open", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [] as unknown[] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();

    render(<MediaLibraryInsertDialog onInsert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Вставить из библиотеки/i }));

    const calls = fetchMock.mock.calls as unknown[][];
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    const afterOpenCount = calls.length;

    const search = screen.getByPlaceholderText("Введите часть имени файла");
    fireEvent.change(search, { target: { value: "xy" } });

    expect(calls.length).toBe(afterOpenCount);

    await vi.advanceTimersByTimeAsync(MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS + 50);

    await waitFor(() => expect(calls.length).toBeGreaterThan(afterOpenCount));
    const lastCall = calls[calls.length - 1]?.[0];
    expect(String(lastCall)).toContain("q=xy");

    vi.useRealTimers();
  });
});
