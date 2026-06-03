# Что сделать дальше (после закрытия плана)

План `patient_help_booking_surface` **закрыт** — всё из Definition of Done в коде и доках есть. Ниже — задачи, которые **не входили в обязательный scope плана**, но вытекают из ваших запросов («доделать хвосты», «довести до полного закрытия», аудиты фаз) и дают пациенту и редактору понятный результат.

Приоритет сверху вниз: сначала то, что сразу видно пользователю, потом упрощение поддержки и тесты.

---

## 1. Заполнить справку в CMS и проверить на «Запись»

**Зачем:** плитки «Как подготовиться», «Стоимость», «О специалисте», адреса по городу и статья про запись **появляются только после публикации** нужных статей. Без контента экран «Запись» выглядит «пустым», хотя код уже готов.

**Что сделать:**

- В CMS открыть раздел **«Статьи справки»** (`section=help`).
- По чеклисту опубликовать статьи с **точными** slug (опечатка в slug = плитка или кнопка не появятся).
- Пройти глазами `/app/patient/booking/new` для Москвы и СПб: плитка «Адрес» ведёт на нужную статью или на общий `/app/patient/address`.
- Если ещё висит старая статья со slug `cost` — перепубликовать как `services-pricing` (код пока понимает оба варианта).

**Чеклист для редактора:** [`apps/webapp/src/modules/help-content/CMS_EDITOR_CHECKLIST.md`](../../../../apps/webapp/src/modules/help-content/CMS_EDITOR_CHECKLIST.md).

---

## 2. Прямой путь к «О специалисте» из каталога справки

**Зачем:** сейчас короткая страница `/app/patient/about` в основном открывается со статьи `booking`. Из общего списка `/help` на неё не попасть — лишний шаг для тех, кто уже в разделе «Справка».

**Что сделать:**

- Добавить в каталог `/help` явную ссылку на `/app/patient/about` (или короткую подпись в блоке «ещё ссылки», рядом с «Запись на приём»).
- Не дублировать путаницу с плиткой «О специалисте» на «Запись», которая ведёт на **CMS-статью** `/help/about` — в тексте ссылки можно не повторять длинные пояснения.

---

## 3. Упростить два пути «О специалисте»

**Зачем:** сейчас у пациента два разных маршрута с похожим смыслом:

| Откуда | Куда |
|--------|------|
| Плитка на «Запись» | Статья в CMS `/help/about` |
| Статья «Запись в приложении» `/help/booking` | Статическая `/app/patient/about` + ссылка на сайт |

Это **не ошибка** — так задумано в фазах 2 и 4, но редактору и пациенту легко запутаться.

**Что сделать (продуктовое решение + правки):**

- Выбрать **один основной** сценарий для пациента (например: всегда короткая `/about` + сайт, а CMS `about` — только расширенный текст по желанию).
- Привести плитку на «Запись», CTA на `/help/booking` и чеклист CMS к одной схеме.
- Обновить формулировки в чеклисте и `cabinet.md` / `help.md`, чтобы не было двух «главных» about.

---

## 4. Вынести полезные статьи на «Запись» (по желанию продукта)

**Зачем:** в IA уже есть статьи `after-visit` («После приёма») и `app-guide` («Справка по приложению»). Они есть в каталоге `/help`, но **не в плитках** на «Запись» — только `preparation` и условные адрес/стоимость/about.

**Что сделать (если нужно в продукте):**

- Решить, нужны ли эти темы прямо на экране записи.
- Если да — добавить их в список условных плиток (как «Подготовка») и дописать строки в CMS-чеклист.

---

## 5. Ручной проход по сценариям (приёмка)

**Зачем:** вы просили детальные аудиты и «полное закрытие» — автотесты есть, но UX лучше один раз пройти руками после публикации CMS.

**Сценарии:**

1. «Запись» → плитки → статьи help → назад.
2. «Запись» с предстоящей записью в Москве / СПб → плитка «Адрес» → правильная city-статья или fallback.
3. Wizard записи: «Назад» и успешная запись сохраняют `cityCode` в URL «Запись».
4. `/help` → статья `booking` (если опубликована) → кнопка «О специалисте» → `/app/patient/about` → сайт.
5. Гость / пациент без программы — страница about открывается без сюрпризов.

---

## 6. Автотест «опубликовали booking → виден переход на about»

**Зачем:** сейчас проверки в основном **контрактные** (есть компонент, есть условие по slug). Нет сценария уровня «как в проде после CMS».

**Что сделать:**

- Добавить inprocess/e2e: при slug `booking` на странице статьи есть ссылка на `routePaths.patientAbout`.
- По возможности — с моком списка статей help, без тяжёлого импорта всего CMS.

---

## 7. Убрать legacy slug `cost` (когда контент готов)

**Зачем:** в коде оставлен alias `cost` → `services-pricing`, чтобы не сломать уже опубликованное. После перепубликации в CMS дублирование только мешает редакторам.

**Что сделать:**

- Убедиться, что в проде нет опубликованной статьи только с `cost`.
- Удалить alias в `resolvePublishedServicesPricingSlug` и обновить тесты/доки.

---

## 8. Отправить изменения на сервер

**Зачем:** план и фиксы CI уже в локальных коммитах; без деплоя пациенты не увидят плитки и `/about`.

**Что сделать:** обычный деплой webapp по [`deploy/HOST_DEPLOY_README.md`](../../../../deploy/HOST_DEPLOY_README.md) после `pnpm run ci` на ветке, которую выкатываете.

---

## Для агента: расшифровка задач в коде

| Задача (человеческая) | Где в репозитории |
|----------------------|-------------------|
| Плитки на «Запись» | `apps/webapp/src/app/app/patient/booking/new/page.tsx` → `CabinetInfoLinks` `surface="booking"` |
| Сбор плиток по опубликованным slug | `apps/webapp/src/modules/help-content/cabinetInfoLinkTiles.ts` → `buildCabinetInfoLinkTiles`, `HELP_CANONICAL_ARTICLE_SLUGS_IN_CABINET_TILES`, `resolvePublishedServicesPricingSlug` |
| City-aware «Адрес» | `patientHelpAddressLink.ts`, `pickBookingCityCodeForAddressLinks`, `bookingCityCode` в `buildCabinetInfoLinkTiles`; query `?cityCode=` и snapshot предстоящих записей на `booking/new/page.tsx` |
| URL «Запись» с городом в wizard | `apps/webapp/src/app/app/patient/booking/bookingNewHref.ts`; использование в `booking/new/service/page.tsx`, `confirm/page.tsx` |
| Каталог `/help` | `apps/webapp/src/app/app/patient/help/page.tsx`, `PatientHelpArticleList` |
| Статья help + CTA booking → about | `apps/webapp/src/app/app/patient/help/[slug]/page.tsx`, `HelpBookingAboutLink.tsx`, константа `HELP_CANONICAL_ARTICLE_SLUG_BOOKING` в `canonicalSlugs.ts` |
| Статическая about | `apps/webapp/src/app/app/patient/about/page.tsx`, `PatientAboutSiteLink.tsx`, `routePaths.patientAbout` в `apps/webapp/src/app-layer/routes/paths.ts` |
| Сброс кэша после CMS | `apps/webapp/src/app-layer/content/revalidatePatientContentPaths.ts` (пути `/help`, `/help/[slug]`, `booking/new`) |
| Канон slug и IA | `apps/webapp/src/modules/help-content/canonicalSlugs.ts` (`HELP_CANONICAL_ARTICLE_IA`, 8 slug) |
| Тесты about/booking | `about-page.test.ts`, `HelpBookingAboutLink.test.tsx`, `PatientAboutSiteLink.test.tsx`, `help-booking-about-link.test.ts`, `cabinetInfoLinkTiles.test.ts`, `booking-new-page.test.ts` |
| Закрытый план | `.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md` |

**Вне scope инициативы (не смешивать без отдельного решения):** редизайн wizard записи, карта на `/app/patient/address`, изменения Rubitime API.
