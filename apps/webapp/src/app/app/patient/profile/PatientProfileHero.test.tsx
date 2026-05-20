/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientProfileHero } from "./PatientProfileHero";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: pushMock }),
}));

describe("PatientProfileHero", () => {
  it("shows bind link when no phone and redirects to bind-phone", async () => {
    pushMock.mockClear();
    const user = userEvent.setup();
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

    const bindButtons = screen.getAllByRole("button", { name: "Привязать" });
    expect(bindButtons).toHaveLength(2);
    expect(screen.queryByLabelText("Номер телефона")).not.toBeInTheDocument();

    await user.click(bindButtons[0]!);

    expect(pushMock).toHaveBeenCalledWith(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}`,
    );
  });

  it("shows phone and redirects to bind-phone when editing", async () => {
    pushMock.mockClear();
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

    expect(screen.getByText("+79991234567")).toBeInTheDocument();

    const editButtons = screen.getAllByRole("button", { name: "Изменить" });
    await user.click(editButtons[1]!);

    expect(pushMock).toHaveBeenCalledWith(
      `${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}`,
    );
  });
});
