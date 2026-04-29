/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientHomeCreateSectionInlineDialog } from "./PatientHomeCreateSectionInlineDialog";

const createSectionMock = vi.fn();

vi.mock("./actions", () => ({
  createContentSectionForPatientHomeBlock: (...args: unknown[]) => createSectionMock(...args),
}));

describe("PatientHomeCreateSectionInlineDialog", () => {
  beforeEach(() => {
    createSectionMock.mockReset();
    createSectionMock.mockResolvedValue({
      ok: true,
      itemId: "550e8400-e29b-41d4-a716-446655440010",
      sectionSlug: "hello-world",
    });
  });

  it("auto-slugs from latin title and submit calls action", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PatientHomeCreateSectionInlineDialog
        open
        onOpenChange={onOpenChange}
        blockCode="situations"
        onSaved={onSaved}
      />,
    );
    await user.type(screen.getByTestId("ph-inline-section-title"), "Hello World");
    expect(screen.getByTestId("ph-inline-section-slug")).toHaveValue("hello-world");
    await user.click(screen.getByTestId("ph-inline-section-submit"));
    await waitFor(() => expect(createSectionMock).toHaveBeenCalled());
    expect(createSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockCode: "situations",
        title: "Hello World",
        slug: "hello-world",
        requiresAuth: false,
        isVisible: true,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("manual slug override then generate from title", async () => {
    const user = userEvent.setup();
    render(
      <PatientHomeCreateSectionInlineDialog
        open
        onOpenChange={vi.fn()}
        blockCode="situations"
        onSaved={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId("ph-inline-section-title"), "Hello");
    const slugInput = screen.getByTestId("ph-inline-section-slug");
    await user.clear(slugInput);
    await user.type(slugInput, "custom-slug");
    expect(slugInput).toHaveValue("custom-slug");
    await user.click(screen.getByTestId("ph-inline-section-slug-generate"));
    expect(slugInput).toHaveValue("hello");
  });

  it("shows server error and does not close on failure", async () => {
    createSectionMock.mockResolvedValue({ ok: false, error: "slug-taken" });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <PatientHomeCreateSectionInlineDialog
        open
        onOpenChange={onOpenChange}
        blockCode="situations"
        onSaved={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId("ph-inline-section-title"), "Hello World");
    await user.click(screen.getByTestId("ph-inline-section-submit"));
    await waitFor(() => expect(screen.getByTestId("ph-inline-section-error")).toHaveTextContent("slug-taken"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
