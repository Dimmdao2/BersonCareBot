/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterialRatingNativeStars } from "./MaterialRatingNativeStars";

describe("MaterialRatingNativeStars", () => {
  it("calls onChange with star level", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialRatingNativeStars value={0} readOnly={false} onChange={onChange} />);
    const buttons = screen.getAllByRole("radio");
    expect(buttons).toHaveLength(5);
    await user.click(buttons[2]!);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("toggles off when clicking the same level", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialRatingNativeStars value={3} readOnly={false} onChange={onChange} />);
    const buttons = screen.getAllByRole("radio");
    await user.click(buttons[2]!);
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("does not call onChange when readOnly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MaterialRatingNativeStars value={0} readOnly onChange={onChange} />);
    await user.click(screen.getAllByRole("radio")[4]!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
