/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PatientHomeMoodCheckin } from "./PatientHomeMoodCheckin";

describe("PatientHomeMoodCheckin", () => {
  it("renders five mood slots with aria-pressed", () => {
    render(<PatientHomeMoodCheckin />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("does not submit when disabled", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<PatientHomeMoodCheckin disabled />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs mood index and sets aria-pressed on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<PatientHomeMoodCheckin submitPath="/api/patient/mood" />);
    fireEvent.click(screen.getAllByRole("button")[2]!);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/patient/mood",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ moodIndex: 2 }),
        }),
      );
    });
    expect(screen.getAllByRole("button")[2]).toHaveAttribute("aria-pressed", "true");
  });

  it("rolls back selection when POST fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<PatientHomeMoodCheckin submitPath="/api/patient/mood" />);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getAllByRole("button")[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("disables all mood buttons while a submit is in flight", async () => {
    let resolvePost: (v: { ok: boolean }) => void;
    const postPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi.fn().mockImplementation(() => postPromise);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<PatientHomeMoodCheckin submitPath="/api/patient/mood" />);
    fireEvent.click(screen.getAllByRole("button")[3]!);
    await waitFor(() => {
      expect(screen.getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });
    resolvePost!({ ok: true });
    await waitFor(() => {
      expect(screen.getAllByRole("button").some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    });
  });
});
