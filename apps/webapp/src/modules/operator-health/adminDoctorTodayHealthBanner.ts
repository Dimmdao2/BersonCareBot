import type { OperatorHealthReadPort } from "./ports";
import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from "./adminHealthThresholds";

const SYSTEM_HEALTH_HREF = "/app/settings?adminTab=system-health";

export type AdminDoctorTodayHealthBanner =
  | { show: true; href: string; title: string }
  | { show: false };

/**
 * Компактный сигнал для экрана врача «Сегодня» (только при вызове для role === admin).
 */
export async function loadAdminDoctorTodayHealthBanner(
  read: OperatorHealthReadPort,
): Promise<AdminDoctorTodayHealthBanner> {
  const [incidents, delivery] = await Promise.all([
    read.listOpenIncidents(1),
    read.getOutgoingDeliveryQueueHealth(),
  ]);
  const dueBacklog = delivery.dueBacklog;
  const deadTotal = delivery.deadTotal;
  if (
    incidents.length === 0 &&
    deadTotal <= 0 &&
    dueBacklog < ADMIN_DELIVERY_DUE_BACKLOG_WARNING
  ) {
    return { show: false };
  }
  return {
    show: true,
    href: SYSTEM_HEALTH_HREF,
    title: "Требуется внимание к здоровью системы",
  };
}
