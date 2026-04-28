/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PatientContentPracticeComplete } from "./PatientContentPracticeComplete";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
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
      />,
    );
    expect(screen.getByRole("link", { name: /Войдите/i })).toBeInTheDocument();
  });

  it("submits feeling via API", async () => {
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Я выполнил\(а\) практику/i }));
    fireEvent.click(screen.getByRole("button", { name: /Оценка 3 из 5/i }));

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
  });
});
