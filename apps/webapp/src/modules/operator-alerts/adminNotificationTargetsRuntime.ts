import type { AdminNotificationTargetsPort } from "./ports";

/**
 * C-4 (2026-07-26): the domain layer (`dispatchOperatorAlert.ts`) must not import `infra/repos`
 * directly (clean-architecture boundary, `no-restricted-imports`). Same registration-on-the-edge
 * shape as {@link import("./operatorAlertRuntime").registerOperatorAlertDedupPort} and
 * {@link import("./emptyAudienceRuntime").registerEmptyAudienceReporter} — wired in `buildAppDeps.ts`.
 */
let port: AdminNotificationTargetsPort | null = null;

export function registerAdminNotificationTargetsPort(next: AdminNotificationTargetsPort): void {
  port = next;
}

export function getAdminNotificationTargetsPort(): AdminNotificationTargetsPort | null {
  return port;
}

/** Только для тестов: вернуть реестр в исходное состояние. */
export function resetAdminNotificationTargetsPortForTests(): void {
  port = null;
}
