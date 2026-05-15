/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { parsePatientHomeMoodIcons } from "@/modules/patient-home/patientHomeMoodIcons";
import { PatientContentPracticeComplete } from "./PatientContentPracticeComplete";

const DEFAULT_MOOD_ICONS = parsePatientHomeMoodIcons(null);

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

describe("PatientContentPracticeComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("shows login prompt for guest", () => {
    render(
      <PatientContentPracticeComplete
        contentPageId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        contentPath="/app/patient/content/x"
        practiceSource="section_page"
        guest
        needsActivation={false}
        moodIconOptions={DEFAULT_MOOD_ICONS}
      />,
    );
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("submits feeling via API (single POST)", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, id: "c1" }),
    } as Response);

    render(
      <PatientContentPracticeComplete
        contentPageId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        contentPath="/app/patient/content/x"
        practiceSource="section_page"
        guest={false}
        needsActivation={false}
        moodIconOptions={DEFAULT_MOOD_ICONS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Я выполнил\(а\) практику/i }));
    fireEvent.click(screen.getByRole("button", { name: /Самочувствие 3 из 5/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/patient/practice/completion",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    const call = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body).toMatchObject({
      contentPageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      source: "section_page",
      feeling: 3,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("daily_warmup: POST then PATCH, stay on page and show completed status", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, id: "warmup-completion-1" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);

    render(
      <PatientContentPracticeComplete
        contentPageId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        contentPath="/app/patient/content/x"
        practiceSource="daily_warmup"
        guest={false}
        needsActivation={false}
        moodIconOptions={DEFAULT_MOOD_ICONS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отметить выполнение/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const postCall = vi.mocked(global.fetch).mock.calls[0];
    expect(postCall[0]).toBe("/api/patient/practice/completion");
    expect(JSON.parse((postCall[1] as { body: string }).body)).toMatchObject({
      feeling: null,
      source: "daily_warmup",
    });

    fireEvent.click(screen.getByRole("button", { name: /Самочувствие 5 из 5/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenCalled();
    });
    expect(push).not.toHaveBeenCalled();
    const patchUrl = vi.mocked(global.fetch).mock.calls[1][0] as string;
    expect(patchUrl).toContain("/api/patient/practice/completion/warmup-completion-1/feeling");

    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: /Разминка отмечена выполненной/i }),
      ).toHaveTextContent(/Разминка выполнена/i);
    });
  });

  it("daily_warmup: clears POST guard when fetch throws so a second click retries", async () => {
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, id: "warmup-after-retry" }),
      } as Response);

    render(
      <PatientContentPracticeComplete
        contentPageId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        contentPath="/app/patient/content/x"
        practiceSource="daily_warmup"
        guest={false}
        needsActivation={false}
        moodIconOptions={DEFAULT_MOOD_ICONS}
      />,
    );

    const cta = screen.getByRole("button", { name: /Отметить выполнение/i });
    fireEvent.click(cta);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(cta);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("daily_warmup: no skip button in modal", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, id: "c-warm" }),
    } as Response);

    render(
      <PatientContentPracticeComplete
        contentPageId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        contentPath="/app/patient/content/x"
        practiceSource="daily_warmup"
        guest={false}
        needsActivation={false}
        moodIconOptions={DEFAULT_MOOD_ICONS}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отметить выполнение/i }));

    await waitFor(() => {
      expect(screen.getByText(/Как самочувствие после разминки/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Пропустить/i })).not.toBeInTheDocument();
  });
});
