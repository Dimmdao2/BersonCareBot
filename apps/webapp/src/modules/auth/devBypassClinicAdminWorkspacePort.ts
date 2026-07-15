import type { DevBypassStaffWorkspaceKind } from "./devBypassClinicAdminWorkspaceReconciliation";

export type DevBypassClinicAdminWorkspacePort = {
  ensureStaffWorkspace(input: {
    platformUserId: string;
    displayName: string;
    kind: DevBypassStaffWorkspaceKind;
  }): Promise<void>;
};

let workspacePort: DevBypassClinicAdminWorkspacePort | undefined;

export function bindDevBypassClinicAdminWorkspacePort(
  port: DevBypassClinicAdminWorkspacePort,
): void {
  workspacePort = port;
}

function requireWorkspacePort(): DevBypassClinicAdminWorkspacePort {
  if (!workspacePort) {
    throw new Error(
      'DevBypassClinicAdminWorkspacePort is not bound. Call ensureAuthModulePortsBound().',
    );
  }
  return workspacePort;
}

export async function ensureDevBypassStaffWorkspace(input: {
  platformUserId: string;
  displayName: string;
  kind: DevBypassStaffWorkspaceKind;
}): Promise<void> {
  await requireWorkspacePort().ensureStaffWorkspace(input);
}
