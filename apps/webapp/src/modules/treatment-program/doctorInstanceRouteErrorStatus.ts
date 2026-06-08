/** HTTP status for doctor treatment-program instance route business errors. */
export function doctorTreatmentProgramInstanceRouteErrorStatus(msg: string): number {
  if (msg.includes("недоступен") || msg.includes("Объект для типа")) return 400;
  if (msg.includes("не найден") || msg.includes("не найдена")) return 404;
  return 400;
}
