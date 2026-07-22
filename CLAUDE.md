# CLAUDE.md — авто-загружается КАЖДЫМ агентом в этом репозитории.

## 🔴 ПРИ СТАРТЕ — ЖЁСТКО прочитать правила по единому источнику
**Единый источник правил агентов — `AGENTS.md` в корне репозитория. Прочитай его ПЕРЕД любой работой**
(там оглавление + канон в `.cursor/rules/*.mdc`, на которые он ссылается). Правила НЕ дублируются здесь —
чтобы не было рассинхрона у агентов разных моделей. При работе по теме читай релевантные `.cursor/rules/*.mdc` целиком.

→ **`AGENTS.md`** (мастер-вход) · **`.cursor/rules/*.mdc`** (канон scoped-правил, приоритет при расхождении).

## 📁 Инфо по репо (куда смотреть)
- Архитектура: `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md`, `ARCHITECTURE.md`, `apps/webapp/ARCHITECTURE.md`.
- Dev/тестирование: `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`. Деплой/прод: `deploy/HOST_DEPLOY_README.md`.
- Оркестрация/автономная работа: `docs/AGENT_AUTORUN_SCHEME.md` + repo-specific bindings
  `docs/ORCHESTRATION_BINDINGS.md` (обязательный практический канон BersonCare: scope, model/effort, timing,
  audit/fix, документация и provenance решений). Ведёшь план из многих этапов — раздел **«Универсальный режим
  исполнения многоэтапного плана»** там обязателен: аудит по риску + потолок кругов, параллель независимых слайсов,
  приёмка владельца в СЕРЕДИНЕ плана («audit PASS» ≠ «готово»), развилки владельца заранее одним листом.
- Owner lesson 2026-07-22: roadmap summary никогда не заменяет linked detailed checklist. Каждый worker/auditor
  получает exact atomic checkbox set и возвращает построчную evidence matrix; missing/unclassified пункт запрещает
  `done/PASS`. Новое owner-уточнение сразу заменяет или явно маркирует старый текст `SUPERSEDED`, без конфликтующих
  active-инструкций. Полный канон — `docs/ORCHESTRATION_BINDINGS.md` §«Урок 2026-07-22».

## 🤖 Для луп/автономных агентов (этот бокс)
- **Два слоя правил:** ОБЩЕЕ → AGENTS.md (выше). РОЛЕВОЕ (твоя роль луп-агента, ДОПОЛНЯЕТ, не дублирует) →
  `/home/dev/dev-projects/.lead/PIPELINE.md` + твой промт: одна задача=один агент, карточка→воркер→независимый
  аудит→контроль владельца, НЕ push/merge/deploy, отчёт+вердикт, гейт по ресурсам, логи через ledger.sh.
- Регламент прогона (карточка → воркер → **независимый аудит** → контроль владельца): `/home/dev/dev-projects/.lead/PIPELINE.md`.
- Порядок работ: `/home/dev/dev-projects/.lead/PLAN.md`. Журнал: `/home/dev/dev-projects/.lead/LEDGER.md`.
- Аудитор обязан проверять СОБЛЮДЕНИЕ правил из `AGENTS.md`/`.cursor/rules` (изоляция, no raw SQL, dev/prod, ветки/деплой), а не только «работает ли».
