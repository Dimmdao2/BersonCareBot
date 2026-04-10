# Platform Identity & Access — промпты EXEC / AUDIT / FIX (копипаст)

Источник плана: `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md`. Нормативка: `docs/PLATFORM_IDENTITY_ACCESS/SPECIFICATION.md`. Карта кода: `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`.

Каждый блок ниже — **цельный текст**: вставь в чат агента как есть, без подстановок.

---

## Последовательность выполнения

**Зачем опционально ПЕРВИЧНЫЙ_AUDIT (шаг 0):** это не часть MASTER_PLAN и **не обязателен**. Он нужен, когда к коду подходят «с холодной»: давно не трогали ветку, несколько параллельных PR, новый исполнитель — и **неочевидно**, что уже сделано и что фаза A не продублирует существующие куски. Результат — короткая **карта «уже есть / частично / нет» по фазам A–E**, без вердикта о закрытии инициативы. Если состояние репозитория и так известно — **сразу Фаза A — EXEC**.

Выполняй **строго по порядку** (закрытие инициативы — финальным сквозным аудитом и фиксом):

0. **ПЕРВИЧНЫЙ_AUDIT** — только по необходимости, **до** фазы A (см. блок промпта ниже)  
1. Фаза **A** — EXEC → AUDIT → FIX  
2. Фаза **B** — EXEC → AUDIT → FIX  
3. Фаза **C** — EXEC → AUDIT → FIX  
4. Фаза **D** — EXEC → AUDIT → FIX  
5. Фаза **E** — EXEC → AUDIT → FIX  
6. **GLOBAL_AUDIT** — сквозная проверка DoD и плана **после всех фаз**; решение «инициатива закрыта» или список остаточных зазоров  
7. **GLOBAL_FIX** — устранение зазоров, выявленных **GLOBAL_AUDIT** (если аудит не дал полного «зелёного» закрытия); затем повтор `pnpm run ci` и актуализация `AGENT_EXECUTION_LOG.md`

Ниже блоки: **ПЕРВИЧНЫЙ_AUDIT** (опционально), затем фазы A–E, в конце — **GLOBAL_AUDIT** и **GLOBAL_FIX**.

---

## ПЕРВИЧНЫЙ_AUDIT

Ты работаешь в репозитории BersonCareBot. Это **стартовый снимок** перед работой по `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md`: **только чтение и аудит**, без правок кода и без реализации фаз.

Цель: понять **что в коде уже есть** относительно инициативы Platform Identity & Access, чтобы следующий шаг **Фаза A — EXEC** не дублировал модули и не ломал уже начатую работу.

Опирайся на:
- `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §2, §3 DoD, §5 фазы A–E
- `docs/PLATFORM_IDENTITY_ACCESS/SPECIFICATION.md`
- `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`

Сделай по фактам в `apps/webapp` (и смежных путях из карты кода):
1. По **каждой фазе A, B, C, D, E** одной строкой: статус **нет / частично / похоже на готово** и **2–5 путей к файлам**, которые это подтверждают.
2. Три целевых модуля из §2 плана (access context / tier, trusted phone policy, route & API policy): есть ли явные зачатки или аналоги под другими именами; где сейчас живёт похожая логика (guards, `phone`, session).
3. Один абзац **рисков**: что сломается, если вслепую начать фазу A (дубли, конфликтующие guards, частичный перенос).
4. Рекомендация **одной фразой**: «можно начинать Фазу A — EXEC с фокусом на …» или «сначала уточнить у команды … из-за …».

**Не** выноси вердикт «инициатива закрыта» — это зона **GLOBAL_AUDIT** после всех фаз. **Не** предлагай большой рефакторинг; только картина для старта.

---

## Фаза A — EXEC

Реализуй **фазу A** из `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §5 «Контракт и кодовая точка истины» в `apps/webapp`.

Сделай:
1. Типы **access context**: `dbRole` и `tier` (tier осмыслен только для `client`; для doctor/admin — по `SPECIFICATION.md` §3).
2. Модуль **access context / tier**: резолв канона из БД и вычисление объекта с `canonicalUserId`, `dbRole`, `tier` и прочими полями, нужными потребителям; это единая точка политики для всех новых и переведённых проверок.
3. Модуль **trusted phone policy**: закрытый перечень того, что считается доверенной активацией телефона для tier **patient**. Любая новая запись в `phone_normalized` **не** считается trusted, пока явно не зарегистрирована в этой политике.
4. Обнови `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`: добавь явный список trusted-путей после реализации (раздел про trusted sources).

Не переходи к фазам B–E в этом задании. Соблюдай стиль и DI существующего webapp. Интеграционные ключи не выноси в env. По завершении — `pnpm run ci` и краткая запись в `docs/PLATFORM_IDENTITY_ACCESS/AGENT_EXECUTION_LOG.md`.

---

## Фаза A — AUDIT

Проверь **только фазу A** Platform Identity & Access: контракт access context и два модуля (tier resolution и trusted phone policy) плюс обновление `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`.

Критерии из `MASTER_PLAN.md` §5 фаза A и §2 таблица модулей:
- Типы и единая точка резолва tier из канона БД.
- Trusted policy — единственный закрытый перечень; нет автоматического trusted от любого writer `phone_normalized`.
- Документ сценариев содержит явный список trusted-путей.

Верни: соответствует / нет; конкретные файлы; что осталось доделать до «готово».

---

## Фаза A — FIX

Исправь недочёты **фазы A** по аудиту (или по собственной сверке с `MASTER_PLAN.md` §5 A и `SPECIFICATION.md` §3–§5). Не трогай фазы B–E, кроме минимальных правок типов/импортов, без которых фаза A не компилируется. `pnpm run ci`, обнови `AGENT_EXECUTION_LOG.md` при изменении поведения или контракта.

---

## Фаза B — EXEC

Реализуй **фазу B** из `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §5: канал ↔ канон и trusted resolution **до** лишних INSERT.

Сделай:
1. Усиль порядок на первом входе мессенджера: до `INSERT` нового `platform_users` — поиск существующего канона (integrator token, `integrator_user_id`, известные bindings, доверенные сигналы из проекций — по продуктовым правилам из спецификации).
2. Интегратор: события в духе `contact.linked`, `user.upserted`, `ensureClientFromAppointmentProjection` должны **сокращать дубли** и кормить канон; не подменяют server-side tier policy на web, но данные согласованы с каноном.

Якорные файлы для правок: `apps/webapp/src/infra/repos/pgIdentityResolution.ts`, `apps/webapp/src/modules/integrator/events.ts`, `apps/webapp/src/infra/repos/pgUserProjection.ts`, плюс связанный DI `apps/webapp/src/app-layer/di/buildAppDeps.ts` при необходимости.

Согласуй с **trusted phone policy** из фазы A. `pnpm run ci`, запись в `AGENT_EXECUTION_LOG.md`.

---

## Фаза B — AUDIT

Аудит **фазы B** только: порядок резолва до создания лишних `platform_users`, согласованность интеграторских событий и проекций с каноном, отсутствие обхода tier policy на web через события.

Проверь `pgIdentityResolution.ts`, `integrator/events.ts`, `pgUserProjection.ts` и вызовы из auth exchange. Результат: таблица находок с путями и P0/P1.

---

## Фаза B — FIX

Устрани зазоры **фазы B** по результатам аудита. Минимальный дифф; не ломай doctor/admin. `pnpm run ci`, `AGENT_EXECUTION_LOG.md`.

---

## Фаза C — EXEC

Реализуй **фазу C** из `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §5: session и входы.

Сделай:
1. На путях exchange (integrator token, Telegram initData/widget, OAuth callback, phone confirm): после резолва канона в cookie **канонический** userId везде, где штатный вход уже позволяет доверенно сопоставить identity; иначе сессия только в рамках **onboarding** без patient-доступа (DoD §2).
2. **Legacy `tg:…` vs UUID** — зафиксируй **архитектурное решение** в коде и кратко в существующих доках инициативы (не только runbook): либо временный onboarding-only compatibility mode, либо вытеснение из основных login flows; не оставляй формат, влияющий на access decisions, без явного решения.

Якорные файлы: `apps/webapp/src/modules/auth/service.ts`, `apps/webapp/src/app/api/auth/**`, типы `apps/webapp/src/shared/types/session.ts` при необходимости.

Учти ограничение Next.js: cookie не из произвольного RSC — перезапись в route handlers / server actions, как принято в проекте. `pnpm run ci`, `AGENT_EXECUTION_LOG.md`.

---

## Фаза C — AUDIT

Аудит **фазы C**: все exchange-пути записывают канонический id при доверенном сопоставлении; при невозможности — нет лазейки patient-доступа; решение по `tg:…` явно в коде/доке; нет опоры только на layout/guard как «первое исправление» неверного userId в cookie.

Укажи файлы и сценарии проверки вручную (кратко).

---

## Фаза C — FIX

Исправь недочёты **фазы C** по аудиту. `pnpm run ci`, `AGENT_EXECUTION_LOG.md`.

---

## Фаза D — EXEC

Реализуй **фазу D** из `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §5: **route & API policy** как единый модуль.

Сделай:
1. Whitelist guest / onboarding / patient для страниц под `/app/patient/*` (дерево `apps/webapp/src/app/app/patient/`) и **те же правила** для API и server actions через тот же access context из модуля tier.
2. Вытесни разрозненные guards и точечные проверки `phone` в patient-контуре в этот модуль или делегирование в него.

Runbook — только дополнение к архитектурному решению фазы C по legacy идентификаторам. `pnpm run ci`, обнови `SCENARIOS_AND_CODE_MAP.md` если изменился перечень маршрутов, `AGENT_EXECUTION_LOG.md`.

---

## Фаза D — AUDIT

Аудит **фазы D**: один модуль политики для маршрутов и API/server actions; нет расхождения «UI через tier, API через старые if phone»; onboarding — серверный запрет бизнес-действий вне whitelist.

Поиск по `apps/webapp` на остаточные `requirePatientAccess`, `getOptionalPatientSession`, разрозненные guards и прямые проверки телефона в patient-контуре; сверка с `SPECIFICATION.md` §4.

---

## Фаза D — FIX

Устрани находки **фазы D**. Минимальный дифф. `pnpm run ci`, `AGENT_EXECUTION_LOG.md`.

---

## Фаза E — EXEC

Реализуй **фазу E** из `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` §5: тесты, наблюдаемость, документация.

Сделай:
1. Тесты: OAuth без телефона → onboarding; канон с телефоном плюс новый канал → OTP → patient; legacy client без телефона → onboarding; **негативные**: API или server action в onboarding без whitelist → отказ.
2. Проверь наличие логирования по DoD §8 в `MASTER_PLAN.md` §3 пункт 8.
3. `pnpm run ci` зелёный; обнови `docs/PLATFORM_IDENTITY_ACCESS/AGENT_EXECUTION_LOG.md`; при необходимости кратко обнови `docs/README.md` только если инициатива стала видимой на верхнем уровне доков (не раздувай).

---

## Фаза E — AUDIT

Аудит **фазы E** и закрытия DoD целиком для пунктов §1–§4 и §8 из `MASTER_PLAN.md` §3: тесты покрывают сценарии из `SCENARIOS_AND_CODE_MAP.md` §3–§6 и негативы; логи дают ответ «почему onboarding»; CI проходит; журнал выполнения актуален.

---

## Фаза E — FIX

Доведи **фазу E** до критериев аудита: добавь недостающие тесты или логи, правки доков без секретов. `pnpm run ci`, `AGENT_EXECUTION_LOG.md`.

---

## GLOBAL_AUDIT

Ты работаешь в репозитории BersonCareBot. Фазы **A–E** инициативы Platform Identity & Access по плану **уже реализованы** (или считаешься в точке «вся запланированная работа по фазам сделана»). Проведи **финальный сквозной аудит без правок кода** — это шаг **закрытия инициативы**: подтвердить соответствие DoD и отсутствие регрессий по всему контуру.

Опирайся строго на:
- `docs/PLATFORM_IDENTITY_ACCESS/MASTER_PLAN.md` (§2 три модуля, §3 DoD §1–§4 и §8, §5 фазы A–E, §6 риски)
- `docs/PLATFORM_IDENTITY_ACCESS/SPECIFICATION.md`
- `docs/PLATFORM_IDENTITY_ACCESS/SCENARIOS_AND_CODE_MAP.md`

Проверь по фактам в коде:
1. Есть ли **ровно три** централизованных модуля с фиксированной ответственностью: access context / tier; trusted phone policy (закрытый перечень доверенных путей записи телефона для tier patient); route & API policy (единый whitelist и те же правила для страниц, API и server actions). Нет ли параллельных guard-файлов с дублирующей бизнес-логикой без делегирования в эти модули.
2. Для роли `client`: вычисляется ли tier guest / onboarding / patient согласно спецификации; для doctor/admin tier не смешан с patient-политикой.
3. Session cookie: в штатных точках входа после доверенного сопоставления с каноном попадает ли **канонический** userId; где сопоставление невозможно — нет ли patient-доступа до прояснения (явная onboarding-only сессия и политика).
4. Onboarding: запрещены ли **бизнес-действия на сервере** вне серверного whitelist активации (REST, route handlers, server actions), а не только в UI.
5. Patient-зона `/app/patient/*` и релевантные API/server actions: один ли access context из модуля tier, или остались точечные проверки телефона в обход него.
6. Multi-channel и `findOrCreateByChannelBinding`: порядок до INSERT нового `platform_users` — есть ли попытка найти канон; нет ли повторного bind-phone при уже доверенном телефоне у канона для доверенно привязанного канала; нет ли «угадывания» identity без доверия.
7. Интегратор: `apps/webapp/src/modules/integrator/events.ts`, проекции `apps/webapp/src/infra/repos/pgUserProjection.ts` — согласованы ли записи в БД с каноном; не обходят ли события tier на web.
8. Наблюдаемость: есть ли структурированное логирование причины tier, trusted / неTrusted на критичных шагах, события merge / phone_bind / критичные projection; без сырого телефона в логах при политике проекта.
9. Конфигурация интеграций: новые ключи не через env — через `system_settings` и правила репозитория.

Выдай отчёт: для каждого пункта — **статус** (соответствует / частично / нет / не применимо), **файлы и символы** (пути от корня репо), **риск регрессии**, **что осталось сделать** кратко. В конце — явный вердикт: **«инициатива закрыта»** или **«не закрыта»** с обоснованием; упорядоченный список остаточных зазоров P0/P1/P2, если вердикт отрицательный. Не предлагай большой рефакторинг в этом сообщении; только фиксацию зазоров для последующего GLOBAL_FIX.

---

## GLOBAL_FIX

Ты работаешь в репозитории BersonCareBot. Непосредственно перед этим выполнен **GLOBAL_AUDIT** (финальный сквозной аудит после фаз A–E). Используй **его выводы** как вход (если в чате нет отчёта — не вызывай этот промпт; сначала выполни GLOBAL_AUDIT).

Задача: **устранить остаточные зазоры** до полного закрытия инициативы, с минимальным диффом, без расширения scope вне DoD плана. Соблюдай правила репозитория: интеграционный конфиг в `system_settings`, не в env; зеркалирование webapp/integrator для новых ключей по существующим правилам; doctor/admin без регрессий.

Порядок работы:
1. Закрой все P0 из отчёта GLOBAL_AUDIT.
2. Затем P1, затем P2 по согласованию с приоритетом продукта и риском.

После изменений выполни `pnpm install --frozen-lockfile` и `pnpm run ci` из корня монорепо. Обнови `docs/PLATFORM_IDENTITY_ACCESS/AGENT_EXECUTION_LOG.md` строкой с датой, кратким описанием закрытия хвостов и ссылкой на коммит или PR. Не добавляй в документацию секреты.

Если после фикса зазоры остаются — зафиксируй их в отчёте и в журнале; при необходимости повтори цикл **GLOBAL_AUDIT → GLOBAL_FIX** до вердикта «инициатива закрыта» или до явного решения владельца продукта о добивке вне текущего DoD.
