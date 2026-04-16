import { logger } from "@/infra/logging/logger";

/**
 * Server-side auth route latency / outcome (no secrets, no raw tokens).
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
  logger.info(
    {
      scope: "auth_route",
      route: input.route,
      status: input.status,
      outcome: input.outcome,
      errorType: input.errorType,
      elapsedMs: Date.now() - input.startedAt,
      correlationId: correlationId ?? undefined,
    },
    `auth_route ${input.route}`,
  );
}
