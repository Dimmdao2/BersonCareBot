import type { PatientAnalyticsClientEvent } from "@/modules/product-analytics/ingestSchemas";

export async function postPatientAnalyticsEvents(events: PatientAnalyticsClientEvent[]): Promise<boolean> {
  if (events.length === 0) return true;
  try {
    const res = await fetch("/api/patient/analytics/events", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
