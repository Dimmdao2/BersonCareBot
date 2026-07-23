/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from "@/shared/ui/doctor/DoctorDnaFlatListRow";
import { TeamSection } from "./TeamSection";

const refreshMock = vi.hoisted(() => vi.fn());
const apiJsonMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/shared/lib/apiJson", () => ({ apiJson: (...args: unknown[]) => apiJsonMock(...args) }));

const baseSeats = { limit: 3, used: 1, available: 2 };

function expectClassContract(element: HTMLElement, contract: string) {
  expect(element).toHaveClass(...contract.split(" "));
}

describe("TeamSection", () => {
  beforeEach(() => {
    refreshMock.mockClear();
    apiJsonMock.mockReset();
  });

  it("renders both existing Settings lists with the shared non-clickable DNA row contract", () => {
    render(
      <TeamSection
        members={[
          { id: "m1", displayName: "Иван Иванов", role: "owner", status: "active", seatConsuming: true },
          { id: "m2", displayName: null, role: "admin", status: "active", seatConsuming: false },
        ]}
        invites={[{ id: "i1", invitedEmail: "new@example.com", invitedRole: "doctor", expiresAt: "2026-08-01T00:00:00.000Z" }]}
        seats={baseSeats}
      />,
    );
    expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(screen.getByText("Занято мест: 1 из 3")).toBeInTheDocument();

    const memberList = screen.getByRole("list", { name: "Участники команды" });
    const inviteList = screen.getByRole("list", { name: "Приглашения в ожидании" });
    expectClassContract(memberList, doctorDnaFlatListClass);
    expectClassContract(inviteList, doctorDnaFlatListClass);

    for (const row of [...memberList.children, ...inviteList.children]) {
      expectClassContract(row as HTMLElement, doctorDnaFlatListRowClass);
      expect(row).not.toHaveAttribute("aria-pressed");
      expect(row).not.toHaveClass(
        "cursor-pointer",
        "bg-card",
        "bg-primary/15",
        "rounded-[var(--doctor-control-radius,24px)]",
      );
    }
    expectClassContract(screen.getByText("Иван Иванов"), doctorDnaFlatListPrimaryClass);
    expectClassContract(screen.getByText("new@example.com"), doctorDnaFlatListPrimaryClass);
    expectClassContract(within(inviteList).getByText("Врач"), doctorDnaFlatListMetaClass);
  });

  it("submits an invite for the default doctor role and refreshes on success", async () => {
    apiJsonMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<TeamSection members={[]} invites={[]} seats={baseSeats} />);

    await user.type(screen.getByPlaceholderText("email@example.com"), "doctor@example.com");
    await user.click(screen.getByRole("button", { name: "Пригласить" }));

    await waitFor(() => expect(apiJsonMock).toHaveBeenCalledWith(
      "/api/clinic/invites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com", role: "doctor" }),
      }),
    ));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a seat-limit message and does not refresh when the server rejects the invite", async () => {
    apiJsonMock.mockRejectedValue(new Error("seat_limit_reached"));
    const user = userEvent.setup();
    render(<TeamSection members={[]} invites={[]} seats={{ limit: 1, used: 1, available: 0 }} />);

    await user.type(screen.getByPlaceholderText("email@example.com"), "doctor@example.com");
    await user.click(screen.getByRole("button", { name: "Пригласить" }));

    await waitFor(() =>
      expect(
        screen.getByText("Достигнут лимит мест специалистов по тарифу. Освободите место или расширьте тариф."),
      ).toBeInTheDocument(),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("revokes a pending invite and refreshes", async () => {
    apiJsonMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <TeamSection
        members={[]}
        invites={[{ id: "i1", invitedEmail: "new@example.com", invitedRole: "doctor", expiresAt: "2026-08-01T00:00:00.000Z" }]}
        seats={baseSeats}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Отозвать" }));

    await waitFor(() => expect(apiJsonMock).toHaveBeenCalledWith("/api/clinic/invites/i1", { method: "DELETE" }));
    expect(refreshMock).toHaveBeenCalled();
  });
});
