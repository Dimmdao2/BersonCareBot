/** localStorage marker: staff PWA установлен через `/app/doctor/install` (не patient standalone). */
export const STAFF_PWA_INSTALLED_STORAGE_KEY = "bersoncare.staffPwaInstalled.v1";

export function markStaffPwaInstalled(): void {
  try {
    localStorage.setItem(STAFF_PWA_INSTALLED_STORAGE_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}

export function isStaffPwaMarkedInstalled(): boolean {
  try {
    return localStorage.getItem(STAFF_PWA_INSTALLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Staff install «готово»: только явный маркер или событие install, не patient standalone. */
export function isStaffPwaInstallComplete(installedAck: boolean): boolean {
  return installedAck || isStaffPwaMarkedInstalled();
}
