/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaLibraryPickerDialog } from "./MediaLibraryPickerDialog";
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

describe("MediaLibraryPickerDialog", () => {
  it("renders image preview for /api/media URL when kind is image", () => {
    render(<MediaLibraryPickerDialog kind="image" value="/api/media/abc" onChange={vi.fn()} />);
    const preview = screen.getByTestId("selected-media-preview");
    const img = preview.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/api/media/abc");
  });

  it("renders video preview when kind is video", () => {
    render(<MediaLibraryPickerDialog kind="video" value="/api/media/vid" onChange={vi.fn()} />);
    const preview = screen.getByTestId("selected-media-preview");
    expect(preview.querySelector("video")).not.toBeNull();
  });

  it("does not render media preview for legacy non-API path but shows warning", () => {
    render(<MediaLibraryPickerDialog kind="image" value="/static/legacy.png" onChange={vi.fn()} />);
    expect(screen.queryByTestId("selected-media-preview")).toBeNull();
    expect(screen.getByText(/Legacy URL/i)).toBeInTheDocument();
  });

  it("debounces search: one fetch after typing stops, not per keystroke", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [] as unknown[] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();

    render(<MediaLibraryPickerDialog kind="image" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Выбрать из библиотеки/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const calls = fetchMock.mock.calls as unknown[][];
    const afterOpenCount = calls.length;
    const firstUrl = String(calls[0]?.[0] ?? "");
    expect(firstUrl).toContain("/api/admin/media");
    expect(firstUrl).not.toMatch(/[&?]q=/);

    const search = screen.getByPlaceholderText("Введите часть имени файла");
    fireEvent.change(search, { target: { value: "abc" } });

    expect(calls.length).toBe(afterOpenCount);

    await vi.advanceTimersByTimeAsync(MEDIA_LIBRARY_SEARCH_DEBOUNCE_MS + 50);

    await waitFor(() => expect(calls.length).toBeGreaterThan(afterOpenCount));
    const lastCall = calls[calls.length - 1]?.[0];
    expect(String(lastCall)).toContain("q=abc");

    vi.useRealTimers();
  });
});
