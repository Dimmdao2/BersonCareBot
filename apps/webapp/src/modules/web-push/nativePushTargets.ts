import type { NativePushTargetLifecyclePort } from './ports';

export function createNativePushTargetsService(port: NativePushTargetLifecyclePort) {
  return {
    register: port.register,
    revoke: port.revoke,
    status: port.status,
    listActive: port.listActive,
    activeOwnerId: port.activeOwnerId,
    activeTarget: port.activeTarget,
    deactivateById: port.deactivateById,
  };
}
