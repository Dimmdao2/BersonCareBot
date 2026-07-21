/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformLocationPaletteSection } from "./PlatformLocationPaletteSection";

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("react-hot-toast", () => ({ default: { success: toastSuccess, error: toastError } }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PlatformLocationPaletteSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      return jsonResponse({
        ok: true,
        settings: [{
          key: "booking_location_default_palette",
          valueJson: {
            value: {
              physicalPalette: ["#111111", "#222222", "#333333", "#444444", "#555555"],
              online: "#666666",
            },
          },
        }],
      });
    }));
  });

  it("edits the ordered palette with native accessible color inputs and saves one structured setting", async () => {
    const user = userEvent.setup();
    render(<PlatformLocationPaletteSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Добавить цвет" })).toBeEnabled());
    const first = screen.getByLabelText("Цвет обычной локации 1");
    expect(first).toHaveAttribute("type", "color");
    fireEvent.input(first, { target: { value: "#abcdef" } });
    await user.click(screen.getByRole("button", { name: "Добавить цвет" }));
    expect(screen.getAllByLabelText(/Цвет обычной локации \d+/)).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "Сохранить цвета" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/platform/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          key: "booking_location_default_palette",
          value: {
            physicalPalette: ["#ABCDEF", "#222222", "#333333", "#444444", "#555555", "#2563EB"],
            online: "#666666",
          },
        }),
      }),
    ));
  });

  it("does not allow the platform palette to shrink below five colors", async () => {
    render(<PlatformLocationPaletteSection />);
    const removeButtons = await screen.findAllByRole("button", { name: /Удалить цвет обычной локации/ });
    expect(removeButtons).toHaveLength(5);
    for (const button of removeButtons) expect(button).toBeDisabled();
  });
});
