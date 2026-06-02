# Patient booking wizard (`/app/patient/booking/new`)

Экран **«Запись»** (шаг 1 wizard): предстоящие записи, полезные ссылки, оплата/абонементы, выбор формата.

## Полезная информация (фаза 2, patient_help_booking_surface)

- Сразу под [`BookingUpcomingSection.tsx`](BookingUpcomingSection.tsx) — [`CabinetInfoLinks`](../../cabinet/CabinetInfoLinks.tsx) с `surface="booking"` (`omitBookingCta`, без плитки «Записаться»).
- Условные плитки из CMS (`buildCabinetInfoLinkTiles`): `preparation`, `about`, стоимость (`services-pricing` / legacy `cost`).
- Блок рендерится **всегда** (адрес + справка), даже если список предстоящих записей пуст.

См. [`modules/help-content/README.md`](../../../../modules/help-content/README.md).
