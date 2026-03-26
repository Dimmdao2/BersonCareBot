# Промпты для запуска агентов

> Копируй → вставляй в Cursor → жди завершения → следующий.

---

## 1. Новый чат · Auto

```text
Выполни шаги I.1, I.2, I.3 из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md

Контекст: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md @docs/README.md

I.1 — Кнопки: унифицировать Button компонент (скругление вдвое меньше, active-состояние с затемнением и inner shadow, текст белый на синем, аудит всех кнопок по приложению).
I.2 — Размеры: увеличить шрифты, отступы, поля ввода. Patient shell px-5. Иконка назад — ChevronLeft size-6. Input h-11 text-base. Правое меню — уменьшить ширину до 17rem.
I.3 — PIN: 4 отдельных квадрата (w-12 h-14 text-center text-2xl), auto-focus на следующий, paste распределяет цифры, auto-submit при 4-й цифре, строго 4 цифры.

После каждого шага: pnpm run ci. При FAIL — чини. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md
```

---

## 2. Тот же чат · Auto

```text
Сделай code review шагов I.1, I.2, I.3. Проверь по чеклисту из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md (секция «Контрольный чеклист»). Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 3. Новый чат · Auto

```text
Выполни шаг I.4 из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md — КРИТИЧНЫЙ.

Контекст: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md @docs/README.md @apps/webapp/src/modules/auth/service.ts @apps/webapp/src/config/env.ts

Админ в Telegram/Max mini-app не получает роль admin, открывается пользовательский интерфейс. Найди где определяется роль при exchangeIntegratorToken, проверь что ADMIN_TELEGRAM_ID / ADMIN_MAX_IDS корректно матчатся. Исправь. Добавь integration-тест: exchange token с admin telegramId → session.user.role === "admin".

После каждого шага: pnpm run ci. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md
```

---

## 4. Тот же чат · Auto

```text
Сделай code review шага I.4. Проверь: admin telegramId → role=admin, doctor telegramId → role=doctor, обычный user → role=patient. Все три кейса покрыты тестами? Нет регрессий в обычном auth flow? Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 5. Новый чат · Auto

```text
Выполни шаги I.5, I.6, I.12 из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md

Контекст: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md @docs/README.md @docs/FULL_DEV_PLAN/RAW_PLAN.md

I.5 — Дневники: одна кнопка «Дневник» на главной и в меню вместо двух. Убрать PatientHomeDiariesSection. Вкладки «Симптомы»/«ЛФК» — sticky под шапкой, фоновая подсветка активной. Плюсик быстрого добавления — только вне дневников, позиция: fixed bottom-6 right-6.
I.6 — Дневник симптомов: toast «Запись сохранена» при сохранении, дедупликация «в моменте» с подтверждением, пользователь не может добавлять диагноз в справочник.
I.12 — Создание симптома: по умолчанию только поле «Название». Ссылка «Дополнительно» раскрывает расширенные поля.

После каждого шага: pnpm run ci. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md
```

---

## 6. Тот же чат · Auto

```text
Сделай code review шагов I.5, I.6, I.12. Проверь по чеклисту из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md. Особенно: одна кнопка «Дневник» на главной? Вкладки sticky? Toast при сохранении? Дедупликация работает? Создание симптома — по умолчанию только название? Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 7. Новый чат · Auto

```text
Выполни шаги I.7, I.8 из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md

Контекст: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md @docs/README.md

I.7 — Дневник ЛФК: ползунки thumb w-7 h-7, цвет зелёный→жёлтый→красный градиент. Дата+время в одну строку flex gap-2. Попап даты: «Сбросить» → «Сегодня», по центру экрана, бордер+тень. Попап времени: убрать «Сбросить», оставить «Готово», по центру экрана.
I.8 — Статистика: переключатели периода — ToggleGroup с явным активным состоянием. «Всё» ограничить датой первой записи. Формат дат: неделя — ПН/ВТ/СР, месяц — «1 мар». Линия графика strokeWidth 2-3px, точки r=4. Подписи не обрезаны (padding-bottom). Журнал — не под графиком, а по кнопке «Открыть журнал» → отдельный экран с фильтром по датам и меню «⋯» (редактировать/удалить) на каждой записи. Единая логика для симптомов и ЛФК.

После каждого шага: pnpm run ci. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md
```

---

## 8. Тот же чат · Auto

```text
Сделай code review шагов I.7, I.8. Проверь по чеклисту из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md. Ползунки достаточно большие и с градиентом? Попапы по центру? Журнал — отдельный экран? Переключатели периода явные? «Всё» ограничено? Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 9. Новый чат · Auto

```text
Выполни шаги I.9, I.10, I.11 из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md

Контекст: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md @docs/README.md @docs/FULL_DEV_PLAN/RAW_PLAN.md

I.9 — Страница записи: новая страница /app/patient/booking с iframe Rubitime на всю высоту. Кнопка «Записаться» на главной и на «Мои записи». Страница адреса: /app/patient/address с iframe dmitryberson.ru/adress. На «Мои записи» — блок «Информация» (подготовка + адрес). Убрать текст про «интеграцию Rubitime», заменить на «У вас нет записей» если пусто.
I.10 — Заглушки: компонент GuestPlaceholder с жёлто-коричневым фоном (bg-amber-50 border-amber-200). На «Мои записи» для гостя: описание + кнопка «Записаться» (доступна без регистрации). На дневниках для гостя: описание + кнопка «Зарегистрироваться». Не показывать форму телефона на страницах контента.
I.11 — Бейдж 29 непрочитанных: если мусорные данные — почистить. Расписание reminders — НЕ реализовывать, записать в @docs/FULL_DEV_PLAN/POST_PROD_TODO.md

После каждого шага: pnpm run ci. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md
```

---

## 10. Тот же чат · Auto

```text
Сделай code review шагов I.9, I.10, I.11. Проверь по чеклисту из @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md. Страница записи работает? Адрес кабинета — отдельная страница? Заглушки — жёлто-коричневые с описанием? Нет формы телефона на контент-страницах? Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 11. Новый чат · gpt5.3 или лучше

```text
Независимый аудит пакетов H и I из @docs/FULL_DEV_PLAN/EXEC/

Прочитай:
- @docs/FULL_DEV_PLAN/EXEC/EXEC_H_HOTFIX_UI_AUTH.md
- @docs/FULL_DEV_PLAN/EXEC/EXEC_I_UI_REVIEW.md
- @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
- @docs/FULL_DEV_PLAN/RAW_PLAN.md
- @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md

Пройдись по контрольным чеклистам обоих пакетов, проверь каждый пункт по коду. Проверь: auth flow (PIN→channel→SMS), normalizePhone, admin role в мессенджере, кнопки единообразны, размеры адекватны, дневники объединены, статистика корректна, заглушки на месте, страница записи работает.

Запусти pnpm run ci.

Верни: список проблем с приоритетом (critical/high/medium/low), доказательства (файлы/строки), verdict: ready / not ready. Если нашёл проблемы — исправь их.
```

---

## 12. Новый чат · Auto

```text
Выполни пакет A из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_A_QUICK_FIXES.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md

Выполняй шаги строго по порядку из файла инструкций. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Не переходи к следующему шагу пока текущий не зелёный. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 13. Тот же чат · Auto

```text
Сделай code review пакета A. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_A_QUICK_FIXES.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 14. Новый чат · Auto

```text
Выполни пакет B из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_B_SETTINGS_ADMIN!!.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md

Выполняй шаги строго по порядку. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 15. Тот же чат · Auto

```text
Сделай code review пакета B. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_B_SETTINGS_ADMIN!!.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 16. Новый чат · Auto

```text
Выполни пакет C из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_C_RELAY_OUTBOUND!.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md @apps/webapp/INTEGRATOR_CONTRACT.md

Выполняй шаги строго по порядку. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 17. Тот же чат · Auto

```text
Сделай code review пакета C. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_C_RELAY_OUTBOUND!.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 18. Новый чат · gpt5.3 или лучше

```text
Независимый аудит пакетов B и C из @docs/FULL_DEV_PLAN/EXEC/

Прочитай:
- @docs/FULL_DEV_PLAN/EXEC/EXEC_B_SETTINGS_ADMIN!!.md
- @docs/FULL_DEV_PLAN/EXEC/EXEC_C_RELAY_OUTBOUND!.md
- @docs/FULL_DEV_PLAN/EXEC/MASTER_PLAN_EXEC.md
- @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
- @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md
- @apps/webapp/INTEGRATOR_CONTRACT.md

Фокус: безопасность (HMAC, guards, admin mode), relay HMAC подпись, role guards, retry/dedup, миграции.

Запусти pnpm run ci. Верни список рисков с приоритетом, доказательства, verdict: ready / not ready. Если нашёл проблемы — исправь.
```

---

## 19. Новый чат · Auto

```text
Выполни пакет D из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_D_REMINDERS!!.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md

Выполняй шаги строго по порядку. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 20. Тот же чат · Auto

```text
Сделай code review пакета D. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_D_REMINDERS!!.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 21. Новый чат · Auto

```text
Выполни пакет E (шаги 1–4) из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_E_INTEGRATIONS!!.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md @apps/webapp/INTEGRATOR_CONTRACT.md

Выполняй только первые 4 шага (13.1–13.4). После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 22. Тот же чат · Auto

```text
Продолжи пакет E — шаги 5–7 (13.5–13.7). Выполняй по порядку. После каждого шага: pnpm run ci. Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 23. Тот же чат · Auto

```text
Сделай code review пакета E. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_E_INTEGRATIONS!!.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 24. Новый чат · gpt5.3 или лучше

```text
Независимый аудит пакетов D и E из @docs/FULL_DEV_PLAN/EXEC/

Прочитай:
- @docs/FULL_DEV_PLAN/EXEC/EXEC_D_REMINDERS!!.md
- @docs/FULL_DEV_PLAN/EXEC/EXEC_E_INTEGRATIONS!!.md
- @docs/FULL_DEV_PLAN/EXEC/MASTER_PLAN_EXEC.md
- @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
- @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md
- @apps/webapp/INTEGRATOR_CONTRACT.md

Фокус: контракты интеграций, подписи, idempotency, nock-покрытие, reminder seen/unseen, миграции.

Запусти pnpm run ci. Верни список рисков с приоритетом, доказательства, verdict: ready / not ready. Если нашёл проблемы — исправь.
```

---

## 25. Новый чат · Auto

```text
Выполни пакет F из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_F_LFK!.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md

Выполняй шаги строго по порядку. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 26. Тот же чат · Auto

```text
Сделай code review пакета F. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_F_LFK!.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 27. Новый чат · Auto

```text
Выполни пакет G из декомпозиции.

Инструкции: @docs/FULL_DEV_PLAN/EXEC/EXEC_G_FINAL_STUBS.md
Решения владельца: @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
Архитектура: @docs/README.md

Выполняй шаги строго по порядку. После каждого шага: pnpm run ci. При FAIL — исправь (до 3 попыток). Обновляй @docs/FULL_DEV_PLAN/finsl_fix_report.md

В конце: список изменённых файлов, результат pnpm run ci, блокеры.
```

---

## 28. Тот же чат · Auto

```text
Сделай code review пакета G. Проверь соответствие @docs/FULL_DEV_PLAN/EXEC/EXEC_G_FINAL_STUBS.md и @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/finsl_fix_report.md @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md
```

---

## 29. Новый чат · gpt5.3 или лучше

```text
Финальная регрессия всех пакетов H, I, A, B, C, D, E, F, G.

Прочитай:
- @docs/FULL_DEV_PLAN/EXEC/MASTER_PLAN_EXEC.md
- @docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md
- @docs/FULL_DEV_PLAN/USER_TODO_STAGE.md
- @docs/FULL_DEV_PLAN/FIX_PLAN_POLISH.md
- @docs/FULL_DEV_PLAN/PLANS/FINAL_FIX_RECOMMENDATIONS.md
- @docs/FULL_DEV_PLAN/RAW_PLAN.md

Запусти pnpm run ci. Пройдись по QA_CHECKLIST полностью. Проверь все миграции, контракты, тесты, безопасность.

Верни: полный отчёт, verdict: ready for production / not ready. Если нашёл проблемы — исправь. Обнови @docs/FULL_DEV_PLAN/FIX_PLAN_EXECUTION_REPORT.md @docs/FULL_DEV_PLAN/finsl_fix_report.md
```
