# CMS: чеклист статей справки (`section=help`)

Редактор: **Статьи справки** → `/app/doctor/content?section=help`. Slug в URL должен **точно** совпадать с каноном (`canonicalSlugs.ts`).

## Плитки на «Запись» (`/app/patient/booking/new`)

| Slug | Плитка / поведение | Рекомендация |
|------|-------------------|--------------|
| `preparation` | «Как подготовиться» | Опубликовать |
| `about` | «О специалисте» → `/help/about` (не путать со статикой `/app/patient/about`) | Опубликовать |
| `services-pricing` | «Стоимость» | Опубликовать (legacy `cost` — до перепубликации) |
| `address-msk` | «Адрес» при городе Москва/msk | Опубликовать при приёме в Москве |
| `address-spb` | «Адрес» при городе СПб | Опубликовать при приёме в СПб |

Без публикации slug плитка **не появляется**. «Адрес кабинета» и «Справка и контакты» — всегда (fallback `/app/patient/address` и `/help`).

## Статьи только в каталоге `/help`

| Slug | Назначение | Рекомендация |
|------|------------|--------------|
| `booking` | Запись в приложении; **на странице** ссылка на `/app/patient/about` | Опубликовать |
| `after-visit` | После приёма | По необходимости |
| `app-guide` | Справка по приложению | По необходимости |

## Статический маршрут (не CMS)

| URL | Назначение |
|-----|------------|
| `/app/patient/about` | Краткая страница + ссылка на https://dmitryberson.ru |

Связка: статья `booking` → кнопка «О специалисте» → `/app/patient/about`.

## После публикации

Сохранение / lifecycle в CMS сбрасывает кэш `/help` и `/app/patient/booking/new` (`revalidatePatientContentPaths`).

См. [`README.md`](README.md), [`help/help.md`](../../app/app/patient/help/help.md).
