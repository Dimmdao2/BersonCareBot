# Страница профиля пациента (`/app/patient/profile`)

Плоская страница без accordion на основных блоках.

## Структура

1. **Hero** — ФИО (`InlineEditField`), телефон (привязка / изменение через Telegram или Max).
2. **Email** — `EmailAccountPanel` (привязка и подтверждение по OTP).
3. **Мессенджеры** — `ConnectMessengersBlock` (Telegram / MAX).
4. **Подписки на уведомления** — одна строка-ссылка на `/app/patient/notifications`.
5. **Дополнительно** (свёрнуто по умолчанию) — календарный пояс IANA, установка PWA, «Поделиться с другом».
6. **Удаление данных дневника** — согласие → OTP на привязанный номер.
7. **Выход** — форма POST `/api/auth/logout` (не показывается в контексте бота).

Server action `updateDisplayName` обновляет `platform_users.display_name` через `userProjection`.

## TODO

### Аватар пациента

Отдельного хранения аватара и upload-flow пока нет. Когда появится схема в БД и загрузка — добавить в hero классический круг (`size-12 rounded-full`) с инициалами как fallback.

### Возврат PIN UI

Механизм PIN **не удалён из кодовой базы**, только скрыт со страницы профиля:

- Компоненты: `PinSection.tsx`, `AuthOtpChannelPreference.tsx`.
- Server action: `setPreferredAuthOtpChannelAction` в `actions.ts`.
- API: `/api/auth/pin/{set,verify,login}/*`, `userPins`, `isDiaryPurgePinReauthValid` в `modules/auth/service.ts`.

Чтобы вернуть UI и двухфакторную защиту удаления дневника:

1. В `page.tsx` снова импортировать и отрендерить `<PinSection>` и `<AuthOtpChannelPreference>`; восстановить `deps.userPins.getByUserId` и вычисление `authOtpOptions` / `initialAuthOtpSelection`.
2. В `DiaryDataPurgeSection` вернуть шаг PIN: состояние `"intro" | "pin" | "otp"` и блок с `PinInput` + `/api/auth/pin/verify`.
3. В `purge-otp/start/route.ts` и `purge/route.ts` вернуть проверку `isDiaryPurgePinReauthValid(session)` перед отправкой OTP / финальным удалением (см. маркеры `// SECURITY:` в этих файлах).

Связанные маркеры безопасности в коде:

- `apps/webapp/src/app/api/patient/diary/purge-otp/start/route.ts`
- `apps/webapp/src/app/api/patient/diary/purge/route.ts`
