import { bindPlatformAccessPort } from "@/modules/platform-access/ports";
import { pgPlatformAccessPort } from "@/infra/repos/pgPlatformAccess";

let bound = false;

export function ensurePlatformAccessPortsBound(): void {
  if (bound) return;
  bindPlatformAccessPort(pgPlatformAccessPort);
  bound = true;
}

export function resetPlatformAccessPortsBindingForTests(): void {
  bound = false;
}
