# Patient booking wizard (`/app/patient/booking/new`)

Экран **«Запись»** (шаг 1 wizard): предстоящие записи, полезные ссылки, оплата/абонементы, выбор формата.

## Полезная информация (фаза 2, patient_help_booking_surface)

- Сразу под [`BookingUpcomingSection.tsx`](BookingUpcomingSection.tsx) — [`CabinetInfoLinks`](../../cabinet/CabinetInfoLinks.tsx) с `surface="booking"` (`omitBookingCta`, без плитки «Записаться»).
- Условные плитки из CMS (`buildCabinetInfoLinkTiles`): `preparation`, `about`, стоимость (`services-pricing` / legacy `cost`).
- Блок рендерится **всегда** (адрес + справка), даже если список предстоящих записей пуст.

## City-aware адрес (фаза 3)

- Контекст города: распознанный `?cityCode=` в URL, иначе `cityCodeSnapshot` ближайшей предстоящей записи (`pickBookingCityCodeForAddressLinks`; нераспознанный query не перекрывает snapshot; upcoming — `ORDER BY slot_start ASC`).
- Плитка «Адрес кабинета»: при опубликованных `address-msk` / `address-spb` и коде `moscow` / `msk` / `spb` → `/app/patient/help/address-msk|address-spb`; иначе `/app/patient/address` (iframe без изменений).
- Wizard: «Назад» с шага услуги и редирект после подтверждения очной записи — `bookingNewHref(cityCode)` (`../bookingNewHref.ts`), чтобы на «Запись» сохранился город для плиток.

См. [`modules/help-content/README.md`](../../../../modules/help-content/README.md). После публикации статей help в CMS — инвалидация через `revalidatePatientContentPaths` (включая этот маршрут).
