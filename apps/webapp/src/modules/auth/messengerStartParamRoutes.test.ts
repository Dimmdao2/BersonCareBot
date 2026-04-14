import { describe, expect, it } from "vitest";
import { mapMaxStartParamToPatientPath } from "./messengerStartParamRoutes";
import { routePaths } from "@/app-layer/routes/paths";

describe("mapMaxStartParamToPatientPath", () => {
  it("maps known aliases", () => {
    expect(mapMaxStartParamToPatientPath("booking")).toBe(routePaths.patientBooking);
    expect(mapMaxStartParamToPatientPath("BOOKING")).toBe(routePaths.patientBooking);
    expect(mapMaxStartParamToPatientPath("booking-new")).toBe(routePaths.bookingNew);
    expect(mapMaxStartParamToPatientPath("sections")).toBe(routePaths.patientSectionsIndex);
  });

  it("accepts safe absolute paths", () => {
    expect(mapMaxStartParamToPatientPath("/app/patient/booking")).toBe("/app/patient/booking");
  });

  it("rejects unsafe paths", () => {
    expect(mapMaxStartParamToPatientPath("/app/settings")).toBeNull();
    expect(mapMaxStartParamToPatientPath("unknown_key")).toBeNull();
  });
});
