/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinInput } from "./PinInput";

describe("PinInput", () => {
  it("centers PIN row and form", () => {
    const { container } = render(
      <PinInput onSubmit={() => {}} onForgot={() => {}} forgotHidden submitLabel="OK" />,
    );
    const form = container.querySelector("form");
    expect(form?.className).toMatch(/items-center/);
    expect(form?.className).toMatch(/mx-auto/);
    const row = container.querySelector('[role="group"]');
    expect(row?.className).toMatch(/justify-center/);
  });

  it("renders custom submitLabel", () => {
    render(
      <PinInput
        onSubmit={() => {}}
        onForgot={() => {}}
        forgotHidden
        submitLabel="Сохранить PIN"
      />,
    );
    expect(screen.getByRole("button", { name: "Сохранить PIN" })).toBeInTheDocument();
  });

  it("auto-submits once for the same 4 digits when disabled toggles (no triple-fire)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <PinInput disabled={false} onSubmit={onSubmit} onForgot={() => {}} forgotHidden submitLabel="OK" />,
    );
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText(`Цифра ${i + 1} из 4`), String(i + 1));
    }
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    rerender(<PinInput disabled onSubmit={onSubmit} onForgot={() => {}} forgotHidden submitLabel="OK" />);
    rerender(<PinInput disabled={false} onSubmit={onSubmit} onForgot={() => {}} forgotHidden submitLabel="OK" />);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: 200 });
  });
});
