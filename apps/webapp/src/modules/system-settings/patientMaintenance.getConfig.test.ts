import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigBoolMock = vi.fn();
const getConfigValueMock = vi.fn();

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...args: unknown[]) => getConfigBoolMock(...args),
  getConfigValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

import { getPatientMaintenanceConfig } from "./patientMaintenance";

describe("getPatientMaintenanceConfig", () => {
  beforeEach(() => {
    getConfigBoolMock.mockReset();
    getConfigValueMock.mockReset();
  });

  it("reads only enabled flag when maintenance is off", async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const cfg = await getPatientMaintenanceConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.message.length).toBeGreaterThan(0);
    expect(cfg.bookingUrl).toMatch(/^https?:\/\//);
    expect(getConfigBoolMock).toHaveBeenCalledWith("patient_app_maintenance_enabled", false);
    expect(getConfigValueMock).not.toHaveBeenCalled();
  });

  it("reads message and booking in parallel when maintenance is on", async () => {
    getConfigBoolMock.mockResolvedValue(true);
    getConfigValueMock
      .mockResolvedValueOnce("Custom text")
      .mockResolvedValueOnce("https://booking.example.com");
    const cfg = await getPatientMaintenanceConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.message).toBe("Custom text");
    expect(cfg.bookingUrl).toBe("https://booking.example.com");
    expect(getConfigValueMock).toHaveBeenCalledTimes(2);
  });
});
