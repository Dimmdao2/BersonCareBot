/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exercise, ExerciseUsageSnapshot } from "@/modules/lfk-exercises/types";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT } from "@/modules/lfk-exercises/types";
import type { ArchiveDoctorExerciseState, SaveDoctorExerciseState } from "./actionsShared";
import { ExerciseForm } from "./ExerciseForm";

vi.mock("@/app/app/doctor/content/MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: () => <div data-testid="media-picker" />,
}));

vi.mock("@/shared/ui/ReferenceSelect", () => ({
  ReferenceSelect: ({ value, name }: { value: string | null; name?: string }) => (
    <>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <input type="text" data-testid={name ? `${name}-select` : "region-select"} readOnly value={value ?? ""} />
    </>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorExerciseUsageSnapshot: vi.fn(async () => ({ ...EMPTY_EXERCISE_USAGE_SNAPSHOT })),
  };
});

function makeUsageWithTemplateRef(): ExerciseUsageSnapshot {
  return {
    ...EMPTY_EXERCISE_USAGE_SNAPSHOT,
    publishedLfkComplexTemplateCount: 1,
    publishedLfkComplexTemplateRefs: [
      { kind: "lfk_complex_template", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Комплекс тест" },
    ],
  };
}

function makeExercise(over: Partial<Exercise>): Exercise {
  return {
    id: "ex-1",
    title: "Title",
    description: null,
    regionRefId: null,
    loadType: null,
    difficulty1_10: 5,
    contraindications: null,
    tags: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    media: [],
    ...over,
  };
}

describe("ExerciseForm", () => {
  it("resets controlled fields when exercise id changes without remount key", () => {
    const saveAction = vi.fn(
      async (_prev: SaveDoctorExerciseState | null): Promise<SaveDoctorExerciseState> => ({ ok: true }),
    );
    const archiveAction = vi.fn(
      async (_prev: ArchiveDoctorExerciseState | null, _fd: FormData): Promise<ArchiveDoctorExerciseState> => ({
        ok: true,
      }),
    );

    const exA = makeExercise({
      id: "a",
      title: "Alpha",
      description: "Desc A",
      tags: ["knee"],
      contraindications: "None A",
    });
    const exB = makeExercise({
      id: "b",
      title: "Beta",
      description: "Desc B",
      tags: ["back"],
      contraindications: "None B",
    });

    const { rerender } = render(
      <ExerciseForm exercise={exA} saveAction={saveAction} archiveAction={archiveAction} />,
    );

    expect(screen.getByLabelText(/название/i)).toHaveValue("Alpha");
    expect(screen.getByLabelText(/описание/i)).toHaveValue("Desc A");
    expect(screen.getByLabelText(/теги/i)).toHaveValue("knee");
    expect(screen.getByLabelText(/противопоказания/i)).toHaveValue("None A");

    rerender(<ExerciseForm exercise={exB} saveAction={saveAction} archiveAction={archiveAction} />);

    expect(screen.getByLabelText(/название/i)).toHaveValue("Beta");
    expect(screen.getByLabelText(/описание/i)).toHaveValue("Desc B");
    expect(screen.getByLabelText(/теги/i)).toHaveValue("back");
    expect(screen.getByLabelText(/противопоказания/i)).toHaveValue("None B");
  });

  it("opens archive warning on USAGE_CONFIRMATION_REQUIRED and resubmits with acknowledgeUsageWarning", async () => {
    const user = userEvent.setup();
    const usageHeavy = makeUsageWithTemplateRef();
    const archiveAction = vi.fn(
      async (_prev: ArchiveDoctorExerciseState | null, fd: FormData): Promise<ArchiveDoctorExerciseState> => {
        const ack = fd.get("acknowledgeUsageWarning");
        if (ack === "1" || ack === "true" || ack === "on") {
          return { ok: true };
        }
        return { ok: false, code: "USAGE_CONFIRMATION_REQUIRED", usage: usageHeavy };
      },
    );

    render(
      <ExerciseForm
        exercise={makeExercise({ id: "ex-1" })}
        saveAction={vi.fn(async () => ({ ok: true }))}
        archiveAction={archiveAction}
        externalUsageSnapshot={usageHeavy}
      />,
    );

    await user.click(screen.getByRole("button", { name: /архивировать/i }));
    expect(await screen.findByRole("heading", { name: /элемент уже используется/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /архивировать всё равно/i }));

    await waitFor(() => expect(archiveAction).toHaveBeenCalledTimes(2));
    const secondFd = archiveAction.mock.calls[1][1] as FormData;
    expect(secondFd.get("acknowledgeUsageWarning")).toBe("1");
  });
});
