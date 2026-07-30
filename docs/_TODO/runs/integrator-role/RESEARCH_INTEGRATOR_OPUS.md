Verified the contradiction myself. Below are corrections to the report I gave — three of them are material, and one overturns my top recommendation.

## Проверено мной лично (не субагентом)

| Утверждение | Вердикт |
|---|---|
| `integratorPoolProvider.ts` не существует (агент №5) | **Неверно.** Файл есть: `[redacted-token].ts`, импортируется `infra/db/client.ts:8` и `[redacted-token].ts:10`. Прав был агент №2: это **не наследие**, а живая SaaS-плумбинг ролей. Моя исходная поправка остаётся в силе |
| `legacyCleanupMatrix.ts` — ноль импортёров | **Подтверждено.** Grep по всему `apps/` даёт один файл — сам себя |
| Существует Track D / WORK_ORDER.md | **Подтверждено:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` |
| `repos/topics.ts` / `repos/subscriptions.ts` — ноль импортёров | **Не проверено мной.** Мой grep искал путь `repos/topics`, а соседи внутри `repos/` импортируются как `./topics.js`. Опираюсь на замер агента №2 — средняя уверенность, перед удалением перепроверить |

---

## ⛔ КОРРЕКЦИЯ №1 — самая важная: я ошибся в главной рекомендации

**Я записал projection/outbox (1 060 строк) в «Ярус A — удалить, риск близок к нулю». Это неверно.**

`repos/projectionFanout.ts` прочитан целиком, комментарий в коде дословный:

> *«Try immediate signed POST to webapp; enqueue outbox only when emit fails... **Keeps worker as retry path instead of the default delivery path**»*

Счастливый путь — синхронный подписанный HTTP POST. **Outbox — путь отказа, а не путь доставки.** Все 8 вызовов `enqueueProjectionEvent` в `writePort.ts` (`:646,767,838,925,1004,1059,1437,1764`) — обработчики ошибок с логом *«direct public write failed, fell back to durable outbox»*. `projectionOutboxLoop` — безусловный `while(true)` без флага (`worker/main.ts:121-132`), прод крутит `bersoncarebot-worker-prod.service`, а `deploy/host/assert-c4-operational-runtime-ready.sh:115` при проверке готовности **специально пробует запись в `integrator.projection_outbox`** под ролью `app_operational_delivery_worker`.

Удаление этого — не удаление мёртвого кода, а **снятие страховки с живого продового пути записи**. Это задача секвенирования, а не чистки. DLQ здесь — `status='dead'`, автоматического redrive нет вообще, единственный выход — ручной `requeue-projection-outbox-dead.ts` (84 строки).

**Безопасно удаляется сегодня ровно один файл: `legacyCleanupMatrix.ts`, 115 строк.**

## ⛔ КОРРЕКЦИЯ №2 — у этой работы уже есть план владельца, и я его не увидел

`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, **Track D, карточка `#987`**, решение владельца **2026-07-23**: *«unified PostgreSQL target must not keep HTTP as an internal projection transport»*. Пакет **D10 — projection transport teardown, last** — это буквально то, что я предлагал в Ярусе A. Он `[ ]`, не начат, и **загейчен за D3–D8** (support, reminders, mailing), которые тоже `[ ]`. Сделаны только D1, D2, частично D5, D9.

По STOP-GATE из AGENTS.md («документ побеждает, агент перестраивает план») мой Ярус A должен быть заменён ссылкой на Track D, а не конкурировать с ним. Реальный вопрос владельцу здесь не «что резать» — это уже решено — а **почему D3–D8 стоят с 23.07**.

## ⛔ КОРРЕКЦИЯ №3 — цифры истории завышены

| Было у меня | Стало |
|---|---|
| 2 052 строки удаляются правкой кода, риск ~0 | **115 строк** удаляются сегодня. ~1 563 строки (3.7%) внутри интегратора историчны, но живые или загейчены за D3–D8 |
| ≈11 700 строк двухбазового следа по репо | **≈5 150 строк** (1 563 внутри + ~3 584 снаружи). Моя первая цифра включала `webappEventsClient.ts` целиком — но ~490 из его 617 строк это **легитимные выжившие вызовы** (channel-link, phone bind, web-push, support sync), явно сохранённые в `DATABASE_UNIFIED_POSTGRES.md` §«Что остаётся HTTP» |
| Тестов по projection «мало» | Их **308 строк**, и единственный в интеграторе (`legacyAppointmentProjectionTransport.contract.test.ts`, 77) добавлен **вчера, 30.07**, как guard *от* удаления. Поведение projection тестируется внутри широких наборов `writePort` — значит демонтаж заставит править чужие тесты, а не удалять свои |
| Миграций наследия «430 строк» | По outbox/projection — **2 миграции, 26 строк** |

## ✅ Что закрылось из «не смог установить»

**Дата унификации установлена** (частично — `git log --grep` и `--diff-filter` были запрещены, «added» = старейший коммит, трогавший путь):

- `83be46d4b` **13.04.2026** — `docs: unified PostgreSQL model (integrator + public, direct SQL)`
- `7981a7bf0` **14.04.2026** — `fix(webapp): migration runner uses public ledger on unified Postgres` (рантайм-переключение)
- `4a8b61d03` **15.04.2026** — завершение

**Outbox построен 19.03 → 13.04.2026 — за три с половиной недели до того, как архитектуру, ради которой он существовал, вывели из эксплуатации.**

Уточнение по связности: барьер `kernel/contracts/index.ts` импортируют **144 файла из 288 (50%)**, а не 124/43% — буквальный grep по пути недосчитывает внутрикернельные `../contracts/index.js` на 15%. Второго хаба нет: 144 → 62 (`logger`) → 33 (`organizationPrincipal`), дальше ничего выше 23.

## Новое, требующее проверки на проде

`docs/ARCHITECTURE/DB_DUMPS/public_bcb_webapp_dev_schema.sql:2825` показывает таблицу **`public.projection_outbox`**, дублирующую `integrator.projection_outbox` — похоже на артефакт прогона миграций интегратора под `search_path=public`. Стоит убедиться, что её нет в проде.

И ловушка для чистки: шесть gate-скриптов (`scripts/stage{4,6,7,9,11,13}-release-gate.mjs`) шеллят в `projection-health` и reconcile-скрипты. Удаление health-тулинга сломает CI-гейты, номинально охраняющие несвязанные этапы.

---

## Пересобранный список: что резать

1. **`legacyCleanupMatrix.ts` (115 строк)** — единственное, что удаляется сегодня без секвенирования.
2. **`repos/topics.ts` + `repos/subscriptions.ts` (145 строк)** — вероятно ноль импортёров, но **сначала перепроверить** `./topics.js` / `./subscriptions.js`.
3. **~10 недостижимых `case`-веток** в `executeAction.ts` + неподключённый `runSchedulerTick`.
4. **Лживая шапка** `writeIdentityAndPreferencesDirect.ts:1-2` («NOT wired into the live write path yet») — правка на одну строку, которая прямо сейчас вводит в заблуждение любого, кто ревьюит пять находок про идентичность.
5. **Всё остальное по проекции — не мой список, а Track D (#987).** Ставить вопрос о разблокировке D3–D8, а не изобретать параллельный план.
6. **Ярус B про протёкший домен (L1–L5) остаётся без изменений** — эти находки от projection-коррекции не зависят. L1 (доверие телефону, открывающее гейт записи на приём) по-прежнему самое срочное.

Раздел «Чего я не смог установить» из исходного отчёта остаётся в силе целиком, минус пункт про дату унификации. Добавляю: **все три пункта, где я разошёлся с самим собой, возникли из-за того, что субагенты считали одно и то же разными регулярками** — где числа расходились, я теперь называю оба и говорю, какое проверял руками.