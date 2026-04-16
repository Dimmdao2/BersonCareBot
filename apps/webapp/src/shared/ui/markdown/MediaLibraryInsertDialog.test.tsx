/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaLibraryInsertDialog } from "./MediaLibraryInsertDialog";

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
  it("loads list on open without q; typing search does not trigger extra fetch", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [] as unknown[] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryInsertDialog onInsert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Библиотека или загрузка/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const fetchCalls = fetchMock.mock.calls as unknown[][];
    const firstUrl = String(fetchCalls[0]?.[0] ?? "");
    expect(firstUrl).toContain("/api/admin/media");
    expect(new URL(firstUrl, "http://localhost").searchParams.get("q")).toBeNull();
    expect(firstUrl).toMatch(/limit=200/);

    const afterOpenCount = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText("Введите часть имени файла"), {
      target: { value: "xy" },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock.mock.calls.length).toBe(afterOpenCount);
  });

  it("filters by filename locally without new fetch", async () => {
    const notes = {
      id: "1",
      kind: "file" as const,
      filename: "notes.txt",
      mimeType: "text/plain",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/1",
    };
    const photo = {
      id: "2",
      kind: "image" as const,
      filename: "photo.png",
      mimeType: "image/png",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/2",
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [notes, photo] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryInsertDialog onInsert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Библиотека или загрузка/i }));

    await waitFor(() => expect(screen.getByText("notes.txt")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Введите часть имени файла"), {
      target: { value: "photo" },
    });

    await waitFor(() => {
      expect(screen.queryByText("notes.txt")).toBeNull();
      expect(screen.getByText("photo.png")).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("shows library and upload tabs when opened", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [] as unknown[] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryInsertDialog onInsert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Библиотека или загрузка/i }));

    expect(screen.getByRole("tab", { name: /Из библиотеки/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Загрузить с устройства/i })).toBeInTheDocument();
  });
});
