/**
 * Structured auth-flow diagnostics for `/app` bootstrap and related UI.
 * Uses console.info (browser) / logger (server) — no secrets in payloads.
 */

export type AuthFlowObservabilityEvent =
  | "auth_bootstrap_started"
  | "context_detected"
  | "initData_detected"
  | "auth_attempt_started"
  | "auth_attempt_finished"
  | "fallback_to_interactive"
  | "late_initData_received"
  | "post_auth_binding_required";

export function emitAuthFlowEvent(
  event: AuthFlowObservabilityEvent,
  payload: Record<string, string | number | boolean | null | undefined>,
): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    const line = JSON.stringify({ scope: "auth_flow", event, ...payload });
    console.info(line);
  } catch {
    /* ignore */
  }
}
