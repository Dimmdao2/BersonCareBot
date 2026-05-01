# Синхронизация документации и статус PASS (release-ready)

**Дата:** 2026-04-29  
**Цель:** устранить противоречия между устаревшими абзацами `FINAL_AUDIT.md` (§2–§5, §7 до синхронизации) и фактическим кодом после батча `0009` + `deps.patientHome`; зафиксировать канонический статус плана и остатки.

## Что было не так (до правки документов)

1. **`FINAL_AUDIT.md` §4** описывал blockers (нет `patient_home_*`, demo editor, только `revalidatePath`), хотя **§10** уже фиксировал обратное — читатель получал противоречивый вердикт.
2. **§2** не упоминал `0009`, `patientHome.ts`, `pgPatientHomeBlocks.ts`, `service.ts`; счётчик таблиц в примере команд был устаревшим.
3. **§3.3** не отражал персистентную привязку inline-create к `patient_home_block_items` и сохранение icon/cover.
4. **§5–§7** частично дублировали «что делать дальше», хотя работы по плану release-ready уже выполнены.

## Что сделано в этой доработке (документация)

- Приведён **`FINAL_AUDIT.md`** к одному narrative: актуальные проверки, таблица целей, findings только **после** release-ready (остатки / backlog).
- Добавлен **`CMS_RELEASE_READY_PLAN_STATUS.md`** — чеклист плана со статусом **PASS** по пунктам кода/CI и **OPEN** только для ручного QA.
- Этот файл (**`DOC_SYNC_AND_PASS_CLOSURE.md`**) — журнал причин и scope доработки доков.
- Обновлены **`README.md`** инициативы (ссылки) и корневой **`docs/README.md`** (индекс активных инициатив); **`LOG.md`** (запись синхронизации).

## Остатки (не блокируют PASS по коду/CI)

| Тема | Статус | Примечание |
|------|--------|------------|
| Ручной smoke по `06_QA_RELEASE_PLAN.md` | OPEN | Обязателен для продуктового «release signed off» |
| Миниаппа бота / отдельный patient home entry | Вне scope release-ready | Основной контракт закрыт на `/app/patient` + doctor editor; при необходимости parity — отдельная задача |
| `content_section_slug_history` / rename в raw SQL в `pgContentSections` | Backlog | Работает; перенос на Drizzle — отдельный refactor, не регресс release-ready |
| Clean-arch: `service.ts` в eslint allowlist, legacy `repository.ts` / `newsMotivation` | Известный долг | См. `eslint.config.mjs`, `LEGACY_CLEANUP_BACKLOG` при расширении зоны |

## Канонический статус плана

Использовать **`CMS_RELEASE_READY_PLAN_STATUS.md`** как единственный чеклист «план vs pass» внутри репозитория.
