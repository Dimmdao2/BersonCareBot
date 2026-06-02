# `/app/patient/about`

Краткая страница «О специалисте»: ссылка на полный сайт (`https://dmitryberson.ru`).

- [`page.tsx`](page.tsx) — RSC, `AppShell`, back → `/help`
- [`PatientAboutSiteLink.tsx`](PatientAboutSiteLink.tsx) — общий блок ссылки (также на экране «Запись»)

Связь: статья справки [`/help/booking`](../help/help.md) (`slug=booking`) показывает [`HelpBookingAboutLink`](../help/HelpBookingAboutLink.tsx) → этот маршрут.

Редакторский чеклист CMS: [`modules/help-content/CMS_EDITOR_CHECKLIST.md`](../../../modules/help-content/CMS_EDITOR_CHECKLIST.md).
