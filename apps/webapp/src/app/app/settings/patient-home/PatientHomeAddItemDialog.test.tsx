/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  buildPatientHomeSectionsNewUrl,
  PATIENT_HOME_CMS_DEFAULT_RETURN_PATH,
} from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { PatientHomeAddItemDialog } from "./PatientHomeAddItemDialog";

const listPatientHomeCandidatesMock = vi.fn();
const addPatientHomeItemMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("./actions", () => ({
  listPatientHomeCandidates: (...args: unknown[]) => listPatientHomeCandidatesMock(...args),
  addPatientHomeItem: (...args: unknown[]) => addPatientHomeItemMock(...args),
}));

describe("PatientHomeAddItemDialog", () => {
  beforeEach(() => {
    listPatientHomeCandidatesMock.mockReset();
    addPatientHomeItemMock.mockReset();
  });

  it("shows CMS shortcut links when candidates empty and block is CMS-managed", async () => {
    listPatientHomeCandidatesMock.mockResolvedValue({ ok: true, items: [] });
    render(
      <PatientHomeAddItemDialog open onOpenChange={vi.fn()} blockCode="situations" onSaved={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByTestId("patient-home-add-item-cms-shortcuts")).toBeInTheDocument());
    const returnTo = PATIENT_HOME_CMS_DEFAULT_RETURN_PATH;
    const block = "situations" as const;
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      buildPatientHomeSectionsNewUrl({ returnTo, patientHomeBlock: block }),
    ]);
  });

  it("hides shortcuts when candidates are not empty", async () => {
    listPatientHomeCandidatesMock.mockResolvedValue({
      ok: true,
      items: [
        {
          targetType: "content_section",
          targetRef: "sec-a",
          title: "A",
          subtitle: null,
          imageUrl: null,
        },
      ],
    });
    render(
      <PatientHomeAddItemDialog open onOpenChange={vi.fn()} blockCode="situations" onSaved={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText("A")).toBeInTheDocument());
    expect(screen.queryByTestId("patient-home-add-item-cms-shortcuts")).toBeNull();
  });

  it("hides shortcuts for non-CMS block even when list empty", async () => {
    listPatientHomeCandidatesMock.mockResolvedValue({ ok: true, items: [] });
    render(<PatientHomeAddItemDialog open onOpenChange={vi.fn()} blockCode="booking" onSaved={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Ничего не найдено.")).toBeInTheDocument());
    expect(screen.queryByTestId("patient-home-add-item-cms-shortcuts")).toBeNull();
  });
});
