/** Human-readable API errors for Rubitime catalog v2 admin UI. */

export function mapBookingCatalogApiError(
  code: string | undefined,
  context?: "create" | "edit",
): string {
  if (code === "unique_violation") {
    if (context === "create") {
      return "Услуга с таким названием и длительностью уже есть — измените существующую выше.";
    }
    return "Услуга с таким названием и длительностью уже существует.";
  }
  if (code === "invalid_input") return "Проверьте введённые значения.";
  if (code === "not_found") return "Запись не найдена. Обновите страницу.";
  if (code) return code;
  return "Не удалось сохранить.";
}
