import type { AppointmentStatus } from "@/modules/booking-engine/types";

const LABELS: Record<AppointmentStatus, string> = {
  created: "Создана",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачена",
  confirmed: "Подтверждена",
  rescheduled: "Перенесена",
  cancelled_by_patient: "Отмена пациентом",
  cancelled_by_specialist: "Отмена специалистом",
  late_cancellation: "Поздняя отмена",
  no_show: "Неявка",
  completed: "Завершена",
  visit_confirmed: "Визит подтверждён",
  charged_to_package: "По абонементу",
  manual_review_required: "На проверке",
};

export function appointmentStatusLabel(status: AppointmentStatus | string): string {
  return LABELS[status as AppointmentStatus] ?? status;
}

export function isCancelledAppointmentStatus(status: string): boolean {
  return (
    status === "cancelled_by_patient"
    || status === "cancelled_by_specialist"
    || status === "late_cancellation"
    || status === "no_show"
  );
}
