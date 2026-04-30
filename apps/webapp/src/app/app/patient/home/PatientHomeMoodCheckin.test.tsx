/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import { PatientHomeMoodCheckin } from "./PatientHomeMoodCheckin";

const defaultMoodOptions = parsePatientHomeMoodIcons(null);

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("react-hot-toast", () => ({
  default: { error: toastError },
}));

describe("PatientHomeMoodCheckin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("shows login prompt for anonymous guest", () => {
    render(
      <PatientHomeMoodCheckin moodOptions={defaultMoodOptions} personalTierOk={false} anonymousGuest initialMood={null} />,
    );
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("shows activation hint without patient tier", () => {
    render(
      <PatientHomeMoodCheckin moodOptions={defaultMoodOptions} personalTierOk={false} anonymousGuest={false} initialMood={null} />,
    );
    expect(screen.getByText(/будет доступен после активации профиля/i)).toBeInTheDocument();
  });

  it("renders five mood icon buttons and highlights saved score", () => {
    render(
      <PatientHomeMoodCheckin
        moodOptions={defaultMoodOptions}
        personalTierOk
        anonymousGuest={false}
        initialMood={{ moodDate: "2026-04-28", score: 4 }}
      />,
    );

    expect(screen.getAllByRole("button", { name: /Самочувствие/i })).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Самочувствие 4 из 5/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Записано/i)).toBeInTheDocument();
  });

  it("optimistically saves selected score", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, mood: { moodDate: "2026-04-28", score: 5 } }),
    } as Response);

    render(
      <PatientHomeMoodCheckin moodOptions={defaultMoodOptions} personalTierOk anonymousGuest={false} initialMood={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Самочувствие 5 из 5/i }));
    expect(screen.getByRole("button", { name: /Самочувствие 5 из 5/i })).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/patient/mood",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    const call = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body).toEqual({ score: 5 });
    expect(refresh).toHaveBeenCalled();
  });

  it("rolls back optimistic selection on error", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false }),
    } as Response);

    render(
      <PatientHomeMoodCheckin
        moodOptions={defaultMoodOptions}
        personalTierOk
        anonymousGuest={false}
        initialMood={{ moodDate: "2026-04-28", score: 4 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Самочувствие 2 из 5/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Самочувствие 4 из 5/i })).toHaveAttribute("aria-pressed", "true");
    });
    expect(toastError).toHaveBeenCalledWith("Не удалось сохранить, попробуйте позже.");
  });
});
