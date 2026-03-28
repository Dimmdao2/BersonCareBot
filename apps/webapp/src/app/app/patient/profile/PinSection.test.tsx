/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinSection } from "./PinSection";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("PinSection", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      }) as unknown as typeof fetch,
    );
  });

  it("when hasPin: shows created state and hides PIN inputs until reset", () => {
    render(<PinSection hasPin />);
    expect(screen.getByText("PIN-код создан")).toBeInTheDocument();
    expect(screen.queryByLabelText("Цифра 1 из 4")).not.toBeInTheDocument();
  });

  it("when hasPin: clicking Сбросить PIN shows first step", async () => {
    const user = userEvent.setup();
    render(<PinSection hasPin />);
    await user.click(screen.getByRole("button", { name: "Сбросить PIN" }));
    expect(screen.getByText(/Задайте новый PIN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
  });

  it("when no hasPin: shows setup flow immediately", () => {
    render(<PinSection hasPin={false} />);
    expect(screen.getByText(/Задайте PIN для быстрого входа/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeInTheDocument();
  });
});
