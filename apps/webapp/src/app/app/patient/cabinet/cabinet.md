# cabinet

Страница «Кабинет клиента» (`/app/patient/cabinet`).

Только для пациента (или гостевой fallback при отсутствии привязки контакта).

**Маршрут `/cabinet`:** redirect на [`/app/patient/booking/new`](../booking/new/page.tsx) («Запись»).

На «Запись» (см. [`booking.md`](../booking/new/booking.md)):
- предстоящие записи (`BookingUpcomingSection`);
- блок полезных ссылок — [`CabinetInfoLinks.tsx`](CabinetInfoLinks.tsx) + [`CabinetInfoLinksCard.tsx`](CabinetInfoLinksCard.tsx), `surface="booking"`;
- wizard записи и история прошедших приёмов.

Серверный рендер: перед `deps.patientBooking` / intake — **`patientRscPersonalDataGate`** (`requireRole.ts`), иначе при onboarding и телефоне только в cookie-snapshot данные не запрашиваются (guest-заглушка). Слоты/создание/отмена — через `/api/booking/*` с **`requirePatientApiBusinessAccess`**.
