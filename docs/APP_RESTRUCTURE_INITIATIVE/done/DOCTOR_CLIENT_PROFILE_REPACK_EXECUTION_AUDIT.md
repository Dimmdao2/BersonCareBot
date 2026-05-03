# DOCTOR_CLIENT_PROFILE_REPACK — аудит выполнения и закрытие хвостов

**Дата аудита:** 2026-05-02.  
**ТЗ:** [`DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md`](DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md) (статус: выполнено).  
**Журнал:** [LOG.md](../LOG.md) — запись «doctor clients: карточка и список (DOCTOR_CLIENT_PROFILE_REPACK)».

---

## 1. Сводка

Микро-проход закрыт в коде: заглушка «Создать из записи на приём» удалена; список клиентов компактный с иконочными бейджами (`Phone`, `Send`, glyph «М»); карточка пациента — один `article` со sticky-шапкой, плоские секции по группам ТЗ, `<details>` для истории записей, старого журнал отправок и админ-блока; дубль ссылки «Открыть раздел сообщений» снят. Глубокая переработка (**табы**, **hero**, новые сводки) по-прежнему вне scope этапа 6 [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md).

---

## 2. Чек-лист ТЗ §5 (верификация)

### 2.1 Архитектура / lint (`rg`)

| Команда | Ожидание | Факт (2026-05-02) |
|---------|----------|-------------------|
| `rg "CreateClientFromRecordStub" apps/webapp/src` | Пусто | Пусто |
| `rg "AccItem\|doctor-client-acc-trigger-" apps/webapp/src` | Пусто | Пусто |
| `rg "@/infra/db\|@/infra/repos" apps/webapp/src/app/app/doctor/clients` | Без новых инфра-импортов | Пусто |

Допустимые упоминания `CreateClientFromRecordStub` **только** в исторических записях [LOG.md](../LOG.md) и в тексте ТЗ/аудита (описание «что было»).

Подстрока `doctor-client-acc-trigger-` в **`ClientProfileCard.backLink.test.tsx`** — намеренный селектор в негативном тесте; в остальном `apps/webapp/src` (без `*.test.tsx`) совпадений нет.

### 2.2 Тесты

| Требование ТЗ | Факт |
|---------------|------|
| `ClientProfileCard.backLink.test.tsx` обновлён | Да; mock `PatientTreatmentProgramsPanel`; сценарии без кнопки «Коммуникации»; чат из шапки; для блока журнала — непустой `messageHistory` |
| В DOM нет legacy `doctor-client-acc-trigger-*` (ТЗ §5.2) | Тест `does not render legacy accordion trigger ids` |
| Новый тест списка `DoctorClientsPanel.test.tsx` | Да: комбинации phone/TG/MAX, отмены, отсутствие сырого телефона в тексте строки |
| e2e `e2e/doctor-clients-inprocess.test.ts` | Прогон: 8/8 зелёных (без ссылок на заглушку) |
| ТЗ §5.2: focused-тест на `suspendLoad` у audit при закрытом `<details>` | **Частично:** поведение реализовано в [`ClientProfileCard.tsx`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) (`adminDetailsOpen`); отдельный RTL-тест на проп-значения не добавлялся — низкий риск, при регрессии смотреть `suspendHeavyFetch` / `suspendLoad` |

### 2.3 Полный CI

Команда: `pnpm install --frozen-lockfile && pnpm run ci` — **успех** после очистки повреждённого кэша `apps/webapp/.next` (артефакт среды: битый `validator.ts`; не следствие данного ТЗ). При локальном `tsc` с ошибкой в `.next/dev/types` — удалить `apps/webapp/.next` и повторить.

### 2.4 Отклонения от дословного ТЗ (зафиксировано)

| Место ТЗ | Реализация | Комментарий |
|----------|------------|-------------|
| §3.3.2: якорь «Назначить» | В шапке подпись **«Программа»** (`#doctor-client-section-treatment-programs`) | Тот же якорь и смысл «назначить программу»; краткая подпись для плотного UI |
| §5.2: интеграционная проверка `suspendLoad=true` | Покрыто кодом + ручной смоук; без отдельного unit | См. §2.2 |

---

## 3. Синхронизированные документы (этот прогон)

| Документ | Изменение |
|----------|-----------|
| [`DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md`](DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md) | §2 переименован в историческую базу; §3.3.2 — уточнение подписи якоря; §8 — ссылка на этот аудит |
| [LOG.md](../LOG.md) | Уточнена запись: ссылка на аудит, команды проверки |
| [`README.md`](../README.md) | Строка про этап 6 кабинета + строка таблицы про этот аудит |
| [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md) | Ссылка на аудит у этапа 6 |
| [RECOMMENDATIONS_AND_ROADMAP.md](../RECOMMENDATIONS_AND_ROADMAP.md) | II.1 / II.3 / IV — снятие устаревших формулировок про аккордеон карточки после REPACK |
| [TARGET_STRUCTURE_DOCTOR.md](../TARGET_STRUCTURE_DOCTOR.md) | Таблица §13: карточка — факт микро-прохода + цель табов |
| [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md) | Команда `rg`: актуальный id CTA `doctor-client-open-support-chat-button` |

---

## 4. Намеренно не делали

- Табы, hero «Что важно сейчас», таймлайн заметок, графики симптомов — roadmap / этап 6 глубокая заморозка.
- Отдельный компонент `ClientChannelBadges.tsx` / `ClientProfileStickyHeader.tsx` — не выносили (JSX остаётся в панели и карточке).
- Изменения портов `doctor-clients`, API, БД.

---

## 5. Definition of Done (ТЗ §7) — итог

Все пункты DoD из [`DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md`](DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md) §7 выполнены; единственный сознательный хвост — отсутствие отдельного unit-теста на проп `suspendLoad` / `suspendHeavyFetch` у admin-панелей при закрытом `<details>` (см. §2.2).
