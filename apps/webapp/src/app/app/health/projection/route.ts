import { proxyIntegratorProjectionHealth } from "@/infra/health/proxyIntegratorProjectionHealth";

export async function GET() {
  return proxyIntegratorProjectionHealth();
}
