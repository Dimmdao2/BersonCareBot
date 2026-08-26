import { logger } from '@/infra/logging/logger';
import { environmentDiagnosticsEnabled } from '@/config/env';

/**
 * Server-side auth route latency / outcome (no secrets, no raw tokens).
 * Routine `info` telemetry is automatic in DEV and TEST.
 */
export function logAuthRouteTiming(input: {
  route: string;
  request: Request;
  startedAt: number;
  status: number;
  outcome: string;
  errorType?: string;
}): void {
  if (process.env.NODE_ENV === 'test') return;
  const elapsedMs = Date.now() - input.startedAt;
  void (async () => {
    if (!environmentDiagnosticsEnabled) return;
    logger.info(
      {
        scope: 'auth_route',
        route: input.route,
        status: input.status,
        outcome: input.outcome,
        errorType: input.errorType,
        elapsedMs,
      },
      `auth_route ${input.route}`,
    );
  })();
}
