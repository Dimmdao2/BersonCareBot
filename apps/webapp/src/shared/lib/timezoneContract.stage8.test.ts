/** Stage 8 UI contract: patient cabinet + doctor dashboard vs integrator bot (Moscow/Samara instants). */
import { describe, expect, it } from "vitest";
import {
  formatBookingDateTimeMediumRu,
  formatDoctorAppointmentRecordAt,
} from "./formatBusinessDateTime";

const MSK = "Europe/Moscow";
const SAMARA = "Europe/Samara";

describe("Stage 8 timezone contract (webapp UI)", () => {
  it("S8.T02: Moscow UTC instant — кабинет пациента и дашборд врача согласованы с контрактом", () => {
    const iso = "2026-04-07T08:00:00.000Z";
    expect(formatBookingDateTimeMediumRu(iso, MSK)).toBe("7 апр. 2026 г., 11:00");
    expect(formatDoctorAppointmentRecordAt(iso, MSK)).toBe("11:00 07.04");
  });

  it("S8.T03: Samara branch UTC instant — MSK vs Samara display texts", () => {
    const iso = "2026-04-07T07:00:00.000Z";
    expect(formatBookingDateTimeMediumRu(iso, MSK)).toBe("7 апр. 2026 г., 10:00");
    expect(formatBookingDateTimeMediumRu(iso, SAMARA)).toBe("7 апр. 2026 г., 11:00");
    expect(formatDoctorAppointmentRecordAt(iso, SAMARA)).toBe("11:00 07.04");
  });

  it("S8.T04b UI: без валидного instant форматтеры не выдают успешное время записи", () => {
    expect(formatDoctorAppointmentRecordAt(null, MSK)).toBe("");
    expect(formatBookingDateTimeMediumRu("", MSK)).toBe("");
  });
});
