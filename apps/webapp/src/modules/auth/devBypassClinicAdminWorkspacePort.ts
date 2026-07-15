export type DevBypassClinicAdminWorkspacePort = {
  ensureClinicOwnerWorkspace(input: { platformUserId: string; displayName: string }): Promise<void>;
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

export async function ensureDevBypassClinicAdminWorkspace(input: {
  platformUserId: string;
  displayName: string;
}): Promise<void> {
  await requireWorkspacePort().ensureClinicOwnerWorkspace(input);
}
