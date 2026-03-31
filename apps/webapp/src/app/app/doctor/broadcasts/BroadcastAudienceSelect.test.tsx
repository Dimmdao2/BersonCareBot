/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastAudienceSelect } from "./BroadcastAudienceSelect";
import { AUDIENCE_LABELS } from "./labels";

describe("BroadcastAudienceSelect", () => {
  it("renders placeholder and all 8 audience options", () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /выберите аудиторию/i })).toBeInTheDocument();
    for (const label of Object.values(AUDIENCE_LABELS)) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("calls onChange with correct filter value when option is selected", async () => {
    const onChange = vi.fn();
    render(<BroadcastAudienceSelect value="" onChange={onChange} />);
    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "with_telegram");
    expect(onChange).toHaveBeenCalledWith("with_telegram");
  });

  it("is disabled when disabled prop is true", () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
