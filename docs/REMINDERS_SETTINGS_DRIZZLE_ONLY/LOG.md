# LOG — REMINDERS_SETTINGS_DRIZZLE_ONLY

Правила: после каждого этапа (0–3, финал) — блок с датой, сделано, проверки, решения, что не делали (scope).

---

## 2026-05-13 — Stage 0 (bootstrap)

### Сделано

- Созданы `README.md`, `STAGE_PLAN.md`, `LOG.md` в `docs/REMINDERS_SETTINGS_DRIZZLE_ONLY/`.

### Проверки

- [x] Пути файлов согласованы с планом (относительные ссылки на репозиторий).

### Решения

- Playbook и политика DDL объединены в README + STAGE_PLAN для единой точки входа; дальнейшие этапы дополнят `docs/README` и `apps/webapp/scripts/README`.

### Не делали (scope)

- Не меняли `vitest.globalSetup.ts`, integrator SQL, Drizzle schema.

---

## 2026-05-13 — Stage 1 (политика + ссылки)

### Сделано

- В [`docs/README.md`](../README.md) добавлена строка в «Активные инициативы».
- В [`apps/webapp/scripts/README.md`](../../apps/webapp/scripts/README.md) добавлен подпункт со ссылкой на инициативу.

### Проверки

- [x] `rg "REMINDERS_SETTINGS_DRIZZLE_ONLY" docs/README.md`
- [x] Политика в [`README.md`](./README.md) инициативы согласована с планом (`ALLOWED_KEYS`, запрет новых `apps/webapp/migrations`).

### Решения

- Отдельная строка в `DB_STRUCTURE.md` / `HOST_DEPLOY_README.md` не добавлялась (в плане — опционально).

### Не делали (scope)

- Не меняли код приложения, только документация.

---

## 2026-05-13 — Stage 2 (playbook)

### Сделано

- Playbook webapp + integrator зафиксирован в [`STAGE_PLAN.md`](./STAGE_PLAN.md) (Drizzle generate/migrate, integrator `core` SQL, глобальный порядок `fileName`, `migrate-all.sh`, DoD фичи, `system_settings` mirror).
- После аудита: в `STAGE_PLAN` добавлен playbook **§0** (имена таблиц, омоним `user_reminder_rules`, `rg` по новым миграциям); блок «Проверки» Stage 2 выровнен с фактическим содержанием файлов.

### Проверки

- [x] В [`README.md`](./README.md) §«Политика DDL» перечислены таблицы зоны в `public` (в т.ч. `reminder_rules`, projection `user_reminder_rules`, `system_settings`).
- [x] В [`STAGE_PLAN.md`](./STAGE_PLAN.md) playbook §0 явно фиксирует `reminder_rules`, `integrator.user_reminder_rules`, `integrator.system_settings`, команду `rg` по новым миграциям; §4 и блок «Ссылки на правила» — `.cursor/rules/system-settings-integrator-mirror.mdc`.

### Решения

- Опциональную таблицу имён ключей `system_settings` не дублировали — достаточно ссылки на `ALLOWED_KEYS` в [`README.md`](./README.md).

### Не делали (scope)

- Не добавляли SQL в integrator и не меняли `migrate.ts`.

---

## 2026-05-13 — Stage 3 (Vitest / legacy)

### Сделано

- Зафиксировано в [`STAGE_PLAN.md`](./STAGE_PLAN.md) поведение [`vitest.globalSetup.ts`](../../apps/webapp/vitest.globalSetup.ts) и CI без `DATABASE_URL`; в backlog добавлены **B1** / **B2**.

### Проверки

- [x] Код `vitest.globalSetup.ts` **не менялся** (нет решения «меняем код» + нет минимального патча с двойным прогоном тестов по критериям плана).

### Решения

- Правку опционального env (`VITEST_SKIP_LEGACY_MIGRATE`) отложили до отдельной задачи после явного решения в `LOG` и тестов.

### Не делали (scope)

- Не внедряли B1/B2 в CI в этом PR.

---

## 2026-05-13 — Final (CI)

### Сделано

- Прогон из корня: `pnpm install --frozen-lockfile && pnpm run ci`.

### Проверки

- [x] `pnpm run ci` завершился с **exit code 0** (~3.6 min на этой машине).

### Решения

- Инициатива остаётся **active**; закрытие как «initiative closed» не требуется (документный процесс, не разовый релиз фичи).

### Не делали (scope)

- Не расширяли scope за пределы плана исполнения.
