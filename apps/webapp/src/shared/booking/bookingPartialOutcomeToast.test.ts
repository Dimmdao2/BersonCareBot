import { describe, expect, it, vi } from "vitest";
import toast from "react-hot-toast";
import {
  parsePatientBookingPartialOutcome,
  showBookingPartialOutcomeToast,
} from "./bookingPartialOutcomeToast";

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

describe("bookingPartialOutcomeToast", () => {
  it("parsePatientBookingPartialOutcome picks rubitimeMirrorFailed", () => {
    expect(parsePatientBookingPartialOutcome({ ok: true })).toBeUndefined();
    expect(parsePatientBookingPartialOutcome({ rubitimeMirrorFailed: true })).toEqual({
      rubitimeMirrorFailed: true,
    });
    expect(parsePatientBookingPartialOutcome({ notificationOutcomeFailed: true })).toBeUndefined();
  });

  it("showBookingPartialOutcomeToast warns on rubitime mirror failure", () => {
    showBookingPartialOutcomeToast({ rubitimeMirrorFailed: true });
    expect(toast).toHaveBeenCalledWith(
      "Запись обновлена. Синхронизация с расписанием может занять время.",
      expect.objectContaining({ icon: "⚠️" }),
    );
  });

  it("showBookingPartialOutcomeToast is silent without flags", () => {
    vi.mocked(toast).mockClear();
    showBookingPartialOutcomeToast(undefined);
    showBookingPartialOutcomeToast({});
    expect(toast).not.toHaveBeenCalled();
  });
});
