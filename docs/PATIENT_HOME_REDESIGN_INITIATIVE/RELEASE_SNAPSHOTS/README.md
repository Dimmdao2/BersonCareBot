# RELEASE_SNAPSHOTS - Patient Home Redesign

Сюда складываются скриншоты финальной QA-сессии Phase 9 перед релизом инициативы.

## Structure

```text
RELEASE_SNAPSHOTS/
├── README.md
├── before/
└── after/
```

- `before/` - baseline до выката, если он был снят.
- `after/` - финальное состояние ветки / production smoke после выката.

## Required scenarios

Минимальный набор скриншотов:

- `home-guest-mobile-375.png`
- `home-guest-desktop-1280.png`
- `home-authorized-non-patient-mobile-375.png`
- `home-authorized-non-patient-desktop-1280.png`
- `home-patient-no-course-mobile-375.png`
- `home-patient-no-course-desktop-1280.png`
- `home-patient-with-course-mobile-375.png`
- `home-patient-with-course-desktop-1280.png`

Дополнительные сценарии:

- `section-subscription-badge.png` - раздел, добавленный в `subscription_carousel`.
- `content-practice-completion.png` - кнопка «Я выполнил(а) практику».
- `mood-checkin-saved.png` - сохранённый чек-ин самочувствия.
- `morning-ping-landing.png` - `/app/patient?from=morning_ping`.
- `settings-patient-home.png` - `/app/settings/patient-home`.

## QA verdict format

Фиксируйте результат рядом со скриншотами в этом файле или в `../LOG.md`:

```text
YYYY-MM-DD HH:mm TZ - PASS - home-guest-mobile-375.png - notes
YYYY-MM-DD HH:mm TZ - BLOCKED - content-practice-completion.png - reason
```

## Privacy

Не сохранять реальные медицинские данные, телефоны, токены, личные имена пациентов или админов. Использовать тестового пользователя или замаскированные данные.
