Страница настроек уведомлений пациента (`/app/patient/notifications`).

- Перед загрузкой email/каналов из БД — **`patientRscPersonalDataGate`** (`requireRole.ts`), тот же критерий tier, что у API.
- Показывает категории подписок и каналы, которые реально подключены у пользователя.
- Если подключённых каналов нет, подсказывает сначала перейти в `Мой профиль`.
- Server action `toggleSubscriptionChannel` пока делает revalidate (временный no-op до backend reminder rules).
