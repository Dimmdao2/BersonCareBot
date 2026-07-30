Готово. Изменены только 3 целевых файла:

- Удалены 10 веток `switch` из `executeAction.ts`.
- Удалены 27 сценариев из Telegram/MAX content.
- Шаблоны, используемые другими сценариями, сохранены; отдельные неиспользуемые определения в разрешённых файлах не обнаружены.
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