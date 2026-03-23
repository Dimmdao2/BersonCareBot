# Этап 15: Настройки и админ-режим

> Приоритет: P3
> Зависимости: Этап 9 (кабинет врача)
> Риск: средний (security — admin mode)

---

## Подэтап 15.1: DB — system_settings

**Задача:** таблица для хранения настроек.

**Файлы:**
- Миграция: `apps/webapp/migrations/027_system_settings.sql`

**Действия:**
```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'doctor', 'admin')),
  value_json JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES platform_users(id),
  PRIMARY KEY (key, scope)
);

-- Seed
INSERT INTO system_settings (key, scope, value_json) VALUES
  ('patient_label', 'doctor', '"пациент"'),
  ('sms_fallback_enabled', 'admin', 'true'),
  ('debug_forward_to_admin', 'admin', 'false'),
  ('dev_mode', 'admin', 'false')
ON CONFLICT DO NOTHING;
```

**Критерий:** таблица создана, seed загружен.

---

## Подэтап 15.2: API + UI — настройки врача

**Задача:** страница настроек с управляемыми параметрами.

**Файлы:**
- `apps/webapp/src/app/app/doctor/settings/page.tsx` (обновить)
- `apps/webapp/src/modules/doctor-cabinet/`

**Действия:**
1. API: `getSettings(scope)`, `updateSetting(key, value)`.
2. UI настроек:
   - «Как называть пациента:» выпадающий список (пациент / клиент).
   - SMS fallback: toggle.
   - Другие настройки из `system_settings`.
3. При смене `patient_label` — UI подставляет выбранный термин.

**Критерий:**
- Настройки сохраняются и применяются.
- label «пациент»/«клиент» меняется в UI.

---

## Подэтап 15.3: Режим админа

**Задача:** переключатель режима админа с визуальной индикацией.

**Файлы:**
- Страница настроек
- AppShell / DoctorHeader

**Действия:**
1. На странице настроек (только для `role = 'admin'`): toggle «Режим админа».
2. При включении: modal подтверждения «Вы уверены? Будьте осторожны с админскими функциями.»
3. При активном admin mode:
   - Шапка меняет цвет фона на красноватый (`var(--admin-header-bg)`).
   - В сессии / cookie: флаг `adminMode = true`.
4. Admin-only функции (удаление, архивация, настройки интеграций) видны только в admin mode.
5. При выключении — шапка возвращается к нормальному цвету.

**Критерий:**
- Toggle с подтверждением.
- Красная шапка в admin mode.
- Admin-only функции скрыты в обычном режиме.

---

## Подэтап 15.4: Флаги и интеграции в настройках

**Задача:** управление флагами и интеграциями через admin UI.

**Файлы:**
- Страница настроек (admin mode)

**Действия:**
1. В admin mode на странице настроек появляются блоки:
   - **Dev mode:** toggle (останавливает рассылки кроме тестовых аккаунтов).
   - **Флаги:** таблица key/value из `system_settings`.
   - **Тестовые ID:** поля для Telegram ID, Max ID (для тестирования).
   - **Дебаг-сообщения админу:** toggle.
   - **SMS при недоставке:** toggle.
2. Ключи интеграций: показать имена (без значений), кнопка «Обновить» → modal ввода нового значения.
3. Все изменения через `system_settings` API.

**Критерий:**
- Флаги управляемы через UI.
- Dev mode влияет на рассылки (через integrator).
- Ключи интеграций обновляемы.

---

## Общий критерий завершения этапа 15

- [ ] system_settings таблица с seed.
- [ ] Настройки врача: patient_label, SMS fallback.
- [ ] Admin mode с красной шапкой и подтверждением.
- [ ] Флаги и интеграции через admin UI.
- [ ] `pnpm run ci` проходит.
