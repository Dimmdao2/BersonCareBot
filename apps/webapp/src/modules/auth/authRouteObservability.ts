import { logger } from "@/infra/logging/logger";
import { getServerRuntimeBool } from "@/modules/system-settings/configAdapter";

/**
 * Server-side auth route latency / outcome (no secrets, no raw tokens).
 * Routine `info`-телеметрия: пишется только при admin-флаге `debug_forward_to_admin`
 * (verbose-логи). Fire-and-forget: флаг читается асинхронно, вызыватели не ждут.
 */
export function logAuthRouteTiming(input: {
  route: string;
  request: Request;
  startedAt: number;
  status: number;
  outcome: string;
  errorType?: string;
}): void {
  if (process.env.NODE_ENV === "test") return;
  const correlationId = input.request.headers.get("x-bc-auth-correlation-id");
  const elapsedMs = Date.now() - input.startedAt;
  void (async () => {
    if (!(await getServerRuntimeBool("debug_forward_to_admin"))) return;
    logger.info(
      {
        scope: "auth_route",
        route: input.route,
        status: input.status,
        outcome: input.outcome,
        errorType: input.errorType,
        elapsedMs,
        correlationId: correlationId ?? undefined,
      },
      `auth_route ${input.route}`,
    );
  })();
}
