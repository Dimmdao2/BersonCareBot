/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastAudienceSelect } from "./BroadcastAudienceSelect";
import { BROADCAST_AUDIENCE_FILTERS_ORDER, getAudienceOptionLabel } from "./labels";

describe("BroadcastAudienceSelect", () => {
  it("renders placeholder text when no value is selected", () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/выберите аудиторию/i)).toBeInTheDocument();
  });

  it("shows selected option label in trigger when value is provided", () => {
    render(<BroadcastAudienceSelect value="all" onChange={vi.fn()} />);
    // ReferenceSelect renders the selected label in the input
    expect(screen.getByDisplayValue(getAudienceOptionLabel("all"))).toBeInTheDocument();
  });

  it("opens dropdown with all 8 audience options when clicked", async () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
    });
    for (const filter of BROADCAST_AUDIENCE_FILTERS_ORDER) {
      expect(screen.getByRole("button", { name: getAudienceOptionLabel(filter) })).toBeInTheDocument();
    }
  });

  it("marks inactive and sms_only options with approximate-estimate suffix", async () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
    });
    expect(getAudienceOptionLabel("inactive")).toContain("оценка");
    expect(getAudienceOptionLabel("sms_only")).toContain("оценка");
    const inactiveBtn = screen.getByRole("button", { name: getAudienceOptionLabel("inactive") });
    expect(inactiveBtn).toBeInTheDocument();
  });

  it("calls onChange with correct filter value when option is selected", async () => {
    const onChange = vi.fn();
    render(<BroadcastAudienceSelect value="" onChange={onChange} />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "true");
    });
    await userEvent.click(
      screen.getByRole("button", { name: getAudienceOptionLabel("with_telegram") }),
    );
    expect(onChange).toHaveBeenCalledWith("with_telegram");
  });

  it("is disabled when disabled prop is true", () => {
    render(<BroadcastAudienceSelect value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
