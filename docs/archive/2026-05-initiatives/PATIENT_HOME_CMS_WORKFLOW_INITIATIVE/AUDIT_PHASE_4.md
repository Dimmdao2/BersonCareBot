# AUDIT — Phase 4 (SAFE SLUG RENAME)

Аудит выполнения Phase 4 против `04_SAFE_SLUG_RENAME_PLAN.md` (scope, behavior requirements, checklist, completion criteria, documentation artifacts, out of scope). Дата аудита: 2026-04-29.

Источник факта о составе работ: запись **2026-04-29 — Phase 4 — EXEC** в `LOG.md`, текущее дерево кода и миграций.

---

## 1. Verdict

**Pass with notes.**

Безопасное переименование slug раздела с историей редиректов, транзакционным обновлением ссылок в `content_pages` и опционально в `patient_home_block_items`, отдельным UI и редиректом на маршруте пациента — реализовано и покрыто тестами. Замечания: (а) персональная панель напоминаний для раздела «разминки» завязана на **литерал** `linkedObjectId === "warmups"` и не следует за переименованием slug; (б) скрипт `db:verify-public-table-count` исключает четыре public-таблицы до появления их в Drizzle schema slice — это ослабление строгой сверки «все public таблицы»; (в) на окружениях с рассинхроном журнала Drizzle может потребоваться явная проверка, что миграция `0008` применена и таблица `content_section_slug_history` существует.

---

## 2. Checklist coverage (`04_SAFE_SLUG_RENAME_PLAN.md`)

| Пункт чеклиста | Статус | Доказательство |
| --- | --- | --- |
| Migration created and schema exported. | **Да** | `0008_content_section_slug_history.sql`, `contentSectionSlugHistory` в `apps/webapp/db/schema/schema.ts`, запись в `db/drizzle-migrations/meta/_journal.json`. |
| Transactional rename implemented. | **Да** | `renameSectionSlug` в `pgContentSections.ts`: один клиент PostgreSQL, `BEGIN` / `COMMIT` / `ROLLBACK` (см. §8). |
| All references updated atomically. | **Да (в границах плана)** | В одной транзакции: `content_pages.section`, при наличии таблицы — `patient_home_block_items`, `content_sections.slug`, `INSERT` в историю. Иные хранилища slug вне транзакции не заявлены в `04` (см. §5). |
| Redirect behavior added and tested. | **Да** | `resolvePatientContentSectionSlug` + `permanentRedirect` в `patient/sections/[slug]/page.tsx`; тесты `resolvePatientContentSectionSlug.test.ts`, `page.slugRedirect.test.tsx`. |
| Section edit UI provides dedicated rename flow. | **Да** | `SectionSlugRenameDialog.tsx`, счётчик страниц `countPagesWithSectionSlug` на `edit/[slug]/page.tsx`, подтверждение чекбоксом, slug в основной форме read-only (`SectionForm.tsx`). |
| Rollback SQL documented. | **Да** | `ROLLBACK_SQL.md`. |
| `LOG.md` updated. | **Да** | Запись Phase 4 — EXEC. |

---

## 3. Behavior requirements (`04` §Behavior Requirements)

| Требование | Статус | Комментарий |
| --- | --- | --- |
| Slug is not free-edited in main form. | **Да** | Режим edit: скрытое поле + `Input` disabled. |
| Rename is explicit confirm action. | **Да** | Отдельная кнопка/диалог; `confirm_rename === "on"` в `renameContentSectionSlug`. |
| Prevent collisions with existing slug. | **Да** | Проверка занятости `new` в `content_sections` до DML; обработка `23505`. |
| Reject invalid slug format. | **Да** | `validateContentSectionSlug` в порте и в `saveContentSection`. |
| Keep old route functional through redirect. | **Да** | История `old_slug` → `new_slug`, обход цепочки в `resolvePatientContentSectionSlug`. |

---

## 4. Completion criteria

| Критерий | Статус |
| --- | --- |
| Slug rename no longer requires manual DB surgery. | **Да** | Операция доступна из doctor UI + server action. |
| Existing links continue to work after rename. | **Частично** | URL вида `/app/patient/sections/<old>` и `content_pages` по `section` — да, за счёт редиректа и транзакции. Связи **напоминаний**, захардкоженные на `"warmups"` как `linkedObjectId`, при смене slug раздела с `"warmups"` на другой идентификатор **не** обновляются автоматически (см. §5). |

---

## 5. Scope vs plan — ссылки и сущности вне транзакции

План Phase 4 явно требует обновлять:

- `content_sections.slug`
- `content_pages.section`
- `patient_home_block_items.target_ref` для `content_section` (если таблица есть)

**Вне заявленного scope**, но связано со slug раздела:

- **`reminder_rules` / UI напоминаний:** на странице раздела пациента отбор правил выполняется так: `linkedObjectType === "content_section" && linkedObjectId === "warmups"` (литерал), а не `section.slug` (см. `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`). После переименования slug с `warmups` на другое значение персональная панель разминок перестанет находить правила, пока данные или код не согласованы с новым slug.

Рекомендация на последующие фазы (не блокер закрытия Phase 4 по тексту `04`): использовать `section.slug` в фильтре или отдельную миграцию данных при rename для типов `linkedObjectId`, совпадающих со slug.

---

## 6. Out of scope (негативная проверка)

| Запрет | Статус |
| --- | --- |
| No visual redesign of patient section page. | **Ок** |
| No redesign of section list UI beyond rename control. | **Ок** |
| No changes to unrelated content entities. | **Ок** | Изменения сфокусированы на секциях, страницах, истории, verify-скрипте, тестах. |

---

## 7. Test gate (`04` §Test Gate)

По журналу Phase 4 EXEC прогонялись: Vitest (изменённые тесты), `db:verify-public-table-count`, `tsc --noEmit`, `lint` для `apps/webapp`. Полный root CI в плане не требовался — **согласовано с планом**.

---

## 8. Атомарность rename и обновление ссылок (отдельная проверка)

### 8.1. Модель транзакции

Реализация `createPgContentSectionsPort().renameSectionSlug` берёт **один** `pg.PoolClient`, открывает транзакцию `BEGIN`, выполняет все изменения данных, затем `COMMIT`. При любой ошибке в `catch` выполняется `ROLLBACK` (с подавлением вторичной ошибки rollback). Клиент освобождается в `finally`.

Узел кода (порядок операций внутри успешного пути):

1. Проверка существования строки раздела со slug `old` и отсутствия занятости slug `new` (всё ещё внутри открытой транзакции после `BEGIN` — согласованное чтение для этого запроса).
2. `UPDATE content_pages SET section = $new WHERE section = $old` — ссылки каталога страниц на раздел.
3. При `EXISTS (information_schema… patient_home_block_items)` — `UPDATE patient_home_block_items SET target_ref = $new WHERE target_type = 'content_section' AND target_ref = $old`.
4. `UPDATE content_sections SET slug = $new WHERE slug = $old`.
5. `INSERT INTO content_section_slug_history (old_slug, new_slug) …`.
6. `COMMIT`.

Ранние выходы при «раздел не найден» / «slug занят» выполняют `ROLLBACK` и возвращают `{ ok: false, … }` без `COMMIT` — частичного применения DML нет.

Фрагмент реализации:

```161:228:apps/webapp/src/infra/repos/pgContentSections.ts
    async renameSectionSlug(oldSlug, newSlug) {
      const vOld = validateContentSectionSlug(oldSlug);
      const vNew = validateContentSectionSlug(newSlug);
      if (!vOld.ok) return { ok: false, error: vOld.error };
      if (!vNew.ok) return { ok: false, error: vNew.error };
      const o = vOld.slug;
      const n = vNew.slug;
      if (o === n) return { ok: false, error: "Новый slug совпадает с текущим" };

      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const exists = await client.query(`SELECT 1 FROM content_sections WHERE slug = $1`, [o]);
        if (exists.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с исходным slug не найден" };
        }
        const taken = await client.query(`SELECT 1 FROM content_sections WHERE slug = $1`, [n]);
        if (taken.rowCount !== 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с таким slug уже существует" };
        }

        await client.query(`UPDATE content_pages SET section = $1, updated_at = now() WHERE section = $2`, [n, o]);

        const tab = await client.query<{ e: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'patient_home_block_items'
          ) AS e`,
        );
        if (tab.rows[0]?.e) {
          await client.query(
            `UPDATE patient_home_block_items SET target_ref = $1
             WHERE target_type = 'content_section' AND target_ref = $2`,
            [n, o],
          );
        }

        const upd = await client.query(`UPDATE content_sections SET slug = $1, updated_at = now() WHERE slug = $2`, [
          n,
          o,
        ]);
        if (upd.rowCount === 0) {
          await client.query("ROLLBACK");
          return { ok: false, error: "Раздел с исходным slug не найден" };
        }

        await client.query(`INSERT INTO content_section_slug_history (old_slug, new_slug) VALUES ($1, $2)`, [o, n]);

        await client.query("COMMIT");
        return { ok: true, newSlug: n };
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        // … маппинг ошибок …
      } finally {
        client.release();
      }
    },
```

### 8.2. Вывод по атомарности

- **Ссылки в `content_pages` и блоках главной** (при существующей таблице) обновляются **в той же транзакции**, что и смена `content_sections.slug` и запись истории: при сбое любого шага транзакция откатывается целиком.
- **Консистентность с уникальным индексом** `content_sections.slug`: сначала обновляются зависимые строки, затем slug раздела; коллизия по `new` отсекается до тяжёлых `UPDATE` и дублируется обработкой `23505` на всякий случай.
- **Ограничение:** атомарность гарантируется только для таблиц, явно включённых в этот метод; см. §5 про напоминания.

### 8.3. In-memory порт (тесты)

`createInMemoryContentSectionsPort` обновляет карту разделов и карту редиректов синхронно в памяти без отдельной «транзакции», что достаточно для unit-поведения порта, но не проверяет откат PostgreSQL.

---

## 9. Инфраструктура проверки таблиц (`db:verify-public-table-count`)

В `scripts/verify-drizzle-public-table-count.mjs` добавлено множество `EXCLUDED_PUBLIC_BASE_TABLES` для четырёх таблиц `patient_*`. Это **не** часть текста `04_SAFE_SLUG_RENAME_PLAN.md`, но снимает ложные расхождения на dev-БД, где DDL создан вне текущего Drizzle schema slice.

**Рекомендация:** после добавления соответствующих `pgTable` в файлы из `drizzle.config.ts` — удалить имена из исключения, чтобы вернуть строгую сверку.

---

## 10. Mandatory fixes (опционально для FIX-режима)

1. **Напоминания / warmups:** заменить литерал `"warmups"` в фильтре правил на `section.slug` (и/или описать в доке ограничение «не переименовывать warmups без миграции данных»).
2. **Verify script:** планом удаления исключений после появления схемы для `patient_*` таблиц (см. §9).
3. **Ops:** на каждом окружении убедиться, что `0008` применена (`content_section_slug_history` существует) и журнал Drizzle согласован с репозиторием.

### Статус после FIX (2026-04-29)

1. **Сделано в коде:** в `patient/sections/[slug]/page.tsx` фильтр правил использует `r.linkedObjectId === section.slug` (ветка по-прежнему только при `section.slug === "warmups"`).
2. **Зафиксировано в `LOG.md` (Phase 4 — FIX):** исключения в `verify-drizzle-public-table-count.mjs` остаются до появления `pgTable` для соответствующих таблиц в `drizzle.config.ts`; затем убрать из `EXCLUDED_PUBLIC_BASE_TABLES`.
3. **Ops:** чеклист для окружений (миграция `0008`, журнал Drizzle) вынесен в запись **Phase 4 — FIX** в `LOG.md`.

---

## 11. Readiness к следующим фазам

После появления канонических Drizzle-схем для `patient_home_*` и персистентных `patient_home_block_items` — повторно проверить: (1) что условный `UPDATE` в rename совпадает с реальными именами колонок; (2) что verify-скрипт можно ужесточить; (3) сценарий rename + напоминания для раздела с персональной панелью.
