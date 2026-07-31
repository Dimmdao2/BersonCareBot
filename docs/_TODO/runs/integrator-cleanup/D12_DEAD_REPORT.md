Готово. Изменены только 3 целевых файла:

- Удалены 10 веток `switch` из `executeAction.ts`.
- Удалены 26 сценариев из Telegram/MAX content: 21 Telegram и 5 MAX.
- Удалены 9 осиротевших определений шаблонов; `confirmPhoneForBooking` сохранён, поскольку используется сценариями и resolver.
- Перехватчики подтверждены:
  - `booking.event.insert` — `executeAction.ts:79`, `handlers/booking.ts:10`
  - `notifications.get/toggle` — `executeAction.ts:80`, `handlers/notifications.ts:15,34`
  - `reminders.rules.get/rule.toggle/rule.cyclePreset` — `executeAction.ts:81-97`, `handlers/reminders.ts:245,275,352`
  - `callback.answer/message.deliver/message.retry.enqueue/intent.enqueueDelivery` — `executeAction.ts:99-105`, `handlers/delivery.ts:327,348,395,436`

Проверки:

- Поиск удалённых веток и сценариев: 0 совпадений.
- Integrator typecheck: OK.
- Integrator lint: OK.
- Integrator tests: OK.
- `check-no-new-raw-sql`: OK.
- JSON validation: OK.

Удалено 1605 строк. Push/merge не выполнялись.
