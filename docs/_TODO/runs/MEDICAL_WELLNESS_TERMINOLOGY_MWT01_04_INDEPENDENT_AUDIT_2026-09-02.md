# MWT-01–MWT-04 preparation — independent audit

Роль: независимый docs/research auditor; разовая inspection актуального кода без source-text tests.

Target: `29e4e6bcb14705a5c4285ab04f0a845d4f793253`.

Authority:

- `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md`;
- owner-решение 02.09.2026: один системный режим вместо независимых настроек слов; до реализации — полный
  инвентарь видимых терминов и пары обоих режимов;
- `AGENTS.md` §10a, §10b, §12, §24.

## Вердикт

**FAIL, NOT FOR LAND.** MWT-01, MWT-02 и MWT-03 закрыты преждевременно. В инвентаре отсутствуют достижимые
видимые медицинские понятия и контексты; несколько продуктово неоднозначных замен объявлены готовыми без решения
владельца; предложенный слой не имеет исполнимого общего пути для webapp + integrator и не закрывает patient,
public booking, auth и tenant-aware notifications. MWT-04–MWT-06 правильно оставлены открытыми, но владельцу пока
нельзя передавать §7 как полный decision packet.

## Blind kill-set, составленный до чтения evidence автора

1. Видимая поверхность или медицинское понятие отсутствует в инвентаре/матрице и после реализации остаётся
   hardcode-обходом режима.
2. Карта `patient_label`, его production-потребителей или tenant boundary не соответствует актуальному коду.
3. Platform copy смешан с редактируемым clinic/CMS content либо юридический текст предложено переключать
   автоматически.
4. Семантически или юридически спорная пара объявлена «однозначной» без owner-authority; вопрос D/Q потерян или
   противоречит другому пункту.
5. Архитектура оставляет второй бессрочный путь, не может использовать один typed layer во всех процессах/ролях,
   не получает режим exact organization либо не покрывает public/server channel.
6. Галочки плана и taskdb описывают состояние, которого evidence не доказывает.

## Findings

### F1 — MWT-01/MWT-02 пропустили реальные видимые понятия и контексты

Достижимый сценарий: wellness-клиника переключает режим, но врач продолжает видеть `Осмотр` и `Травмы и
операции`, пользователь Telegram/MAX — `результаты обследований`, `МРТ`, `рентген`, `остеопатия`,
`фасциальные манипуляции`, `лекарства` и `Онлайн-консультация`, а публичная запись `/book` — `Очный приём`,
`Онлайн-приём` и `Реабилитация онлайн`. Для этих понятий в §4 нет ни `TermKey` с парой, ни отдельного owner
question. Простое упоминание слова «осмотра» внутри объяснения D3 не задаёт его wellness-формулировку и не включает
три реальные подписи `Осмотр` в implementation manifest.

Отдельная фактическая ошибка: inventory утверждает, что `app/legal/**` не содержит ни `медицинск`, ни других
терминов, но `app/legal/terms/page.tsx:41-42` содержит `Медицинские решения` и `очную консультацию`. Вывод
«legal не переключать автоматически» верен; вывод «legal терминологически нейтрален» и сам инвентарь — нет.

Это меняет будущую реализацию: словарь и список потребителей, построенные по §4/§6, оставят перечисленные строки
за пределами единого режима. Поэтому заявленные `719` строк не являются полным проверяемым инвентарём: сами строки
в artifact не перечислены, а точная extraction-команда не дана. Ближайший воспроизводимый file census автора
также не совпал: команда ниже вернула `4129`, а не `4128`.

### F2 — §4.1 и Q8 превращают решения агента в owner-факты

Достижимый сценарий: исполнитель MWT-05 считает §4.1 утверждённым и меняет `Медицинская карта` на `Карта занятий`.
Но эта же поверхность содержит диагнозы, анамнез, осмотр, травмы и операции; `Карта занятий` сужает смысл, а не
является однозначным немедицинским эквивалентом. Аналогично №22 прямо обоснован тем, что `Ограничения` **расширяет**
смысл `Противопоказания`; изменение смысла и есть продуктовая развилка для владельца. Пары №8–10, №19–21 также
меняют клиническую семантику и не имеют отдельного owner-authority, кроме общего требования предложить варианты.

Лист вопросов дополнительно противоречит своей матрице: строка Q8 объявляет спорными D1–D10, но просит ответ только
по D1, D2, D4, D6, D7 и D8. D3, D5, D9 и D10 остаются спорными в §4.2, но не имеют однозначного способа ответа в
итоговом owner packet. Значит MWT-02 не закрыт, а MWT-04 подготовлен неполно.

### F3 — MWT-03 не задаёт исполнимый единый шов для всех процессов и ролей

Есть четыре независимых разрыва с наблюдаемым impact:

1. Словарь/`resolveTerms` помещён в `apps/webapp/src/modules/terminology`, но документ одновременно требует, чтобы
   его вызывал worker уведомлений. `apps/webapp/ARCHITECTURE.md:43-50` запрещает прямые импорты между
   `apps/webapp` и `apps/integrator`; общий чистый код должен жить в `packages/*`. В предложенном location
   integrator либо не соберётся, либо заведёт второй словарь.
2. Интерфейс runtime-port для patient principal уже существует, но утверждение «RLS и порт чтения уже существуют
   и не меняются» всё равно неполно: DB capability `app.read_authenticated_runtime_setting` имеет фиксированный
   allowlist (`20260825T084524_close_live_acceptance_runtime_roots.sql:110-134`) и классификацию
   `authenticated_client` (`:141-157`), где есть `patient_label`, но нет нового ключа. Без явного обновления тела
   этой capability patient read вернёт пустой результат/fallback вместо режима своей организации. §6 называет
   только seed нового значения и не назначает изменение accessor.
3. Integrator сейчас вызывает `getNotifTemplate(event, audience, db)` без `organizationId`, а
   `app.read_integrator_runtime_setting(text)` читает только `scope='admin' AND organization_id IS NULL`.
   §5/Q5 признаёт проблему, но design/manifest не задаёт новый exact-org port/capability и способ получить режим
   организации события. Это не архитектурный шов, на основании которого можно реализовать tenant-aware канал.
4. Провайдер запланирован для doctor, patient и `app/[clinicSlug]/**`, но отдельный живой flow `app/book/**` в
   список не входит, хотя содержит режимные строки. Обратная ошибка есть у global role login: acceptance row 15
   требует `Пациент → Клиент` на `/app`, где tenant ещё не выбран; источник per-org режима там не определён и
   owner question, аналогичного Q2/Q3, отсутствует.

Временный fallback `clinic_terminology_mode → patient_label` ограничен миграцией и сам по себе допустим; finding не
про него. Finding — отсутствие одного реально достижимого typed/read seam на всех обязательных поверхностях.

### F4 — plan/task state не соответствует факту

Из F1–F3 следует, что галочки MWT-01, MWT-02 и MWT-03 не имеют достаточного evidence и должны оставаться открытыми
до одного docs fix-round. MWT-04, MWT-05 и MWT-06 в target открыты корректно. `taskdb find` показывает `#1094`
в `blocked`, что согласуется с незавершённым workstream, но текст плана «следующий вход — ответы владельца» неверен:
сначала нужен исправленный полный inventory/matrix/architecture packet, иначе владелец ответит на неполный набор.

## Что подтвердилось

- Текущий `patient_label` действительно `scope=doctor`, `ownership=per_org`; exact production search дал `10`
  файлов с самим ключом и `3` файла с `resolvePatientTerms`. Жёсткие строки в `DoctorTodayQuickActions`,
  `doctorScreenTitles` и patient card подтверждают, что настройка сегодня меняет только часть поверхностей.
- Сохранённый clinic/CMS content и уже засеянные `reference_items` нельзя массово переписывать переключателем:
  `pgReferences.ts` редактирует exact organization rows через `insertItemStaff`, `updateItem`, `saveCatalog`.
- Фискальный fallback и legal/security copy нельзя автоматически смягчать режимом. Ошибка F1 касается полноты
  inventory, а не этой границы.
- Старый `patient_label` предложено удалить после bounded backfill; бессрочный двойной путь не заявлен.

## Exact commands и результаты

```bash
# Текущая механика: 10 production-файлов с ключом, 3 — с resolver.
rg -l --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'patient_label' apps/webapp/src | sort
rg -l --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'patient_label' apps/webapp/src | wc -l
# 10
rg -l --glob '!**/*.test.*' --glob '!**/*.spec.*' \
  'resolvePatientTerms' apps/webapp/src | wc -l
# 3

# Пропущенные видимые контексты doctor + Telegram/MAX.
rg -n 'label="Осмотр"|title: '\''Осмотр'\''|Травмы и операции|Онлайн-консультация|результаты обследований|МРТ|рентген|остеопатия|лекарства|Опишите травму или операцию' \
  apps/webapp/src/app/app/doctor/patients \
  apps/integrator/src/content \
  apps/webapp/src/app/book \
  apps/webapp/src/app/app/patient \
  apps/webapp/src/app/legal
# 3 product occurrences `Осмотр`; `Травмы и операции`; exact Telegram/MAX template hits listed above.

# Public booking, отсутствующий в provider/acceptance inventory.
rg -n 'Очный приём|Онлайн-приём|Реабилитация онлайн' apps/webapp/src/app/book
# PublicFormatStepClient.tsx:35,67,78

# Legal не нейтрален.
rg -n 'Медицинские решения|очную консультацию' apps/webapp/src/app/legal
# terms/page.tsx:41-42

# Candidate сам фиксирует спорную семантику и архитектурные утверждения.
rg -n 'app/legal/\*\*.*нейтральны|Ограничения.*расширяет|D1-D10|Нужен ответ|apps/webapp/src/modules/terminology|resolveTerms.*воркер|RLS и порт чтения уже существуют|монтируется.*тр[её]х|/\[clinicSlug\]/booking|Вход `/app`' \
  docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md

# Cross-app boundary, patient capability allowlist и global integrator read.
rg -n 'Нет ПРЯМЫХ импортов|read_authenticated_runtime_setting|patient_label|organization_id IS NULL|getNotifTemplate\(' \
  apps/webapp/ARCHITECTURE.md \
  apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts \
  apps/webapp/db/drizzle-migrations/20260825T084524_close_live_acceptance_runtime_roots.sql \
  deploy/postgres/integrator-server-runtime-config.sql \
  apps/integrator/src/infra/db/repos/notifTemplatePort.ts

# Ближайшая воспроизводимая команда к заявленным 4128 tracked files.
git ls-files 'apps/**/*.ts' 'apps/**/*.tsx' 'apps/**/*.sql' 'apps/**/*.json' 'packages/**/*.ts' | wc -l
# 4129

# Task state.
node /home/dev/brain/tools/taskdb.mjs find bcb "терминолог"
# #1094 {bcb} [blocked] Медицинский / оздоровительный режим терминологии
```

До exact searches выполнены `code-search` запросы по `patient_label`, patient settings/accessor,
integrator notification templates, видимому медицинскому copy, export/print/ICS, auth/join/public booking и
cross-app shared layer. Полный CI, тесты, БД, env, UI и продуктовый код не запускались и не менялись.

## Минимальный fix-round до повторного gate

Один docs-only проход по исходному plan/inventory:

1. Добавить полный воспроизводимый context inventory (не только aggregate counts) и пары/owner questions для
   пропусков doctor, patient, public `/book`, auth, legal, TG/MAX и остальных найденных каналов.
2. Перенести все семантически меняющие смысл пункты из «однозначных» в owner packet; Q8 должен однозначно принимать
   решение по каждому D-пункту.
3. Спроектировать общий package либо иной один канонический cross-process resolver; назвать exact patient-safe и
   integrator exact-org capabilities, source organization mode для события, wiring `/book` и правило для
   tenantless auth/global surfaces.
4. После исправления evidence синхронизировать MWT-01–MWT-03; MWT-04–MWT-06 не закрывать.
