# Страница профиля пациента (`/app/patient/profile`)

Плоская страница без accordion на основных блоках.

## Структура

1. **Hero** — ФИО (`InlineEditField`), телефон (ссылка «Привязать» / «Изменить» → `/app/patient/bind-phone?next=…`), email (`EmailAccountPanel`).
2. **Мессенджеры** — всегда `ConnectMessengersBlock` (Telegram / MAX, сетка 2 колонки).
3. **Вход по телефону** — `AuthOtpChannelPreference`: выпадающий список configured+enabled+linked каналов, дефолт вычисляется (`channelPreferences.resolveAuthOtpChannel`) как явный выбор либо канал, впервые подтвердивший номер (`IDENTITY_AND_MERGE_SCHEME.md` §3.1).
4. **Уведомления** — ссылки «Настройка» и «Расписание» (`/app/patient/notifications/settings`, `/app/patient/reminders`).
5. **Календарный пояс (UTC / IANA)** — `PatientCalendarTimezoneSection` (всегда видимая секция под уведомлениями).
6. **Удаление данных дневника** — согласие → OTP на привязанный номер.
7. **Выход** — форма POST `/api/auth/logout` (не показывается в контексте бота).

Server action `updateDisplayName` обновляет `platform_users.display_name` через `userProjection`.

## TODO

### Аватар пациента

Отдельного хранения аватара и upload-flow пока нет. Когда появится схема в БД и загрузка — добавить в hero классический круг (`size-12 rounded-full`) с инициалами как fallback.

### PIN снят как способ входа (владелец, 04.08)

PIN полностью удалён из кодовой базы: `PinSection.tsx`, `PinInput.tsx`, `/api/auth/pin/{set,verify,login}/*`,
`userPins`-порт и `isDiaryPurgePinReauthValid`/`setDiaryPurgePinReauth` в `modules/auth/service.ts` — не
восстанавливать. Удаление дневника защищено одним фактором — OTP на привязанный номер (маркеры `// SECURITY:`
в `purge-otp/start/route.ts` и `purge/route.ts`). Подробности — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §7.
