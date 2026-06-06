import { describe, expect, it, vi } from "vitest";
import {
  rollbackFailedRubitimeCreate,
  waitForRubitimeProjectionMapping,
} from "./rubitimeCreateRollback";

describe("rubitimeCreateRollback", () => {
  it("waitForRubitimeProjectionMapping returns id on first attempt", async () => {
    const getAppointmentIdByRubitimeExternalId = vi
      .fn()
      .mockResolvedValue("appt-1");
    const id = await waitForRubitimeProjectionMapping(
      { getAppointmentIdByRubitimeExternalId } as never,
      { organizationId: "org-1", rubitimeId: "rt-1", attempts: 3, delayMs: 1 },
    );
    expect(id).toBe("appt-1");
    expect(getAppointmentIdByRubitimeExternalId).toHaveBeenCalledTimes(1);
  });

  it("waitForRubitimeProjectionMapping retries until mapping appears", async () => {
    const getAppointmentIdByRubitimeExternalId = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("appt-2");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const id = await waitForRubitimeProjectionMapping(
      { getAppointmentIdByRubitimeExternalId } as never,
      {
        organizationId: "org-1",
        rubitimeId: "rt-2",
        attempts: 5,
        delayMs: 10,
        sleep,
      },
    );
    expect(id).toBe("appt-2");
    expect(getAppointmentIdByRubitimeExternalId).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("waitForRubitimeProjectionMapping returns null after exhausted attempts", async () => {
    const getAppointmentIdByRubitimeExternalId = vi.fn().mockResolvedValue(null);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const id = await waitForRubitimeProjectionMapping(
      { getAppointmentIdByRubitimeExternalId } as never,
      {
        organizationId: "org-1",
        rubitimeId: "rt-3",
        attempts: 2,
        delayMs: 1,
        sleep,
      },
    );
    expect(id).toBeNull();
    expect(getAppointmentIdByRubitimeExternalId).toHaveBeenCalledTimes(2);
  });

  it("rollbackFailedRubitimeCreate calls deleteRecord and cancels canonical row", async () => {
    const deleteRecord = vi.fn().mockResolvedValue(undefined);
    const transitionAppointmentStatus = vi.fn().mockResolvedValue({});
    await rollbackFailedRubitimeCreate({
      syncPort: { deleteRecord } as never,
      bookingEngine: {
        getAppointmentIdByRubitimeExternalId: vi.fn(),
        transitionAppointmentStatus,
      } as never,
      organizationId: "org-1",
      rubitimeId: "rt-4",
      appointmentId: "appt-4",
    });
    expect(deleteRecord).toHaveBeenCalledWith("rt-4");
    expect(transitionAppointmentStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appt-4",
        toStatus: "cancelled_by_specialist",
      }),
    );
  });
});
