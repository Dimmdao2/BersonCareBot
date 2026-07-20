# settings compatibility

`/app/settings` больше не является вторым деревом персональных настроек. Канонический личный раздел staff-account —
`/app/account`:

- default / `?tab=specialist` → `/app/account`;
- `?tab=install` → `/app/account?tab=install`;
- `?tab=organization` сохраняет единственный guarded writer терминологии и organization reminders и является
  канонической поверхностью **«Настройки»** для владельца кабинета/организации;
- `?tab=team` сохраняет существующую C4A-поверхность только для organization manager с активным
  `clinic_team`; без capability переход безопасно возвращается на `/app/settings?tab=organization`;
- `?tab=billing` сохраняет честный owner-only placeholder до C5 и не объявляется личной настройкой.

Legacy `?adminTab=` по-прежнему перенаправляет на соответствующие platform-operation URL через
`ADMIN_TAB_REDIRECTS`. Все переходы имеют внешний безопасный fallback и не перенаправляют обратно в тот же URL.

Legacy `/app/doctor/install` ведёт в account install, `/app/doctor/clinic/settings` — в этот organization writer,
`/app/doctor/clinic/members` — в entitlement-guarded Team compatibility entry. Legacy `/app/manage` не является
отдельной продуктовой страницей и только перенаправляет на `/app/settings?tab=organization`.

Booking settings остаются в `/app/doctor/schedule?tab=setup`: owner запретил переносить или копировать их в U2.
Коммерческие действия остаются недоступными до C5, security/2FA/sessions — до U3S.

Секреты и операционные значения интеграций по правилам репозитория хранятся в `system_settings`, а не в новых
env-переменных.
