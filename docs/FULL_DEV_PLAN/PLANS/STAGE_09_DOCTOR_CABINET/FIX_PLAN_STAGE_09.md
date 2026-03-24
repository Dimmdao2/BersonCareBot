# FIX_PLAN — этап 9 (кабинет врача: клиенты и подписчики)

## 1. Статус этапа

**Выполнен в основном по структуре маршрутов и данным:** есть `apps/webapp/src/app/app/doctor/page.tsx` (дашборд с метриками), `subscribers/page.tsx`, `subscribers/[userId]/page.tsx`, `clients/page.tsx` с комментарием про `appointment_records`, миграция `026_doctor_notes_user_flags.sql`, модули `doctor-stats`, `doctor-clients`. Остаются зазоры по **тестам**, **стилям** (legacy-классы рядом с Tailwind), **согласованности SQL** отмен с этапом 1.8 для дашборда, и **инлайн-стилям** в карточке клиента.

## 2. Найденные проблемы

### Критичные

- **`apps/webapp/src/infra/repos/pgDoctorAppointments.ts`**, метод `getDashboardAppointmentMetrics`: запрос `cancellationsInCalendarMonth` считает `status = 'canceled'` за календарный месяц **без** исключения `last_event` в `('event-remove-record', 'event-delete-record')`, в отличие от `getAppointmentStats`. Плитка «Отмен за месяц» на дашборде может **расходиться** с определением «отмена» из подэтапа **1.8** / **9.1.2**. Тип: **логика**, **backend**.

### Средние

- **`apps/webapp/src/app/app/doctor/page.tsx`**: быстрые действия используют классы **`button`**, **`panel`**, **`feature-grid`** (legacy) вместо примитивов shadcn (см. этап 2). Шаг: **9.1.3**, пересечение с этапом 2. Тип: **фронт**, **стили**.
- **`apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx`**: инлайн-стили у списка каналов и заголовка блока истории (`style={{ listStyle, padding, margin }}`, `style={{ marginTop, marginBottom }}`). Шаг: **9.4.1**. Тип: **фронт**, **стили**.
- **`apps/webapp/src/app/app/doctor/clients/page.tsx`**: классы **`master-detail`**, **`panel`**, **`stack`** — наследие глобального CSS; при полной миграции на Tailwind нужна замена. Шаг: **9.3.2**. Тип: **фронт**, **стили**.
- **`apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx`**: поле поиска с классом **`auth-input`**. Шаг: **9.2.3**, пересечение с этапом 2. Тип: **фронт**, **стили**.
- **`apps/webapp/src/app/app/doctor/layout.tsx`**: `bg-[#f5f7fb]` — хардкод цвета вне токенов. Тип: **стили**.

### Мелкие

- Документация: после изменения метрик дашборда обновить описание семантики отмен в комментариях SQL или JSDoc `doctor-stats`. Шаг: **9.1.1**. Тип: **документация**.
- Тесты: сверить наличие unit/e2e для блоков **9.2.6**, **9.3.5**, **9.4.3**, **9.5.3**, **9.6.4**, **9.7.4** — в этом аудите не выгружался полный список `*.test.ts` и `e2e/`. Тип: **тесты**.

## 3. Пропущенные шаги

- Не подтверждено закрытие каждого пункта **9.7.x** (admin-only soft-delete) без чтения API и UI модалок.
- Полная приемка **9.8** (финальный чеклист, `test:e2e`) — только по логам CI.

## 4. Лишние изменения

Не анализировались (нет изолированного diff этапа 9).

## 5. План исправлений

1. **`pgDoctorAppointments.ts`**: в `getDashboardAppointmentMetrics` для отмен за календарный месяц применить то же правило исключения удалённых записей по `last_event`, что и в `getAppointmentStats` / отменах за 30 дней; вынести общее условие «отмена для метрик» в один фрагмент в файле; обновить тесты `doctor-stats` или репозитория.
2. **`doctor/page.tsx`**: заменить legacy `button`/`panel` на `Button`/`Card` и утилиты Tailwind; сохранить `id` для e2e.
3. **`ClientProfileCard.tsx`**: убрать инлайн-стили — `list-none`, `p-0`, `m-0`, отступы заголовка через Tailwind (`mt-4`, `mb-2`).
4. **`clients/page.tsx` и `DoctorClientsPanel.tsx`**: заменить `panel`/`auth-input` на компоненты из `components/ui` и сетку Tailwind; проверить e2e-селекторы.
5. **`doctor/layout.tsx`**: заменить хардкод фона на токен темы.
6. Пройти чеклист **9.6–9.7**: серверная проверка роли admin для опасных операций, тесты 403 для врача, блокировка messaging на стороне patient API — убедиться по коду и `route.test.ts`.
7. Заполнить пробелы e2e по DAG **9.1.4**, **9.2.6**, **9.3.5** и т.д. согласно `PLAN.md`.
8. `pnpm run ci` и `pnpm --dir apps/webapp run test:e2e` после правок.

---

Аудит: `PLAN.md` STAGE_09, файлы `doctor/page.tsx`, `clients/page.tsx`, `DoctorClientsPanel.tsx`, `ClientProfileCard.tsx`, `pgDoctorAppointments.ts`, наличие `026_doctor_notes_user_flags.sql`, `subscribers/*`.
