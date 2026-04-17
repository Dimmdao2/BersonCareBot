import { proxyIntegratorProjectionHealth } from "@/app-layer/health/proxyIntegratorProjectionHealth";

export async function GET() {
  return proxyIntegratorProjectionHealth();
}
