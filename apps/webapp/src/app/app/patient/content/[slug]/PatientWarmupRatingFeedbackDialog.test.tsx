/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientWarmupRatingFeedbackDialog } from "./PatientWarmupRatingFeedbackDialog";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("PatientWarmupRatingFeedbackDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, id: "fb-1" }),
      })) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables submit until reason or comment provided", async () => {
    render(
      <PatientWarmupRatingFeedbackDialog
        open
        onOpenChange={() => {}}
        contentPageId={PAGE_ID}
        ratingValue={2}
      />,
    );
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Слишком сложно" }));
    expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
  });

  it("submits feedback and closes", async () => {
    const onOpenChange = vi.fn();
    render(
      <PatientWarmupRatingFeedbackDialog
        open
        onOpenChange={onOpenChange}
        contentPageId={PAGE_ID}
        ratingValue={1}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Качество видео" }));
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/patient/material-ratings/feedback"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(PAGE_ID),
      }),
    );
  });

  it("skip closes without submit", async () => {
    const onOpenChange = vi.fn();
    render(
      <PatientWarmupRatingFeedbackDialog
        open
        onOpenChange={onOpenChange}
        contentPageId={PAGE_ID}
        ratingValue={3}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Пропустить" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("close button closes without submit", async () => {
    const onOpenChange = vi.fn();
    render(
      <PatientWarmupRatingFeedbackDialog
        open
        onOpenChange={onOpenChange}
        contentPageId={PAGE_ID}
        ratingValue={2}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("click outside closes without submit", async () => {
    const onOpenChange = vi.fn();
    render(
      <PatientWarmupRatingFeedbackDialog
        open
        onOpenChange={onOpenChange}
        contentPageId={PAGE_ID}
        ratingValue={2}
      />,
    );
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
