/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentRouteError } from "./SegmentRouteError";

const backMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: backMock, push: pushMock }),
  usePathname: () => "/app/patient/reminders",
}));

describe("SegmentRouteError", () => {
  beforeEach(() => {
    backMock.mockClear();
    pushMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, url: "https://t.me/support_bot" }),
      })),
    );
    Object.defineProperty(window, "history", {
      value: { length: 2 },
      configurable: true,
    });
  });

  it("shows retry, support, and back without duplicate refresh buttons", async () => {
    const reset = vi.fn();
    render(<SegmentRouteError error={new Error("fail")} reset={reset} backFallbackHref="/app/patient" />);

    expect(screen.getByRole("button", { name: "Попробовать снова" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Обновить страницу" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Связаться с поддержкой" })).toHaveAttribute(
        "href",
        "https://t.me/support_bot",
      );
    });
    expect(screen.getByRole("button", { name: "Назад" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(reset).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
