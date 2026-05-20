import { describe, expect, it } from "vitest";
import {
  PATIENT_HOME_BLOCK_STATIC_ICON_URL,
  PATIENT_HOME_MOOD_STATIC_ICON_URL,
  resolvePatientHomeBlockLeadingIconUrl,
} from "./patientHomeStaticIcons";

describe("patientHomeStaticIcons", () => {
  it("maps known block codes to public PNG paths", () => {
    expect(PATIENT_HOME_BLOCK_STATIC_ICON_URL.booking).toBe("/patient/home/icons/booking.png");
    expect(PATIENT_HOME_BLOCK_STATIC_ICON_URL.sos).toBe("/patient/home/icons/sos.png");
    expect(PATIENT_HOME_BLOCK_STATIC_ICON_URL.progress).toBe("/patient/home/icons/progress.png");
    expect(PATIENT_HOME_BLOCK_STATIC_ICON_URL.next_reminder).toBe("/patient/home/icons/next-reminder.png");
    expect(PATIENT_HOME_BLOCK_STATIC_ICON_URL.plan).toBe("/patient/home/icons/chart-line.png");
  });

  it("maps mood scores to public PNG paths", () => {
    expect(PATIENT_HOME_MOOD_STATIC_ICON_URL[1]).toBe("/patient/home/icons/mood/1.png");
    expect(PATIENT_HOME_MOOD_STATIC_ICON_URL[5]).toBe("/patient/home/icons/mood/5.png");
  });

  it("prefers bundled block icon over CMS url", () => {
    expect(resolvePatientHomeBlockLeadingIconUrl("booking", "/api/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBe(
      "/patient/home/icons/booking.png",
    );
  });

  it("falls back to CMS url when block has no bundled icon", () => {
    expect(resolvePatientHomeBlockLeadingIconUrl("situations", "/api/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe(
      "/api/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(resolvePatientHomeBlockLeadingIconUrl("situations", null)).toBeNull();
  });
});
