import { describe, expect, it, vi } from "vitest";
import { wrapBookingEngineMembershipHooks } from "./wrapBookingEngineMembershipHooks";

describe("wrapBookingEngineMembershipHooks", () => {
  it("calls onVisitConfirmed after visit_confirmed transition", async () => {
    const onVisitConfirmed = vi.fn().mockResolvedValue({ skipped: true });
    const bookingEngine = {
      transitionAppointmentStatus: vi.fn().mockResolvedValue({
        id: "a1",
        organizationId: "org-1",
      }),
    };
    wrapBookingEngineMembershipHooks(
      bookingEngine as unknown as Parameters<typeof wrapBookingEngineMembershipHooks>[0],
      { onVisitConfirmed } as unknown as Parameters<typeof wrapBookingEngineMembershipHooks>[1],
    );
    await bookingEngine.transitionAppointmentStatus({
      appointmentId: "a1",
      toStatus: "visit_confirmed",
    });
    expect(onVisitConfirmed).toHaveBeenCalledWith("a1", "org-1");
  });
});
