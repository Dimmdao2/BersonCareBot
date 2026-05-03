# PHASE E — Восстановление и уведомление «ок»

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §3.2, §5 фаза E.

## 1. Цель этапа

При наступлении **критерия восстановления** закрыть открытый инцидент (`resolved_at`) и отправить **ровно одно** уведомление о восстановлении (мультиканал: TG + email + UI уже отражено записью; избегать тройного дубля текста — политика: один primary канал + «запись в БД всегда»).

## 2. Зависимости

- **Фазы A, B, D** (источники успеха: probe, боевая операция, нормализация очереди).

## 3. In scope / out of scope

### In scope

- Функция `resolveIncidentAndNotifyRecovery(dedupKey, context)`:
  - если нет открытого инцидента — no-op;
  - если `recovery_notified_at` уже set — no-op (идемпотентность);
  - иначе: `resolved_at = now()`, отправка текста «восстановлено: …», `recovery_notified_at`.
- Триггеры:
  - успешный **outbound probe** по тому же каналу, что и открытый ключ;
  - успешный **GCal sync** после ошибки;
  - **projection** snapshot: `deadCount === 0` и retries в норме **устойчиво** M минут (настройка);
  - успешная обработка **вебхука** после серии ошибок — опционально (не создавать шум при каждом ok).
- Тексты алертов: короткие, с `error_class` и временем.

### Out of scope

- Персональные данные пациентов в recovery-сообщении.
- Отдельный Slack/discord.

## 4. Разрешённые области правок

| Разрешено | Пути |
|-----------|------|
| Сервис инцидентов | тот же модуль, что фаза A |
| Пробы / хуки | точки успеха из фаз B, D, C |

## 5. Декомпозиция шагов

### Шаг E.1 — Идемпотентность recovery

**Действия:**

1. Транзакция: `SELECT … FOR UPDATE` по строке инцидента или `UPDATE … WHERE dedup_key = $1 AND resolved_at IS NULL RETURNING id`.
2. Отправка уведомления после commit или с outbox pattern — выбрать; MVP: после update.

**Checklist:**

- [ ] Два параллельных success не шлют два recovery.

**Критерий закрытия:** stress-тест в unit.

---

### Шаг E.2 — Маппинг триггер → ключи

**Действия:**

1. Таблица соответствия: probe `telegram` success → закрыть все `outbound:telegram:*` или только тот же `error_class` — **решение:** закрывать **все открытые outbound telegram** при успешном getMe (один aggregate ключ `outbound:telegram:probe`).

**Checklist:**

- [ ] Документ в MASTER appendix или LOG.

**Критерий закрытия:** предсказуемое поведение для оператора.

---

### Шаг E.3 — Тесты

**Действия:**

1. open → fail alerts once → resolve → recovery once → second resolve no-op.

**Checklist:**

- [ ] Покрытие для email failure (запись в БД, recovery_notified не ставится до retry — политика).

**Критерий закрытия:** тесты зелёные.

## 6. Definition of Done (фаза E)

- Любой согласованный триггер успеха закрывает инцидент и шлёт не более одного recovery на ключ жизненного цикла.
- Повторный успех не генерирует шум.

## 7. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_F_UI_AND_ADMIN_API.md`](PHASE_F_UI_AND_ADMIN_API.md)
