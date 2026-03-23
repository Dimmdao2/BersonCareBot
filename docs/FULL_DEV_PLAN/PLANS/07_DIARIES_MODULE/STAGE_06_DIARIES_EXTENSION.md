# Этап 6: Расширение модуля дневников

> Приоритет: P2
> Зависимости: Этап 2 (дизайн-система), Этап 1 (багфиксы дневника)
> Риск: средний (миграции БД, обратная совместимость)

---

## Подэтап 6.1: Справочники — backend

**Задача:** универсальная система справочников.

**Файлы:**
- Миграция: `apps/webapp/migrations/018_references.sql`
- Новый: `apps/webapp/src/modules/references/`
- API routes

**Действия:**
1. Миграция:
   ```sql
   CREATE TABLE IF NOT EXISTS reference_categories (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     code TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     is_user_extensible BOOLEAN NOT NULL DEFAULT false,
     owner_id UUID,  -- для мультитенантности в будущем
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   CREATE TABLE IF NOT EXISTS reference_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     category_id UUID NOT NULL REFERENCES reference_categories(id) ON DELETE CASCADE,
     code TEXT NOT NULL,
     title TEXT NOT NULL,
     sort_order INT NOT NULL DEFAULT 0,
     is_active BOOLEAN NOT NULL DEFAULT true,
     meta_json JSONB NOT NULL DEFAULT '{}',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE(category_id, code)
   );
   CREATE INDEX idx_ref_items_category ON reference_items(category_id, sort_order);
   ```
2. Seed data (в миграции или отдельном скрипте):
   - Категория `symptom_type`: боль, жжение, онемение, слабость, напряжение, отёк, ограничение подвижности, кинезиофобия, тревожность, паническая атака.
   - Категория `body_region`: шея, грудной отдел, поясница, плечо, локоть, кисть, тазобедренный сустав, колено, голеностоп, стопа.
   - Категория `diagnosis`: основные ортопедические (остеохондроз, грыжа, протрузия, артроз, тендинит, бурсит, etc.) + периферические нейропатии (туннельные синдромы, радикулопатии).
   - Категория `disease_stage`: острый период, заживление, ремоделирование тканей, адаптация, хроническое течение, восстановление функций, профилактика обострений, возврат в спорт, улучшение спорт результатов.
   - Категория `load_type`: многоповторное, статика, статодинамика, эксцентрика, концентрика, плиометрика, баллистика, баланс, растяжка, мобилизация.
3. API:
   - `GET /api/references/:categoryCode` → список items.
   - `POST /api/doctor/references/:categoryCode` → добавить item (doctor-only).

**Критерий:**
- Таблицы созданы, seed данные загружены.
- API возвращает справочники.
- Доктор может добавлять значения.

---

## Подэтап 6.2: Справочники — UI (shared)

**Задача:** компонент выбора из справочника.

**Файлы:**
- Новый: `apps/webapp/src/shared/ui/ReferenceSelect.tsx`

**Действия:**
1. Компонент `ReferenceSelect`:
   - Props: `categoryCode`, `value`, `onChange`, `placeholder`, `allowFreeText`.
   - Загрузка items из API при монтировании.
   - Выпадающий список с поиском.
   - Если `allowFreeText` — можно вписать своё значение.
   - Иконка справочника справа (опционально).
2. Кэширование: справочники загружаются один раз за сессию (sessionStorage или React context).

**Критерий:**
- Компонент работает для любой категории справочника.
- Поиск фильтрует значения.
- Свободный ввод работает при `allowFreeText`.

---

## Подэтап 6.3: Расширение symptom_trackings

**Задача:** добавить поля к модели симптомов.

**Файлы:**
- Миграция: `apps/webapp/migrations/019_symptom_tracking_extension.sql`
- `apps/webapp/src/modules/diaries/` — repos, types

**Действия:**
1. Миграция:
   ```sql
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS symptom_type_ref_id UUID REFERENCES reference_items(id);
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('left', 'right', 'both'));
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
   ALTER TABLE symptom_trackings ADD COLUMN IF NOT EXISTS stage_ref_id UUID REFERENCES reference_items(id);
   ```
2. Обновить типы и repo: добавить новые поля в SELECT, INSERT, UPDATE.
3. Все новые поля — nullable (обратная совместимость).

**Критерий:**
- Миграция применяется без ошибок.
- Существующие данные не затронуты.
- API возвращает новые поля (null для старых записей).

---

## Подэтап 6.4: UI — расширенная форма симптома

**Задача:** форма создания симптома с новыми полями.

**Файлы:**
- `apps/webapp/src/app/app/patient/diary/symptoms/CreateTrackingForm.tsx`

**Действия:**
1. Добавить поля в форму:
   - Название (text, как сейчас) — опционально.
   - Тип симптома (`ReferenceSelect` category=`symptom_type`).
   - Регион (`ReferenceSelect` category=`body_region`).
   - Сторона: кнопки «Прав» / «Лев» справа от региона (опционально).
   - Диагноз: текстовое поле + `ReferenceSelect` category=`diagnosis` с `allowFreeText`.
   - Стадия: `ReferenceSelect` category=`disease_stage`.
2. Все поля опциональны, кроме названия или типа (хотя бы одно).
3. Кнопка «Добавить» → сохранение через server action.

**Критерий:**
- Форма содержит все поля.
- Справочники загружаются.
- Данные сохраняются.

---

## Подэтап 6.5: Управление симптомами

**Задача:** три-точки меню для каждого симптома.

**Файлы:**
- Страница дневника симптомов — компонент списка отслеживаемых.

**Действия:**
1. Справа от названия каждого симптома — иконка «⋮» (три точки).
2. При нажатии — popup/dropdown с действиями:
   - «Переименовать» → inline-edit названия.
   - «Архивировать» → `is_active = false`, симптом скрывается из основного списка.
   - «Удалить» → soft-delete (пометить `is_active = false` + `deleted_at`). Добавить поле `deleted_at` в миграцию если нужно.
3. Подтверждение для «Удалить» (modal или confirm).

**Критерий:**
- Три-точки меню работает.
- Переименование сохраняется.
- Архивированные скрываются.
- Удалённые не отображаются.

---

## Подэтап 6.6: Расширение lfk_sessions

**Задача:** добавить поля к ЛФК-сессиям.

**Файлы:**
- Миграция: `apps/webapp/migrations/020_lfk_session_extension.sql`
- `apps/webapp/src/modules/diaries/` — repos, types

**Действия:**
1. Миграция:
   ```sql
   ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT;
   ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS difficulty_0_10 SMALLINT CHECK (difficulty_0_10 BETWEEN 0 AND 10);
   ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS pain_0_10 SMALLINT CHECK (pain_0_10 BETWEEN 0 AND 10);
   ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS comment TEXT;
   ALTER TABLE lfk_sessions ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;
   -- Для существующих записей: recorded_at = completed_at
   UPDATE lfk_sessions SET recorded_at = completed_at WHERE recorded_at IS NULL;
   ```
2. Обновить типы и repo.
3. Расширить `lfk_complexes`: привязка к симптому.
   ```sql
   ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS symptom_tracking_id UUID REFERENCES symptom_trackings(id);
   ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS region_ref_id UUID REFERENCES reference_items(id);
   ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS side TEXT CHECK (side IN ('left', 'right', 'both'));
   ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_text TEXT;
   ALTER TABLE lfk_complexes ADD COLUMN IF NOT EXISTS diagnosis_ref_id UUID REFERENCES reference_items(id);
   ```

**Критерий:**
- Миграция применяется, данные не теряются.
- API возвращает новые поля.

---

## Подэтап 6.7: UI — расширенная форма ЛФК-сессии

**Задача:** форма добавления занятия с доп. полями.

**Файлы:**
- Страница дневника ЛФК.

**Действия:**
1. Под выбором комплекса:
   - Дата и время (по умолчанию — текущие). Иконка календаря, нативный `<input type="date">` и `<input type="time">`. Формат ДД.ММ.ГГГГ, ЧЧ:ММ.
   - Длительность: placeholder «длительность выполнения», текст «минут» справа.
   - Сложность: текст «сложность выполнения: N баллов из 10» + `<input type="range" min=0 max=10>`.
   - Боль: аналогичный ползунок.
   - Комментарий: `<textarea>` placeholder «Комментарий», авто-рост, лимит 200 символов.
2. Кнопка «Сохранить» → server action.
3. Toast «Запись добавлена».

**Критерий:**
- Все поля работают.
- Дата/время выбираются.
- Ползунки 0–10.
- Комментарий с ограничением.

---

## Подэтап 6.8: Вкладки «Симптомы» / «ЛФК»

**Задача:** объединить дневники на одной странице с табами.

**Файлы:**
- `apps/webapp/src/app/app/patient/diary/` — реструктуризация

**Действия:**
1. Создать `/app/patient/diary` как основную страницу дневника.
2. Вкладки сверху: «Симптомы» | «ЛФК».
3. Содержимое переключается по вкладкам (client-side, без навигации).
4. Порядок блоков на вкладке «Симптомы»:
   1. Добавить запись.
   2. Отслеживаемые симптомы.
   3. Статистика.
5. Старые роуты `/diary/symptoms` и `/diary/lfk` — redirect на `/diary?tab=symptoms` / `/diary?tab=lfk`.

**Критерий:**
- Одна страница с двумя вкладками.
- Переключение без перезагрузки.
- Прямые ссылки на вкладки работают.

---

## Подэтап 6.9: Попап быстрого добавления

**Задача:** кнопка «+» для быстрого добавления записи.

**Файлы:**
- Новый: `apps/webapp/src/shared/ui/QuickAddPopup.tsx`
- `apps/webapp/src/shared/ui/AppShell.tsx`

**Действия:**
1. Кнопка-кружочек «+» в правом верхнем углу (под шапкой).
2. Видна только если есть отслеживаемые симптомы или ЛФК-комплексы.
3. При нажатии — popup (modal):
   - Блок «Добавить симптом» (если есть отслеживаемые): выбор симптома + шкала 0–10.
   - Блок «Добавить ЛФК» (если есть комплексы): выбор комплекса + кнопка «Выполнено».
4. Если только одно (симптом без ЛФК или наоборот) — показывать только один блок.
5. После сохранения — toast + закрытие popup.

**Критерий:**
- Кнопка «+» видна при наличии данных.
- Popup содержит мини-формы.
- Запись сохраняется.

---

## Общий критерий завершения этапа 6

- [ ] Справочники: таблицы, seed, API, UI компонент.
- [ ] Симптомы: расширенная модель, форма, управление (удалить/архивировать/переименовать).
- [ ] ЛФК: расширенная модель сессий, форма с датой/временем/ползунками.
- [ ] Вкладки «Симптомы» / «ЛФК».
- [ ] Попап быстрого добавления.
- [ ] `pnpm run ci` проходит.
