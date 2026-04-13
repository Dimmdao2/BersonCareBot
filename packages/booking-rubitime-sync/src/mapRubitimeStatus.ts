export type RubitimeMappedPatientBookingStatus =
  | "creating"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "failed_sync"
  | "cancelling"
  | "cancel_failed";

export function mapRubitimeStatusToPatientBookingStatus(rawStatus: string): RubitimeMappedPatientBookingStatus {
  const x = rawStatus.toLowerCase();
  if (x.includes("cancel") || x.includes("отмен")) return "cancelled";
  if (x.includes("resched")) return "rescheduled";
  if (x.includes("complete")) return "completed";
  if (x.includes("no_show")) return "no_show";
  return "confirmed";
}
