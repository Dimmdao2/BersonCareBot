# settings compatibility

`/app/settings` — канонический раздел управления кабинетом/организацией для staff с capability
`organization.management`. Канонический личный раздел staff-account — `/app/account`:

- default → guarded organization settings; binding специалиста для этого не требуется;
- explicit legacy `?tab=specialist` → `/app/account`;
- `?tab=install` → `/app/account?tab=install`;
- `?tab=organization` сохраняет единственный guarded writer терминологии и organization reminders и является
  канонической поверхностью **«Настройки»** для владельца кабинета/организации; legacy owner без `specialist_id`
  видит здесь причину недоступности клинического кабинета и прямую ссылку на `/app/account?tab=security`;
- здесь же management-capable member видит и создаёт публичный адрес `/book/{slug}`, копирует полную ссылку
  и может самостоятельно переименовывать slug через browser-protected `POST /api/clinic/slug`; прежние адреса
  навсегда остаются привязаны к той же организации и доступны ей для возврата;
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

В organization tab находится единственный блок «Каналы доставки клиники»: SMTP, SMSC API key и credentials
dedicated Telegram/MAX bots. Это org-scoped `secret_envelope` storage с redacted HTTP/audit представлением;
настоящая encryption-at-rest остаётся отдельным §12.7. Каждая запись требует отдельный tariff mechanic. Inbound
webhook/binding dedicated bots не дублируется здесь и остаётся контуром S6.5.
