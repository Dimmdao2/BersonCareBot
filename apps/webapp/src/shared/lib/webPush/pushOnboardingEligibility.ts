import type { PushPermissionState } from "@/shared/lib/webPush/pushCapability";
import { isPushPromptDismissalActive } from "@/shared/lib/webPush/pushPromptStorage";

export type WebPushUiStatus =
  | "unsupported"
  | "needs_pwa"
  | "pending_permission"
  | "enabled"
  | "denied_system"
  | "granted_no_subscription";

export function resolveWebPushUiStatus(input: {
  pushSupported: boolean;
  /** Safari/Chrome во вкладке на телефоне — push после установки PWA. */
  pushNeedsPwaInstall: boolean;
  standalone: boolean;
  permission: PushPermissionState;
  hasServerSubscription: boolean;
  vapidConfigured: boolean;
}): WebPushUiStatus {
  if (!input.standalone && input.pushNeedsPwaInstall) return "needs_pwa";
  if (!input.pushSupported) return "unsupported";
  if (!input.standalone) return "needs_pwa";
  if (input.permission === "denied") return "denied_system";
  if (input.permission === "granted") {
    return input.hasServerSubscription ? "enabled" : "granted_no_subscription";
  }
  if (input.permission === "default") {
    if (!input.vapidConfigured) return "unsupported";
    return "pending_permission";
  }
  return "unsupported";
}

export function shouldShowPushOnboardingPrompt(input: {
  standalone: boolean;
  pushSupported: boolean;
  permission: PushPermissionState;
  hasLocalSubscription: boolean;
  hasServerSubscription: boolean;
  promptDismissedAt: string | null;
  dismissedCooldownDays: number;
  vapidConfigured: boolean;
  now: Date;
}): boolean {
  if (!input.standalone || !input.pushSupported || !input.vapidConfigured) return false;
  if (input.permission !== "default") return false;
  if (input.hasLocalSubscription || input.hasServerSubscription) return false;
  if (isPushPromptDismissalActive(input.promptDismissedAt, input.now, input.dismissedCooldownDays)) {
    return false;
  }
  return true;
}
