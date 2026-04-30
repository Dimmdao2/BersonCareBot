/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeMoodIconsPanel } from "./PatientHomeMoodIconsPanel";

vi.mock("@/app/app/doctor/content/MediaLibraryPickerDialog", () => ({
  MediaLibraryPickerDialog: ({ value }: { value: string }) => (
    <button type="button">Изменить{value ? " выбранную иконку" : ""}</button>
  ),
}));

vi.mock("./patientHomeDoctorSettingsActions", () => ({
  savePatientHomeMoodIconsAction: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("PatientHomeMoodIconsPanel", () => {
  it("renders five compact score icon controls without editable labels", () => {
    render(
      <PatientHomeMoodIconsPanel
        initialOptions={[
          { score: 1, label: "Очень плохо", imageUrl: null },
          { score: 2, label: "Скорее плохо", imageUrl: null },
          { score: 3, label: "Нейтрально", imageUrl: null },
          { score: 4, label: "Хорошо", imageUrl: null },
          { score: 5, label: "Отлично", imageUrl: null },
        ]}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^Изменить/ })).toHaveLength(5);
    expect(screen.queryByLabelText(/Подпись для оценки/)).toBeNull();
    for (const score of [1, 2, 3, 4, 5]) {
      expect(screen.getAllByText(String(score)).length).toBeGreaterThan(0);
    }
  });
});
