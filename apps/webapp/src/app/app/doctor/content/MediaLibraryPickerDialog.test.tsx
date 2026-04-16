/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaLibraryPickerDialog } from "./MediaLibraryPickerDialog";

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
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ ok: false }),
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MediaLibraryPickerDialog", () => {
  const sampleMediaId = "11111111-1111-4111-8111-111111111111";

  it("renders placeholder (no ready thumb) for /api/media URL when kind is image without library pick meta", () => {
    render(<MediaLibraryPickerDialog kind="image" value={`/api/media/${sampleMediaId}`} onChange={vi.fn()} />);
    const preview = screen.getByTestId("selected-media-preview");
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders placeholder for video when no API preview status from pick", () => {
    render(<MediaLibraryPickerDialog kind="video" value={`/api/media/${sampleMediaId}`} onChange={vi.fn()} />);
    const preview = screen.getByTestId("selected-media-preview");
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("does not render media preview for legacy non-API path but shows warning", () => {
    render(<MediaLibraryPickerDialog kind="image" value="/static/legacy.png" onChange={vi.fn()} />);
    expect(screen.queryByTestId("selected-media-preview")).toBeNull();
    expect(screen.getByText(/Legacy URL/i)).toBeInTheDocument();
  });

  it("loads list on open without q; typing search does not trigger extra fetch", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [] as unknown[] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryPickerDialog kind="image" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Выбрать из библиотеки/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    const fetchCalls = fetchMock.mock.calls as unknown[][];
    const firstUrl = String(fetchCalls[0]?.[0] ?? "");
    expect(firstUrl).toContain("/api/admin/media");
    expect(new URL(firstUrl, "http://localhost").searchParams.get("q")).toBeNull();
    expect(firstUrl).toMatch(/limit=200/);

    const afterOpenCount = fetchMock.mock.calls.length;

    const search = screen.getByPlaceholderText("Введите часть имени файла");
    fireEvent.change(search, { target: { value: "abc" } });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock.mock.calls.length).toBe(afterOpenCount);
  });

  it("filters by filename locally without new fetch", async () => {
    const alpha = {
      id: "1",
      kind: "image" as const,
      filename: "alpha.png",
      mimeType: "image/png",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/1",
    };
    const beta = {
      id: "2",
      kind: "image" as const,
      filename: "beta.png",
      mimeType: "image/png",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/2",
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [alpha, beta] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryPickerDialog kind="image" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Выбрать из библиотеки/i }));

    await waitFor(() => expect(screen.getByText("alpha.png")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Введите часть имени файла"), {
      target: { value: "bet" },
    });

    await waitFor(() => {
      expect(screen.queryByText("alpha.png")).toBeNull();
      expect(screen.getByText("beta.png")).toBeInTheDocument();
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("filters by displayName locally without new fetch", async () => {
    const demo = {
      id: "1",
      kind: "video" as const,
      filename: "blob-id.mp4",
      displayName: "Демо для пациента",
      mimeType: "video/mp4",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/1",
    };
    const warmup = {
      id: "2",
      kind: "video" as const,
      filename: "clip.mp4",
      displayName: "Разминка",
      mimeType: "video/mp4",
      size: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: "/api/media/2",
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [demo, warmup] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryPickerDialog kind="video" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Выбрать из библиотеки/i }));

    await waitFor(() => expect(screen.getByText("Разминка")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Введите часть имени файла"), {
      target: { value: "пациент" },
    });

    await waitFor(() => {
      expect(screen.getByText("Демо для пациента")).toBeInTheDocument();
      expect(screen.queryByText("Разминка")).toBeNull();
    });
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("exercise mode shows folder filter and new-only toggle", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      const body = JSON.stringify({ ok: true, items: [] as unknown[] });
      if (url.includes("/api/admin/media/folders")) {
        return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<MediaLibraryPickerDialog kind="image_or_video" value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Выбрать из библиотеки/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Папка").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("только новые")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Загрузить с устройства/i })).toBeInTheDocument();
  });
});
