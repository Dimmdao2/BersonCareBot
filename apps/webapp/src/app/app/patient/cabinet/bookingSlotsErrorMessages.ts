/** Маппинг кодов ошибки `GET /api/booking/slots` на сообщения для пациента (RU). */
export function mapBookingSlotsErrorCodeToRu(code: string | undefined): string {
  if (!code) return "Не удалось загрузить расписание.";
  if (code === "slots_unavailable") {
    return "Расписание сейчас недоступно. Попробуйте позже или нажмите «Повторить».";
  }
  if (code === "catalog_unavailable") {
    return "Каталог записи временно недоступен. Попробуйте позже.";
  }
  if (code === "branch_service_not_found") {
    return "Услуга не найдена. Вернитесь назад и выберите услугу снова.";
  }
  if (code === "invalid_query") {
    return "Не удалось загрузить расписание. Обновите страницу.";
  }
  if (code === "patient_activation_required") {
    return "Нужен подтверждённый номер телефона.";
  }
  if (code === "unauthorized" || code === "forbidden") {
    return "Нет доступа. Войдите в аккаунт и попробуйте снова.";
  }
  return "Не удалось загрузить расписание. Попробуйте ещё раз.";
}
