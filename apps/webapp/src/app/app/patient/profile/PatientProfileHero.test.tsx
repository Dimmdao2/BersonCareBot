/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientProfileHero } from "./PatientProfileHero";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/ui/auth/PhoneMessengerAuthFlow", () => ({
  PhoneMessengerAuthFlow: ({ title }: { title?: string }) => (
    <div data-testid="phone-messenger-auth-flow">{title ?? ""}</div>
  ),
}));

describe("PatientProfileHero", () => {
  it("shows inline phone messenger flow when no phone (no bind-phone redirect link)", () => {
    render(
      <PatientProfileHero
        displayName="Test"
        phone={null}
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );

    expect(screen.getByTestId("phone-messenger-auth-flow")).toBeInTheDocument();
    expect(screen.getByText("Привязать номер")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Привязать номер" })).not.toBeInTheDocument();
  });

  it("shows messenger bind flow when editing phone", async () => {
    const user = userEvent.setup();
    render(
      <PatientProfileHero
        displayName="Test"
        phone="+79991234567"
        supportContactHref="https://support.example"
        fallbackDisplayName="."
        initialEmail={null}
        emailVerified={false}
      />,
    );

    const editButtons = screen.getAllByRole("button", { name: "Изменить" });
    await user.click(editButtons[1]!);

    expect(screen.getByTestId("phone-messenger-auth-flow")).toBeInTheDocument();
    expect(screen.getByText("Изменить номер")).toBeInTheDocument();
  });
});
