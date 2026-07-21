/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentStaffCommentsSection } from "./AppointmentStaffCommentsSection";

describe("AppointmentStaffCommentsSection", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, comments: [] }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps comment submission disabled for empty and whitespace-only drafts", async () => {
    render(<AppointmentStaffCommentsSection appointmentId="appointment-1" />);
    const submit = screen.getByRole("button", { name: "Добавить комментарий" });
    const textarea = screen.getByPlaceholderText("Комментарий к записи");

    expect(submit).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "   \n" } });
    expect(submit).toBeDisabled();
    fireEvent.change(textarea, { target: { value: "Комментарий" } });
    expect(submit).toBeEnabled();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
