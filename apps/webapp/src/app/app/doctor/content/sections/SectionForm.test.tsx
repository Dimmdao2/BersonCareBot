/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveContentSectionMock = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  saveContentSection: saveContentSectionMock,
  renameContentSectionSlug: vi.fn(),
}));

vi.mock("../MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: ({ value }: { value: string }) => (
    <div data-testid="media-picker">{value || "empty"}</div>
  ),
}));

import { SectionForm } from "./SectionForm";

describe("SectionForm", () => {
  beforeEach(() => {
    saveContentSectionMock.mockReset();
  });

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
        pagesInSection={3}
      />,
    );
    expect(screen.getAllByDisplayValue("warmups").length).toBeGreaterThan(0);
    expect(screen.getByText("Переименовать slug…")).toBeInTheDocument();
    expect((document.querySelector('input[name="cover_image_url"]') as HTMLInputElement).value).toContain("/api/media/");
    expect((document.querySelector('input[name="icon_image_url"]') as HTMLInputElement).value).toContain("/api/media/");
  });

  it("prefills slug from initialSuggestedSlug", () => {
    render(<SectionForm initialSuggestedSlug="office-work" />);
    const slugInput = document.querySelector('input[name="slug"]') as HTMLInputElement;
    expect(slugInput.value).toBe("office-work");
  });

  it("shows patient-home return banner after successful save", async () => {
    const user = userEvent.setup();
    saveContentSectionMock.mockResolvedValueOnce({ ok: true });
    render(
      <SectionForm
        initialSuggestedSlug="office-work"
        patientHomeContext={{ returnTo: "/app/doctor/patient-home", patientHomeBlock: "situations" }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /заголовок/i }), "Офисная работа");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Раздел сохранён");
    });
    expect(screen.getByRole("link", { name: /главная пациента/i })).toHaveAttribute(
      "href",
      "/app/doctor/patient-home",
    );
  });
});
