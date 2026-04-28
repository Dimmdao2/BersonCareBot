/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  saveContentSection: vi.fn(),
}));

vi.mock("../MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: ({ value }: { value: string }) => (
    <div data-testid="media-picker">{value || "empty"}</div>
  ),
}));

import { SectionForm } from "./SectionForm";

describe("SectionForm", () => {
  it("renders cover and icon picker fields", () => {
    render(<SectionForm />);
    expect(document.querySelector('input[name="cover_image_url"]')).not.toBeNull();
    expect(document.querySelector('input[name="icon_image_url"]')).not.toBeNull();
    expect(screen.getAllByTestId("media-picker")).toHaveLength(2);
  });

  it("renders section values in edit mode", () => {
    render(
      <SectionForm
        section={{
          slug: "warmups",
          title: "Разминки",
          description: "desc",
          sortOrder: 2,
          isVisible: true,
          requiresAuth: false,
          coverImageUrl: "/api/media/11111111-1111-1111-1111-111111111111",
          iconImageUrl: "/api/media/22222222-2222-2222-2222-222222222222",
        }}
      />,
    );
    expect(screen.getAllByDisplayValue("warmups").length).toBeGreaterThan(0);
    expect((document.querySelector('input[name="cover_image_url"]') as HTMLInputElement).value).toContain("/api/media/");
    expect((document.querySelector('input[name="icon_image_url"]') as HTMLInputElement).value).toContain("/api/media/");
  });
});
