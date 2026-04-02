/** Маппинг кодов ошибки API `/api/booking/create` на сообщения для пользователя (RU). */
export function mapBookingCreateErrorCodeToRu(code: string | undefined): string {
  if (!code) return "Не удалось создать запись.";
  if (code === "slot_overlap" || code === "slot_already_taken" || code === "duplicate_local_booking_id") {
    return "Это время уже занято. Выберите другой слот.";
  }
  if (code === "booking_confirm_failed" || code.startsWith("rubitime_") || code === "integrator_not_configured") {
    return "Не удалось подтвердить запись. Попробуйте еще раз.";
  }
  if (code === "branch_service_not_found") {
    return "Услуга или специалист недоступны.";
  }
  if (code === "city_mismatch") {
    return "Город не совпадает с выбранной услугой.";
  }
  if (code === "catalog_unavailable") {
    return "Каталог записи временно недоступен. Попробуйте позже.";
  }
  if (code === "unauthorized" || code === "forbidden") {
    return "Нет доступа. Войдите в аккаунт и попробуйте снова.";
  }
  if (code === "invalid_body" || code.startsWith("invalid_")) {
    return "Проверьте введённые данные и попробуйте снова.";
  }
  return "Не удалось создать запись.";
}
