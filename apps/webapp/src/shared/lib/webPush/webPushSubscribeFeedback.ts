import toast from "react-hot-toast";
import type { SubscribePatientWebPushResult } from "@/shared/lib/webPush/subscribePatientWebPush";

export function webPushSubscribeFailureMessage(
  reason: Extract<SubscribePatientWebPushResult, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "permission_denied":
      return "Разрешение не выдано. Включите уведомления в настройках устройства.";
    case "permission_default":
      return "Разрешение не подтверждено";
    case "unsupported":
      return "Уведомления не поддерживаются на этом устройстве";
    case "vapid_unavailable":
      return "Push недоступен";
    case "save_failed":
      return "Не удалось сохранить подписку";
    case "error":
      return "Не удалось включить уведомления";
  }
}

export function reportWebPushSubscribeFailure(result: SubscribePatientWebPushResult): void {
  if (result.ok) return;
  toast.error(webPushSubscribeFailureMessage(result.reason));
}
