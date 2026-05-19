/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientShellPageTitleWithHistoryBack } from "./PatientShellPageTitleWithHistoryBack";

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}));

describe("PatientShellPageTitleWithHistoryBack", () => {
  beforeEach(() => {
    pushMock.mockClear();
    backMock.mockClear();
  });

  it("calls router.back when history has entries", async () => {
    vi.stubGlobal("history", { length: 2 });
    const user = userEvent.setup();
    render(
      <PatientShellPageTitleWithHistoryBack title="Расписание напоминаний" fallbackHref="/app/patient/profile" />,
    );
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(backMock).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("pushes fallback when history is empty", async () => {
    vi.stubGlobal("history", { length: 1 });
    const user = userEvent.setup();
    render(
      <PatientShellPageTitleWithHistoryBack title="Настройка уведомлений" fallbackHref="/app/patient/profile" />,
    );
    await user.click(screen.getByRole("button", { name: "Назад" }));
    expect(pushMock).toHaveBeenCalledWith("/app/patient/profile");
    expect(backMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
