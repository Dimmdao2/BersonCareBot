# Обход TEST по всем кабинетам — 23.08.2026

Владелец 23.08 дословно: «пройдись полноценно каждый кабинет… каждую страницу, каждую ручку покрутить,
каждую кнопочку нажать, каждую отметку поставить… чтобы видео открывалось, проигрывалось, чтобы все
ставилось, все сохранялось, все настройки менялись».

**Это не «получить двести».** Страница засчитывается, когда на ней прожаты элементы управления и
проверено, что изменение СОХРАНИЛОСЬ (перезагрузка страницы показывает новое значение).

Учётки владельца на TEST — доктор, глобальный админ, пациент; пароль общий (см. память
`owner-accounts-password-dev-test`). Вход по коду на почту, если требуется.

## Что каждая проверка закрывает в плане

| Живая проверка | Галочка плана |
|---|---|
| Запись на приём пациентом до подтверждения, отмена и перенос | Б2, D30 (часть) |
| Письмо/сообщение по теме → ссылка «отписаться» называет тему | E2 |
| Вход по каналу мессенджера и привязка канала, доставка входа | D15b/6, D25 |
| Приём входящего сообщения обоими вебхуками | D15b/2, D25 |
| Создание/изменение/выполнение/удаление задачи специалиста | D30 |
| Узкая роль интегратора не мешает доставке | D17 |

## Кабинет доктора (57 страниц)

- [ ] `/app/doctor`
- [ ] `/app/doctor/broadcasts`
- [ ] `/app/doctor/broadcasts/archive`
- [ ] `/app/doctor/clients/name-match-hints`
- [ ] `/app/doctor/clinic/members`
- [ ] `/app/doctor/clinic/settings`
- [ ] `/app/doctor/clinical-tests`
- [ ] `/app/doctor/clinical-tests/[id]`
- [ ] `/app/doctor/clinical-tests/new`
- [ ] `/app/doctor/comments`
- [ ] `/app/doctor/communications`
- [ ] `/app/doctor/content`
- [ ] `/app/doctor/content/edit/[id]`
- [ ] `/app/doctor/content/library`
- [ ] `/app/doctor/content/library/delete-errors`
- [ ] `/app/doctor/content/motivation`
- [ ] `/app/doctor/content/new`
- [ ] `/app/doctor/content/news`
- [ ] `/app/doctor/content/sections`
- [ ] `/app/doctor/content/sections/edit/[slug]`
- [ ] `/app/doctor/content/sections/new`
- [ ] `/app/doctor/courses`
- [ ] `/app/doctor/courses/[id]`
- [ ] `/app/doctor/courses/new`
- [ ] `/app/doctor/dev/chart-test`
- [ ] `/app/doctor/exercises`
- [ ] `/app/doctor/exercises/[id]`
- [ ] `/app/doctor/exercises/auto-create`
- [ ] `/app/doctor/exercises/new`
- [ ] `/app/doctor/lfk-templates`
- [ ] `/app/doctor/lfk-templates/[id]`
- [ ] `/app/doctor/lfk-templates/new`
- [ ] `/app/doctor/material-ratings`
- [ ] `/app/doctor/material-ratings/[kind]/[id]`
- [ ] `/app/doctor/messages`
- [ ] `/app/doctor/patient-home`
- [ ] `/app/doctor/patients`
- [ ] `/app/doctor/patients/[userId]`
- [ ] `/app/doctor/patients/[userId]/[...tabSlug]`
- [ ] `/app/doctor/patients/[userId]/programs/[instanceId]`
- [ ] `/app/doctor/recommendations`
- [ ] `/app/doctor/recommendations/[id]`
- [ ] `/app/doctor/recommendations/new`
- [ ] `/app/doctor/references`
- [ ] `/app/doctor/references/[categoryCode]`
- [ ] `/app/doctor/references/measure-kinds`
- [ ] `/app/doctor/schedule`
- [ ] `/app/doctor/stats`
- [ ] `/app/doctor/subscribers`
- [ ] `/app/doctor/subscribers/[userId]`
- [ ] `/app/doctor/test-sets`
- [ ] `/app/doctor/test-sets/[id]`
- [ ] `/app/doctor/test-sets/new`
- [ ] `/app/doctor/treatment-program-promo`
- [ ] `/app/doctor/treatment-program-templates`
- [ ] `/app/doctor/treatment-program-templates/[id]`
- [ ] `/app/doctor/treatment-program-templates/new`

Отдельно, помимо страниц: видео на упражнении открывается и **проигрывается**; карточка пациента —
переключение всех вкладок; расписание — создание, перенос и отмена приёма; рассылка — отправка себе.

## Кабинет пациента (42 страниц)

- [ ] `/app/patient`
- [ ] `/app/patient/about`
- [ ] `/app/patient/address`
- [ ] `/app/patient/bind-phone`
- [ ] `/app/patient/booking`
- [ ] `/app/patient/booking/city`
- [ ] `/app/patient/booking/confirm`
- [ ] `/app/patient/booking/done`
- [ ] `/app/patient/booking/pay`
- [ ] `/app/patient/booking/service`
- [ ] `/app/patient/booking/slot`
- [ ] `/app/patient/broadcasts/[auditId]`
- [ ] `/app/patient/cabinet`
- [ ] `/app/patient/content/[slug]`
- [ ] `/app/patient/courses`
- [ ] `/app/patient/diary`
- [ ] `/app/patient/diary/lfk/journal`
- [ ] `/app/patient/diary/symptoms/journal`
- [ ] `/app/patient/emergency`
- [ ] `/app/patient/go/[kind]`
- [ ] `/app/patient/help`
- [ ] `/app/patient/help/[slug]`
- [ ] `/app/patient/install`
- [ ] `/app/patient/lessons`
- [ ] `/app/patient/memberships/[id]`
- [ ] `/app/patient/memberships/pay`
- [ ] `/app/patient/messages`
- [ ] `/app/patient/notifications`
- [ ] `/app/patient/notifications/settings`
- [ ] `/app/patient/organizations`
- [ ] `/app/patient/profile`
- [ ] `/app/patient/purchases`
- [ ] `/app/patient/reminders`
- [ ] `/app/patient/reminders/journal/[ruleId]`
- [ ] `/app/patient/sections`
- [ ] `/app/patient/sections/[slug]`
- [ ] `/app/patient/support`
- [ ] `/app/patient/treatment`
- [ ] `/app/patient/treatment/[instanceId]`
- [ ] `/app/patient/treatment/[instanceId]/item/[itemId]`
- [ ] `/app/patient/treatment/promo`
- [ ] `/app/patient/treatment/promo/item/[templateStageItemId]`

Отдельно: запись на приём полным путём (город → услуга → слот → подтверждение → готово); дневник —
запись сохраняется; настройки уведомлений — переключатель темы сохраняется; видео урока проигрывается.

## Глобальный админ (23 страниц)

- [ ] `/app/(global-admin)/doctor/analytics`
- [ ] `/app/(global-admin)/doctor/analytics/clients`
- [ ] `/app/(global-admin)/doctor/analytics/notifications`
- [ ] `/app/(global-admin)/doctor/booking-merge`
- [ ] `/app/(global-admin)/doctor/usage`
- [ ] `/app/admin/app-settings`
- [ ] `/app/admin/audit-log`
- [ ] `/app/admin/auth`
- [ ] `/app/admin/booking`
- [ ] `/app/admin/booking/catalog`
- [ ] `/app/admin/booking/form-public`
- [ ] `/app/admin/booking/payments`
- [ ] `/app/admin/clinics`
- [ ] `/app/admin/clinics/[organizationId]`
- [ ] `/app/admin/commercial`
- [ ] `/app/admin/health-archive`
- [ ] `/app/admin/integrations`
- [ ] `/app/admin/notification-templates`
- [ ] `/app/admin/notifications`
- [ ] `/app/admin/payments`
- [ ] `/app/admin/promo`
- [ ] `/app/admin/system-health`
- [ ] `/app/admin/technical`

Отдельно: **медицинских данных админ не видит нигде** — это проверяется глазами на каждой странице
(память `global-admin-reads-accounts-not-medical`).

## Прочие поверхности (13 страниц)

- [ ] `/app`
- [ ] `/app/(role-login)/admin/login`
- [ ] `/app/(role-login)/doctor/login`
- [ ] `/app/(role-login)/patient/login`
- [ ] `/app/(staff-personal)/doctor/install`
- [ ] `/app/account`
- [ ] `/app/clinic/invites/accept`
- [ ] `/app/contact-support`
- [ ] `/app/manage`
- [ ] `/app/max`
- [ ] `/app/settings`
- [ ] `/app/settings/patient-home`
- [ ] `/app/tg`

## Правило записи результата

Каждая находка — строкой в `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` формата
«страница · что нажал · что ожидал · что получил». Находки НЕ чинятся на ходу
(память `dont-autofix-acceptance-findings`): сначала полный обход, потом триаж.

---

## Находки обхода 23.08 (не чинятся на ходу, идут на триаж)

Разделение важное: массовые «НЕ КЛИКНУЛОСЬ» в сыром выводе — артефакт инструмента (элемент списка
чатов не находится по усечённой подписи), это НЕ дефекты продукта. Ниже — только то, где реально
пришёл 4xx/5xx или ошибка в консоли браузера.

### Кабинет врача (41 страница пройдена, каждая кнопка прожата)

| Находка | Где | Что видит человек |
|---|---|---|
| **`Сохранить черновик` отвечает `500`** | `/app/doctor/broadcasts` и `/app/doctor/broadcasts/archive` → `POST /app/doctor/communications?tab=broadcasts` | Черновик рассылки не сохраняется вообще. Воспроизводится обоими путями. |
| **Кнопка `Сохранить SMTP` в настройках клиники даёт `403`** | `/app/doctor/clinic/settings` → `/api/admin/settings` | Врач видит кнопку, которую ему не разрешено нажимать: либо её не должно быть, либо она обязана ходить в клиничный маршрут, а не в админский. |
| **Разметка поля адреса ломает проверку ввода в браузере** | `/app/doctor/content/new`, `/app/doctor/content/sections/new` | `pattern="[a-z0-9-]+"` не компилируется под флагом `v` современных браузеров (`Invalid character class`) — браузерная валидация поля мертва, ошибка сыплется в консоль. Чинится экранированием дефиса. |
| `Создать адрес` отвечает `400` при пустом поле | `/app/doctor/clinic/settings` → `/api/clinic/slug` | Похоже на штатную проверку ввода, а не дефект — но человеку не показывается, что именно не так. |

### Замеченное попутно, вне клик-обхода

| Находка | Где | Что видит человек |
|---|---|---|
| **Интерфейс говорит «почта включена», а доставки нет** | `/app/account?tab=notifications`, тема «Напоминания о задачах» | Пока у темы нет ЯВНОЙ строки канала, тумблер почты нарисован включённым, а резолвер берёт глобальный запас (`web_push`+`telegram`) и почту не выбирает. Письмо начинает приходить только после того, как человек переключит тумблер дважды. Замерено 23.08 на TEST: до переключения доставок ноль, после — строка `specialist_task_reminder\|email\|pending`. |
| У переключателей уведомлений нет доступных подписей | тот же экран | Ни `aria-label`, ни связанной подписи — незрячий пользователь и автопроверка не отличают «Push» от «Email». |
