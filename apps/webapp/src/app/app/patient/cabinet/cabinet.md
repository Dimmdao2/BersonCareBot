# cabinet

Страница «Кабинет клиента» (`/app/patient/cabinet`).

Только для пациента (или гостевой fallback при отсутствии привязки контакта).

Текущая версия — native booking экран:
- карточки активных записей с действиями отмены,
- блок полезных ссылок (адрес/подготовка/стоимость) — [`CabinetInfoLinks.tsx`](CabinetInfoLinks.tsx) (RSC, **не смонтирован** на экране: `/cabinet` → redirect на «Запись»): условные плитки через `buildCabinetInfoLinkTiles` — `preparation` + стоимость (`services-pricing` / legacy `cost`); остальные канонические slug — см. `HELP_CANONICAL_ARTICLE_IA`, плитки в фазах 2–3;
- модальный/нижний flow записи на приём (категория -> дата -> слот -> подтверждение),
- аккордеон истории прошедших приёмов.

Серверный рендер: перед `deps.patientBooking` / intake — **`patientRscPersonalDataGate`** (`requireRole.ts`), иначе при onboarding и телефоне только в cookie-snapshot данные не запрашиваются (guest-заглушка). Слоты/создание/отмена — через `/api/booking/*` с **`requirePatientApiBusinessAccess`**.
