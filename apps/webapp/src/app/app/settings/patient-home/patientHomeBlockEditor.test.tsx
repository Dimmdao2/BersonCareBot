/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientHomeBlockPreview } from "@/app/app/settings/patient-home/PatientHomeBlockPreview";
import { PatientHomeBlockSettingsCard } from "@/app/app/settings/patient-home/PatientHomeBlockSettingsCard";
import { getDemoPatientHomeEditorPayload } from "@/modules/patient-home/patientHomeEditorDemo";
import { PatientHomeBlockCandidatePicker } from "@/app/app/settings/patient-home/PatientHomeBlockCandidatePicker";
import { useState } from "react";

describe("PatientHomeBlockPreview", () => {
  it("shows visible-empty warning for situations when block is visible and has no items", () => {
    render(<PatientHomeBlockPreview blockCode="situations" isBlockVisible visibleItemsCount={0} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/не появится, пока нет видимых элементов/i);
  });

  it("shows non-item explanation for lfk_progress", () => {
    render(<PatientHomeBlockPreview blockCode="lfk_progress" isBlockVisible visibleItemsCount={0} />);
    const root = screen.getByTestId("patient-home-block-preview");
    expect(root).toHaveTextContent(/не настраивается списком/i);
    expect(root).toHaveTextContent(/ЛФК/i);
  });

  it("lists unresolved reasons", () => {
    render(
      <PatientHomeBlockPreview
        blockCode="courses"
        isBlockVisible
        visibleItemsCount={1}
        unresolvedRefs={[{ kind: "course_unpublished", targetKey: "c1" }]}
      />,
    );
    expect(screen.getByText(/не опубликован/i)).toBeTruthy();
  });
});

describe("PatientHomeBlockSettingsCard (Phase 2)", () => {
  it("shows «Настроить» for situations", () => {
    const { items, candidates } = getDemoPatientHomeEditorPayload("situations");
    render(
      <PatientHomeBlockSettingsCard
        blockCode="situations"
        isBlockVisible
        visibleItemsCount={0}
        initialItems={items}
        initialCandidates={candidates}
      />,
    );
    expect(screen.getByRole("button", { name: /настроить/i })).toBeTruthy();
  });

  it("opens unified editor from card", async () => {
    const user = userEvent.setup();
    const { items, candidates } = getDemoPatientHomeEditorPayload("situations");
    render(
      <PatientHomeBlockSettingsCard
        blockCode="situations"
        isBlockVisible
        visibleItemsCount={0}
        initialItems={items}
        initialCandidates={candidates}
      />,
    );
    await user.click(screen.getByRole("button", { name: /настроить/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Настроить:/i)).toBeTruthy();
    expect(within(dialog).getByText(/Элементы блока/i)).toBeTruthy();
  });

  it("shows repair CTA for unresolved item", async () => {
    const user = userEvent.setup();
    const { items, candidates } = getDemoPatientHomeEditorPayload("situations");
    render(
      <PatientHomeBlockSettingsCard
        blockCode="situations"
        isBlockVisible
        visibleItemsCount={0}
        initialItems={items}
        initialCandidates={candidates}
      />,
    );
    await user.click(screen.getByRole("button", { name: /настроить/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /исправить/i })).toBeTruthy();
  });
});

function PickerHarness({ withInline }: { withInline?: boolean }) {
  const [search, setSearch] = useState("");
  return (
    <PatientHomeBlockCandidatePicker
      blockCode="situations"
      candidates={[]}
      search={search}
      onSearchChange={setSearch}
      onPick={() => {}}
      onInlineSectionCreated={withInline ? () => {} : undefined}
    />
  );
}

describe("PatientHomeBlockCandidatePicker", () => {
  it("shows link to CMS new section when inline handler omitted", () => {
    render(<PickerHarness />);
    const link = screen.getByRole("link", { name: /создать раздел/i });
    expect(link.getAttribute("href")).toContain("/app/doctor/content/sections/new");
    expect(link.getAttribute("href")).toContain("patientHomeBlock=situations");
  });

  it("shows inline create form when onInlineSectionCreated provided", () => {
    render(<PickerHarness withInline />);
    expect(screen.getByTestId("patient-home-inline-create-section")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /создать раздел/i })).toBeNull();
  });

  it("groups subscription_carousel candidates by type and shows grouped create CTAs", () => {
    const { candidates } = getDemoPatientHomeEditorPayload("subscription_carousel");
    render(
      <PatientHomeBlockCandidatePicker
        blockCode="subscription_carousel"
        candidates={candidates}
        search=""
        onSearchChange={() => {}}
        onPick={() => {}}
      />,
    );
    expect(screen.getByText("Разделы")).toBeTruthy();
    expect(screen.getByText("Материалы")).toBeTruthy();
    expect(screen.getByText("Курсы")).toBeTruthy();
    const mat = screen.getByRole("link", { name: /создать материал в cms/i });
    expect(mat.getAttribute("href")).toContain("patientHomeBlock=subscription_carousel");
    const crs = screen.getByRole("link", { name: /создать курс/i });
    expect(crs.getAttribute("href")).toContain("/app/doctor/courses/new");
  });
});
