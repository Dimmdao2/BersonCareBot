# Этап 4: Экран «Мои записи» и привязка каналов

**Задачи:** P-11, P-12

## Цель

Убрать техническую надпись из кабинета. Разобраться с нерабочей привязкой MAX-бота.

## Шаги

### Шаг 4.1: Убрать техническую надпись из кабинета (P-11)

**Файл:** `apps/webapp/src/modules/patient-cabinet/service.ts`

**Найти:**
```ts
    reason: hasAppointments
      ? "Здесь отображаются ваши записи и программы."
      : "Кабинет активируется, когда у пользователя есть запись на прием, купленный курс или назначенная программа.",
```

**Заменить на:**
```ts
    reason: hasAppointments
      ? "Здесь отображаются ваши записи и программы."
      : "У вас пока нет записей на приём.",
```

### Шаг 4.2: Убрать «причину» из hero-card если записей нет

**Файл:** `apps/webapp/src/app/app/patient/cabinet/page.tsx`

Сейчас `cabinet.reason` всегда отображается в hero-card. Если записей нет, достаточно пустого состояния в блоке записей. Можно упростить:

**Найти:**
```tsx
<section id="patient-cabinet-hero-section" className="hero-card stack">
  <p>{cabinet.reason}</p>
  {cabinet.nextAppointmentLabel ? <p className="empty-state">{cabinet.nextAppointmentLabel}</p> : null}
</section>
```

**Заменить на:**
```tsx
{cabinet.enabled && (
  <section id="patient-cabinet-hero-section" className="hero-card stack">
    <p>{cabinet.reason}</p>
    {cabinet.nextAppointmentLabel ? <p className="empty-state">{cabinet.nextAppointmentLabel}</p> : null}
  </section>
)}
```

Hero-card показывается только если есть записи. Иначе — только блок «Ближайшие записи» с пустым состоянием.

### Шаг 4.3: Привязка MAX-бота (P-12)

Этот шаг требует исследования бэкенда. Агенту нужно проверить:

1. **Открыть** `apps/integrator/src/integrations/max/` — найти webhook handler.
2. **Проверить:** обрабатывает ли бот MAX команду `/start` с параметром привязки?
3. **Проверить:** URL в `CHANNEL_LIST` (`https://max.ru/id780713840637_1_bot`) — валидный ли? Открывается ли бот?
4. **Проверить:** есть ли обратный вызов (webhook) от MAX к integrator при нажатии `/start` в MAX?
5. **Проверить:** создаётся ли `user_channel_bindings` запись с `maxId` при привязке через MAX?

**Файл для проверки URL:** `apps/webapp/src/modules/channel-preferences/constants.ts`

```ts
{ code: "max", title: "MAX", openUrl: "https://max.ru/id780713840637_1_bot", implemented: true },
```

Если привязка не работает на уровне integrator — зафиксировать баг и создать задачу для отдельного фикса в integrator. Не блокировать этап UI.

## Верификация

1. `pnpm run ci` — без ошибок.
2. Страница `/app/patient/cabinet` без записей: нет надписи «Кабинет активируется...», вместо неё — «У вас пока нет записей на приём.»
3. Тест `patient-cabinet/service.test.ts` проходит (обновить ожидаемый текст в тесте).
