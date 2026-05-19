/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientProfileHero } from "./PatientProfileHero";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/app/patient/bind-phone/PatientBindPhoneClient", () => ({
  PatientBindPhoneClient: ({ hint }: { hint?: string }) => (
    <div data-testid="patient-bind-phone-client">{hint ?? ""}</div>
  ),
}));

vi.mock("@/app/app/patient/bind-phone/PatientBrowserMessengerBindPanel", () => ({
  PatientBrowserMessengerBindPanel: () => <div data-testid="profile-messenger-bind-panel">bind</div>,
}));

describe("PatientProfileHero", () => {
  it("shows messenger bind flow when editing phone (no SMS / BindPhoneBlock)", async () => {
    const user = userEvent.setup();
    render(
      <PatientProfileHero
        displayName="Test"
        phone="+79991234567"
        telegramId=""
        maxId=""
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );

    const editButtons = screen.getAllByRole("button", { name: "Изменить" });
    await user.click(editButtons[1]!);

    expect(screen.getByTestId("patient-bind-phone-client")).toBeInTheDocument();
    expect(screen.getByTestId("patient-bind-phone-client").textContent).toContain("SMS в профиле не используется");
    expect(screen.queryByText(/кодом из SMS/i)).not.toBeInTheDocument();
  });

  it("shows browser messenger bind in hero when Telegram and MAX are not linked", () => {
    render(
      <PatientProfileHero
        displayName="Test"
        phone="+79991234567"
        telegramId=""
        maxId=""
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );
    expect(screen.getByTestId("profile-messenger-bind-panel")).toBeInTheDocument();
  });
});
