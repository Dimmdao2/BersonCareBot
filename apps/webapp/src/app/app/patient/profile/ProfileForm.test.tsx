/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "./ProfileForm";

beforeEach(() => {
  global.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ ok: true, calendarTimezone: null }), { status: 200 }),
    ) as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/app/patient/bind-phone/PatientBindPhoneClient", () => ({
  PatientBindPhoneClient: ({ hint }: { hint?: string }) => (
    <div data-testid="patient-bind-phone-client">{hint ?? ""}</div>
  ),
}));

describe("ProfileForm", () => {
  it("shows messenger bind flow when editing phone (no SMS / BindPhoneBlock)", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        displayName="Test"
        phone="+79991234567"
        telegramId=""
        maxId=""
        supportContactHref="https://support.example"
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
});
