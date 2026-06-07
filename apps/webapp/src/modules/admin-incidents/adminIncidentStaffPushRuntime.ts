import type { AdminIncidentStaffPushDeps } from "./sendAdminIncidentStaffWebPush";

let deps: AdminIncidentStaffPushDeps | null = null;

export function registerAdminIncidentStaffPushDeps(next: AdminIncidentStaffPushDeps): void {
  deps = next;
}

export function getAdminIncidentStaffPushDeps(): AdminIncidentStaffPushDeps | null {
  return deps;
}
