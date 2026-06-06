/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  STAFF_PWA_INSTALLED_STORAGE_KEY,
  isStaffPwaInstallComplete,
  isStaffPwaMarkedInstalled,
  markStaffPwaInstalled,
} from "./staffPwaInstallState";

describe("staffPwaInstallState", () => {
  afterEach(() => {
    localStorage.removeItem(STAFF_PWA_INSTALLED_STORAGE_KEY);
  });

  it("markStaffPwaInstalled sets storage key", () => {
    markStaffPwaInstalled();
    expect(localStorage.getItem(STAFF_PWA_INSTALLED_STORAGE_KEY)).toBe("1");
    expect(isStaffPwaMarkedInstalled()).toBe(true);
  });

  it("isStaffPwaInstallComplete ignores standalone without marker", () => {
    expect(isStaffPwaInstallComplete(false)).toBe(false);
  });

  it("isStaffPwaInstallComplete true after appinstalled ack or marker", () => {
    expect(isStaffPwaInstallComplete(true)).toBe(true);
    markStaffPwaInstalled();
    expect(isStaffPwaInstallComplete(false)).toBe(true);
  });
});
