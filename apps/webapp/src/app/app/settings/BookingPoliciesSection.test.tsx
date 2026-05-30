/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingPoliciesSection } from "./BookingPoliciesSection";

const fetchMock = vi.fn();

const policiesResponse = {
  ok: true,
  cancellationPolicies: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "org-1",
      scopeLevel: "organization",
      scopeEntityId: null,
      title: "org-cancel",
      isActive: true,
      freeCancelHoursBefore: 72,
      cancellationAllowed: true,
      lateCancellationBehavior: "retain_prepayment",
      refundPrepaymentOnLate: "manual",
      chargePackageSessionOnLate: true,
      requiresStaffConfirmation: false,
      notifyPatient: false,
      notifyStaff: true,
      sortOrder: 0,
    },
  ],
  reschedulePolicies: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      organizationId: "org-1",
      scopeLevel: "organization",
      scopeEntityId: null,
      title: "org-reschedule",
      isActive: true,
      selfRescheduleHoursBefore: 48,
      maxSelfReschedules: 3,
      allowDifferentBranch: true,
      allowDifferentCity: true,
      allowDifferentSpecialist: false,
      allowDifferentService: true,
      limitExceededBehavior: "deny",
      requiresStaffConfirmation: false,
      notifyPatient: true,
      notifyStaff: false,
      sortOrder: 0,
    },
  ],
};

describe("BookingPoliciesSection", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ json: async () => policiesResponse })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, specialists: [], services: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, products: [] }) })
      .mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("saves cancellation policy without hardcoded overwrite", async () => {
    const user = userEvent.setup();
    render(<BookingPoliciesSection />);
    const saveButton = await screen.findByRole("button", { name: "Сохранить отмену" });
    await user.click(saveButton);

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/admin/booking-engine/policies" && (c[1] as RequestInit)?.method === "POST",
      );
      expect(saveCall).toBeDefined();
    });
    const saveCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/admin/booking-engine/policies" && (c[1] as RequestInit)?.method === "POST",
    );
    const body = JSON.parse(String(saveCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body.kind).toBe("cancellation");
    expect(body.lateCancellationBehavior).toBe("retain_prepayment");
    expect(body.chargePackageSessionOnLate).toBe(true);
    expect(body.notifyPatient).toBe(false);
    expect(body.notifyStaff).toBe(true);
  });

  it("saves reschedule policy with full flags model", async () => {
    const user = userEvent.setup();
    render(<BookingPoliciesSection />);
    await screen.findByRole("button", { name: "Сохранить отмену" });

    const kindSelect = screen.getAllByRole("combobox")[1];
    await user.click(kindSelect);
    await user.click(screen.getByRole("option", { name: "Перенос" }));
    await user.click(await screen.findByRole("button", { name: "Сохранить перенос" }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        (c) =>
          c[0] === "/api/admin/booking-engine/policies" &&
          (c[1] as RequestInit)?.method === "POST" &&
          String((c[1] as RequestInit)?.body ?? "").includes("reschedule"),
      );
      expect(saveCall).toBeDefined();
    });
    const saveCall = fetchMock.mock.calls.find(
      (c) =>
        c[0] === "/api/admin/booking-engine/policies" &&
        (c[1] as RequestInit)?.method === "POST" &&
        String((c[1] as RequestInit)?.body ?? "").includes("reschedule"),
    );
    const body = JSON.parse(String(saveCall?.[1]?.body ?? "{}")) as Record<string, unknown>;
    expect(body.kind).toBe("reschedule");
    expect(body.allowDifferentBranch).toBe(true);
    expect(body.allowDifferentCity).toBe(true);
    expect(body.allowDifferentService).toBe(true);
    expect(body.limitExceededBehavior).toBe("deny");
    expect(body.notifyStaff).toBe(false);
  });
});
