# Перепись документации — 2026-09-16

Снимок: commit `d6bea44bd950e8cb7a70a08c3d3eab07513aa5c1`; итоговый файл не входит в собственный входной набор. Классифицированы все tracked `*.md` вне `docs/archive/**`, включая корень, `.cursor`, `.lead`, `runs`, `deploy` и `apps`. Файлы не изменялись и не переносились.

## 1. Сводка числами

| Класс | Файлов | Строк | Критерий |
|---|---:|---:|---|
| КАНОН | 47 | 17634 | действующее правило/contract/owner source |
| ОПИСАНИЕ | 283 | 31399 | текущее устройство без собственной нормы |
| ПЛАН | 137 | 48238 | есть незакрытая работа; ratio дан по файлам |
| ЖУРНАЛ | 1214 | 177839 | прошедший brief/report/audit/log |
| МЁРТВОЕ | 170 | 34666 | закрыто, superseded, retired либо дубль |
| **Итого** | **1851** | **309776** | — |

Команды замера:

~~~bash
# полный входной набор
git ls-files -z -- '*.md' ':(exclude)docs/archive/**' ':(exclude)docs/_TODO/DOCS_INVENTORY_2026-09-16.md' | tr -cd '\0' | wc -c  # 1851
git ls-files -z -- '*.md' ':(exclude)docs/archive/**' ':(exclude)docs/_TODO/DOCS_INVENTORY_2026-09-16.md' | xargs -0 wc -l | tail -n 1  # 309776 total

# только docs/ — сверка с замером ведущего
git ls-files -z -- 'docs/*.md' 'docs/**/*.md' ':(exclude)docs/archive/**' ':(exclude)docs/_TODO/DOCS_INVENTORY_2026-09-16.md' | tr -cd '\0' | wc -c  # 1322
git ls-files -z -- 'docs/*.md' 'docs/**/*.md' ':(exclude)docs/archive/**' ':(exclude)docs/_TODO/DOCS_INVENTORY_2026-09-16.md' | xargs -0 wc -l | tail -n 1  # 260342 total
~~~

Отличие от входного замера `1319 / 259557`: на выданном commit `1322 / 260342`, то есть `+3 файла / +785 строк`. Числа классов воспроизводятся из последней таблицы:

~~~bash
node - <<'NODE'
const fs = require('fs');
const s = fs.readFileSync('docs/_TODO/DOCS_INVENTORY_2026-09-16.md', 'utf8');
const body = s.slice(s.lastIndexOf('<!-- INVENTORY_START -->'), s.lastIndexOf('<!-- INVENTORY_END -->'));
const totals = {};
for (const line of body.split('\n')) {
  const m = line.match(/^\| `(.+)` \| ([0-9]+) \| (КАНОН|ОПИСАНИЕ|ПЛАН(?: \([^|]+\))?|ЖУРНАЛ|МЁРТВОЕ) \|/);
  if (!m) continue;
  const cls = m[3].split(' ')[0];
  totals[cls] ??= { files: 0, lines: 0 };
  totals[cls].files += 1;
  totals[cls].lines += Number(m[2]);
}
console.log(totals);
NODE
~~~

Для ПЛАНА в причине дано `закрыто/всего`; считаются только `- [x]`/`- [ ]`. При списке без checkbox указано `0/0, неприменимо`.

Exact command для проверки ratio любого файла: `printf 'closed='; rg -c '^\s*[-*]\s+\[[xX]\]' FILE; printf 'open='; rg -c '^\s*[-*]\s+\[ \]' FILE`.

## 2. Конкуренция за истину

Оракул — `docs/CURRENT_AUTHORITY_MAP.md`: датированные briefs/reports не authority. Ниже только реальные пересечения одного правила; разные домены не склеены.

| Область | Претенденты вне `docs/archive/` | Оставить единственным каноном | Почему / судьба остальных после решения владельца |
|---|---|---|---|
| Правила агентов | `AGENTS.md`; `.cursor/rules/test-execution-policy.md`; `CLAUDE.md`; `docs/ORCHESTRATION_BINDINGS.md`; `TASKDB_RULES.md`; `SHARED_TASKDB.md`; два больших `docs/RULES/*` | `AGENTS.md` | Сам объявляет себя единственным нормативным текстом. Delivery оставить указателями/командами; уникальные domain-факты перенести, дубли §4a/§5/§9–§10 архивировать. |
| Вход, identity, merge, блокировки | `AUTH_AND_IDENTITY_CANON.md`; `PLATFORM_IDENTITY_SPECIFICATION.md`; `PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`; `PLATFORM_USER_MERGE.md`; merge-аудиты | `AUTH_AND_IDENTITY_CANON.md` | Это маршрут из `AGENTS.md`, обновлён решениями 16.09. Specification дублирует норму; scenarios оставить только code-map; USER_MERGE описывает снятую функцию; аудиты — журнал. |
| Уведомления и каналы | `OWNER_PRODUCT_RULES.md` §2/15/18/21–24/28; `NOTIFICATION_CHANNELS.md`; `DOCTOR_BROADCASTS.md`; `PATIENT_SUPPORT_CHAT_INBOX.md`; `NOTIFICATION_DELIVERY_TARGET_SHAPE…`; privacy requirements | `OWNER_PRODUCT_RULES.md` | Authority map прямо называет его единственным. Остальные оставить только runtime-описаниями/исследованием после удаления target-policy; старые channel-решения — архив. |
| Карточка пациента у врача | `…-CURRENT-SPEC.md`; `…-бэклог.md`; `DOCTOR_APP_UI_STYLE_GUIDE.md` §9; два UI execution-плана | `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` | Он сам и authority map называют его single source. Из соседей убрать старые 6/8 вкладок, богатую шапку и принятые решения; планы оставить только для реально открытой работы. |
| Doctor visual language | `AGENTS.md` §16; `DOCTOR_APP_UI_STYLE_GUIDE.md`; `DOCTOR_UI_REBUILD_REVIEW/*`; UI-планы | `DOCTOR_APP_UI_STYLE_GUIDE.md` для продукта; `AGENTS.md` §16 — только agent-route | Гайд содержит точные токены, но хранит частично устаревший §9. Старые review/roadmap — журнал/мёртвые планы; из execution-планов убрать повтор нормативов. |
| SaaS tenant foundation | `SAAS_ENFORCE_ROADMAP.md`; `SEQUENCE.md`; `01_MASTER_PLAN.md`; `ROADMAP_TO_SAAS.md`; `CORRECTED_PLAN.md`; nightly runbook; T0/S*-планы | `SAAS_ENFORCE_ROADMAP.md` | Основной current source карты. Влить только живой порядок из SEQUENCE, затем демотировать его; старые master/roadmap/corrected/nightly закрыты или устарели. |
| Тарифы / entitlements | `TARIFFS_PAYMENTS_ADMIN_PLAN.md`; `STORE_EXECUTION_PLAN.md`; `STORE_P0_ENTITLEMENTS_PLAN.md`; старые SaaS-разделы | `TARIFFS_PAYMENTS_ADMIN_PLAN.md` | Карта называет его единственным; STORE_* сами historical/superseded. В текущем плане оставить 4 открытых из 110 и чистый контракт; историю 106 закрытий вынести. |
| Магазин упражнений | `EXERCISE_STORE_PLAN.md`; старые store/S4-3 планы и briefs | `EXERCISE_STORE_PLAN.md` | Переписан 11.09 и отделён от тарифов/PSP; старые планы superseded, briefs/reports не authority. |
| SaaS billing | `SAAS_BILLING_PLAN.md`; billing-разделы тарифного плана; payment reports | `OWNER_DECISIONS.md` для вечных правил + runtime для факта | Billing plan имеет 22/22 и taskdb done, поэтому МЁРТВОЕ, хотя карта называет его текущим. Устойчивые правила свести в один canon, план архивировать. |
| DB privileges / RLS / migration access | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`; `SCHEME.md`; старые chokepoint/deploy/role-grants планы | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` до закрытия | PLAN имеет 5 открытых из 95. Уникальную целевую схему из SCHEME влить в PLAN/будущий чистый контракт; старые deploy/migration планы заменены B0/owner-решениями. |
| Тестовая политика | `AGENTS.md` §9–§12/§24; delivery-rule; `TEST_SUITE_AUDIT_2026-07-29.md`; `runs/testsuite-*` | `AGENTS.md` | TEST_SUITE_AUDIT сам объявляет остальное историей и ведёт в AGENTS; строка authority map устарела. Delivery остаётся ссылкой, dated-корпус — журнал. |
| Native mobile / PWA | `NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`; `apps/mobile-shell/README.md`; mobile briefs/reports | Для runtime — `apps/mobile-shell/README.md`; активного плана нет | MASTER_PLAN: status done и 53/53, значит МЁРТВОЕ вопреки карте «active/doing». Новую работу открывать через taskdb и новый approved plan. |
| Очередь и статус | taskdb; authority map; `INITIATIVES.md`; `ACTIVE_WORKQUEUE.md`; `BACKLOG_CONSOLIDATION…`; `docs/README.md` | taskdb для статуса; authority map только для маршрута | ACTIVE_WORKQUEUE закрыт; consolidation запрещает цитировать свои числа; INITIATIVES направляет статус в taskdb. Из карты убрать dated reconciliation prose. |
| Server/runtime vs deploy | `SERVER CONVENTIONS.md`; `HOST_DEPLOY_README.md`; `LOCAL_DEV_AND_AGENT_TESTING.md`; старые deploy/runbook-планы | `SERVER CONVENTIONS.md` для фактов; HOST_DEPLOY_README только для команд | Старые планы повторяют topology/migration truth; `SAAS_PROD_DEPLOY_PROCESS.md` прямо заменён и архивируется. |

Проверка чисел в ключевых конфликтах:

~~~bash
for f in \
  docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md \
  docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md \
  docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md \
  docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md; do
  x=$(grep -Ec '^\s*[-*]\s+\[[xX]\]' "$f" || true)
  o=$(grep -Ec '^\s*[-*]\s+\[ \]' "$f" || true)
  printf '%s closed=%s open=%s total=%s\n' "$f" "$x" "$o" "$((x+o))"
done
~~~

## 3. Замусоренность действующих документов

Число — объединение (а) целых разделов с историческим заголовком и (б) целых абзацев с history-marker (`SUPERSEDED`, `historical`, `retired`, «устарело», «отменено», «прежнее», owner-цитата/исправление, журнал изменений). Повторы строк не считаются дважды. Это консервативный минимум текста на вынос без затрагивания чистой нормы. Примеры — первые 2–3 диапазона; `—` означает ноль.

Воспроизводимый detector:

~~~js
// split('\n'); historical heading -> до следующего heading того же/верхнего уровня; paragraph -> между пустыми строками
const historyHeading = /^#{1,6}\s+.*(?:истори|как было|раньше|прежн|отмен|superseded|deprecated|decision trail|change\s*log|журнал (?:измен|исполн)|хронолог|ретроспектив)/i;
const historyMarker = /SUPERSEDED|DEPRECATED|OWNER[- ]SUPERSEDED|historical|retired|устарел|отмен[её]н|заменено решением|раньше было|прежн(?:ее|яя|ий|ие)|владелец.{0,50}(?:сказал|решил|дословно|исправил|отменил)|owner correction|решение владельца.{0,30}(?:20\d\d|\d{1,2}[.\/]\d{1,2})|истори[яию] (?:решений|изменений|прохода|обсуждений)|журнал (?:исполнения|изменений)/i;
// result = union(line indexes of matched sections, line indexes of matched paragraphs).size
~~~

| Файл | Класс | Строк истории | Примеры мест |
|---|---|---:|---|
| `.cursor/rules/test-execution-policy.md` | ОПИСАНИЕ | 0 | — |
| `AGENTS.md` | КАНОН | 134 | L16–21: Повтори карту и чтение только когда произошёл хотя бы один переход: контекст был сжат/восстановлен; работ; L67–83: 2. **Строгая цель — решения и указания владельца; план — средство.** Работу и готовность судят по соответ; L304–308: Три состояния, не больше: `[ ]` открыто (включая отложенное владельцем) · `[x]` сделано + доказательство  |
| `apps/integrator/e2e/README.md` | ОПИСАНИЕ | 6 | L37: ## 5) Retired Rubitime reverse API (выведено 2026-07-27); L39–40: - Не проверять `/api/doctor/appointments/rubitime/*` и `/api/bersoncare/rubitime/*`: эти runtime routes r; L50: ## 7) Retired Rubitime autobind (выведено 2026-07-27) |
| `apps/integrator/src/app/app.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/config/config.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/content/content.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/content/max/max.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/content/telegram/admin/admin.md` | ОПИСАНИЕ | 3 | L3: > **SUPERSEDED AS TARGET — 2026-07-27.** The patient-dialogue/reply scenarios below must not authorize a ; L9–10: > ⚠️ **УСТАРЕЛО (26.07.2026).** Выдача прав через объединение списков `admin_*_ids`/`doctor_*_ids` — |
| `apps/integrator/src/content/telegram/telegram.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/content/telegram/user/user.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/adapters/adapters.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/db/db.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/db/schema.md` | ОПИСАНИЕ | 4 | L40–41: Для Telegram runtime-state используется integration-таблица `telegram_state`.; L43–44: Mailing/subscription tables were retired by Track D8 after the producer/consumer census proved the domain |
| `apps/integrator/src/infra/dispatcher/dispatcher.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/infra.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/observability/observability.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/queue/queue.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/runtime/runtime.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/runtime/scheduler/scheduler.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/infra/runtime/worker/worker.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/integrations/integrations.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/integrations/max/max.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/integrations/telegram/db/schema.md` | ОПИСАНИЕ | 3 | L7–8: - `telegram_state` — Telegram-only runtime state (state, update dedup, notification flags, profile snapsh; L10: Legacy mailing/subscription tables were retired by Track D8 after the exact callgraph proved there was no |
| `apps/integrator/src/integrations/telegram/telegram.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/contentRegistry/contentRegistry.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/contracts/contracts.md` | КАНОН | 0 | — |
| `apps/integrator/src/kernel/domain/domain.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/domain/executor/executor.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/eventGateway/eventGateway.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/kernel.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/orchestrator/orchestrator.md` | ОПИСАНИЕ | 0 | — |
| `apps/integrator/src/kernel/orchestrator/orchestrstor.md` | ОПИСАНИЕ | 0 | — |
| `apps/media-worker/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/mobile-shell/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/AGENTS.md` | КАНОН | 0 | — |
| `apps/webapp/ARCHITECTURE.md` | ОПИСАНИЕ | 28 | L43–70: - **Нет ПРЯМЫХ импортов между деревьями приложений** (`apps/integrator` ↔ `apps/webapp`) — но общее вынос |
| `apps/webapp/CLAUDE.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/e2e/CI_BASELINE.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/e2e/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/INTEGRATOR_CONTRACT.md` | КАНОН | 22 | L16–30: - **Доступ к базе (действующее правило, 30.07):** при единой PostgreSQL интегратор читает и пишет `public; L162–168: HTTP routes `POST /api/integrator/reminders/occurrences/{done,snooze,skip}`, `mute`, |
| `apps/webapp/public/brand/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/public/icons/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/README.md` | ОПИСАНИЕ | 9 | L15–23: - **`/`** — публичный маркетинговый лендинг и блок установки PWA (`manifest.webmanifest` с **`scope: "/ap |
| `apps/webapp/scripts/DEMO_CLIENT_WELLBEING_WARMUP_FILL.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/scripts/fio-backfill/README.md` | ОПИСАНИЕ | 11 | L76–82: 1. collect candidate names from historical booking records and current; L96: Historical source note: Rubitime was one input to that completed rehearsal and was retired on 2026-07-27.; L190–192: The source audit is read-only. It scans current client profiles, booking names, |
| `apps/webapp/scripts/integrator-schema-cleanup/README.md` | ОПИСАНИЕ | 12 | L3–4: > HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27. The suite remains only for reproducible; L17–22: ```bash; L26–29: 1. Run `01_audit.ts` against a safe non-prod or approved target DB to collect aggregate counts. |
| `apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md` | ОПИСАНИЕ | 2 | L57–58: Резидентный scheduler+worker процесс `scheduler:start` (см. `apps/integrator/package.json`; D30 Ш9 — преж |
| `apps/webapp/scripts/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app-layer/app-layer.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app-layer/di/di.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app-layer/guards/guards.md` | ОПИСАНИЕ | 14 | L5–18: - **requireSession** — требует авторизованную сессию; иначе редирект на вход. Для страниц и действий, дос |
| `apps/webapp/src/app-layer/routes/routes.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/api/api.md` | ОПИСАНИЕ | 84 | L38–91: - **auth/** — авторизация: обмен токена интегратора на сессию (exchange), вход по Telegram initData (`tel; L93–122: - **doctor/clients/[userId]/permanent-delete** — legacy `POST`, временно **fail-closed** после admin-mode |
| `apps/webapp/src/app/app.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/account/account.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/app.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/doctor/communications/communications.md` | ОПИСАНИЕ | 15 | L137–138: Таб-бар рендерит **только шелл** (`DoctorCommunicationsShell`) и только при двух или более вкладках.; L199–211: - Новый метод(ы) в `program-item-discussion` (**port + Drizzle infra + тесты + DI**): сейчас порт |
| `apps/webapp/src/app/app/doctor/content/library/media-library.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/doctor/doctor.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/doctor/schedule/schedule.md` | ОПИСАНИЕ | 3 | L62–64: - `firstVisitInPeriod` — пациент, у которого **нет ни одной** более ранней не-отменённой записи |
| `apps/webapp/src/app/app/doctor/treatment-program-shared/README.md` | ОПИСАНИЕ | 11 | L5–15: - **`treatmentProgramConstructorShellStyles.ts`** — цвета шапок карточек, классы карточек этапа/«общие ре |
| `apps/webapp/src/app/app/patient/about/about.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/booking/booking.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/cabinet/cabinet.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/content/content.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/diary/diary.md` | ОПИСАНИЕ | 13 | L116–118: - Месячный вид.; L122–131: ## Прежняя структура (архив описания) |
| `apps/webapp/src/app/app/patient/diary/lfk/lfk.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/diary/symptoms/symptoms.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/emergency/emergency.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/help/help.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/lessons/lessons.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/notifications/notifications.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/patient.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/profile/profile.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/patient/purchases/purchases.md` | ОПИСАНИЕ | 2 | L5–6: Описание раздела и история платежей (`PatientBookingHistorySection mode="payments"`). Каталог товаров выр |
| `apps/webapp/src/app/app/patient/treatment/program-detail/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/app/app/settings/settings.md` | ОПИСАНИЕ | 3 | L25–27: Прежние значения `?tab=` отвечают редиректом: `profile`, `organization` и `specialist` → `public`, |
| `apps/webapp/src/config/config.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/infra/db/db.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/infra/idempotency/idempotency.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/infra/infra.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/infra/repos/repos.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/infra/webhooks/webhooks.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/appointments/appointments.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/auth/auth.md` | ОПИСАНИЕ | 3 | L213–215: > ⚠️ **УСТАРЕЛО (26.07.2026).** Выдача роли через whitelist в `system_settings`/env (`admin_emails` и |
| `apps/webapp/src/modules/booking-calendar/booking-calendar.md` | ОПИСАНИЕ | 4 | L36–39: - `POST .../appointments/manual`: canonical create. |
| `apps/webapp/src/modules/booking-form/booking-form.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/booking-scheduling/booking-scheduling.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/channel-preferences/channel-preferences.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/client-history/client-history.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/content-catalog/content-catalog.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/diaries/diaries.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/doctor-broadcasts/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/doctor-cabinet/doctor-cabinet.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/emergency/emergency.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/help-content/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/integrator/integrator.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/leads/leads.md` | ОПИСАНИЕ | 6 | L6–11: Создать заявку можно только после подтверждения введённой почты через существующий публичный |
| `apps/webapp/src/modules/lessons/lessons.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/media/media.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/memberships/memberships.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/menu/menu.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/messaging/README.md` | ОПИСАНИЕ | 10 | L3–12: Чат поддержки пациента и врача хранится в `support_conversations` / `support_conversation_messages`. |
| `apps/webapp/src/modules/modules.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/patient-booking/patient-booking.md` | ОПИСАНИЕ | 14 | L7–8: Doctor list/KPI/calendar and patient/public slots/create are canonical-only. Historical source-selection ; L55–66: ## Перенос и отмена (этап 4) |
| `apps/webapp/src/modules/patient-broadcasts/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/patient-cabinet/patient-cabinet.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/patient-home/patient-home.md` | ОПИСАНИЕ | 1 | L72: **Legacy:** `patient_home_warmup_skip_to_next_available_enabled` — **deprecated**, pick не читает. |
| `apps/webapp/src/modules/patient-home/README.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/patient-mood/patient-mood.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/patient-practice/patient-practice.md` | ОПИСАНИЕ | 5 | L26–30: - `POST /api/patient/practice/completion` — сохранить выполнение практики (`feeling` опционален; для сцен |
| `apps/webapp/src/modules/payments/payments.md` | ОПИСАНИЕ | 4 | L21–24: Ссылка на предоплату, которую получает человек, всегда строится как `/book/pay/{intentId}` через |
| `apps/webapp/src/modules/platform-analytics/platform-analytics.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/purchases/purchases.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/reminders/reminders.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/roles/roles.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/treatment-program/treatment-program.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/users/users.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/modules/web-push/web-push.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/lib/platform.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/shared.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/types/types.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/ui/doctor/doctorCmsCatalogSearchNotes.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/ui/ui.md` | ОПИСАНИЕ | 0 | — |
| `apps/webapp/src/shared/utils/utils.md` | ОПИСАНИЕ | 0 | — |
| `ARCHITECTURE.md` | ОПИСАНИЕ | 6 | L221–226: - `src/infra/runtime/scheduler/main.ts` — резидентный scheduler+worker процесс (D30 Ш9: один systemd-unit |
| `CLAUDE.md` | ОПИСАНИЕ | 0 | — |
| `deploy/DATA_MIGRATION_CHECKLIST.md` | КАНОН | 4 | L68: ### Integrator: retired legacy tables (Track D8); L70: Mailing/subscription source and projection tables were retired migration-forward in Track D8 after the ex; L74–75: - **Карточки и настройки пользователей:** исторический `backfill-person-domain` завершён и удалён; повтор |
| `deploy/env/README.md` | ОПИСАНИЕ | 3 | L41–43: - `bersoncarebot-api-prod.service` |
| `deploy/HOST_DEPLOY_README.md` | КАНОН | 52 | L310–320: **D30 Ш6 (21.08.2026, code-side retirement):** синтетические пробы (MAX/Telegram/Google Calendar) больше ; L481: **Операторские уведомления (Wave 2):** внешним cron остаётся только `operator_health_critical` (`*/5`, `P; L650–664: - `NODE_ENV=production` |
| `deploy/jitsi/NETWORK_POLICY.md` | КАНОН | 13 | L25–32: **Nothing the prod profile installs carries a `bersoncarebot`/`bcb` name.** That is the owner's ruling of; L98–102: **НА НОВОМ ПРОДЕ ОГРАНИЧЕНИЯ ПО IP СНЯТЫ — решение владельца 14.09.2026**, дословно: «Ограничения на |
| `deploy/jitsi/README.md` | ОПИСАНИЕ | 38 | L39–47: **The prod column carries no `bersoncarebot`/`bcb` name anywhere** — owner ruling of 10.09.2026, recorded; L90–118: ¦ Path ¦ Purpose ¦ |
| `deploy/jitsi/RUNBOOK.md` | ОПИСАНИЕ | 0 | — |
| `deploy/jitsi/VERSIONS.md` | ОПИСАНИЕ | 0 | — |
| `deploy/postgres/privileges/README.md` | ОПИСАНИЕ | 9 | L27–29: Верхняя часть `declaration.ts` хранит нейтральный инвентарь объектов, из которого Revision 10 строит теку; L38–43: `therapysto_prod` — новый прод на `135.106.187.95`, заведён 10.09.2026. До этого декларация знала ровно д |
| `deploy/postgres/README.md` | ОПИСАНИЕ | 0 | — |
| `deploy/systemd/hardening/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/_INBOX/_TEMPLATE.md` | ОПИСАНИЕ | 0 | — |
| `docs/_INBOX/patient-files-library-isolation.md` | ОПИСАНИЕ | 0 | — |
| `docs/_INBOX/quick-wins-user.md` | ОПИСАНИЕ | 0 | — |
| `docs/_INBOX/README.md` | ОПИСАНИЕ | 7 | L1–7: # 📥 INBOX — исторические входящие |
| `docs/_TODO/B1_B2_IDENTITY_SPLIT_RUNBOOK.md` | ОПИСАНИЕ | 5 | L19–23: ⚠️ **ФАКТ УСТАРЕЛ 2026-08-23 — не запускать как runbook.** Документ предшествует port-context cutover: |
| `docs/_TODO/CURRENT_GOAL.md` | ОПИСАНИЕ | 56 | L98–153: 1. **Внутренний пакет на TEST — выполнено 29.08.2026.** Штатные deploy `0e8060ab4`, точечный |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/db-access-map.md` | ОПИСАНИЕ | 23 | L68–76: - `apps/webapp/scripts/purge-placeholder-bookings.ts`; L95–98: - `scripts/check-telegram-users.ts`; L179–188: - **S1:** start with high-confidence webapp layer bypasses above. Keep behavior unchanged and move SQL to |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/RAW_SQL_RULING.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/REQUIREMENTS.md` | КАНОН | 0 | — |
| `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md` | ОПИСАНИЕ | 3 | L44: Positive controls: valid webapp staff/patient/global-admin certificate with its exact login CN + SCRAM; v; L197: Trigger/constraint ownership следует owner relation; replication slots не имеют независимого owner и допу; L252: Generator derives all definer totals from the revision-11 declaration per database (no fixed DEV/TEST tot |
| `docs/_TODO/DECIDED_NOT_DONE.md` | ОПИСАНИЕ | 11 | L16–26: ¦ Решение ¦ Где записано ¦ Чем доказано, что не сделано ¦ Состояние ¦ |
| `docs/_TODO/DOCTOR_LOADING_BASELINE.md` | ОПИСАНИЕ | 12 | L5: Related: fetch inventory [`DOCTOR_LOADING_FETCH_INVENTORY.md`](./DOCTOR_LOADING_FETCH_INVENTORY.md), hist; L85–95: ## 3a. Background noise (Stage 1 baseline — superseded by §3) |
| `docs/_TODO/DOCTOR_LOADING_FETCH_INVENTORY.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/FIX_MERGE_FIO_ON_CANON_2026-09-15.md` | КАНОН | 23 | L62–71: 1. Объекты: дропается `app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)`, создаётся; L107: **2. Прежние прогоны — целы.**; L126–130: **Про зашитые абсолютные пути (требование брифа).** Проверено перед тем, как верить зелёному: |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/OWNER_DECISIONS.md` | КАНОН | 0 | — |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15/ROUND2.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/ROUND2.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/ROUND3.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/README.md` | ОПИСАНИЕ | 3 | L7–9: Предыдущая архитектура отдельного local-bundle mobile SPA отменена владельцем и перенесена в |
| `docs/_TODO/NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` | ОПИСАНИЕ | 10 | L81–85: ⚠️ **ФАКТ УСТАРЕЛ 2026-08-23.** Это не текущий план реализации. После разведки Webapp уже стал; L183–187: ~~Ни строки кода по этому разбору не написано.~~ ⚠️ **ФАКТ УСТАРЕЛ 2026-08-23:** см. фактические |
| `docs/_TODO/OWNER_WALKTHROUGHS/README.md` | ОПИСАНИЕ | 14 | L9–22: 1. **Дословно.** Текст владельца сохраняется цитатой, без пересказа и без «улучшения формулировок». Перес |
| `docs/_TODO/POST_PRODUCTION_FILE_DELETION_AND_PURGE.md` | ОПИСАНИЕ | 5 | L29–31: Обязательного срока хранения здесь нет: продукт — не медицинское ПО, а рабочие заметки врачей и тренеров; L41–42: Проверка использования выполняется **один раз, в момент удаления строки** (владелец 17.08). Прежняя форму |
| `docs/_TODO/POST_PRODUCTION_IDENTITY_AND_CONTACT_MODEL.md` | ОПИСАНИЕ | 37 | L20: Канон прежних owner-решений: [`IDENTITY_AND_MERGE_SCHEME.md`](../archive/2026-09-identity-merge-supersede; L26–39: - `public.platform_users` остаётся перегруженным account root: кроме id/role/merge/session state в нём до; L158–166: `platform_users` сейчас одновременно account root, identity row и место для DOB/gender/height/weight. Мед |
| `docs/_TODO/README.md` | ОПИСАНИЕ | 9 | L20–28: ¦ #   ¦ Инициатива                                                                                        |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_AND_LEGAL_GATES.md` | ОПИСАНИЕ | 1 | L37: > **PARTIALLY SUPERSEDED — 2026-07-27.** Только channel-topology часть блока ниже заменена строкой **«Уве |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/README.md` | ОПИСАНИЕ | 20 | L3: > **SUPERSEDED AS TARGET — 2026-07-27.** Формулировка этой инициативы о messenger auth-only boundary не я; L25–36: 1. [`REQUIREMENTS.md`](REQUIREMENTS.md) — границы и обязательные результаты.; L46–52: - `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md`; |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/REQUIREMENTS.md` | КАНОН | 1 | L79: > **SUPERSEDED AS TARGET — 2026-07-27.** Требования о product push-only/auth-only bots ниже заменены стро |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` | ОПИСАНИЕ | 6 | L3–8: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-06-17, SKELETON).** Как активный план-документ заменён `CORRECTED_PLAN.md` |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_OWNER_GATES.md` | ОПИСАНИЕ | 36 | L41–76: ## Б. Решил я, владелец должен знать (решать не обязан, но может отменить) |
| `docs/_TODO/SAAS_FOUNDATION/GATES_WHAT_THEY_GUARD.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` | ОПИСАНИЕ | 170 | L3–5: Status: **УСТАРЕЛО/ЗАМЕНЕНО 16.08.2026 → `docs/OWNER_DECISIONS.md`, B0 migration baseline.**; L7–14: **ЧАСТИЧНО ВОССТАНОВЛЕНО 20.08.2026:** `609a19f94` («salvage: establish B0-forward candidate without; L32–39: **ЗАМЕНЕНО 15.08.2026:** the 12.08 instruction below that made DEV the mandatory next target and blocked  |
| `docs/_TODO/SAAS_FOUNDATION/MECHANICS_TABLE_FOR_OWNER.md` | ОПИСАНИЕ | 37 | L26–37: - **Свой домен** — больше не отдельная строка, входит в брендирование целиком.; L47–60: ¦ Механика ¦ Что это ¦ Что выключается у клиники ¦ Что теряет пациент ¦; L80–90: - Курсы и страницы сайта (CMS) в коде сегодня — числовой предел, хотя владелец решил: обе механики должны |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` | КАНОН | 16 | L11–20: ## 1. Биллинг — ПОПРАВКА к прежней записи; L200–203: > **SUPERSEDED ДЛЯ ТЕКУЩЕЙ РАБОТЫ:** ниже сохранена дословная историческая директива завершённого retirem; L213–214: **Исторически значило:** свежая выгрузка была каноном того прохода; все записи из Rubitime должны были по |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` | КАНОН | 7 | L33–39: ¦ Блок                                      ¦ Карточки        ¦ Уточнение владельца                       |
| `docs/_TODO/SAAS_FOUNDATION/P0_4_BATCHES.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md` | ОПИСАНИЕ | 1 | L1: > **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is p |
| `docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md` | ОПИСАНИЕ | 38 | L1: > **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is p; L5–6: > OWNER-SUPERSEDED 16.08.2026: this is a historical code-facts record. Scratch/disposable commands are no; L13–18: - Tests/builds must run through `bash /home/dev/orch/run-tests.sh "<command>"`. |
| `docs/_TODO/SAAS_FOUNDATION/P0_UNPRINCIPLED_READ_INVENTORY.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md` | ОПИСАНИЕ | 1 | L1: > **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is p |
| `docs/_TODO/SAAS_FOUNDATION/PHASE3_ORCHESTRATION.md` | ОПИСАНИЕ | 9 | L1: > **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is p; L22–29: - Added backend-only specialist signup start/confirm API. |
| `docs/_TODO/SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` | ОПИСАНИЕ | 1 | L29: ## Historical compatibility deploy (disposable/provenance only) |
| `docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md` | ОПИСАНИЕ | 2 | L1: > **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is p; L7: This document is the execution-facing taxonomy for the shared product. The historical derivation artifact |
| `docs/_TODO/SAAS_FOUNDATION/README.md` | ОПИСАНИЕ | 12 | L5–13: - [`OWNER_RULINGS_2026-07-15.md`](OWNER_RULINGS_2026-07-15.md) — foundation/tenant/enforcement rulings §§; L17–19: The only initiative objective is a fully working system on TEST. A fresh database dump may be obtained fo |
| `docs/_TODO/SAAS_FOUNDATION/S4_0_S4_1_CONTRACT_INVENTORY.md` | КАНОН | 1 | L34: ### 2026-07-19 owner correction — disabled patient card/files block every write |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md` | ОПИСАНИЕ | 3 | L3–5: > **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** это доказательство старого two-login locked contour, не текущий targe |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C1_WEBAPP_DUAL_POOL_FANOUT.md` | ОПИСАНИЕ | 3 | L3–5: > **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** dual-pool — подтверждённая исходная реализация, но не полный target. |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md` | ОПИСАНИЕ | 12 | L3–5: > **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** HMAC signing secret и отдельный telemetry operator URL ниже — старый ; L54–62: - requires `DB_PRINCIPAL_CONTEXT_MODE=port-context` in webapp and integrator — the webapp process refuses |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md` | ОПИСАНИЕ | 18 | L27–44: ¦ ID                      ¦ Entrypoint                                                                    |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md` | ОПИСАНИЕ | 29 | L3–7: > Superseded hard protocol: for the current fresh-dump hard migration sequence, use; L25–30: **Superseded 02.09.2026 (#1085).** The overlay/E1/`test-strict-rls-finalizer.sql` closure this section us; L57–60: - Code: merge to `main` → CI auto-deploys `deploy/host/deploy-prod.sh` (build + `pnpm migrate` + schema g |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_E1_REMINDER_M2M_ORG_CONTEXT.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/method-code.md` | ОПИСАНИЕ | 12 | L25–29: - **SCOPE** — code reads/writes it in a PATIENT, CLINICAL, or DOCTOR/practice context (per-patient; L284: Rubitime mirror path, explicitly compat-only / being deprecated.; L286–291: - `patient_bookings` — `modules/patient-booking`; canonical path now writes `be_appointments`, this is |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/method-fk.md` | ОПИСАНИЕ | 17 | L284–300: ## LEGACY (8) — Rubitime / branch-scoped, being deprecated |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md` | ОПИСАНИЕ | 4 | L36–39: 1. **Per-patient TELEMETRY / delivery-logs (~10, currently INSIDE the 66):** product*analytics_events_rec |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md` | ОПИСАНИЕ | 12 | L11–22: ¦ Entrypoint                              ¦ Runtime source                                                |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md` | ОПИСАНИЕ | 11 | L3: Status: accepted for T0.4-pre execution unless superseded by owner decision.; L7–9: Decision (superseded 2026-07-29 by owner ruling/taskdb `#1076`): `public.system_settings` is the only; L47–50: - Integrator still ingests Rubitime webhooks and writes raw/projection tables. |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` | ОПИСАНИЕ | 21 | L73–82: - `public.be_*` booking-engine tables: canonical booking business data.; L98–101: - Flip `booking_slots_read_source=canonical`.; L139–145: - `public.support_conversations` and `support_conversation_messages`: canonical support chat/product read |
| `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md` | ОПИСАНИЕ | 26 | L78–103: - `apps/webapp/src/app/api/admin/audit-log/resolve/route.ts` |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` | ОПИСАНИЕ | 12 | L117–120: **Режимы** (`DB_PRINCIPAL_CONTEXT_MODE`): `legacy-guc` и `shadow` сохраняются как исторические/диагностич; L126–133: - Клиника одна → мультиклиника dormant. Дефолт `legacy-guc` — поведение №1 не изменено. |
| `docs/_TODO/SAAS_FOUNDATION/UPSTREAM_SYNC_POLICY.md` | КАНОН | 0 | — |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_CAPABILITY_MATRIX.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` | КАНОН | 28 | L400–413: - Normalize deterministically (Unicode normalization/transliteration policy, lowercase ASCII, single hyph; L452–463: ¦ Object                               ¦ Scope/owner                                                   ¦ ; L470–471: Source for current results: [`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Historical pl |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/CURRENT_STATE_BASELINE.md` | ОПИСАНИЕ | 14 | L11–17: - DEV обновлена из TEST, миграции применены и является изменяемой UX-песочницей; прежний missing-function; L39–45: - primary sections: `Сегодня`, `Пациенты`, `Расписание`, `Коммуникации`; |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` | ОПИСАНИЕ | 75 | L63–68: ```text; L125–133: ¦ ID  ¦ Journey                                                                            ¦ Trusted orga; L228–243: - Migration `0215_staff_security_profiles.sql` adds one global identity-security row per canonical user,  |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OPERATING_MODEL.md` | ОПИСАНИЕ | 14 | L164–166: Why this is preferred: it preserves one clinic identity, avoids merge/copy problems, supports a coherent ; L180–185: - Solo specialist: no `Мои / Все` toggle when both produce the same permitted result.; L380–384: Earlier discovery considered primary assignment, care-team membership, work-item reassignment and cross-o |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md` | КАНОН | 385 | L18–23: - Действующий provenance всех результатов: ответ владельца в текущем чате 2026-07-16 и; L41–42: Текст «Вопрос владельцу», «Рекомендация» и «Безопасный default до ответа» ниже сохранён как историческая; L44–172: ### Исторические вопросы (resolved outcomes выше каждого ID) |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` | КАНОН | 180 | L87–104: ### Исторические вопросы конструктора и текущий статус; L130–140: ### Исторические вопросы и текущий статус; L145–150: - Начать с минимального рабочего варианта и переиспользовать существующую платёжную основу. |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` | КАНОН | 0 | — |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/README.md` | ОПИСАНИЕ | 75 | L3–10: **Статус:** staged execution in progress. Planning package 2026-07-16, complete owner review 2026-07-18 a; L49–66: - Единый owner-review от 2026-07-18 с датированным addendum 2026-07-19:; L74–90: - **Решение владельца 2026-07-18:** не плодить отдельные документы с частичными или конкурирующими услови |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/REQUIREMENTS.md` | КАНОН | 0 | — |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` | ОПИСАНИЕ | 21 | L152–160: ¦ Actor/context                                   ¦ Operational profile/security/scheduling              ; L207–209: Cancellation/reschedule/deactivation follow ordinary appointment policy. Historical authorship remains un; L234–242: - Current UX product authority and solo-first boundary: `OWNER_RULINGS_2026-07-16.md`. |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md` | ОПИСАНИЕ | 41 | L3–12: **Статус:** owner rulings 2026-07-16 integrated; awaiting independent audit. The earlier full UX-06 re-au; L42–72: ¦   # ¦ Current page file(s)                                                                              |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_COMPOSITION.md` | ОПИСАНИЕ | 21 | L3–7: **Статус:** latest owner clarifications integrated; awaiting full independent audit. Canonical registry r; L51–58: ¦ ID / candidate route                ¦ Composition                                                      ; L168–175: ¦ Priority flow                                          ¦ UX-04 state trace                       ¦ Cano |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_PATIENT_PUBLIC.md` | ОПИСАНИЕ | 53 | L24–35: - Public login подтверждён desktop/mobile; текущий landing подтверждён mobile.; L57–66: ¦ Contract             ¦ Факт                                                                            ; L99–124: ¦ Route / coherent family                                                              ¦ Actor / guard    |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_SPECIALIST.md` | ОПИСАНИЕ | 69 | L7–13: - Layout families ниже — только локальные исторические метки этого снимка; прежний общий inventory архиви; L56–88: ¦   # ¦ Route / coherent family                                                                          ; L100–116: ## 6. Historical screenshot index (superseded) |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md` | ОПИСАНИЕ | 21 | L3–9: **Статус:** latest owner clarifications integrated; awaiting full independent audit. Registry remains `57; L135–145: ¦ Alias / family                                                ¦ Classification                         ; L381–383: These are outputs of the dated owner rulings, not pending inputs. Historical UX-07 prototype alternatives |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_ACCEPTANCE.md` | ОПИСАНИЕ | 22 | L71–73: The original independent verdict remains **FAIL**. It is historical and must not be rewritten as PASS. At; L75–91: - Route allocation remains `150/150`; the page-path set is unchanged.; L97–98: **PASS — UX-01 factual current-state audit complete.** The new independent verdict is recorded in |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_PRODUCT_PATTERNS.md` | ОПИСАНИЕ | 34 | L376–382: invite_pending; L401–406: - organization name/logo и specialist/clinic sender до подтверждения;; L410–430: ¦ Сценарий                                      ¦ Официальное evidence                                    |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_TECHNICAL_PATTERNS.md` | ОПИСАНИЕ | 31 | L13–17: - [`REQUIREMENTS.md`](REQUIREMENTS.md) и [`ROADMAP.md`](../../archive/2026-07-plans/SAAS_PRODUCT_UX_INITI; L46–54: ```text; L60: `delivery_failed` не отменяет сам invite автоматически: специалист может повторить email или добавить SMS |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_OPERATING_MODEL_DRAFT.md` | ОПИСАНИЕ | 37 | L27–48: - Tenant/workspace — `Organization`; solo specialist — организация с одним специалистом, clinic — организ; L111–119: 1. «Мои / все пациенты организации» и «мои визиты / вся история / специалист X» применяются только после; L372–374: - Capabilities могут отличаться: view summary, shared history, write entries, message, manage program. |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX04_SCREEN_STATE_LIST.md` | ОПИСАНИЕ | 42 | L3–6: **Статус:** owner rulings 2026-07-16 integrated; awaiting independent audit. The earlier independent re-a; L20–21: **Deferred future state family:** retained for historical traceability; none of `STF-01…08` is an initial; L23–32: ¦ ID     ¦ Surface                   ¦ Required states                                                    |
| `docs/_TODO/SOURCE_MEDIA_RETENTION_CANON_2026-09-13.md` | КАНОН | 67 | L49–60: ¦ Джоб / путь ¦ Файл ¦ Удаляет оригинал? ¦ Совпадает с действующим решением ¦; L82–91: ¦ Файл:строка ¦ Цитата ¦ Дата текста / git ¦ Чьё ¦; L113–119: ¦ Файл:строка ¦ Цитата ¦ Дата / git ¦ Чьё ¦ |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/EXTERNAL_PRODUCT_RESEARCH.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/LEGAL_PAGE_BRANDING_WORLD_PRACTICE.md` | ОПИСАНИЕ | 2 | L103–104: **Ровно та развилка, которую решает владелец, — и Physitrack решил её в пользу платформы.** |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/MULTI_BRAND_DOMAIN_WORLD_PRACTICE.md` | ОПИСАНИЕ | 84 | L27–60: 1. **Домен решает ТОЛЬКО одно: какое лицо показать.** Кто ты и что тебе можно — решает сессия и членство,; L356–385: #### 3.8.1. Let's Encrypt и `.ru` — соглашение v1.7 отменено, есть официальное заявление; L498–500: Исследование 26.07 рекомендовало Caddy `on_demand_tls` с `ask`-эндпоинтом. Рекомендация остаётся верной,  |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/OTP_SENDER_BRANDING_WORLD_PRACTICE.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/PASSKEY_ACROSS_DOMAINS_RESEARCH.md` | ОПИСАНИЕ | 27 | L44–70: - `apps/webapp/src/modules/auth/passkeyAuth.ts:21-35` — `getPasskeyRpConfig()`: |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/PHONE_AUTH_CHANNELS_RESEARCH.md` | ОПИСАНИЕ | 0 | — |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/ORCHESTRATOR_PROMPT.md` | ОПИСАНИЕ | 23 | L3–4: > **SUPERSEDED IN PART 2026-07-29:** Rubitime retired 2026-07-27. Track C instructions below are historic; L73–93: - **Verification ≠ documentation.** Prefer an executable current gate over prose: a contract test or cens |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` | ОПИСАНИЕ | 1 | L3: > **SUPERSEDED 2026-07-29 — НЕ ИСПОЛНЯТЬ.** |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | ОПИСАНИЕ | 1 | L3: > **SUPERSEDED 2026-07-29 — НЕ ИСПОЛНЯТЬ.** |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md` | ОПИСАНИЕ | 2 | L101: > **SUPERSEDED — 2026-07-22 by `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2:** Doctor workspace ca; L158: > Shared radius scale соблюдена: page-level blocks `12px`, KPI `8px`, doctor buttons/inputs/select trigge |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_B_B4_OWNER_HANDOFF.md` | ОПИСАНИЕ | 0 | — |
| `docs/APP_RESTRUCTURE_INITIATIVE/CLINICAL_TEST_SCORING_CURRENT_SYSTEM.md` | ОПИСАНИЕ | 0 | — |
| `docs/APP_RESTRUCTURE_INITIATIVE/E2E_ACCEPTANCE_AFTER_AB.md` | ОПИСАНИЕ | 6 | L3–8: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-05-04).** §7 «Хвосты PLAN_DOCTOR_CABINET этапа 6 (карточка пациента у врач |
| `docs/APP_RESTRUCTURE_INITIATIVE/README.md` | ОПИСАНИЕ | 41 | L3–8: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-05-01).** Фраза в статусе ниже «глубокая переработка карточки (табы / hero; L30–64: ¦ Файл                                                                                                    |
| `docs/APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md` | ОПИСАНИЕ | 17 | L3–10: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-05-01).** §5 «Карточка пациента — главный экран» (tabs «Заметки и визиты /; L168–172: Tab 1 — Заметки и история визитов  ← основной рабочий tab; L338–341: - **Журнал рассылок только в `/broadcasts`**, не дублируется в `/messages`. |
| `docs/APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_PATIENT.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md` | КАНОН | 2 | L8–9: **Решение владельца 26.07.2026.** Этот файл — единственный источник истины по тому, кто и как получает |
| `docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` | КАНОН | 141 | L24–31: - `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md` — раздача прав администратора, состав дверей, passkey-модель.; L39–44: > Историческая формулировка 04.08: «я бы делал три экрана с разным дизайном (под админку, клинику и пацие; L59–65: **Решение владельца 16.09: состав сотрудничьих дверей задаётся кодом, а не настройкой.** Дословно: |
| `docs/ARCHITECTURE/BERSONCARE_SCREEN_SPECIFICATION.md` | КАНОН | 7 | L172–178: - **Зоны:** Z1 (заголовок + вкладки раздела) → Z3 (sticky: дата/период/переключатель вида) → Z4 (сетка ка |
| `docs/ARCHITECTURE/CHAT_READ_RECEIPTS.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` | КАНОН | 29 | L3–8: > ⚠️ **УСТАРЕЛО для роли администратора (26.07.2026).** Правило ниже — «операционная конфигурация, включа; L53–73: - **Yandex OAuth (backend-only):** `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_; L85–86: - Ранее в документе фигурировало утверждение, что «все интеграционные ключи только в env». Для **webapp** |
| `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/DB_DUMPS/README.md` | ОПИСАНИЕ | 7 | L107–113: - целостность generated schema B и active forwards — `node scripts/check-b0-migration-baseline.mjs`; |
| `docs/ARCHITECTURE/DB_STRUCTURE.md` | ОПИСАНИЕ | 16 | L42–49: ### 1.3 Booking / RubiTime (историческая схема); L168–170: Каталог товаров (этап 7, `0095`) вырезан целиком — решение владельца 01.08,; L233–237: - `system_settings` — единственный settings data-root (`scope` `admin` ¦ `doctor` ¦ `global`) для runtime |
| `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` | КАНОН | 6 | L3–8: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО.** §9 «Карточка сущности (ClientProfileCard)» — конкретика по вкладке «Обзор» (§ |
| `docs/ARCHITECTURE/DOCTOR_BROADCASTS.md` | ОПИСАНИЕ | 9 | L3: > **SUPERSEDED AS NOTIFICATION POLICY — 2026-07-27.** Sender-selected channels, absent-row consent, ignor; L31–38: - **SUPERSEDED 2026-07-27:** absent row = consent below conflicts with §21; see the **«Уведомления»** aut |
| `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md` | ОПИСАНИЕ | 13 | L5–17: - **Хаб:** `/app/doctor/content` — левое меню (мотивации, разделы контента по `kind` / parent, фильтр по  |
| `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md` | ОПИСАНИЕ | 6 | L116–118: - Legacy URL **`/app/doctor/stats`** — server redirect на `analytics/clients`.; L141–143: ## Журнал изменений |
| `docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/ERROR_TRACKING.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/FULL PLATFORM MODEL.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/GITHUB_ACCAUNTS.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` | КАНОН | 0 | — |
| `docs/ARCHITECTURE/MATERIAL_RATINGS.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/MAX_SETUP.md` | КАНОН | 0 | — |
| `docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/MESSAGING_CONTRACT.md` | КАНОН | 0 | — |
| `docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md` | ОПИСАНИЕ | 17 | L3: > **SUPERSEDED AS TARGET — 2026-07-27.** Этот документ сохраняет фактическое описание current runtime, но; L5–11: > **SUPERSEDED — 2026-07-27.** Цитата ниже отменена в части рассылки и уточнена по содержимому уведомлени; L21: > **CURRENT-RUNTIME FACT, SUPERSEDED AS TARGET — 2026-07-27.** Описанная ниже модель primary/fallback cha |
| `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/OUTGOING_DISPATCH_CLASSIFICATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` | КАНОН | 185 | L42–46: ¦ вид сообщения                     ¦ что видно прямо в уведомлении                                      ; L70: Связанные: **E-1 отменён** (Telegram и MAX не вырезаем), **#1034/#1035** ждут юриста.; L102–103: **Пункт `SCH-G1` пунш-листа от 18.07 сформулирован НАОБОРОТ** («не сбрасывать») и владельцем **отменён**. |
| `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` | КАНОН | 0 | — |
| `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md` | ОПИСАНИЕ | 5 | L18: > **SUPERSEDED AS NOTIFICATION POLICY — 2026-07-27.** «Preview + ссылка» and hard-coded channel rows belo; L27–30: ¦ Событие                                                           ¦ Хранение                            |
| `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md` | КАНОН | 1 | L5: **Версия:** 2026-06-06 · **Статус:** справочный черновик (инициатива **deferred** 2026-06-06; guest mode  |
| `docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md` | ОПИСАНИЕ | 15 | L141–150: ¦ Enum (`TrustedPatientPhoneSource`)  ¦ Где выставляется `patient_phone_trust_at` / доверие              ; L259–263: - [x] `/api/booking/*` (create, cancel, my, slots, catalog) — `requirePatientApiBusinessAccess` с тем же  |
| `docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md` | КАНОН | 0 | — |
| `docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md` | ОПИСАНИЕ | 17 | L3–7: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (2026-07-11).** §«T4 — Просмотр объекта (entity card)» использует `ClientProfile; L386–390: ¦ ID     ¦ Пробел                                                               ¦ Приор. ¦ Решение       ; L418–424: 1. **`actions`-слот в `DoctorPageHeader`** (D4). Ввести явную зону первичного действия справа в шапке? Ре |
| `docs/ARCHITECTURE/SECURITY_CANON.md` | КАНОН | 103 | L93–96: ⚠️ **Правка 04.08, позже того же дня, когда написан этот раздел: устарело.** D15b/4 landed на; L105–106: <details>; L108–111: **Как сейчас (устарело):** таблица создана без RLS (`apps/webapp/migrations/006_platform_users.sql:2`), н |
| `docs/ARCHITECTURE/SERVER CONVENTIONS.md` | КАНОН | 136 | L156–161: **Что где лежит (решение владельца 06.09.2026).** Selectel — объём и трафик: библиотека упражнений,; L163–173: **Сырое отдельно, отдаваемое отдельно (М7, решение владельца 10.09.2026 вечер,; L211–215: **Именование на новом проде: только `therapysto` / `therapygo`, никаких `bersoncarebot` и `bcb` |
| `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` | ОПИСАНИЕ | 20 | L3–8: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО.** §6.9 «Реализация в webapp (ориентир)» описывает карточку клиента с табами; L158: Числовые определения плиток обзора и соответствие ссылок спискам зафиксированы в **DOCTOR_DASHBOARD_METRI; L221–226: ### 6.4. История записей |
| `docs/ARCHITECTURE/STAGE12_E2E_SCENARIO.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/STAGE12_RECONCILIATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md` | ОПИСАНИЕ | 0 | — |
| `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md` | ОПИСАНИЕ | 33 | L10–24: ¦ Что                                                                                                    ; L54–66: - **Видеозвонки — своё, self-hosted (НЕ сторонний SaaS-провайдер).** Решение владельца 08.09.2026: быстры; L96: ## Редактор контента — единый Tiptap Simple Editor (решение владельца 16.09.2026) |
| `docs/ARCHITECTURE/VK_MESSENGER_SETUP.md` | ОПИСАНИЕ | 0 | — |
| `docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md` | КАНОН | 23 | L7–8: - **Канон:** `be_appointments` — primary source of truth для lifecycle и политик.; L12–18: ¦ Сценарий                        ¦ Порядок                                                              ; L59–72: ## Staff delete (отменённая запись) |
| `docs/COURSES_INITIATIVE/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/CURRENT_AUTHORITY_MAP.md` | КАНОН | 50 | L13–22: ¦ Область                                                                                                ; L26–29: ¦ Область                                      ¦ Актуальный источник                                     ; L31–35: > **Owner correction 2026-09-08:** Design DNA v1.0/v1.1 описывал старое направление кабинета врача и |
| `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` | КАНОН | 39 | L7–18: > **Этот документ ЗАМЕНЯЕТ (supersedes) более ранние описания карты.** Старые доки помечены «НЕ АКТУАЛЬНО; L26–35: - **ФИО.**; L76–92: - Поиск при активной карточке доступен; совпадения — dropdown под полем. _(PLAN.md:185,531)_ ⚑ **owner-de |
| `docs/design/bersoncare-карточка-пациента-бэклог.md` | КАНОН | 9 | L3–11: > ⚠️ **ЧАСТИЧНО УСТАРЕЛО (бэклог 2026-06-11/12).** |
| `docs/design/dna/README.md` | ОПИСАНИЕ | 2 | L3–4: **SUPERSEDED 2026-09-08 по решению владельца.** Этот набор описывал старое визуальное направление кабинет |
| `docs/FINANCES_BIG07_DESIGN.md` | ОПИСАНИЕ | 0 | — |
| `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md` | ОПИСАНИЕ | 8 | L471–478: - Historical acceptance of taskdb `#24` covers the earlier delivered tranche only. Task `#855` is complet |
| `docs/INITIATIVES.md` | ОПИСАНИЕ | 43 | L18–60: ## Исторический execution snapshot (2026-07-22; не исполнять) |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md` | ОПИСАНИЕ | 87 | L325–330: ¦ Файл                                                   ¦ Назначение                                    ; L379–459: ¦ Файл                                                      ¦ Назначение                                  |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/README.md` | ОПИСАНИЕ | 6 | L7–12: ¦ Документ                                                   ¦ Назначение                                 |
| `docs/MEDIA_PREVIEW_PIPELINE.md` | ОПИСАНИЕ | 5 | L49–52: **Порядок записи** (решение владельца 19.08.2026, SECURITY_CANON §5) не изменился, только распался на два; L123: Воркер сначала читает `FFMPEG_PATH` из env (на сервере канонично `/usr/bin/ffmpeg`), иначе разрешает `ffm |
| `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md` | ОПИСАНИЕ | 0 | — |
| `docs/OPERATIONS/RESCHEDULE_COUNT_SANITATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md` | ОПИСАНИЕ | 0 | — |
| `docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md` | ОПИСАНИЕ | 0 | — |
| `docs/ORCHESTRATION_BINDINGS.md` | ОПИСАНИЕ | 0 | — |
| `docs/OWNER_DECISION_2026-06-23_client-comms-tab.md` | КАНОН | 0 | — |
| `docs/OWNER_DECISIONS.md` | КАНОН | 132 | L56–59: Правило: «Доступ к системе» (`system_access_policy`) — единственная лестница для кабинета и всех вложенны; L61–63: ⛔ **УСТАРЕЛО / ОШИБКА АГЕНТА:** любая формулировка «per-mechanic — только opt-in исключение»,; L65–67: **Т9. Периоды оплаты — вариантом в тарифе, не в коде. «День» убрать.** ⛔ УСТАРЕЛО, заменено Т14 (05.09). |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/REQUIREMENTS.md` | КАНОН | 0 | — |
| `docs/PRODUCT_OVERVIEW.md` | ОПИСАНИЕ | 20 | L123–131: ¦ Область                                                     ¦ Сейчас                               ¦ Да; L139–149: ¦ Тема                                               ¦ Документ                                           |
| `docs/RASSL-06_broadcast-image-attachment-scope.md` | ОПИСАНИЕ | 0 | — |
| `docs/README.md` | ОПИСАНИЕ | 77 | L3–19: - 🧭 **ГДЕ АКТУАЛЬНОЕ ПО КАЖДОЙ ОБЛАСТИ (читать первым):** [`CURRENT_AUTHORITY_MAP.md`](CURRENT_AUTHORITY; L25–73: - **Фоновые джобы (host):** [`deploy/HOST_DEPLOY_README.md`](../deploy/HOST_DEPLOY_README.md) — единствен; L90–100: - **Own booking engine (этапы 1–9):** [`OWN_BOOKING_ENGINE_INITIATIVE/README.md`](archive/legacy-undersco |
| `docs/RESPONSIVE_PWA_LAYOUT_PASS.md` | ОПИСАНИЕ | 0 | — |
| `docs/round3/ESCALATIONS.md` | ОПИСАНИЕ | 0 | — |
| `docs/RULES/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md` | КАНОН | 2 | L19–20: - [`STAGE_PLAN.md`](./STAGE_PLAN.md) — этапы и playbook webapp + integrator. |
| `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md` | КАНОН | 0 | — |
| `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` | КАНОН | 9 | L27–35: - Schema files живут в `apps/webapp/db/schema/` (или согласованный путь после установки). |
| `docs/SHARED_TASKDB.md` | ОПИСАНИЕ | 0 | — |
| `docs/SUBSCRIPTION_INITIATIVE/REQUIREMENTS.md` | КАНОН | 0 | — |
| `docs/TASKDB_RULES.md` | ОПИСАНИЕ | 0 | — |
| `docs/TODO_NOT_NOW/product-platform-mass-patient.md` | ОПИСАНИЕ | 1 | L9: Roadmap «платформы с двумя режимами» (Guest/Mass Mode + Patient Mode, product-status resolver, отдельная  |
| `docs/TODO_NOT_NOW/public_landing_metadata.md` | ОПИСАНИЕ | 0 | — |
| `docs/TODO_NOT_NOW/README.md` | ОПИСАНИЕ | 6 | L28–33: ¦ Карточка                                                                             ¦ Тема             |
| `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md` | ОПИСАНИЕ | 0 | — |
| `README.md` | ОПИСАНИЕ | 7 | L52–53: Резидентный процесс integrator (при необходимости — второй терминал; D30 Ш9: один процесс, совмещающий; L73–77: Проверка npm advisory registry не является обязательной частью CI: внешний bulk API может временно отвеча |
| `tools/testsuite/README.md` | ОПИСАНИЕ | 0 | — |
| `docs/PROMO_ASSIGNMENT_SOURCE.md` | КАНОН | 0 | — |

Итого: 4036 строк history-блоков в 145 из 330 действующих КАНОНОВ/ОПИСАНИЙ.

~~~bash
node - <<'NODE'
const fs = require('fs');
const s = fs.readFileSync('docs/_TODO/DOCS_INVENTORY_2026-09-16.md', 'utf8');
const from = s.indexOf('| Файл | Класс | Строк истории |');
const body = s.slice(from, s.indexOf('\nИтого:', from));
let docs = 0, dirty = 0, lines = 0;
for (const line of body.split('\n')) {
  const m = line.match(/\| (КАНОН|ОПИСАНИЕ) \| ([0-9]+) \|/);
  if (!m) continue; const n = Number(m[2]); docs += 1; lines += n; if (n > 0) dirty += 1;
}
console.log({ lines, dirty, docs });
NODE
~~~

## 4. Предлагаемый состав архива

Ничего не перемещено. В предложение входят все ЖУРНАЛЫ и МЁРТВЫЕ; КАНОНЫ/ОПИСАНИЯ с history-врезками чистятся на месте после owner-решения.

### Side-archive вне `docs/archive/`

| Файл | Почему мёртв/архивен | Что вместо него |
|---|---|---|
| `.cursor/plans/archive/active_workqueue_plan_30236040.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/admin_db_guard_monitoring.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/admin_incident_alerts.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/analytics_test_filter_cards_65eac7c8.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/bot_fixes_staff_auth.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/clinical_test_attempts_history.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/cron_and_system_health.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/daily_warmup_ux_48e8a684.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/debug-flag-log-verbosity.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_broadcast_delivery_336bbbc0.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_catalog_regions_ux.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_inbox_by_attempt.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_material_statistics_d9985311.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_schedule_section.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_schedule_v26_rebuild.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor_ui_visual_style_pass.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor-loading-performance_e024544d.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor-only_stage_completion.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/doctor-ui-unification-phases_1146e22e.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/drizzle_final_closeout_6f3ea830.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/drizzle_wave3_closeout_caf9d91d.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/exercise_load_from_refs_bb4eba2e.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/exercise_ui_+_references_03b21d8e.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/health_ui_operator_actions_c49ffef4.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/health_ui_operator_actions.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/hls_private_bucket_proxy.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/hls_quality_selector_ui_c281dac4.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/instance-editor-batch-toolbar_3d597170.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/integrator_drizzle_migration_master.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/integrator_drizzle_phase_1_simple_repos.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/integrator_drizzle_phase_2_outbox_job_queue.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/integrator_drizzle_phase_3_domain_repos.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/integrator_drizzle_phase_4_complex_sql.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/lfk_expand_instance_cleanup.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/material_ratings_stars.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/max_tg_pre-prod_automation.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/media_hardening_and_logging_1171a669.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/media_preview_worker_split.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/merge+contacts_wave1-4.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/messenger_bot_block_handling.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/miniapp-audit-fixes_813ba600.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/operator_health_alerting_wave2.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage1_canonical_model.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage3_public_widget.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage4_reschedule_cancel.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage6_memberships.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage7_products_courses.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage8_calendar.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/patient_doctor_ui_split_9a04ff8e.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/patient_shell_md_breakpoint.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phase_3_patient_home_1b1dc5a6.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phase_4.5_patient_home_a2e6bd38.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phase1_support_model_7c745931.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phone_bind_mismatch_ux.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phone_messenger_bind_bot_ux.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/phone_messenger_bind_pwa_autologin.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/prod_reminder_scheduler_829b7cd4.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/product_analytics.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/production_log_findings_2026-05-14.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/program_item_discussion_070c3846.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/program-stage-dnd-reorder_8fce4297.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/promo_assignment_source.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/public_landing_metadata_system_settings.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/README.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/reliable_delivery_queue_audit_followup.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/reminder_bot_buttons_ux_2dc55692.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/reminder_defaults_and_home_goal.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/reminder_ux_full.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/rubitime_catalog_ux_fix.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/rubitime_name_mismatch_ui.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/rubitime_transition_stabilize.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/system_health_tab_b0e8ec64.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/telegram_menu_reply_admin.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/telegram_reminder_callback_fix_cf461c6a.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/unify_doctor_patient_card_37615243.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/warmup_feeling_ux_symptom.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/warmup_scheduled_rotation_0ce52970.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |
| `.cursor/plans/archive/webapp_tests_optimization.plan.md` | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority | `docs/CURRENT_AUTHORITY_MAP.md` + taskdb; evidence — Git |

### Датированные briefs / reports / audits / run evidence

| Файл | Почему мёртв/архивен | Что вместо него |
|---|---|---|
| `.lead/briefs/berson-test-custom-domain-proof-correction-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/berson-test-custom-domain-security-fixer-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/berson-test-custom-domain-security-reaudit-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/berson-test-custom-domain-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/clinic-branded-bots-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/clinic-branded-bots-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-active-call-combined-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-active-call-continuity-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-active-call-nav-fix-auditor-live-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-active-call-navigation-fix-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-active-call-preland-code-audit-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-android-capacitor-thread-crash-fix-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-android-emulator-recovery-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-android-runtime-closure-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-android-stable-emulator-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-android-toolchain-ops-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-branded-pwa-closure-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-browser-jitsi-closure-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-browser-jitsi-explicit-end-correction-worker-20260910.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-browser-jitsi-explicit-end-live-recheck-20260910.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-device-media-ui-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-device-media-ui-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-device-media-ui-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-emulator-api34-viewer-ops-20260910.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-emulator-browser-view-ops-20260910.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-final-integrated-browser-acceptance-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-m7-browser-final-auditor-live-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-m7-browser-production-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-media-multipart-backend-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-media-multipart-backend-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-media-multipart-backend-fixer-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-media-multipart-backend-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-capabilities-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-capabilities-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-capabilities-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-capabilities-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-jitsi-pip-explicit-end-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-jitsi-pip-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-push-tap-kind-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-push-wire-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-native-push-wire-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-plan-opus-review-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-push-backend-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-push-backend-final-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-push-backend-fixer-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-push-backend-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-push-route-fix-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-identities-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-identities-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-identities-fixer-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-identities-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-live-acceptance-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-live-acceptance-confirmation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-pwa-live-bootstrap-recheck-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-rustore-provider-contract-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-shell-foundation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-shell-foundation-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-therapygo-name-correction-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-therapygo-name-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-native-jitsi-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-native-jitsi-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-native-jitsi-lifecycle-closing-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-native-jitsi-lifecycle-continuation-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-native-jitsi-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-runtime-jitsi-push-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-runtime-jitsi-push-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-runtime-push-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/mobile-web-runtime-push-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-delivery-audience-final-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-delivery-audience-fix-acceptance-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-delivery-audience-fix-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-delivery-audience-split-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-delivery-audience-split-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-smtp-roundtrip-auditor-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-smtp-roundtrip-correction-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/platform-smtp-roundtrip-worker-20260909.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/briefs/reconcile-locks-auditor-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/307/work-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/bcb-feedback-2026-07-08/clients-and-chat.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/bcb-feedback-2026-07-08/patient-booking.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/bcb-feedback-2026-07-08/program-editor.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/bcb-feedback-2026-07-08/README.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/bcb-feedback-2026-07-08/schedule-and-today.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/clinical-anamnesis-audit-20260906/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/clinical-anamnesis-audit-20260906/01-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/clinical-encounter-page-audit-20260906/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/clinical-encounter-page-audit-20260906/blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/doctor-catalog-flat-list-align-audit-20260911/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/doctor-catalog-sort-control-audit-20260912/00-classification-and-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/doctor-catalog-sort-control-audit-20260912/01-final-verdict.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/encounter-start-owner-audit-20260906/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/encounter-start-owner-audit-20260906/blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-active-call-combined-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-active-call-nav-fix-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-active-call-preland-code-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-android-emulator-recovery-20260909/90-emulator-recovery-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-android-runtime-closure-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-android-stable-emulator-audit-20260909/90-m7-04-live-view-audit.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-browser-jitsi-explicit-end-live-recheck-20260910/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-device-media-ui-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-device-media-ui-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-emulator-api34-viewer-20260910/90-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-emulator-network-recovery-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-final-browser-acceptance-20260909-r5/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-m7-browser-final-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-media-multipart-backend-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-media-multipart-backend-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-capabilities-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-capabilities-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-push-tap-kind-confirmation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-patient-passwordless-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-backend-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-backend-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-backend-audit-20260909/92-lead-final-correction-evidence.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-backend-final-audit-20260909/00-targeted-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-backend-final-audit-20260909/90-final-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-push-route-fix-confirmation-20260909/90-final-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-identities-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-identities-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-identities-confirmation-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-identities-confirmation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-live-acceptance-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-live-acceptance-confirmation-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-pwa-live-bootstrap-recheck-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-rustore-provider-contract-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-rustore-provider-contract-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-shell-foundation-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-shell-foundation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-shell-foundation-audit-20260909/91-lead-fix-evidence.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-therapygo-name-correction-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-therapygo-name-correction-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-native-jitsi-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-native-jitsi-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-native-jitsi-lifecycle-continuation-audit-20260909/00-continuation-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-native-jitsi-lifecycle-continuation-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-runtime-push-audit-20260909/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-runtime-push-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/mobile-web-runtime-push-audit-correction-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/patient-typography-audit-20260908/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/patient-typography-final-20260908/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/platform-delivery-audience-final-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/platform-delivery-audience-split-audit-20260909/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/test-auth-entry-c069/00-blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/test-auth-entry-c069/90-final-audit-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/video-appointment-format-audit-20260908/blind-killset.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `.lead/runs/video-appointment-format-audit-20260908/privilege-analysis.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `apps/webapp/src/app/app/doctor/communications/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `apps/webapp/src/app/app/patient/diary/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `apps/webapp/src/modules/help-content/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `BILLING_PAYMENT_DOOR_R3_AUDIT_REPORT.md` | датированный отчёт/аудит/история прохода; не authority | current tariffs/store canon; закрытый billing — runtime |
| `BILLING_PAYMENT_DOOR_R3_FIX_REPORT.md` | датированный отчёт/аудит/история прохода; не authority | current tariffs/store canon; закрытый billing — runtime |
| `deploy/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/ACCESS_SWEEP_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/ACCESS_SWEEP_LIVE_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/APPOINTMENT_PREPAYMENT_CORE_INDEPENDENT_AUDIT_2026-09-06.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/AUDIT_ADMIN_DOORS_A1_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND4_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND5_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_D2_DEAD_MESSENGER_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_D3_PASSWORD_ENUM_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_D4_DOOR_DUPES_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_D5_OAUTH_SURFACE_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_D5_OAUTH_SURFACE_ROUND2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_D6_PATIENT_PASSWORD_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/AUDIT_D7_REGISTER_DUPE_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_DOCTOR_DOORS_A2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_2026-09-14.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND4_ADVERSARIAL_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND5_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4a_POST_E1_MERGE_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4B_MERGE_CONFLICT_SCREENS_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_E4B_MOBILE_ACTIONS_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_DOCTOR_DECISION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/AUDIT_E4C_MOBILE_DOT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_PROOF_SET_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_ROUND5_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E4C_ROUND8_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_GATE_FALSE_POSITIVES_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND10_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND11_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND7_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND8_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_ROUND2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_ROUND3_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_ROUND4_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_ROUND5_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_E5A_RUNTIME_DOOR_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L3_PUBLIC_INTAKE_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/AUDIT_L5_DEV_MAIL_TRAP_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L5_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L5_ROUND4_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L5_ROUND6_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L5_ROUND7_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L6_CANON_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L6_CANON_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L6_CANON_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L6_CANON_ROUND4_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_L6_CANON_ROUND5_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_ROUND3_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_MERGE_FIO_ON_CANON_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_MERGE_FIO_ON_CANON_CORRECTION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_MERGE_FIO_ORIENTATION_FIX_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/AUDIT_PATIENT_SUPPORT_DOOR_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_ROUND2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_ROUND3_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_STAFF_DOORS_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND2_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND3_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND4_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND5_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/audit/AUDIT_2D_926_BLIND_KILLSET.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/audits/CUTOVER_COMPLETENESS_AUDIT_2026-08-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/BLOCK_SPLIT_INVENTORY_2026-09-14.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/C4_ADMIN_ALLOWLISTS_2026-07-26.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/CABINET_UI_AUDIT_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/CLINIC_PUBLIC_PAGE_AUDIT_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/CLINIC_SHOWCASE_WORLD_PRACTICE_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/CUSTOM_DOMAIN_TLS_EDGE_RUNBOOK_2026-09-07.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/D2_MESSENGER_PAIR_CUT_REPORT_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/D3_PASSWORD_DOOR_UNIFORM_REPORT_2026-09-16.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/D6_PATIENT_PASSWORD_DEAD_END_2026-09-16.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/log.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/DOCTOR_ANALYTICS_FIRST_STAGE_INDEPENDENT_AUDIT_2026-09-06.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/DOCTOR_FULLSCREEN_TEXT_EDITOR_INDEPENDENT_AUDIT_2026-09-06.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/UI5B_PATIENT_CARD_COMPOSITION_INDEPENDENT_AUDIT_2026-08-20.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/E4B_MOBILE_ACTIONS_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `apps/mobile-shell/README.md` + taskdb |
| `docs/_TODO/E4C_DEV_APPLY_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/E4C_PROOF_SET_CORRECTION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/E4C_ROUND7_FIX_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/EXTERNAL_VIDEO_LINK_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/EXTERNAL_VIDEO_PLAYER_APIS_2026-09-07.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/FAULTS_E4a_MERGE_CONFLICT_DOCTOR_ROUND5_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/FIX_E4a_DOOR_AFTER_E1_MERGE_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/FIX_E4a_MERGE_CONFLICT_DOCTOR_ROUND4_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/FIX_E4b_DETAIL_DOOR_500_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/HANDOFF_2026-07-26.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/HANDOFF_2026-07-27.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/HANDOFF_ORCHESTRATION_2026-08-20.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/INVENTED_SCOPE_FOR_OWNER_REVIEW_2026-07-26.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/L5_DEV_MAIL_TRAP_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LEADS_CABINET_L2_POST_LANDING_AUDIT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/LEADS_L4_CLINIC_NOTIFICATION_REPORT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/LEADS_NOTIFICATION_TOPIC_AUDIT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/LEADS_NOTIFICATION_TOPIC_WORKER_REPORT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/LEADS_PUBLIC_GATE_ORDER_FIX_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/LIVE_ACCEPTANCE_LEADS_KPI_2026-09-15/REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/MERGE_AUDIT_LEDGER_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/MERGE_FIO_ON_CANON_REPORT_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/NEW_PROD_DEPLOY_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/NEW_PROD_DEPLOY_BB91018EC_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/NOTIFICATION_ALERTING_DESIGN_2026-07-26.md` | датированный снимок/разбор события; не текущая authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/NOTIFY_MAP_AND_SIMPLICITY_2026-09-16.md` | датированный снимок/разбор события; не текущая authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/OWN_PATIENT_INVENTORY_VERIFICATION_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/OWNER_LIVE_PASS_2026-08-18_TRIAGE.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_ОТВЕТЫ.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/PROD_JOURNAL_TRUTH_PIPELINE_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/PROD_MIGRATION_JOURNAL_TRUTH_MEASUREMENT_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/PROD_VS_TEST_DIVERGENCE_2026-07-26.md` | датированный снимок/разбор события; не текущая authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/PROGRAM_LIFECYCLE_AND_MEDIA_RETENTION_2026-09-11.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/PUBLIC_SHOWCASE_SEAM_CENSUS_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/REPORT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/REPORT_L4_CLINIC_NOTIFICATION_CORRECTION_ROUND2_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/REPORT_MERGE_FIO_ORIENTATION_FIX_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/RESERVED_CLINIC_SLUGS_2026-09-13.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/ROLE_LOGIN_CONSOLIDATION_AUDIT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/CURRENT_PROD_BASELINE_2026-07-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/ENCRYPTED_HOST_BUILD_2026-08-17.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/NEW_HOST_BASELINE_2026-08-17.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/PII_MEDICAL_STORE_SEPARATION_RECON_2026-07-24.md` | датированный снимок/разбор события; не текущая authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-03_CLINICAL_ACCESS_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/runs/access-reconcile-locks-audit-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/acquiring-webhook-settlement-audit-20260905.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/appointment-detail-hydration-audit-20260905.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/appointment-detail-hydration-killset-20260905.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/appointment-prepayment-core-gatefix-20260906.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/appointment-prepayment-core-reaudit-20260906.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/AUDIT_INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/APPLY_DEPLOY_AND_CLOSE_PAYMENT_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/AUTH_ERROR_MESSAGES_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/AUTH_ERROR_MESSAGES_REPORT_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_REPAIR_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/B1.2_PAYER_IDENTITY_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_APPLY_AND_DEPLOY_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_AUTOPAY_COMPLETION_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_CANCELED_ORDER_IDEMPOTENCY_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_CAPTURE_RLS_CONTEXT_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_FINISH_PAYMENT_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_FISCALIZATION_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_IDEMPOTENCE_KEY_DRAFT_RETRY_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_IMMEDIATE_UPGRADE_PRORATION_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_LIVE_CHECKOUT_RETRY_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_LIVE_VAT_CHECKOUT_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_PAYMENT_STATE_AND_CLOSE_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_SMALL_INTEGRATION_CI_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_TARIFF_APPLY_ROLE_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_WARNING_VARIABLES_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_CAPTURE_GRANT_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_CHAIN_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_GRANT_FIX_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/DB_TX_PRINCIPAL_LOSS_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/DEP_AUDIT_TRIAGE_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/MIGRATION_HASH_RECONCILIATION_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/SAAS_SEAT_BILLING_0308_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/SAAS_WEBHOOK_GUARDS_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_500_PAGES_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_DEPLOY_NIGHT_BATCH_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_GATE_AND_PAYMENT_CLOSE_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_FIX_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_PASSWORD_INCIDENT_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_PASSWORD_RESTORE_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/TEST_YOOKASSA_WEBHOOK_INGRESS_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/billing/YOOKASSA_IDEMPOTENCE_KEY_LIMIT_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/CALENDAR_TIMEZONE_SINGLE_DOOR_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/cash-payment-principal-audit-20260905.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/clinical-appointment-overlap-20260906/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/clinical-appointment-overlap-20260906/KILLSET.blind.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/DB_RUNTIME_CONTRACTS_W1_W3_W4_INDEPENDENT_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/DEEP_CODE_HUMAN_GAPS_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/DEEP_CODE_HUMAN_GAPS_CORRECTION_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/DEEP_CODE_SHARED_CONTRACTS_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/DOCS_CONSOLIDATION_STEP1_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/DOCS_SYNC_PASS2_2026-08-23.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_FIX_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_TRACK_D_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_TRACK_D_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/doctor-appointment-payments-audit-20260820.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/doctor-appointment-payments-local-qr-audit-20260820.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/exercise-store-s0b-assignment-path-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/exercise-store-s0b-confirmation-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/exercise-store-s0b-live-acceptance-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/EXHAUSTIVE_LIFECYCLE_SEMANTICS_FIX_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_HOSTED_VIDEO_PREVIEW_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_SYSTEMIC_COMPLETION_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_TRACK_D_IDENTITY_RETENTION_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/FINAL_TRACK_D_LIFECYCLE_PACKAGE_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-cleanup/LOGIN_SCREENS_INVENTORY_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-cleanup/SYSTEMIC_LIFECYCLE_C1_E1_D1_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-cleanup/VK_ID_LOGIN_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-diary-removal/REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-identity/RESEARCH_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_OPUS_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_R2_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_SOL_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/PLAN_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/RESEARCH_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_OPUS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_SOL.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_TERRA.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/integrator-role/SYNTHESIS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/KOSTYAKOV_MERGE_PROBE_2026-09-13.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/kpi-filters-audit-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/kpi-filters-audit2-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/kpi-filters-audit3-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/material-ratings-platform-label-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDIA_FILES_INSERT_GRANT_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/media-hls-cleanup/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/media-hls-cleanup/KILLSET.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_REAUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_A_INDEPENDENT_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_B_INDEPENDENT_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_D_INDEPENDENT_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_F_INDEPENDENT_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-booking-card-audit-2-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-booking-card-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-booking-card-audit-result.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-booking-card-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-chat-fix-20260908/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-media-storage-20260906/AUDIT_PATIENT_MEDIA_STORAGE.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-media-storage-20260906/AUDIT_STORAGE_FIX_CORRECTION.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-media-storage-20260906/LEAD_DISPOSITION.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-media-storage-20260906/STORAGE_SETUP.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_SYMPTOM_BRIDGE_ACCEPTANCE_20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_ACCEPTANCE_20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/AUDIT_BOOKING_AVAILABILITY_HORIZON.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/AUDIT_HORIZON_SECOND_INDEPENDENT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/BLIND_KILL_SET.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_MODALS_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_SYMPTOMS_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_WORK3_CI_CORRECTION_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/platform-read-complex-templates-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/PRE_SESSION_GATE_CONFLICT_2026-08-23.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s3-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s3-audit-result.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s3-check-screen-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s4-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s4-audit-result.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s4-patient-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s5-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s5-notify-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s7-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s7-audit-result.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s7-patient-cancel-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s8-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s8-one-message-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s9-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-s9-patient-payment-door-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-settings-fix-20260905/audit-live-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/prepayment-settings-fix-20260905/kill-set-blind.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/PUBLIC_IDENTITY_NO_RESIDUE_AUDIT_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/PUBLIC_IDENTITY_NO_RESIDUE_FIX_2026-08-28.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/RUNTIME_OVERLAY_CURRENT_STATE_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_CORRECTION_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_REAUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/saas-period-grid-20260905/AUDIT-2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/saas-period-grid-20260905/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/saas-period-grid-20260905/KILLSET-ADDENDUM.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/saas-period-grid-20260905/KILLSET.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/saas-period-grid-20260905/TEST-POLICY-AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/schedule-list-colors-audit-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/schedule-list-colors-audit-brief-20260914.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/CH1B_STORAGE_LIFECYCLE_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/CH1B_STORAGE_LIFECYCLE_WORKER_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/CH3_QUEUE_PORT_GATE_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/CH4B_TRANSACTION_QUOTA_PORT_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_BROADCAST_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/RAW_SQL_EMAIL_OTP_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/RAW_SQL_PASSWORD_LOGIN_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/single-entry/ROOT_TYPECHECK_PREREQUISITES_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/SYSTEM_SETTINGS_AUDIT_REDACTION_INDEPENDENT_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/systemic-access/BLIND_KILL_SET_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/systemic-access/SYSTEMIC_ACCESS_INDEPENDENT_AUDIT_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/systemic-hosted-preview/SYSTEMIC_HOSTED_PREVIEW_AUDIT_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/systemic-media-reconcile/SYSTEMIC_MEDIA_RECONCILE_AUDIT_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/systemic-scheduler/SYSTEMIC_SCHEDULER_INDEPENDENT_AUDIT_2026-08-27.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_PLAN2_OPUS_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_PLAN2_SOL_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_SEAM_OPUS_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_SEAM_SOL_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_OPUS_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_SOL_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/S4_ADJUDICATE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/S4_ADJUDICATE_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/S4_RECONCILE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/S4_RECONCILE_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/S4_TRIAGE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/SEAM_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FINAL_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FINAL_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FIX_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R3_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R3_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R5_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R5_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX2_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX3_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX3_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX4_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX4_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FINAL_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX2_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_MECHANISM_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_REAUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE3_INTEGRATOR_SEAM_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE3_SEAM_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_WORKER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_WORKER_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_R3_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_R3_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_CORRECTION_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FINISH_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FINISH_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX2_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REAUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REAUDIT_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_IMPLEMENTATION_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_C_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_OPUS_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_SOL_RESULT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/CRITICAL_MECHANICS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/FILES_DELETION_RESEARCH_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/GRACE_NOTIFY_OFFSET_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/MECHANICS_CENSUS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/MECHANICS_TABLE_V2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/MERGE_BREAKAGE_FIX_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/PATIENT_FILE_DELETE_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/PLATFORM_QUOTA_USAGE_PATIENT_FILES_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_WORKER_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_1_CONTINUE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_1_LADDER_SUBJECTS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_6_CONSTANTS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_6_GATE_HOLE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_6_MERGE_AND_GATE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S2_LADDER_ENGINE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S31_READONLY_WRITE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S31A_COVERAGE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S31A_READ_LADDER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S31B_VISIBILITY_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S47_TOGGLES_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S4A3_CMS_BOUNDARY_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S4A4_CALENDAR_DIARIES_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S4A5_FALSE_SURFACES_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S4B_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S4B_KNOBS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S5_NUMBERS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S5_STORAGE_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S5_STORAGE_REGRESSION_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S6_VISIBILITY_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S7_0_LADDER_TO_PAYMENT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S7_3_LIVE_RUN_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/T1_SYSTEM_ACCESS_GOVERNS_MECHANICS_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/T3_MAILINGS_TAB_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TARIFF_2_13_MIGRATION_0305_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TARIFF_CHANGE_PAID_PERIOD_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TARIFF_CHANGE_PAID_PERIOD_WORKER_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TARIFF_DOWNGRADE_CONSOLIDATION_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TARIFF_NOTIFY_TRIGGERS_BRIEF_2026-08-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/tariff/TRIAL_GRACE_MODEL_BRIEF_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-appointment-word-T-A-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-appointment-word-T-B-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-appointment-word-T-D-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-appointment-word-T-F-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-T-A-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-T-B-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-T-D-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/terminology-T-F-audit-brief.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/TEST_TO_DEV_REFRESH_INDEPENDENT_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/TEST_TO_DEV_REFRESH_REAUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testcut-how/BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testcut-how/CALIB_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testcut-how/PROVENANCE.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testcut-how/sol-report.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-foundation/G0_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-foundation/G0_DEV_PREFLIGHT_WORKER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-foundation/STACK_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-foundation/STACK_WORKER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B_DISPOSABLE_PG_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B_FIX_ROUND2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_CORRECTION_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_INDEPENDENT_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_REAUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B0_NO_DISPOSABLE_DB_INDEPENDENT_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2_CHECKLIST_CLOSURE_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/B3_DEVDB_ORPHAN_TRIAGE_2026-08-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_ACCEPTANCE_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_VALIDATION_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_CHOKEPOINT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH5_DI_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CHOKEPOINT_SWEEP_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/CHOKEPOINT_SWEEP_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/DECISION_TRAIL_2026-08-01.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_PRODUCT_PILOT_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_TRANSPLANT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/ETALON_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/ETALON_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/FIXTURES_SPLIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/FIXTURES_SPLIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/LAYER_ALLOWLIST_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_FIX_ROUND2_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_FIX_ROUND2_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_MECHANICS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/M_MECHANICS_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/PLAN_CANON_RESEARCH_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_DOCTOR_NOTES_SLICE_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_DOCTOR_NOTES_SLICE_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_PLAYBACK_FIRST_SLICE_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_REAUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/REFS_REPOINT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/REFS_REPOINT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9_ROLE_GUARDS_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9A_BLIND_AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9A_ROUTE_WIRING_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_FIX_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_S01_RETIRE_LEGACY_BOOKING_PROJECTIONS_AUDIT_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_S02_CAPABILITY_EXPAND_INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_S02_CAPABILITY_SEAMS_REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_S03_DEV_BOOKING_OWNERSHIP_CENSUS_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_S03_INDEPENDENT_AUDIT_2026-08-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RESEARCH_opus.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RESEARCH_sol.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/toast-notifications-20260905/AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/TYPED_SQL_W5_INDEPENDENT_AUDIT_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/unified-loader-20260904/AUDIT_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/unified-loader-20260904/FIX_ACCEPTANCE.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/unified-loader-20260904/INDEPENDENT_AUDIT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/unified-loader-20260904/WORKER_BRIEF.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/VERDICTS_PENDING_2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/W11_W16_CRITICAL_ACCEPTANCE_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/W17_BRANDED_BOT_ROUTING_ACCEPTANCE_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/runs/W17_REMINDER_PRIVACY_ACCEPTANCE_2026-09-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/S1_FIRST_INDEPENDENT_AUDIT_2026-09-03.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/S1_SECOND_INDEPENDENT_AUDIT_2026-09-04.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/S4_ACTION_CORRELATION_REAUDIT_2026-09-04.md` | датированный снимок/разбор события; не текущая authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_BOOKING_PREPAYMENT_ENTITLEMENT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_CMS_ENTITLEMENT_VISIBILITY_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_DOCTOR_STATISTICS_ENTITLEMENT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_EXERCISE_PLATFORM_LIBRARY_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_MAILINGS_ENTITLEMENT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_PAYMENTS_ENTITLEMENT_CONSOLIDATION_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_SUBSCRIPTIONS_ENTITLEMENT_VISIBILITY_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_TARIFF_DOWNGRADE_CAPABILITY_2026-09-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/BILLING_CATALOG_REMOVAL_AUDIT_REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/BILLING_PREPAYMENT_PROVIDER_GATE_AUDIT_REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_EXECUTABLE_GATE_REAUDIT_2026-08-15.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_2026-08-15.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_INDEPENDENT_AUDIT_2026-08-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_REAUDIT_2026-08-15.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0A_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_ASSIGNMENT_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_CONFIRMATION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_LIVE_ACCEPTANCE_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/HANDOFF_2026-07-12.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/HANDOFF_TARIFFS_PAYMENTS_2026-08-01.md` | датированный снимок/разбор события; не текущая authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/MATERIAL_RATINGS_PLATFORM_LABEL_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/ORCHESTRATOR_BRIEF.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_DECISIONS_FOR_REVIEW.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-01.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/owner-intent-reconciliation.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/process-audit-status.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-01-final-PASS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-02-final-PASS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-curated-system-health-closure.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-final-PASS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-04-integration-PASS.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/log.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/PLATFORM_READ_COMPLEX_TEMPLATES_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/PROMO_ENTITLEMENT_VISIBILITY_AUDIT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/REMOVE_ONLINE_INTAKE_BLIND_AUDIT_2026-08-02.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/REVIEW_2026-06-17_FRESH.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` | датированный снимок/разбор события; не текущая authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_WORLD_PRACTICE_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_UNPAID_PRACTICE_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_MATRIX_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_EVIDENCE_MANIFEST.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_FRESH_AUDIT_2026-07-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_INDEPENDENT_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_RECONCILIATION_REVIEW.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_VISUAL_ATTEMPT_LEDGER.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_RESEARCH_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SEAM_OWNERS_CENSUS_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/SILENT_CODE_CENSUS_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/SMTP_ROUND_TRIP_P5_AUDIT_2026-09-09.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/STATE_2026-07-28_EVENING.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/SWALLOWED_ERRORS_CENSUS_2026-08-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/TEST_DEPLOY_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/TEST_DEPLOY_EVIDENCE_2026-09-15.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/TEST_LIVE_FINDINGS_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` | датированный отчёт/аудит/история прохода; не authority | `AGENTS.md` §9–§12/§24 + фактическая CI-конфигурация |
| `docs/_TODO/THERAPYSTO_JOURNAL_GATE_SUDOERS_2026-09-15.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_787_CLINIC_BRANDED_BOTS_2026-09-09.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_APP_TEST_EDGE_REAUDIT_2026-09-10.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_SECURITY_REAUDIT_2026-09-09.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_DNS_ALTERNATIVES_2026-09-10.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_READINESS_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_TLS_EDGE_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_UI_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_LOGIN_SURFACE_SPLIT_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_NEW_PROD_SPLIT_SURFACE_CONFIGURATION_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PLATFORM_CLINIC_BRAND_DOMAIN_STATUS_2026-09-10.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_SAME_ORG_CUSTOM_DOMAIN_RECLAIM_2026-09-10.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_TRUSTED_REMINDER_ORIGIN_RUBITIME_RETIREMENT_2026-09-07.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PROCESS_AUDIT_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_DNA_LIVE_EVIDENCE.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_ROADMAP_DAG_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI0_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI1_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI2_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI3_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_LIVE_EVIDENCE.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI5A_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI6_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI8_UI9_CLIENT_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UIP_REALITY_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_LAYOUT_SYSTEMIC_2026-08-08.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/UI_WALKTHROUGH_2026-07-25.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/VETOED_FEATURES_AUDIT_2026-08-04.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/VIDEO_MEETINGS_JITSI_AUDIT_2026-09-08.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/VISIBILITY_MODEL_DESIGN_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/_TODO/VISIBILITY_MODEL_GAP_2026-08-04.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/ACQUIRING_INTEGRATION/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/CMS_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/CMS_RESTRUCTURE_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/ARCHITECTURE/ADMIN_NAME_MATCH_HINTS_PLAN_AND_EXECUTION_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/ARCHITECTURE/DOCTOR_CATALOG_REGIONS_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/ARCHITECTURE/INTEGRATOR_PLATFORM_USER_MIGRATION_EXECUTION_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/ARCHITECTURE/LOG_DOCTOR_ONLY_STAGE_COMPLETION.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/ARCHITECTURE/MAX_MAIN_MENU_EXECUTION_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/ARCHITECTURE/PRODUCTION_DB_INVENTORY_2026-04-13.md` | датированный снимок/разбор события; не текущая authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/audit/active-patient-card-daily-notes-1100-independent-audit-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/blind-killset-booking-webhook-215.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/blind-killset-encoding-mode-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/c3m-09-communications-2026-09-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/c3m-encounters-independence-2026-09-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/clinical-encounters-ui-2026-09-06.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-cr-10.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-CR-123.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-CR-5.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-CR-8.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-cr7-d1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-extra-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-pfi-st-01.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-a1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-a2-b5.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-a3.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-a4.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-b5-a2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-b7.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-d9.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-e10-batch1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-qw-e10-batch2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-sch-r-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-sch-r-05.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-sch-r-06.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-1-SCH-R-C8.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-cr-10.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-CR-123.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-CR-5.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-CR-8.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-cr7-d1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-extra-02.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-a1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-a3.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-a4.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-b5-a2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-b7.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-d9.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-e10-batch1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-qw-e10-batch2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-sch-r-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-sch-r-05.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-sch-r-06.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2-SCH-R.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2b-qw-b7.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2b-qw-d9.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2b-qw-e10-batch2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2c-qw-b7.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-2d-qw-b7.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-3-CR-5.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-3-qw-e10-batch1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-3-qw-e10-batch2.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-4-qw-e10-batch1.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-audit-money-13-booking-webhook.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/code-reaudit-1-qw-a4.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/daily-notes-1100-independent-audit-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/doctor-catalog-form-canonical-audit-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/encoding-mode-crf-ceiling-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/encoding-mode-f1-round2-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/exercise-store-tariff-gate-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/identity-fio-latin-ban-2026-09-14.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/identity-fio-latin-ban-round2-2026-09-14.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/jitsi-coturn-test-package-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/jitsi-live-infra-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/jitsi-turn-global-external-services-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/login-history-2026-09-13.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/login-security-action-explicit-columns-2026-09-14.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-e3-adversarial-round4-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-e3-human-confirmation-round2-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-e3-round3-fixes-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-e3-round4-fix-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-org-gate-adversarial-audit-2026-09-14.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-org-gate-fifth-audit-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-org-gate-fourth-audit-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-org-gate-recheck-2026-09-14.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/merge-org-gate-third-audit-2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/mobile-patient-card-2026-09-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/PATIENT_BOOKING_CARD_AUDIT_2_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/PREPAYMENT_S5_DELIVERY_AUDIT_2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/PREPAYMENT_S8_ONE_MESSAGE_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/PREPAYMENT_S9_PATIENT_PAYMENT_DOOR_AUDIT_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/reaudit-1-qw-a3.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-appointment-format-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-appointment-format-plan-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-delivery-byte-metering-2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-guest-tenant-gate-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-guest-tenant-gate-fix-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-invite-patient-binding-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-live-ui-final-verification-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-live-ui-owner-correction-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-live-ui-postfix-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-meetings-full-surface-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-meetings-test-acceptance-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-meetings-workspace-gate-correction-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/audit/video-vpn-reconciler-2026-09-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/BIG_ITEMS_SCOPING_2026-06-28.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/CONTENT_CMS_REPORT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/CURSOR_PLANS_REVIEW_2026-05-01.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/DEDUP_REPORT_2026-06-28.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/DOCTOR_UI_REBUILD_REVIEW/REVIEW_2026-06-13.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map → текущая UI-спека/plan + runtime |
| `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/TEST_BEHAVIOR_AUDIT.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/OPERATIONS/REMINDER_SCHEDULER_ROLLOUT_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/OWNER_VISION_BRAINDUMP_2026-06-17.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-01.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-02-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-05.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-06.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-09.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-10.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-01.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-02-03.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-04.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-05.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-06.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-08.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-09.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-10.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/plan-audit.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/PATIENT_UX_AUTH_MENU_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/QUICK_WINS_REVISION_2026-06-19.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/QUICK_WINS_USER_2026-06-17.md` | датированный снимок/разбор события; не текущая authority | authority map → текущая UI-спека/plan + runtime |
| `docs/REPORTS/AB_PATH_EXECUTABLE_FIX_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_4BBBDA02F_D20_PRIVILEGE_PRINCIPAL_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_70B08FFEB_SCHEMA_DERIVATION_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_AB_PATH_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_APPOWNER_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_CABINET_ORG_ACTIVE_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_D39_DELIVERY_SEAMS_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_DROP_REISSUE_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_FINAL_ENCODE_SHAPE_2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_LEDGER_DOWN_OP_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_LEDGER_ORPHAN_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_MEDIA_DELIVERY_WALLS_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_MEDIA_RAW_ORIGINAL_DOWNLOAD_2026-09-10.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_MIGRATION_LEDGER_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_MIGRATION_LEDGER_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_RAW_ORIGINALS_MIGRATION_2026-09-12.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_RAW_UPLOAD_BUCKET_2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_RESTORE_AB_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_SEAT_SINGLE_DOOR_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_TEST_OWNERSHIP_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_TEST_RESET_PATH_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/AUDIT_WALLTEST_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/B0_NAMED_DEV_DB_CORRECTED_REAUDIT_ONE_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_CARD_SWITCH_AND_SPECIALIST_CARDS_AUDIT_2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_DOMAIN_WRITE_CONSTRAINTS_FIX_2026-08-23.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_UI_AUDIT_2026-09-07.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_ROOT_AND_SPECIALIST_LINK_AUDIT_2026-09-11.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_SLUG_POLICY_BLIND_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_SLUG_POLICY_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CLINIC_TARIFF_PICKER_FIX_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/COUNTERS_NAME_CENSUS_BLIND_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/CUTOVER_STEP_LOGGING_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/D10A_SINGLE_WRITER_AUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/D39_DELIVERY_SEAM_CENSUS_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/D39_FIX_F1_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/D39_REMAINING_SEAMS_SWEEP_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/DEV_DOCTOR_API_PORT_CONTEXT_AUDIT_2026-08-16.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/DEV_DOCTOR_BROWSER_RUNTIME_AUDIT_2026-08-16.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/DEV_PORT_CONTEXT_LATENCY_AUDIT_2026-08-16.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/DOCTOR_UI_TWEAKCN_DNA_AUDIT_2026-07-13.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/GLOBAL_ADMIN_VIDEO_ACCESS_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/GLOBAL_PAID_ACCESS_AUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/GLOBAL_SINGLETON_POLICY_UPSERT_AUDIT_2026-08-16.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/INVOICE_REISSUE_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/INVOICE_REISSUE_FIX_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/INVOICE_REISSUE_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/LEDGER_DOWN_OP_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/LIVE_DEV_AUDIT_A_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MEDIA_WORKER_DISPATCH_AUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MEDIA_WORKER_QUEUE_ROOT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MERGE_ORG_GATE_E1_ADVERSARIAL_AUDIT_2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MERGE_ORG_GATE_E1_ROUND_7_AUDIT_2026-09-15.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_BYPASS_FIX_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_BYPASS_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_LEDGER_ORPHANS_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_LEDGER_RED_FIX_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_ORDER_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_TIMESTAMP_FIX_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_TIMESTAMP_NAMES_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/OPERATOR_ALERT_ENV_LABEL_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PATIENT_COUNT_LIMIT_REMOVAL_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PATIENT_REMINDER_MATERIALIZER_500_FORENSIC_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PLAN_CENSUS_RAW_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PLAN_VERIFICATION_SUMMARY_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PLATFORM_MERGE_V2_CUTOVER_RUNBOOK.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PROGRAM_ITEM_WRITE_GRANT_FIX_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_ROOTS_BLIND_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLIND_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLOCKERS_FIXED_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLOCKERS_REAUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_REAUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_THIRD_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/README.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/REMINDER_MATERIALIZATION_NARROW_READS_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/RUNTIME_MIGRATION_WRAPPER_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/RUNTIME_MIGRATION_WRAPPER_FINAL_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/SCHEDULER_MATERIALIZE_WAKE_CONTRACT_AUDIT_2026-08-17.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/SEAT_SINGLE_DOOR_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/SLUG_SELF_RENAME_ALLOWANCE_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TASKDB_TRIAGE_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TEST_RESET_2026-08-20_RUN2_BIRTH_WALL.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TEST_RESET_2026-08-20_RUN3_APP_OWNER.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TEST_RESET_OWNERSHIP_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TIMEZONE_RULE_34_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/TIMEZONE_RULE_34_AUDIT_2026-08-19.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_AUDIT_2026-08-20.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/RULES/OPERATIONS/REMINDER_SCHEDULER_ROLLOUT_LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `docs/SCHEDULE_REDESIGN_2026-06-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/SESSION_REPORT_2026-06-28.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | authority map + taskdb + runtime |
| `docs/SETTINGS_RESEARCH_MAP_2026-06-19.md` | датированный снимок/разбор события; не текущая authority | authority map + taskdb + runtime |
| `docs/SUBSCRIPTION_INITIATIVE/audit/2026-07-07-full-initiative-audit.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `docs/SUBSCRIPTION_INITIATIVE/LOG.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | current tariffs/store canon; закрытый billing — runtime |
| `docs/TENANT_ISOLATION_PROOF_BLIND_AUDIT_2026-08-19.md` | отчёт, аудит, brief, лог или evidence прошлого события; не authority | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `PORTFOLIO_CHAT_SUMMARY.md` | датированный отчёт/аудит/история прохода; не authority | authority map + taskdb + runtime |
| `runs/ALARM_REVIVE_REMOVED.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/ALARM.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/audit-1102/KILLSET_BLIND.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/audit-926-2b/KILLSET_BLIND.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/audit-926-stage2a/KILLSET-blind.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/audit-926-stage2a/REPORT.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-absolute-links-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-absolute-links-audit-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-absolute-links-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-absolute-links-fixer-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-correction-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-correction2-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-correction3-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-readiness-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-core-readiness-audit-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-edge-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-edge-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-edge-correction-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-final-audit-salvage-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-final-live-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-prod-config-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-prod-config-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-reminder-origin-final-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-ui-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-ui-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-domain-ui-live-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-login-auth-policy-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-login-auth-policy-followup-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-login-surfaces-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-login-surfaces-initial-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-login-surfaces-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/branding-reminder-rubitime-reaudit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-behavior-audit-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-final-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-recovery-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-communications-slice-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-encounters-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-encounters-audit-resume-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-encounters-slice-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-integration-acceptance-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-medical-record-audit-366f65f63.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-medical-record-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-medical-record-audit-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-medical-record-slice-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-portal-symptom-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-portal-symptom-audit-e82c4a43a.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-portal-symptom-fix-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-portal-symptom-slice-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-audit-d77f7dbaf.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-audit-resume-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-dev-closure-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-rehabilitation-slice-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-specialist-shell-routes-audit-8a83a0788.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-specialist-shell-routes-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-specialist-shell-routes-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-identity-audit-251b9f1fc.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-identity-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-identity-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-terminology-ui-audit-6b8fd2732.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-terminology-ui-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-terminology-ui-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-support-terminology-ui-fix-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-foundation-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-foundation-audit-d4446a453.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-foundation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-settings-audit-5bee7711a.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-settings-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m-workspace-settings-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-calendar-analytics-broadcasts-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-cms-catalog-programs-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-core-doctor-ui-terminology-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-doctor-pages-terminology-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-patient-server-terminology-worker-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-terms-card-programs-brief-20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-terms-server-presentations-brief-20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-terms-settings-broadcasts-patient-brief-20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/c3m11-terms-today-calendar-analytics-brief-20260908.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-audit-continuation-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-correction-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-ui-audit-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-ui-completion-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/clinic-management-workspace-ui-correction-brief-20260907.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/dev-interactive-audit/EXECUTION-MATRIX-2026-08-16.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/dev-interactive-audit/README.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/lead-revive-mission.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/audit-dirty-tree-salvage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/clinic-owner-systemic-audit1-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/clinic-owner-systemic-worker-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/correction-dirty-tree-salvage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/diary-snapshot-conflict-select-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/diary-snapshot-conflict-select-fix-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/final-fix-db-chart-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/final-fix-invoice-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/final-fix-profile-sms-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/full-function-surface-closure-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/full-function-surface-final-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/full-function-surface-forensic-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/function-return-shape-closure-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/function-return-shape-final-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/function-return-shape-forensic-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/gitleaks-bot-token-visibility-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/global-admin-systemic-audit1-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/global-admin-systemic-correction-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/global-admin-systemic-correction2-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/global-admin-systemic-reaudit2-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/global-admin-systemic-worker-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/migrate-dev-owner-metadata-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/migrate-dev-owner-metadata-fix-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/migrate-dev-stale-test-fix-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/patient-b0-capability-salvage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/patient-capability-batch1-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/patient-root-surface-closure-fix-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/patient-root-surface-final-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/patient-root-surface-forensic-audit-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-final-correction-integration-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-final-independent-audit-a-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-final-independent-audit-b-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-integration-clinic-stage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-integration-global-stage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/orchestration/systemic-integration-security-stage-20260817.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/owner-inbox.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/owner-questions.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |
| `runs/video-notifications-audit-b0c1085d6.md` | brief/report/audit/evidence завершённого прогона; датированная запись, не authority | authority map → active domain-plan; факт — runtime/тест |

| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md` | датированный provider-evidence завершённого gate; не standing rule | authority map + active privacy plan |
| `docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md` | датированный audit findings ledger; запись события, не authority | `AGENTS.md` §9–§12/§24 + active security plan |
| `docs/OWNER_TASKS_STATUS_2026-06-26.md` | датированный снимок статусов; текущая очередь только в taskdb | taskdb + `docs/CURRENT_AUTHORITY_MAP.md` |

### Полностью закрытые планы и чек-листы

| Файл | Почему мёртв/архивен | Что вместо него |
|---|---|---|
| `docs/_TODO/BCB2_OWNER_PUNCHLIST_2026-07-18.md` | план/чек-лист закрыт полностью: 61/61 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` | план/чек-лист закрыт полностью: 4/4 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/BOOKING_MULTISLOT_DESIGN.md` | план/чек-лист закрыт полностью: 12/12 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/BUGFIX_54_OAUTH_REMINDERS_TELEGRAM.md` | план/чек-лист закрыт полностью: 12/12 (100%) | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/_TODO/BUILT_BUT_INVISIBLE_2026-07-26.md` | план/чек-лист закрыт полностью: 4/4 (100%) | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/CUTOVER_PROTECTED_INPUTS_CANONICAL_HOME_2026-08-20.md` | план/чек-лист закрыт полностью: 7/7 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/DOCTOR_SCHEDULE_LIST_COLORS_PERIOD_2026-09-14.md` | план/чек-лист закрыт полностью: 12/12 (100%) | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` | план/чек-лист закрыт полностью: 7/7 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` | план/чек-лист закрыт полностью: 53/53 (100%) | `apps/mobile-shell/README.md` + taskdb |
| `docs/_TODO/NIGHT_PLAN_2026-07-26.md` | план/чек-лист закрыт полностью: 35/35 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/OWNER_QUESTIONS_2026-07-26.md` | план/чек-лист закрыт полностью: 1/1 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/PATIENT_INVITE_LINK_2026-09-10.md` | план/чек-лист закрыт полностью: 12/12 (100%) | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md` | план/чек-лист закрыт полностью: 6/6 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/RLS_CONTEXT_PER_ROW_2026-08-18.md` | план/чек-лист закрыт полностью: 7/7 (100%) | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/SAAS_FOUNDATION/ISOLATION_PROVISIONING_REMEDIATION_PLAN_2026-07-24.md` | план/чек-лист закрыт полностью: 1/1 (100%) | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` | план/чек-лист закрыт полностью: 22/22 (100%) | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SERVICE_IS_ENABLED_ONLY_WHEN_SOMEBODY_DOES_IT_2026-09-11.md` | план/чек-лист закрыт полностью: 6/6 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` | план/чек-лист закрыт полностью: 13/13 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/UNIVERSAL_OUTBOUND_2026-08-19.md` | план/чек-лист закрыт полностью: 13/13 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` | план/чек-лист закрыт полностью: 48/48 (100%) | authority map + taskdb + runtime |
| `docs/_TODO/WEB_PUSH_REMINDER_TICK_809.md` | план/чек-лист закрыт полностью: 5/5 (100%) | `OWNER_PRODUCT_RULES.md` + module/runtime docs |

### Superseded / retired / дубли / планы без живого статуса

| Файл | Почему мёртв/архивен | Что вместо него |
|---|---|---|
| `apps/webapp/MVP_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | authority map + taskdb + runtime |
| `apps/webapp/src/modules/help-content/CMS_EDITOR_CHECKLIST.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | authority map → текущая UI-спека/plan + runtime |
| `docs/_TODO/CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/S2_PLAN.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/DR-01_BACKUP_AND_RECOVERY.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` + server canon |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-02_HOST_AND_SECRETS.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/TOOLING_AND_HOST_PACKAGES.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/_TODO/SAAS_FOUNDATION/01_MASTER_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/DORMANT_DEPLOY_TEST_RUNBOOK.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/ROADMAP_TO_SAAS.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | current tariffs/store canon; закрытый billing — runtime |
| `docs/_TODO/SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/_TODO/SECURITY_CI_STACK_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | `AGENTS.md` §9–§12/§24 + CI config |
| `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | authority map → текущая UI-спека/plan + runtime |
| `docs/ACTIVE_WORKQUEUE.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | authority map + taskdb + runtime |
| `docs/AGENT_AUTORUN_SCHEME.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/CMS_RESTRUCTURE_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MENU_RESTRUCTURE_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_NAV_BADGES_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_TODAY_DASHBOARD_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_SETTINGS_CLEANUP_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/README.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/STAGE1_PLAN_CLOSEOUT.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `AUTH_AND_IDENTITY_CANON.md` + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE2.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE3.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE4.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE5.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/INVENTORY_AND_IA.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/README.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE2_DECOMPOSITION.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE3_DECOMPOSITION.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE4_DECOMPOSITION.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map + taskdb + runtime |
| `docs/DOCTOR_AI_PHI_PLAN.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | authority map → текущая UI-спека/plan + runtime |
| `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_POLISH_PLAN.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | authority map → текущая UI-спека/plan + runtime |
| `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_REWORK_PLAN.md` | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым | authority map → текущая UI-спека/plan + runtime |
| `docs/ORCHESTRATOR_CHECKLIST.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | authority map + taskdb + runtime |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/ROADMAP.md` | плановый документ без открытого checkbox и без подтверждённого active-статуса | `SAAS_ENFORCE_ROADMAP.md` + taskdb |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/STAGE_PLAN.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | `OWNER_PRODUCT_RULES.md` + module/runtime docs |
| `FIX PROBLEMS.md` | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 | authority map + taskdb + runtime |

## 5. Полная пофайловая опись

Причина — основание класса. У ПЛАНОВ closure ratio посчитан по checkbox; у остальных checkbox не превращает контракт/журнал в план автоматически.

<!-- INVENTORY_START -->
| Файл | Строк | Класс | Причина |
|---|---:|---|---|
| `.cursor/plans/archive/active_workqueue_plan_30236040.plan.md` | 217 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/admin_db_guard_monitoring.plan.md` | 171 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/admin_incident_alerts.plan.md` | 171 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/analytics_test_filter_cards_65eac7c8.plan.md` | 362 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md` | 90 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md` | 314 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md` | 338 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md` | 47 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md` | 338 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md` | 362 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/bot_fixes_staff_auth.plan.md` | 141 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/clinical_test_attempts_history.plan.md` | 138 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/cron_and_system_health.plan.md` | 194 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/daily_warmup_ux_48e8a684.plan.md` | 420 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/debug-flag-log-verbosity.plan.md` | 264 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_broadcast_delivery_336bbbc0.plan.md` | 107 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_catalog_regions_ux.plan.md` | 141 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_inbox_by_attempt.plan.md` | 111 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_material_statistics_d9985311.plan.md` | 170 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md` | 92 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_schedule_section.plan.md` | 452 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_schedule_v26_rebuild.plan.md` | 237 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor_ui_visual_style_pass.plan.md` | 253 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor-loading-performance_e024544d.plan.md` | 116 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor-only_stage_completion.plan.md` | 241 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/doctor-ui-unification-phases_1146e22e.plan.md` | 328 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/drizzle_final_closeout_6f3ea830.plan.md` | 217 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/drizzle_wave3_closeout_caf9d91d.plan.md` | 196 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/exercise_load_from_refs_bb4eba2e.plan.md` | 33 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/exercise_ui_+_references_03b21d8e.plan.md` | 47 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/health_ui_operator_actions_c49ffef4.plan.md` | 195 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/health_ui_operator_actions.plan.md` | 288 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/hls_private_bucket_proxy.plan.md` | 263 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/hls_quality_selector_ui_c281dac4.plan.md` | 82 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/instance-editor-batch-toolbar_3d597170.plan.md` | 151 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/integrator_drizzle_migration_master.plan.md` | 111 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/integrator_drizzle_phase_1_simple_repos.plan.md` | 92 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/integrator_drizzle_phase_2_outbox_job_queue.plan.md` | 92 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/integrator_drizzle_phase_3_domain_repos.plan.md` | 68 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/integrator_drizzle_phase_4_complex_sql.plan.md` | 60 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/lfk_expand_instance_cleanup.plan.md` | 174 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/material_ratings_stars.plan.md` | 35 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/max_tg_pre-prod_automation.plan.md` | 123 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/media_hardening_and_logging_1171a669.plan.md` | 56 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/media_preview_worker_split.plan.md` | 102 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/merge+contacts_wave1-4.plan.md` | 193 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/messenger_bot_block_handling.plan.md` | 310 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md` | 134 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/miniapp-audit-fixes_813ba600.plan.md` | 188 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/operator_health_alerting_wave2.plan.md` | 68 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage1_canonical_model.plan.md` | 132 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md` | 134 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage3_public_widget.plan.md` | 99 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage4_reschedule_cancel.plan.md` | 86 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md` | 94 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage6_memberships.plan.md` | 91 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage7_products_courses.plan.md` | 112 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage8_calendar.plan.md` | 70 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md` | 122 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/patient_doctor_ui_split_9a04ff8e.plan.md` | 242 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/patient_help_booking_surface_phase_f90d9842.plan.md` | 106 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/patient_shell_md_breakpoint.plan.md` | 113 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phase_3_patient_home_1b1dc5a6.plan.md` | 178 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phase_4.5_patient_home_a2e6bd38.plan.md` | 100 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phase1_support_model_7c745931.plan.md` | 116 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phone_bind_mismatch_ux.plan.md` | 115 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phone_messenger_bind_bot_ux.plan.md` | 212 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/phone_messenger_bind_pwa_autologin.plan.md` | 188 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/prod_reminder_scheduler_829b7cd4.plan.md` | 204 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/product_analytics.plan.md` | 440 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/product-platform-roadmap_e6f81831.plan.md` | 417 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/production_log_findings_2026-05-14.plan.md` | 83 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/program_item_discussion_070c3846.plan.md` | 401 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/program-stage-dnd-reorder_8fce4297.plan.md` | 50 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/promo_assignment_source.plan.md` | 12 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/public_landing_metadata_system_settings.plan.md` | 119 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/README.md` | 46 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/reliable_delivery_queue_audit_followup.plan.md` | 58 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/reminder_bot_buttons_ux_2dc55692.plan.md` | 46 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/reminder_defaults_and_home_goal.plan.md` | 135 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/reminder_ux_full.plan.md` | 239 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/rubitime_catalog_ux_fix.plan.md` | 145 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/rubitime_name_mismatch_ui.plan.md` | 160 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/rubitime_transition_stabilize.plan.md` | 411 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md` | 431 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/system_health_tab_b0e8ec64.plan.md` | 180 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/telegram_menu_reply_admin.plan.md` | 136 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/telegram_reminder_callback_fix_cf461c6a.plan.md` | 72 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/unify_doctor_patient_card_37615243.plan.md` | 151 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/warmup_feeling_ux_symptom.plan.md` | 158 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/warmup_scheduled_rotation_0ce52970.plan.md` | 269 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/archive/webapp_tests_optimization.plan.md` | 176 | МЁРТВОЕ | архивный Cursor-план/указатель вне единого `docs/archive/`; не authority |
| `.cursor/plans/doctor_communications_client_shell.plan.md` | 458 | ПЛАН (0/33, 0%) | открытый чек-лист: 0/33 закрыто (0%) |
| `.cursor/plans/doctor-loading-closure_9a07581d.plan.md` | 375 | ПЛАН (54/56, 96%) | открытый чек-лист: 54/56 закрыто (96%) |
| `.cursor/plans/fio_identity_cleanup.plan.md` | 621 | ПЛАН (11/13, 85%) | открытый чек-лист: 11/13 закрыто (85%) |
| `.cursor/rules/test-execution-policy.md` | 7 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `.lead/briefs/berson-test-custom-domain-proof-correction-20260909.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/berson-test-custom-domain-security-fixer-20260909.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/berson-test-custom-domain-security-reaudit-20260909.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/berson-test-custom-domain-worker-20260909.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/clinic-branded-bots-auditor-20260909.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/clinic-branded-bots-worker-20260909.md` | 86 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-active-call-combined-auditor-20260909.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-active-call-continuity-worker-20260909.md` | 35 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-active-call-nav-fix-auditor-live-20260909.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-active-call-navigation-fix-worker-20260909.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-active-call-preland-code-audit-20260909.md` | 23 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-android-capacitor-thread-crash-fix-worker-20260909.md` | 35 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-android-emulator-recovery-auditor-20260909.md` | 20 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-android-runtime-closure-auditor-20260909.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-android-stable-emulator-auditor-20260909.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-android-toolchain-ops-20260909.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-branded-pwa-closure-auditor-20260909.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-browser-jitsi-closure-auditor-20260909.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-browser-jitsi-explicit-end-correction-worker-20260910.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-browser-jitsi-explicit-end-live-recheck-20260910.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-device-media-ui-auditor-20260909.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-device-media-ui-correction-worker-20260909.md` | 87 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-device-media-ui-worker-20260909.md` | 79 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-emulator-api34-viewer-ops-20260910.md` | 28 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-emulator-browser-view-ops-20260910.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-final-integrated-browser-acceptance-auditor-20260909.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-m7-browser-final-auditor-live-20260909.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-m7-browser-production-auditor-20260909.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-media-multipart-backend-auditor-20260909.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-media-multipart-backend-confirmation-auditor-20260909.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-media-multipart-backend-fixer-20260909.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-media-multipart-backend-worker-20260909.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-capabilities-auditor-20260909.md` | 111 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-capabilities-confirmation-auditor-20260909.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-capabilities-correction-worker-20260909.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-capabilities-worker-20260909.md` | 129 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-jitsi-pip-explicit-end-worker-20260909.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-jitsi-pip-worker-20260909.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-push-tap-kind-confirmation-auditor-20260909.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-push-wire-confirmation-auditor-20260909.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-native-push-wire-correction-worker-20260909.md` | 86 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-plan-opus-review-20260909.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-push-backend-auditor-20260909.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-push-backend-final-auditor-20260909.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-push-backend-fixer-20260909.md` | 106 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-push-backend-worker-20260909.md` | 142 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-push-route-fix-confirmation-auditor-20260909.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-identities-auditor-20260909.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-identities-confirmation-auditor-20260909.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-identities-fixer-20260909.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-identities-worker-20260909.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-live-acceptance-auditor-20260909.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-live-acceptance-confirmation-auditor-20260909.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-pwa-live-bootstrap-recheck-auditor-20260909.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-rustore-provider-contract-auditor-20260909.md` | 63 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-shell-foundation-auditor-20260909.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-shell-foundation-worker-20260909.md` | 101 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-therapygo-name-correction-auditor-20260909.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-therapygo-name-correction-worker-20260909.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-native-jitsi-auditor-20260909.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-native-jitsi-correction-worker-20260909.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-native-jitsi-lifecycle-closing-worker-20260909.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-native-jitsi-lifecycle-continuation-auditor-20260909.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-native-jitsi-worker-20260909.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-runtime-jitsi-push-auditor-20260909.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-runtime-jitsi-push-worker-20260909.md` | 112 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-runtime-push-auditor-20260909.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/mobile-web-runtime-push-worker-20260909.md` | 93 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-delivery-audience-final-auditor-20260909.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-delivery-audience-fix-acceptance-20260909.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-delivery-audience-fix-worker-20260909.md` | 80 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-delivery-audience-split-auditor-20260909.md` | 76 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-delivery-audience-split-worker-20260909.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-smtp-roundtrip-auditor-20260909.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-smtp-roundtrip-correction-worker-20260909.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/platform-smtp-roundtrip-worker-20260909.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/briefs/reconcile-locks-auditor-20260914.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/307/work-report.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/bcb-feedback-2026-07-08/clients-and-chat.md` | 67 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/bcb-feedback-2026-07-08/patient-booking.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/bcb-feedback-2026-07-08/program-editor.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/bcb-feedback-2026-07-08/README.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/bcb-feedback-2026-07-08/schedule-and-today.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/clinical-anamnesis-audit-20260906/00-blind-killset.md` | 146 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/clinical-anamnesis-audit-20260906/01-audit-report.md` | 308 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/clinical-encounter-page-audit-20260906/90-final-audit-report.md` | 205 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/clinical-encounter-page-audit-20260906/blind-killset.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/doctor-catalog-flat-list-align-audit-20260911/90-final-audit-report.md` | 184 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/doctor-catalog-sort-control-audit-20260912/00-classification-and-killset.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/doctor-catalog-sort-control-audit-20260912/01-final-verdict.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/encounter-start-owner-audit-20260906/90-final-audit-report.md` | 166 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/encounter-start-owner-audit-20260906/blind-killset.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-active-call-combined-audit-20260909/90-final-audit-report.md` | 89 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-active-call-nav-fix-audit-20260909/90-final-audit-report.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-active-call-preland-code-audit-20260909/90-final-audit-report.md` | 47 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-android-emulator-recovery-20260909/90-emulator-recovery-report.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-android-runtime-closure-20260909/90-final-audit-report.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-android-stable-emulator-audit-20260909/90-m7-04-live-view-audit.md` | 103 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-browser-jitsi-explicit-end-live-recheck-20260910/90-final-audit-report.md` | 18 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-device-media-ui-audit-20260909/00-blind-killset.md` | 67 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-device-media-ui-audit-20260909/90-final-audit-report.md` | 205 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-emulator-api34-viewer-20260910/90-report.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-emulator-network-recovery-20260909/90-final-audit-report.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-final-browser-acceptance-20260909-r5/90-final-audit-report.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-m7-browser-final-20260909/90-final-audit-report.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-media-multipart-backend-audit-20260909/00-blind-killset.md` | 12 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-media-multipart-backend-audit-20260909/90-final-audit-report.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/00-blind-killset.md` | 16 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/90-final-audit-report.md` | 113 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-capabilities-audit-20260909/00-blind-killset.md` | 99 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-capabilities-audit-20260909/90-final-audit-report.md` | 267 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/00-blind-killset.md` | 109 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/90-final-audit-report.md` | 270 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-push-tap-kind-confirmation-audit-20260909/90-final-audit-report.md` | 126 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` | 63 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md` | 195 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-patient-passwordless-audit-20260909/90-final-audit-report.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-backend-audit-20260909/00-blind-killset.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-backend-audit-20260909/90-final-audit-report.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-backend-audit-20260909/92-lead-final-correction-evidence.md` | 67 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-backend-final-audit-20260909/00-targeted-killset.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-backend-final-audit-20260909/90-final-report.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-push-route-fix-confirmation-20260909/90-final-report.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-identities-audit-20260909/00-blind-killset.md` | 15 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-identities-audit-20260909/90-final-audit-report.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-identities-confirmation-audit-20260909/00-blind-killset.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-identities-confirmation-audit-20260909/90-final-audit-report.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-live-acceptance-20260909/90-final-audit-report.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-live-acceptance-confirmation-20260909/90-final-audit-report.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-pwa-live-bootstrap-recheck-20260909/90-final-audit-report.md` | 309 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-rustore-provider-contract-audit-20260909/00-blind-killset.md` | 14 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-rustore-provider-contract-audit-20260909/90-final-audit-report.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-shell-foundation-audit-20260909/00-blind-killset.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-shell-foundation-audit-20260909/90-final-audit-report.md` | 179 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-shell-foundation-audit-20260909/91-lead-fix-evidence.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-therapygo-name-correction-audit-20260909/00-blind-killset.md` | 12 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-therapygo-name-correction-audit-20260909/90-final-audit-report.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-native-jitsi-audit-20260909/00-blind-killset.md` | 14 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-native-jitsi-audit-20260909/90-final-audit-report.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-native-jitsi-lifecycle-continuation-audit-20260909/00-continuation-killset.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-native-jitsi-lifecycle-continuation-audit-20260909/90-final-audit-report.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-runtime-push-audit-20260909/00-blind-killset.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-runtime-push-audit-20260909/90-final-audit-report.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/mobile-web-runtime-push-audit-correction-20260909/90-final-audit-report.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/patient-typography-audit-20260908/AUDIT.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/patient-typography-final-20260908/AUDIT.md` | 153 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/platform-delivery-audience-final-audit-20260909/90-final-audit-report.md` | 40 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/platform-delivery-audience-split-audit-20260909/90-final-audit-report.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/test-auth-entry-c069/00-blind-killset.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/test-auth-entry-c069/90-final-audit-report.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/video-appointment-format-audit-20260908/blind-killset.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `.lead/runs/video-appointment-format-audit-20260908/privilege-analysis.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `AGENTS.md` | 2272 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `apps/integrator/e2e/README.md` | 53 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/app/app.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/config/config.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/content/content.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/content/max/max.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/content/telegram/admin/admin.md` | 27 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/content/telegram/telegram.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/content/telegram/user/user.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/adapters/adapters.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/db/db.md` | 12 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/db/schema.md` | 51 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/dispatcher/dispatcher.md` | 28 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/infra.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/observability/observability.md` | 21 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/queue/queue.md` | 43 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/runtime/runtime.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/runtime/scheduler/scheduler.md` | 11 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/infra/runtime/worker/worker.md` | 314 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/integrations/integrations.md` | 6 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/integrations/max/max.md` | 8 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/integrations/telegram/db/schema.md` | 16 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/integrations/telegram/telegram.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/contentRegistry/contentRegistry.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/contracts/contracts.md` | 3 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `apps/integrator/src/kernel/domain/domain.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/domain/executor/executor.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/eventGateway/eventGateway.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/kernel.md` | 4 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/orchestrator/orchestrator.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/integrator/src/kernel/orchestrator/orchestrstor.md` | 58 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/media-worker/README.md` | 42 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/mobile-shell/README.md` | 115 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/AGENTS.md` | 9 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `apps/webapp/ARCHITECTURE.md` | 263 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/CLAUDE.md` | 1 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/e2e/CI_BASELINE.md` | 37 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/e2e/README.md` | 32 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/INTEGRATOR_CONTRACT.md` | 553 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `apps/webapp/MVP_PLAN.md` | 57 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `apps/webapp/public/brand/README.md` | 20 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/public/icons/README.md` | 30 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/README.md` | 70 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/scripts/DEMO_CLIENT_WELLBEING_WARMUP_FILL.md` | 326 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/scripts/fio-backfill/README.md` | 221 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/scripts/integrator-schema-cleanup/README.md` | 33 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/scripts/PLATFORM_IDENTITY_OPS.md` | 86 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/scripts/README.md` | 49 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app-layer/app-layer.md` | 9 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app-layer/di/di.md` | 9 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app-layer/guards/guards.md` | 36 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app-layer/routes/routes.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/api/api.md` | 176 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app.md` | 9 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/account/account.md` | 28 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/app.md` | 10 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/doctor/communications/communications.md` | 288 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/doctor/communications/LOG.md` | 231 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `apps/webapp/src/app/app/doctor/content/library/media-library.md` | 28 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/doctor/doctor.md` | 43 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/doctor/schedule/schedule.md` | 214 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/doctor/treatment-program-shared/README.md` | 15 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/about/about.md` | 10 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/booking/booking.md` | 17 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/cabinet/cabinet.md` | 15 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/content/content.md` | 7 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/diary/diary.md` | 131 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/diary/lfk/lfk.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/diary/LOG.md` | 53 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `apps/webapp/src/app/app/patient/diary/symptoms/symptoms.md` | 7 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/emergency/emergency.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/help/help.md` | 46 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/lessons/lessons.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/notifications/notifications.md` | 8 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/patient.md` | 17 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/profile/profile.md` | 28 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/purchases/purchases.md` | 6 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/patient/treatment/program-detail/README.md` | 54 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/app/app/settings/settings.md` | 40 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/config/config.md` | 15 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/infra/db/db.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/infra/idempotency/idempotency.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/infra/infra.md` | 10 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/infra/repos/repos.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/infra/webhooks/webhooks.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/appointments/appointments.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/auth/auth.md` | 262 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/booking-calendar/booking-calendar.md` | 44 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/booking-form/booking-form.md` | 20 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/booking-scheduling/booking-scheduling.md` | 17 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/channel-preferences/channel-preferences.md` | 7 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/client-history/client-history.md` | 62 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/content-catalog/content-catalog.md` | 17 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/diaries/diaries.md` | 14 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/doctor-broadcasts/README.md` | 105 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/doctor-cabinet/doctor-cabinet.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/emergency/emergency.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/help-content/CMS_EDITOR_CHECKLIST.md` | 37 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `apps/webapp/src/modules/help-content/LOG.md` | 45 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `apps/webapp/src/modules/help-content/README.md` | 66 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/integrator/integrator.md` | 8 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/leads/leads.md` | 25 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/lessons/lessons.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/media/media.md` | 38 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/memberships/memberships.md` | 141 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/menu/menu.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/messaging/README.md` | 48 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/modules.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-booking/patient-booking.md` | 103 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-broadcasts/README.md` | 16 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-cabinet/patient-cabinet.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-home/patient-home.md` | 103 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-home/README.md` | 7 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-mood/patient-mood.md` | 23 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/patient-practice/patient-practice.md` | 32 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/payments/payments.md` | 81 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/platform-analytics/platform-analytics.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/purchases/purchases.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/reminders/reminders.md` | 41 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/roles/roles.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/treatment-program/treatment-program.md` | 15 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/users/users.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/modules/web-push/web-push.md` | 3 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/lib/platform.md` | 43 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/shared.md` | 9 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/types/types.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/ui/doctor/doctorCmsCatalogSearchNotes.md` | 26 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/ui/ui.md` | 35 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/src/shared/utils/utils.md` | 5 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `apps/webapp/TODO_REGISTER.md` | 66 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `ARCHITECTURE.md` | 257 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `BILLING_PAYMENT_DOOR_R3_AUDIT_REPORT.md` | 129 | ЖУРНАЛ | датированный отчёт/аудит/история прохода; не authority |
| `BILLING_PAYMENT_DOOR_R3_FIX_REPORT.md` | 22 | ЖУРНАЛ | датированный отчёт/аудит/история прохода; не authority |
| `CLAUDE.md` | 12 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `deploy/DATA_MIGRATION_CHECKLIST.md` | 87 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `deploy/env/README.md` | 292 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `deploy/HOST_DEPLOY_README.md` | 1124 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `deploy/jitsi/NETWORK_POLICY.md` | 270 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `deploy/jitsi/README.md` | 346 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `deploy/jitsi/RUNBOOK.md` | 106 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `deploy/jitsi/VERSIONS.md` | 63 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `deploy/LOG.md` | 38 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `deploy/postgres/privileges/README.md` | 179 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `deploy/postgres/README.md` | 105 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `deploy/systemd/hardening/README.md` | 42 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_INBOX/_TEMPLATE.md` | 22 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_INBOX/patient-files-library-isolation.md` | 42 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_INBOX/quick-wins-user.md` | 141 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_INBOX/README.md` | 7 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/ACCESS_SWEEP_2026-08-04.md` | 224 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/ACCESS_SWEEP_LIVE_2026-08-04.md` | 159 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/API_DOORS_BY_AREA_2026-09-16.md` | 176 | ПЛАН (0/7, 0%) | открытый чек-лист: 0/7 закрыто (0%) |
| `docs/_TODO/APPOINTMENT_PREPAYMENT_CORE_INDEPENDENT_AUDIT_2026-09-06.md` | 468 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` | 537 | ПЛАН (38/44, 86%) | открытый чек-лист: 38/44 закрыто (86%) |
| `docs/_TODO/AUDIT_ADMIN_DOORS_A1_2026-09-16.md` | 211 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_2026-09-16.md` | 65 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND2_2026-09-16.md` | 185 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND4_2026-09-16.md` | 174 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_C7_PHONE_SURFACE_ROUND5_2026-09-16.md` | 130 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D2_DEAD_MESSENGER_2026-09-16.md` | 152 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D3_PASSWORD_ENUM_2026-09-16.md` | 104 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D4_DOOR_DUPES_2026-09-16.md` | 140 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D5_OAUTH_SURFACE_2026-09-16.md` | 166 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D5_OAUTH_SURFACE_ROUND2_2026-09-16.md` | 92 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D6_PATIENT_PASSWORD_2026-09-16.md` | 135 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_D7_REGISTER_DUPE_2026-09-16.md` | 248 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_DOCTOR_DOORS_A2_2026-09-16.md` | 275 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_2026-09-14.md` | 180 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND2_2026-09-15.md` | 306 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND3_2026-09-15.md` | 319 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND4_ADVERSARIAL_2026-09-15.md` | 428 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND5_2026-09-15.md` | 182 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4a_POST_E1_MERGE_2026-09-15.md` | 238 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4B_MERGE_CONFLICT_SCREENS_ROUND2_2026-09-15.md` | 132 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4B_MOBILE_ACTIONS_2026-09-15.md` | 242 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_DOCTOR_DECISION_2026-09-15.md` | 328 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_MOBILE_DOT_2026-09-15.md` | 162 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_PROOF_SET_2026-09-15.md` | 178 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_ROUND2_2026-09-15.md` | 161 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_ROUND3_2026-09-15.md` | 202 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_ROUND5_2026-09-15.md` | 172 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md` | 257 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E4C_ROUND8_2026-09-15.md` | 198 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_2026-09-16.md` | 51 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_GATE_FALSE_POSITIVES_2026-09-16.md` | 158 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND10_2026-09-16.md` | 135 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND11_2026-09-16.md` | 148 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND7_2026-09-16.md` | 205 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_GATE_ROUND8_2026-09-16.md` | 136 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_ROUND2_2026-09-16.md` | 80 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_ROUND3_2026-09-16.md` | 118 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_ROUND4_2026-09-16.md` | 202 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_ROUND5_2026-09-16.md` | 221 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_E5A_RUNTIME_DOOR_2026-09-16.md` | 190 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L3_PUBLIC_INTAKE_ROUND3_2026-09-15.md` | 110 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_2026-09-15.md` | 196 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` | 262 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_ROUND3_2026-09-15.md` | 197 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_DEV_MAIL_TRAP_2026-09-15.md` | 437 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_ROUND2_2026-09-15.md` | 267 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_ROUND3_2026-09-15.md` | 195 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_ROUND4_2026-09-15.md` | 238 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_ROUND6_2026-09-15.md` | 222 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L5_ROUND7_2026-09-15.md` | 146 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L6_CANON_2026-09-15.md` | 245 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L6_CANON_ROUND2_2026-09-15.md` | 155 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L6_CANON_ROUND3_2026-09-15.md` | 182 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L6_CANON_ROUND4_2026-09-15.md` | 186 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_L6_CANON_ROUND5_2026-09-15.md` | 185 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_2026-09-15.md` | 257 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_ROUND2_2026-09-15.md` | 333 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_LEADS_PUBLIC_GATE_ORDER_ROUND3_2026-09-15.md` | 390 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_MERGE_FIO_ON_CANON_2026-09-15.md` | 183 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_MERGE_FIO_ON_CANON_CORRECTION_2026-09-15.md` | 140 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_MERGE_FIO_ORIENTATION_FIX_2026-09-15.md` | 139 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_PATIENT_SUPPORT_DOOR_2026-09-16.md` | 173 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_2026-09-16.md` | 209 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_ROUND2_2026-09-16.md` | 229 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_ROUND3_2026-09-16.md` | 178 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_STAFF_DOORS_2026-09-16.md` | 128 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND2_2026-09-16.md` | 143 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND3_2026-09-16.md` | 90 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND4_2026-09-16.md` | 114 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUDIT_SUPPORT_TEXT_RULE_ROUND5_2026-09-16.md` | 136 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/audit/AUDIT_2D_926_BLIND_KILLSET.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/audits/CUTOVER_COMPLETENESS_AUDIT_2026-08-15.md` | 285 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUTH_DOORS_AUDIT_2026-09-15.md` | 284 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md` | 173 | ПЛАН (5/9, 56%) | открытый чек-лист: 5/9 закрыто (56%) |
| `docs/_TODO/B1_B2_IDENTITY_SPLIT_RUNBOOK.md` | 416 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` | 556 | ПЛАН (1/2, 50%) | открытый чек-лист: 1/2 закрыто (50%) |
| `docs/_TODO/BACKLOG_HYGIENE_HANDOVER_2026-07-27.md` | 131 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/BACKUP_NOTIFICATION_CHANNEL_2026-09-14.md` | 187 | ПЛАН (0/10, 0%) | открытый чек-лист: 0/10 закрыто (0%) |
| `docs/_TODO/BACKUPS_2026-09-14.md` | 250 | ПЛАН (4/6, 67%) | открытый чек-лист: 4/6 закрыто (67%) |
| `docs/_TODO/BCB2_OWNER_PUNCHLIST_2026-07-18.md` | 476 | МЁРТВОЕ | план/чек-лист закрыт полностью: 61/61 (100%) |
| `docs/_TODO/BCB2_PUNCHLIST_TRIAGE_2026-07-18.md` | 62 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/BLOCK_SPLIT_INVENTORY_2026-09-14.md` | 91 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` | 12 | МЁРТВОЕ | план/чек-лист закрыт полностью: 4/4 (100%) |
| `docs/_TODO/BOOKING_MULTISLOT_DESIGN.md` | 389 | МЁРТВОЕ | план/чек-лист закрыт полностью: 12/12 (100%) |
| `docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md` | 540 | ПЛАН (22/23, 96%) | открытый чек-лист: 22/23 закрыто (96%) |
| `docs/_TODO/BUGFIX_54_OAUTH_REMINDERS_TELEGRAM.md` | 94 | МЁРТВОЕ | план/чек-лист закрыт полностью: 12/12 (100%) |
| `docs/_TODO/BUILT_BUT_INVISIBLE_2026-07-26.md` | 119 | МЁРТВОЕ | план/чек-лист закрыт полностью: 4/4 (100%) |
| `docs/_TODO/C4_ADMIN_ALLOWLISTS_2026-07-26.md` | 102 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/CABINET_UI_AUDIT_2026-08-19.md` | 290 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/CLINIC_APP_ICON_AND_FAVICON_2026-09-10.md` | 263 | ПЛАН (10/12, 83%) | открытый чек-лист: 10/12 закрыто (83%) |
| `docs/_TODO/CLINIC_CUSTOM_DOMAIN_PROPOSAL_2026-08-19.md` | 589 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` | 506 | ПЛАН (45/49, 92%) | открытый чек-лист: 45/49 закрыто (92%) |
| `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` | 1404 | ПЛАН (28/29, 97%) | открытый чек-лист: 28/29 закрыто (97%) |
| `docs/_TODO/CLINIC_PUBLIC_PAGE_AUDIT_2026-08-19.md` | 398 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` | 265 | ПЛАН (39/41, 95%) | открытый чек-лист: 39/41 закрыто (95%) |
| `docs/_TODO/CLINIC_SHOWCASE_WORLD_PRACTICE_2026-08-19.md` | 480 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/CRYPTO_INFRA_SEC_WORK_SPLIT_2026-07-27.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/CURRENT_GOAL.md` | 154 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/CUSTOM_DOMAIN_TLS_EDGE_RUNBOOK_2026-09-07.md` | 113 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` | 388 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/CUTOVER_PROTECTED_INPUTS_CANONICAL_HOME_2026-08-20.md` | 45 | МЁРТВОЕ | план/чек-лист закрыт полностью: 7/7 (100%) |
| `docs/_TODO/D2_MESSENGER_PAIR_CUT_REPORT_2026-09-16.md` | 167 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/D3_PASSWORD_DOOR_UNIFORM_REPORT_2026-09-16.md` | 161 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/D6_PATIENT_PASSWORD_DEAD_END_2026-09-16.md` | 190 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/db-access-map.md` | 188 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/FUNNEL_COVERAGE_REPORT.md` | 117 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/log.md` | 83 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/RAW_SQL_RULING.md` | 58 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/REQUIREMENTS.md` | 54 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/S2_PLAN.md` | 46 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md` | 737 | ПЛАН (90/95, 95%) | открытый чек-лист: 90/95 закрыто (95%) |
| `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/README.md` | 14 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md` | 263 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/DECIDED_NOT_DONE.md` | 48 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/DEEP_CODE_AUDIT_PLAN.md` | 184 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/DEFERRED_INFRA_TRIGGERS.md` | 181 | ПЛАН (0/6, 0%) | открытый чек-лист: 0/6 закрыто (0%) |
| `docs/_TODO/DEPENDENCY_MODERNIZATION_2026-09.md` | 611 | ПЛАН (26/30, 87%) | открытый чек-лист: 26/30 закрыто (87%) |
| `docs/_TODO/DOCS_PLAN_HYGIENE_2026-07-29.md` | 896 | ПЛАН (59/61, 97%) | открытый чек-лист: 59/61 закрыто (97%) |
| `docs/_TODO/DOCTOR_ANALYTICS_FIRST_STAGE_INDEPENDENT_AUDIT_2026-09-06.md` | 201 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md` | 77 | ПЛАН (0/32, 0%) | открытый чек-лист: 0/32 закрыто (0%) |
| `docs/_TODO/DOCTOR_FULLSCREEN_TEXT_EDITOR_INDEPENDENT_AUDIT_2026-09-06.md` | 156 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/DOCTOR_KPI_FILTERS_2026-09-14.md` | 286 | ПЛАН (42/43, 98%) | открытый чек-лист: 42/43 закрыто (98%) |
| `docs/_TODO/DOCTOR_LOADING_BASELINE.md` | 292 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/DOCTOR_LOADING_FETCH_INVENTORY.md` | 51 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` | 1018 | ПЛАН (220/445, 49%) | открытый чек-лист: 220/445 закрыто (49%) |
| `docs/_TODO/DOCTOR_SCHEDULE_LIST_COLORS_PERIOD_2026-09-14.md` | 98 | МЁРТВОЕ | план/чек-лист закрыт полностью: 12/12 (100%) |
| `docs/_TODO/DOCTOR_TODAY_CONFIGURABLE_WIDGETS_2026-08-23/PLAN.md` | 142 | ПЛАН (0/27, 0%) | открытый чек-лист: 0/27 закрыто (0%) |
| `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/PLAN.md` | 997 | ПЛАН (98/114, 86%) | открытый чек-лист: 98/114 закрыто (86%) |
| `docs/_TODO/DOCTOR_UI_REWORK_2026-07-20/UI5B_PATIENT_CARD_COMPOSITION_INDEPENDENT_AUDIT_2026-08-20.md` | 125 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/E4B_MOBILE_ACTIONS_2026-09-15/REPORT.md` | 70 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/E4C_DEV_APPLY_2026-09-15.md` | 477 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/E4C_PROOF_SET_CORRECTION_2026-09-15.md` | 144 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/E4C_ROUND7_FIX_2026-09-15.md` | 119 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/E5_EMAIL_AT_LOGIN_GROUND_2026-09-15.md` | 263 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/EDITOR_TIPTAP_MIGRATION_PLAN.md` | 42 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/EXTERNAL_VIDEO_LINK_2026-08-19.md` | 121 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/EXTERNAL_VIDEO_PLAYER_APIS_2026-09-07.md` | 480 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/FAULTS_E4a_MERGE_CONFLICT_DOCTOR_ROUND5_2026-09-15.md` | 222 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/FIX_E4a_DOOR_AFTER_E1_MERGE_2026-09-15.md` | 235 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/FIX_E4a_MERGE_CONFLICT_DOCTOR_ROUND4_2026-09-15.md` | 193 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/FIX_E4b_DETAIL_DOOR_500_2026-09-15.md` | 180 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/FIX_MERGE_FIO_ON_CANON_2026-09-15.md` | 216 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/_TODO/FORM_FIELD_ERRORS_2026-09-15.md` | 69 | ПЛАН (5/8, 63%) | открытый чек-лист: 5/8 закрыто (63%) |
| `docs/_TODO/GET_IMAGE_ACCESSOR_2026-08-19.md` | 115 | ПЛАН (3/4, 75%) | открытый чек-лист: 3/4 закрыто (75%) |
| `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md` | 490 | ПЛАН (19/44, 43%) | открытый чек-лист: 19/44 закрыто (43%) |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/LOG.md` | 86 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/OWNER_DECISIONS.md` | 37 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/README.md` | 45 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/ROADMAP.md` | 12 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/GLOBAL_ADMIN_UI_INITIATIVE/STAGE_01_ANALYTICS.md` | 282 | ПЛАН (15/16, 94%) | открытый чек-лист: 15/16 закрыто (94%) |
| `docs/_TODO/HANDOFF_2026-07-26.md` | 187 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/HANDOFF_2026-07-27.md` | 84 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/HANDOFF_ORCHESTRATION_2026-08-20.md` | 169 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md` | 390 | ПЛАН (8/82, 10%) | открытый чек-лист: 8/82 закрыто (10%) |
| `docs/_TODO/INVENTED_SCOPE_FOR_OWNER_REVIEW_2026-07-26.md` | 286 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/L5_DEV_MAIL_TRAP_2026-09-15/REPORT.md` | 251 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` | 841 | МЁРТВОЕ | план/чек-лист закрыт полностью: 7/7 (100%) |
| `docs/_TODO/LEADS_CABINET_L2_POST_LANDING_AUDIT_2026-09-15.md` | 109 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LEADS_L4_CLINIC_NOTIFICATION_REPORT_2026-09-15.md` | 78 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LEADS_NOTIFICATION_TOPIC_AUDIT_2026-09-15.md` | 120 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LEADS_NOTIFICATION_TOPIC_WORKER_REPORT_2026-09-15.md` | 42 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LEADS_PUBLIC_GATE_ORDER_FIX_2026-09-15.md` | 93 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_2026-09-15/REPORT.md` | 114 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_AFTER_2026-09-15/REPORT.md` | 108 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_E4B_MODAL_2026-09-15/REPORT.md` | 68 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15/REPORT.md` | 214 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_E4C_2026-09-15/ROUND2.md` | 178 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_2026-09-15/REPORT.md` | 280 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/REPORT.md` | 166 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/ROUND2.md` | 264 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/LIVE_ACCEPTANCE_L4_TEST_2026-09-15/ROUND3.md` | 275 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/LIVE_ACCEPTANCE_LEADS_KPI_2026-09-15/REPORT.md` | 47 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/LOGIN_HISTORY_2026-09-13.md` | 658 | ПЛАН (11/13, 85%) | открытый чек-лист: 11/13 закрыто (85%) |
| `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_INVENTORY_2026-09-02.md` | 845 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/MEDICAL_WELLNESS_TERMINOLOGY_MODE_2026-09-02.md` | 372 | ПЛАН (4/7, 57%) | открытый чек-лист: 4/7 закрыто (57%) |
| `docs/_TODO/MERGE_AUDIT_LEDGER_2026-08-19.md` | 872 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/MERGE_FIO_ON_CANON_REPORT_2026-09-15.md` | 247 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md` | 224 | ПЛАН (4/8, 50%) | открытый чек-лист: 4/8 закрыто (50%) |
| `docs/_TODO/MIGRATION_TRUTH_AND_DEAD_ALERTING_2026-09-15.md` | 189 | ПЛАН (8/15, 53%) | открытый чек-лист: 8/15 закрыто (53%) |
| `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` | 646 | МЁРТВОЕ | план/чек-лист закрыт полностью: 53/53 (100%) |
| `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/README.md` | 9 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/NEW_PROD_DEPLOY_2026-09-15.md` | 551 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/NEW_PROD_DEPLOY_BB91018EC_2026-09-15.md` | 345 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/NIGHT_PLAN_2026-07-26.md` | 968 | МЁРТВОЕ | план/чек-лист закрыт полностью: 35/35 (100%) |
| `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` | 3284 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/NOTIFICATION_ALERTING_DESIGN_2026-07-26.md` | 221 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/NOTIFICATION_DELIVERY_TARGET_SHAPE_2026-07-27.md` | 187 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/_TODO/NOTIFICATION_TEXT_CONSOLIDATION_2026-09-13.md` | 797 | ПЛАН (77/78, 99%) | открытый чек-лист: 77/78 закрыто (99%) |
| `docs/_TODO/NOTIFY_MAP_AND_SIMPLICITY_2026-09-16.md` | 182 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/OUTBOUND_DELIVERY_ALERTING_PLAN.md` | 384 | ПЛАН (4/6, 67%) | открытый чек-лист: 4/6 закрыто (67%) |
| `docs/_TODO/OWN_PATIENT_INVENTORY_VERIFICATION_2026-08-04.md` | 141 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/OWNER_LIVE_PASS_2026-08-18_TRIAGE.md` | 186 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/OWNER_LIVE_PASS_2026-08-18.md` | 376 | ПЛАН (9/11, 82%) | открытый чек-лист: 9/11 закрыто (82%) |
| `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` | 927 | ПЛАН (49/50, 98%) | открытый чек-лист: 49/50 закрыто (98%) |
| `docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` | 1238 | ПЛАН (60/82, 73%) | открытый чек-лист: 60/82 закрыто (73%) |
| `docs/_TODO/OWNER_QUESTIONS_2026-07-26.md` | 275 | МЁРТВОЕ | план/чек-лист закрыт полностью: 1/1 (100%) |
| `docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_global-admin.md` | 252 | ПЛАН (33/42, 79%) | открытый чек-лист: 33/42 закрыто (79%) |
| `docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_ОТВЕТЫ.md` | 246 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md` | 536 | ПЛАН (109/135, 81%) | открытый чек-лист: 109/135 закрыто (81%) |
| `docs/_TODO/OWNER_WALKTHROUGHS/README.md` | 32 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/PATIENT_BOOKING_CARD_AND_PAY_2026-09-12.md` | 216 | ПЛАН (11/15, 73%) | открытый чек-лист: 11/15 закрыто (73%) |
| `docs/_TODO/PATIENT_CABINET_OWNER_FIXES_2026-09-10.md` | 105 | ПЛАН (5/7, 71%) | открытый чек-лист: 5/7 закрыто (71%) |
| `docs/_TODO/PATIENT_INVITE_LINK_2026-09-10.md` | 227 | МЁРТВОЕ | план/чек-лист закрыт полностью: 12/12 (100%) |
| `docs/_TODO/PLAN_HYGIENE_REGISTRY_2026-07-29.md` | 686 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/PLAN_HYGIENE_RESULT_2026-07-29.md` | 168 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/POST_PRODUCTION_FILE_DELETION_AND_PURGE.md` | 57 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/POST_PRODUCTION_IDENTITY_AND_CONTACT_MODEL.md` | 296 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/POST_PRODUCTION_PRIVILEGE_GATES.md` | 43 | ПЛАН (1/4, 25%) | открытый чек-лист: 1/4 закрыто (25%) |
| `docs/_TODO/PRE_PRODUCTION_TODO.md` | 248 | ПЛАН (0/7, 0%) | открытый чек-лист: 0/7 закрыто (0%) |
| `docs/_TODO/PROD_JOURNAL_TRUTH_PIPELINE_2026-09-15.md` | 147 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/PROD_MIGRATION_JOURNAL_TRUTH_MEASUREMENT_2026-09-15.md` | 328 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/PROD_VS_TEST_DIVERGENCE_2026-07-26.md` | 428 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/PROGRAM_LIFECYCLE_AND_MEDIA_RETENTION_2026-09-11.md` | 40 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/PUBLIC_BOOKING_TENANT_SERVICE_SEAM_2026-08-19.md` | 206 | ПЛАН (4/8, 50%) | открытый чек-лист: 4/8 закрыто (50%) |
| `docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md` | 129 | ПЛАН (4/6, 67%) | открытый чек-лист: 4/6 закрыто (67%) |
| `docs/_TODO/PUBLIC_SHOWCASE_SEAM_CENSUS_2026-08-19.md` | 318 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/README.md` | 37 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/REFERENCE_CATALOG_OWNERSHIP_2026-09-16.md` | 195 | ПЛАН (1/6, 17%) | открытый чек-лист: 1/6 закрыто (17%) |
| `docs/_TODO/REPORT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` | 145 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/REPORT_L4_CLINIC_NOTIFICATION_CORRECTION_ROUND2_2026-09-15.md` | 255 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/REPORT_MERGE_FIO_ORIENTATION_FIX_2026-09-15.md` | 82 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/RESERVED_CLINIC_SLUGS_2026-09-13.md` | 44 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/RETENTION_SWEEPS_NEVER_RAN_2026-08-18.md` | 84 | МЁРТВОЕ | план/чек-лист закрыт полностью: 6/6 (100%) |
| `docs/_TODO/RLS_CONTEXT_PER_ROW_2026-08-18.md` | 129 | МЁРТВОЕ | план/чек-лист закрыт полностью: 7/7 (100%) |
| `docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md` | 88 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/_TODO/ROLE_LOGIN_CONSOLIDATION_AUDIT_2026-08-02.md` | 158 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/CURRENT_PROD_BASELINE_2026-07-19.md` | 53 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/ENCRYPTED_HOST_BUILD_2026-08-17.md` | 73 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/NEW_HOST_BASELINE_2026-08-17.md` | 56 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/README.md` | 25 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE/SELECTEL_PROVIDER_ANSWER_2026-08-17.md` | 161 | ЖУРНАЛ | датированный provider-evidence завершённого gate; не standing rule |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/FINAL_ACCEPTANCE.md` | 117 | ПЛАН (0/35, 0%) | открытый чек-лист: 0/35 закрыто (0%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/LOG.md` | 643 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` | 260 | ПЛАН (0/12, 0%) | открытый чек-лист: 0/12 закрыто (0%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_ACTIONS.md` | 233 | ПЛАН (1/25, 4%) | открытый чек-лист: 1/25 закрыто (4%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/OWNER_AND_LEGAL_GATES.md` | 95 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/PII_MEDICAL_STORE_SEPARATION_RECON_2026-07-24.md` | 74 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/README.md` | 76 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/REQUIREMENTS.md` | 117 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/DR-01_BACKUP_AND_RECOVERY.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md` | 208 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md` | 726 | ПЛАН (19/53, 36%) | открытый чек-лист: 19/53 закрыто (36%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-00_SCOPE_LOCK.md` | 191 | ПЛАН (1/7, 14%) | открытый чек-лист: 1/7 закрыто (14%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-01_PROCESSING_REGISTER.md` | 136 | ПЛАН (4/10, 40%) | открытый чек-лист: 4/10 закрыто (40%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-02_HEALTH_CONSENT.md` | 39 | ПЛАН (0/8, 0%) | открытый чек-лист: 0/8 закрыто (0%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-03_DATA_RIGHTS_AND_RETENTION.md` | 138 | ПЛАН (6/27, 22%) | открытый чек-лист: 6/27 закрыто (22%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/PR-04_ISPDN_RELEASE_GATE.md` | 51 | ПЛАН (0/7, 0%) | открытый чек-лист: 0/7 закрыто (0%) |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/README.md` | 17 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-02_HOST_AND_SECRETS.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-03_CLINICAL_ACCESS_AUDIT.md` | 67 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/SEC-04_GOVERNANCE_AND_INCIDENTS.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/TOOLING_AND_HOST_PACKAGES.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/RUBITIME_REMNANTS_2026-08-19.md` | 75 | ПЛАН (0/5, 0%) | открытый чек-лист: 0/5 закрыто (0%) |
| `docs/_TODO/runs/access-reconcile-locks-audit-20260914.md` | 404 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md` | 185 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/acquiring-webhook-settlement-audit-20260905.md` | 140 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/appointment-detail-hydration-audit-20260905.md` | 181 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/appointment-detail-hydration-killset-20260905.md` | 22 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/appointment-prepayment-core-gatefix-20260906.md` | 22 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/appointment-prepayment-core-reaudit-20260906.md` | 21 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/AUDIT_INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` | 159 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/APPLY_DEPLOY_AND_CLOSE_PAYMENT_BRIEF_2026-08-03.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/AUTH_ERROR_MESSAGES_BRIEF_2026-08-03.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/AUTH_ERROR_MESSAGES_REPORT_2026-08-03.md` | 142 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_INDEPENDENT_AUDIT_2026-08-02.md` | 86 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_REPAIR_2026-08-02.md` | 10 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/B1.2_PAYER_IDENTITY_INDEPENDENT_AUDIT_2026-08-02.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_APPLY_AND_DEPLOY_BRIEF_2026-08-03.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_AUTOPAY_COMPLETION_INDEPENDENT_AUDIT_2026-08-02.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_CANCELED_ORDER_IDEMPOTENCY_BRIEF_2026-08-03.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_CAPTURE_RLS_CONTEXT_BRIEF_2026-08-04.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_FINISH_PAYMENT_BRIEF_2026-08-03.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_FISCALIZATION_INDEPENDENT_AUDIT_2026-08-02.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_IDEMPOTENCE_KEY_DRAFT_RETRY_BRIEF_2026-08-03.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_IMMEDIATE_UPGRADE_PRORATION_AUDIT_REPORT.md` | 136 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_LIVE_CHECKOUT_RETRY_BRIEF_2026-08-03.md` | 47 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_LIVE_VAT_CHECKOUT_BRIEF_2026-08-03.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_PAYMENT_STATE_AND_CLOSE_BRIEF_2026-08-03.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_SMALL_INTEGRATION_CI_2026-08-02.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_TARIFF_APPLY_ROLE_BRIEF_2026-08-03.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_WARNING_VARIABLES_INDEPENDENT_AUDIT_2026-08-02.md` | 47 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_CAPTURE_GRANT_BRIEF_2026-08-03.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_CHAIN_BRIEF_2026-08-03.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/BILLING_WEBHOOK_GRANT_FIX_BRIEF_2026-08-03.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/DB_TX_PRINCIPAL_LOSS_BRIEF_2026-08-04.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/DEP_AUDIT_TRIAGE_BRIEF_2026-08-04.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/MIGRATION_HASH_RECONCILIATION_AUDIT_REPORT.md` | 360 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/SAAS_SEAT_BILLING_0308_INDEPENDENT_AUDIT_2026-08-02.md` | 173 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/SAAS_WEBHOOK_GUARDS_INDEPENDENT_AUDIT_2026-08-02.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_500_PAGES_BRIEF_2026-08-03.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_DEPLOY_NIGHT_BATCH_BRIEF_2026-08-04.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_GATE_AND_PAYMENT_CLOSE_BRIEF_2026-08-03.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md` | 201 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_BRIEF_2026-08-03.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_FIX_BRIEF_2026-08-03.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_PASSWORD_INCIDENT_2026-08-03.md` | 118 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_PASSWORD_RESTORE_BRIEF_2026-08-03.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/TEST_YOOKASSA_WEBHOOK_INGRESS_INDEPENDENT_AUDIT_2026-08-02.md` | 95 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/billing/YOOKASSA_IDEMPOTENCE_KEY_LIMIT_INDEPENDENT_AUDIT_2026-08-02.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/CALENDAR_TIMEZONE_SINGLE_DOOR_AUDIT_2026-09-02.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/cash-payment-principal-audit-20260905.md` | 173 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/clinical-appointment-overlap-20260906/AUDIT.md` | 234 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/clinical-appointment-overlap-20260906/KILLSET.blind.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/DB_RUNTIME_CONTRACTS_W1_W3_W4_INDEPENDENT_AUDIT_2026-09-02.md` | 158 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/DEEP_CODE_HUMAN_GAPS_AUDIT_2026-09-02.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/DEEP_CODE_HUMAN_GAPS_CORRECTION_2026-09-02.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/DEEP_CODE_SHARED_CONTRACTS_AUDIT_2026-09-02.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/DOCS_CONSOLIDATION_STEP1_BRIEF.md` | 87 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/DOCS_SYNC_PASS2_2026-08-23.md` | 20 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_AUDIT_BRIEF.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_AUDIT.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_FIX_BRIEF.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_FIX_REPORT.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_TRACK_D_BRIEF.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/docs-consolidation/PLANS_TIDY_TRACK_D_REPORT.md` | 95 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/doctor-appointment-payments-audit-20260820.md` | 127 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/doctor-appointment-payments-local-qr-audit-20260820.md` | 168 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/exercise-store-s0b-assignment-path-audit-brief.md` | 90 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/exercise-store-s0b-confirmation-audit-brief.md` | 104 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/exercise-store-s0b-live-acceptance-audit-brief.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/EXHAUSTIVE_LIFECYCLE_SEMANTICS_FIX_2026-08-28.md` | 318 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md` | 269 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_HOSTED_VIDEO_PREVIEW_AUDIT_2026-08-28.md` | 317 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md` | 340 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_SYSTEMIC_COMPLETION_AUDIT_2026-08-28.md` | 238 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md` | 301 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_TRACK_D_IDENTITY_RETENTION_AUDIT_2026-08-28.md` | 400 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/FINAL_TRACK_D_LIFECYCLE_PACKAGE_AUDIT_2026-08-28.md` | 156 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/INTEGRATION_SECRET_ENCRYPTION_DECISION_PACKET_2026-09-02.md` | 596 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` | 720 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-cleanup/LOGIN_SCREENS_INVENTORY_2026-08-04.md` | 346 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-cleanup/SYSTEMIC_LIFECYCLE_C1_E1_D1_2026-08-27.md` | 175 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-cleanup/VK_ID_LOGIN_BRIEF_2026-08-03.md` | 102 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-diary-removal/REPORT.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-identity/RESEARCH_BRIEF.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_OPUS_RESULT.md` | 109 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_R2_RESULT.md` | 120 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/AUDIT_TRACKD_SOL_RESULT.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/PLAN_AUDIT_BRIEF.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/RESEARCH_BRIEF.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_OPUS.md` | 71 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_SOL.md` | 167 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/RESEARCH_INTEGRATOR_TERRA.md` | 117 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/integrator-role/SYNTHESIS.md` | 63 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/KOSTYAKOV_MERGE_PROBE_2026-09-13.md` | 597 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/kpi-filters-audit-20260914.md` | 169 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/kpi-filters-audit2-20260914.md` | 155 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/kpi-filters-audit3-20260914.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/material-ratings-platform-label-audit-brief.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDIA_FILES_INSERT_GRANT_AUDIT_2026-08-28.md` | 35 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/media-hls-cleanup/AUDIT.md` | 219 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/media-hls-cleanup/KILLSET.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_AUDIT_2026-09-02.md` | 177 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_MWT01_04_INDEPENDENT_REAUDIT_2026-09-02.md` | 200 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_A_INDEPENDENT_AUDIT_2026-09-12.md` | 136 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_B_INDEPENDENT_AUDIT_2026-09-12.md` | 198 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_D_INDEPENDENT_AUDIT_2026-09-12.md` | 369 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/MEDICAL_WELLNESS_TERMINOLOGY_T_F_INDEPENDENT_AUDIT_2026-09-12.md` | 278 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-booking-card-audit-2-brief.md` | 131 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-booking-card-audit-brief.md` | 87 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-booking-card-audit-result.md` | 84 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-booking-card-brief.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-chat-fix-20260908/AUDIT.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-media-storage-20260906/AUDIT_PATIENT_MEDIA_STORAGE.md` | 226 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-media-storage-20260906/AUDIT_STORAGE_FIX_CORRECTION.md` | 270 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-media-storage-20260906/LEAD_DISPOSITION.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-media-storage-20260906/STORAGE_SETUP.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_SYMPTOM_BRIDGE_ACCEPTANCE_20260908.md` | 308 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_ACCEPTANCE_20260908.md` | 143 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md` | 732 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/AUDIT_BOOKING_AVAILABILITY_HORIZON.md` | 199 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/AUDIT_HORIZON_SECOND_INDEPENDENT.md` | 233 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/BLIND_KILL_SET.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_MODALS_AUDIT.md` | 169 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_SYMPTOMS_AUDIT.md` | 338 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/patient-work3-20260906/PATIENT_WORK3_CI_CORRECTION_AUDIT.md` | 207 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/platform-read-complex-templates-audit-brief.md` | 89 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/PRE_SESSION_GATE_CONFLICT_2026-08-23.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s3-audit-brief.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s3-audit-result.md` | 253 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s3-check-screen-brief.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s4-audit-brief.md` | 76 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s4-audit-result.md` | 237 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s4-patient-brief.md` | 71 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s5-audit-brief.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s5-notify-brief.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s7-audit-brief.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s7-audit-result.md` | 255 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s7-patient-cancel-brief.md` | 84 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s8-audit-brief.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s8-one-message-brief.md` | 76 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s9-audit-brief.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-s9-patient-payment-door-brief.md` | 75 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-settings-fix-20260905/audit-live-report.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/prepayment-settings-fix-20260905/kill-set-blind.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/PUBLIC_IDENTITY_NO_RESIDUE_AUDIT_2026-08-28.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/PUBLIC_IDENTITY_NO_RESIDUE_FIX_2026-08-28.md` | 84 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/RUNTIME_OVERLAY_CURRENT_STATE_AUDIT_2026-09-02.md` | 288 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_CORRECTION_2026-09-02.md` | 22 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_REAUDIT_2026-09-02.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/saas-period-grid-20260905/AUDIT-2.md` | 419 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/saas-period-grid-20260905/AUDIT.md` | 384 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/saas-period-grid-20260905/KILLSET-ADDENDUM.md` | 106 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/saas-period-grid-20260905/KILLSET.md` | 115 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/saas-period-grid-20260905/TEST-POLICY-AUDIT.md` | 422 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/schedule-list-colors-audit-20260914.md` | 157 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/schedule-list-colors-audit-brief-20260914.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/CH1B_STORAGE_LIFECYCLE_INDEPENDENT_AUDIT.md` | 80 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/CH1B_STORAGE_LIFECYCLE_WORKER_REPORT.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/CH3_QUEUE_PORT_GATE_INDEPENDENT_AUDIT_2026-08-02.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/CH4B_TRANSACTION_QUOTA_PORT_INDEPENDENT_AUDIT_2026-08-02.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_BROADCAST_INDEPENDENT_AUDIT.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_REPORT.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/RAW_SQL_EMAIL_OTP_INDEPENDENT_AUDIT_2026-08-02.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/RAW_SQL_PASSWORD_LOGIN_INDEPENDENT_AUDIT_2026-08-02.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/single-entry/ROOT_TYPECHECK_PREREQUISITES_INDEPENDENT_AUDIT_2026-08-02.md` | 89 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/SYSTEM_SETTINGS_AUDIT_REDACTION_INDEPENDENT_AUDIT_2026-09-02.md` | 87 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/systemic-access/BLIND_KILL_SET_2026-08-27.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/systemic-access/SYSTEMIC_ACCESS_INDEPENDENT_AUDIT_2026-08-27.md` | 259 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/systemic-hosted-preview/SYSTEMIC_HOSTED_PREVIEW_AUDIT_2026-08-27.md` | 107 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/systemic-media-reconcile/SYSTEMIC_MEDIA_RECONCILE_AUDIT_2026-08-27.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/systemic-scheduler/SYSTEMIC_SCHEDULER_INDEPENDENT_AUDIT_2026-08-27.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_PLAN2_OPUS_RESULT.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_PLAN2_SOL_RESULT.md` | 118 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_SEAM_OPUS_RESULT.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_SEAM_SOL_RESULT.md` | 82 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_OPUS_RESULT.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/AUDIT_STAGE2_SOL_RESULT.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_AUDIT_BRIEF.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_AUDIT_RESULT.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_BRIEF.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_REPORT.md` | 28 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_2_BRIEF.md` | 75 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_BRIEF.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/PLAN_AUDIT_RESULT.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/S4_ADJUDICATE_BRIEF.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/S4_ADJUDICATE_RESULT.md` | 9 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/S4_RECONCILE_BRIEF.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/S4_RECONCILE_REPORT.md` | 191 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/S4_TRIAGE_BRIEF.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/SEAM_AUDIT_BRIEF.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FINAL_AUDIT_BRIEF.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FINAL_AUDIT_RESULT.md` | 109 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FIX_BRIEF.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/SEAM_FIX_REPORT.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_BRIEF.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R3_BRIEF.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R3_RESULT.md` | 87 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_BRIEF.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R4_RESULT.md` | 101 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R5_BRIEF.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_R5_RESULT.md` | 19 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_AUDIT_RESULT.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_BRIEF.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_CORRECTION_REPORT.md` | 18 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX2_BRIEF.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX2_REPORT.md` | 17 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX3_BRIEF.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX3_REPORT.md` | 8 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX4_BRIEF.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_FIX4_REPORT.md` | 16 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_BRIEF.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_REAUDIT_RESULT.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_BRIEF.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE12_WORKER_REPORT.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_AUDIT_BRIEF.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FINAL_AUDIT_RESULT.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX_BRIEF.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX_REPORT.md` | 80 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX2_BRIEF.md` | 75 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_FIX2_REPORT.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_MECHANISM_BRIEF.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_REAUDIT_BRIEF.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE2_REPORT.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE3_INTEGRATOR_SEAM_BRIEF.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE3_SEAM_REPORT.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_AUDIT_BRIEF.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_AUDIT_RESULT.md` | 18 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_WORKER_BRIEF.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE40_WORKER_REPORT.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_BRIEF.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_R3_BRIEF.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_R3_RESULT.md` | 88 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_AUDIT_RESULT.md` | 117 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_BRIEF.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_CORRECTION_RESULT.md` | 117 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FINISH_BRIEF.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FINISH_REPORT.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX_BRIEF.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX_REPORT.md` | 0 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX2_BRIEF.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_FIX2_REPORT.md` | 0 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REAUDIT_BRIEF.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REAUDIT_RESULT.md` | 88 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REPORT.md` | 10 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_BRIEF.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_IMPLEMENTATION_REPORT.md` | 27 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_B_REPORT.md` | 0 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_C_BRIEF.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_OPUS_RESULT.md` | 145 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff-mechanics/TRIAGE_S4_SOL_RESULT.md` | 129 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/CRITICAL_MECHANICS_BRIEF.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/FILES_DELETION_RESEARCH_BRIEF.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/GRACE_NOTIFY_OFFSET_BRIEF_2026-08-04.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/MECHANICS_CENSUS_BRIEF.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/MECHANICS_TABLE_V2_BRIEF.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/MERGE_BREAKAGE_FIX_BRIEF_2026-08-04.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/PATIENT_FILE_DELETE_INDEPENDENT_AUDIT_2026-08-02.md` | 82 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/PLATFORM_QUOTA_USAGE_PATIENT_FILES_INDEPENDENT_AUDIT_2026-08-02.md` | 75 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_INDEPENDENT_AUDIT_2026-08-02.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_WORKER_2026-08-02.md` | 40 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_1_CONTINUE_BRIEF.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_1_LADDER_SUBJECTS_BRIEF.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_6_CONSTANTS_BRIEF.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_6_GATE_HOLE_BRIEF.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_6_MERGE_AND_GATE_BRIEF.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S2_LADDER_ENGINE_BRIEF.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S31_READONLY_WRITE_BRIEF.md` | 31 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S31A_COVERAGE_BRIEF.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S31A_READ_LADDER_BRIEF.md` | 35 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S31B_VISIBILITY_BRIEF.md` | 40 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S47_TOGGLES_BRIEF.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S4A3_CMS_BOUNDARY_BRIEF.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S4A4_CALENDAR_DIARIES_BRIEF.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S4A5_FALSE_SURFACES_BRIEF.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S4B_AUDIT_BRIEF.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S4B_KNOBS_BRIEF.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S5_NUMBERS_BRIEF.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S5_STORAGE_BRIEF.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S5_STORAGE_REGRESSION_BRIEF.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S6_VISIBILITY_BRIEF.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S7_0_LADDER_TO_PAYMENT_BRIEF.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S7_3_LIVE_RUN_BRIEF.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md` | 219 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/T1_SYSTEM_ACCESS_GOVERNS_MECHANICS_BRIEF_2026-08-04.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/T3_MAILINGS_TAB_BRIEF_2026-08-04.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TARIFF_2_13_MIGRATION_0305_INDEPENDENT_AUDIT.md` | 23 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TARIFF_CHANGE_PAID_PERIOD_INDEPENDENT_AUDIT_2026-08-02.md` | 143 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TARIFF_CHANGE_PAID_PERIOD_WORKER_2026-08-02.md` | 16 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TARIFF_DOWNGRADE_CONSOLIDATION_INDEPENDENT_AUDIT_2026-08-02.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TARIFF_NOTIFY_TRIGGERS_BRIEF_2026-08-04.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/tariff/TRIAL_GRACE_MODEL_BRIEF_2026-08-03.md` | 71 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-appointment-word-T-A-brief.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-appointment-word-T-B-brief.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-appointment-word-T-D-brief.md` | 75 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-appointment-word-T-F-brief.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-T-A-audit-brief.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-T-B-audit-brief.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-T-D-audit-brief.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/terminology-T-F-audit-brief.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/TEST_TO_DEV_REFRESH_INDEPENDENT_AUDIT_2026-09-02.md` | 197 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/TEST_TO_DEV_REFRESH_REAUDIT_2026-09-02.md` | 172 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testcut-how/BRIEF.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testcut-how/CALIB_BRIEF.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testcut-how/PROVENANCE.md` | 11 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testcut-how/sol-report.md` | 544 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-foundation/G0_AUDIT_BRIEF.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-foundation/G0_DEV_PREFLIGHT_WORKER_BRIEF.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-foundation/STACK_AUDIT_BRIEF.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-foundation/STACK_WORKER_BRIEF.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_BRIEF.md` | 55 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B_BLIND_AUDIT_REPORT.md` | 465 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B_DISPOSABLE_PG_BRIEF.md` | 77 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B_FIX_ROUND2_BRIEF.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_CORRECTION_2026-08-17.md` | 81 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_INDEPENDENT_AUDIT_2026-08-17.md` | 191 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_MATRIX_2026-08-17.md` | 149 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B0_NAMED_DEV_DB_BEHAVIOR_REAUDIT_2026-08-17.md` | 166 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B0_NO_DISPOSABLE_DB_INDEPENDENT_AUDIT_2026-08-17.md` | 179 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_BRIEF.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2_BASELINE_REFRESH_REPORT.md` | 94 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2_CHECKLIST_CLOSURE_AUDIT_BRIEF.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_ASSUMPTION_BRIEF.md` | 61 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2A_REFRESH_ROLE_REPORT.md` | 134 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_BRIEF.md` | 71 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B2B_ETALON_GENERATOR_REPORT.md` | 180 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/B3_DEVDB_ORPHAN_TRIAGE_2026-08-03.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1_BLIND_AUDIT_BRIEF.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_ACCEPTANCE_REPORT.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_BLIND_AUDIT_REPORT.md` | 185 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_FIX_REPORT.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1_UPLOAD_VALIDATION_BRIEF.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH1B_STORAGE_LIFECYCLE_BLIND_AUDIT_REPORT.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_BLIND_AUDIT_REPORT.md` | 261 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH2_MEDIA_DELIVERY_CHOKEPOINT_REPORT.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH5_DI_REPORT.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_BLIND_AUDIT_REPORT.md` | 274 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CH7_SETTINGS_VALUES_DB_REPORT.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CHOKEPOINT_SWEEP_BRIEF.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/CHOKEPOINT_SWEEP_REPORT.md` | 292 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/DECISION_TRAIL_2026-08-01.md` | 81 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_PRODUCT_PILOT_INDEPENDENT_AUDIT.md` | 115 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_AUDIT_REPORT.md` | 148 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/DROP_2FA_ENFORCEMENT_TRANSPLANT_REPORT.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/ETALON_BLIND_AUDIT_BRIEF.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/ETALON_BLIND_AUDIT_REPORT.md` | 339 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/FIXTURES_SPLIT_BRIEF.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/FIXTURES_SPLIT_REPORT.md` | 167 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/LAYER_ALLOWLIST_REPORT.md` | 72 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_BLIND_AUDIT_BRIEF.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_BLIND_AUDIT_REPORT.md` | 268 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_FIX_ROUND2_BRIEF.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_FIX_ROUND2_REPORT.md` | 306 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_MECHANICS_BRIEF.md` | 94 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/M_MECHANICS_REPORT.md` | 349 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` | 194 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_FIX_REPORT.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/PLAN_CANON_RESEARCH_REPORT.md` | 1559 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_INDEPENDENT_AUDIT.md` | 95 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md` | 489 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_DOCTOR_NOTES_SLICE_AUDIT_REPORT.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_DOCTOR_NOTES_SLICE_REPORT.md` | 23 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_FIX_REPORT.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_PLAYBACK_FIRST_SLICE_AUDIT_REPORT.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_REAUDIT_REPORT.md` | 498 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` | 272 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/REFS_REPOINT_BRIEF.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/REFS_REPOINT_REPORT.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9_BLIND_AUDIT_BRIEF.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9_ROLE_GUARDS_BRIEF.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9A_BLIND_AUDIT_BRIEF.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9A_ROUTE_WIRING_BRIEF.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_AUDIT_REPORT.md` | 268 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_FIX_REPORT.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md` | 96 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` | 356 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_S01_RETIRE_LEGACY_BOOKING_PROJECTIONS_AUDIT_REPORT.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_S02_CAPABILITY_EXPAND_INDEPENDENT_AUDIT.md` | 159 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_S02_CAPABILITY_SEAMS_REPORT.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_S03_DEV_BOOKING_OWNERSHIP_CENSUS_AUDIT.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_S03_INDEPENDENT_AUDIT_2026-08-02.md` | 520 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RECOMMENDATION.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RESEARCH_opus.md` | 191 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/testsuite-v2/V9B_WALL_RESEARCH_sol.md` | 490 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/toast-notifications-20260905/AUDIT.md` | 114 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/TYPED_SQL_W5_INDEPENDENT_AUDIT_2026-09-02.md` | 263 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/unified-loader-20260904/AUDIT_BRIEF.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/unified-loader-20260904/FIX_ACCEPTANCE.md` | 22 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/unified-loader-20260904/INDEPENDENT_AUDIT.md` | 193 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/unified-loader-20260904/WORKER_BRIEF.md` | 21 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/VERDICTS_PENDING_2026-09-15.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/W11_W16_CRITICAL_ACCEPTANCE_2026-09-02.md` | 114 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/W17_BRANDED_BOT_ROUTING_ACCEPTANCE_2026-09-02.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/runs/W17_REMINDER_PRIVACY_ACCEPTANCE_2026-09-02.md` | 124 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/S1_FIRST_INDEPENDENT_AUDIT_2026-09-03.md` | 148 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/S1_SECOND_INDEPENDENT_AUDIT_2026-09-04.md` | 245 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/S4_ACTION_CORRELATION_REAUDIT_2026-09-04.md` | 383 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/S4_ERROR_BOUNDARY_IMPLEMENTATION_2026-09-04.md` | 486 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/S4_ERROR_BOUNDARY_INDEPENDENT_AUDIT_2026-09-04.md` | 340 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_BILLING_RECONCILE_2026-08-18.md` | 130 | ПЛАН (6/19, 32%) | открытый чек-лист: 6/19 закрыто (32%) |
| `docs/_TODO/SAAS_FOUNDATION_PLAN_MAP_2026-08-01.md` | 271 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md` | 65 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/01_MASTER_PLAN.md` | 122 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md` | 577 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_BOOKING_PREPAYMENT_ENTITLEMENT_2026-08-02.md` | 72 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_CMS_ENTITLEMENT_VISIBILITY_2026-08-02.md` | 56 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_DOCTOR_STATISTICS_ENTITLEMENT_2026-08-02.md` | 47 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_EXERCISE_PLATFORM_LIBRARY_2026-08-02.md` | 120 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_MAILINGS_ENTITLEMENT_2026-08-02.md` | 94 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_PAYMENTS_ENTITLEMENT_CONSOLIDATION_2026-08-02.md` | 38 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_SUBSCRIPTIONS_ENTITLEMENT_VISIBILITY_2026-08-02.md` | 61 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUDIT_TARIFF_DOWNGRADE_CAPABILITY_2026-09-02.md` | 210 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md` | 275 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md` | 170 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/BILLING_CATALOG_REMOVAL_AUDIT_REPORT.md` | 212 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/BILLING_PREPAYMENT_PROVIDER_GATE_AUDIT_REPORT.md` | 71 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/C1_WALLS_TEST_CHECKLIST.md` | 139 | ПЛАН (13/14, 93%) | открытый чек-лист: 13/14 закрыто (93%) |
| `docs/_TODO/SAAS_FOUNDATION/CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md` | 117 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md` | 179 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_EXECUTABLE_GATE_REAUDIT_2026-08-15.md` | 107 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_2026-08-15.md` | 194 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_INDEPENDENT_AUDIT_2026-08-15.md` | 816 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_REAUDIT_2026-08-15.md` | 474 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md` | 282 | ПЛАН (10/12, 83%) | открытый чек-лист: 10/12 закрыто (83%) |
| `docs/_TODO/SAAS_FOUNDATION/DORMANT_DEPLOY_TEST_RUNBOOK.md` | 60 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_OWNER_GATES.md` | 86 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` | 794 | ПЛАН (7/47, 15%) | открытый чек-лист: 7/47 закрыто (15%) |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0A_AUDIT.md` | 525 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_ASSIGNMENT_AUDIT.md` | 337 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_AUDIT.md` | 150 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_CONFIRMATION_AUDIT.md` | 312 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_LIVE_ACCEPTANCE_AUDIT.md` | 363 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/FOUNDATION_PLAN.md` | 518 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_FOUNDATION/GATES_WHAT_THEY_GUARD.md` | 71 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/HANDOFF_2026-07-12.md` | 65 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/HANDOFF_TARIFFS_PAYMENTS_2026-08-01.md` | 96 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` | 746 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/ISOLATION_PROVISIONING_REMEDIATION_PLAN_2026-07-24.md` | 141 | МЁРТВОЕ | план/чек-лист закрыт полностью: 1/1 (100%) |
| `docs/_TODO/SAAS_FOUNDATION/LANDING_AND_ENTRIES_DESIGN.md` | 473 | ПЛАН (0/7, 0%) | открытый чек-лист: 0/7 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/LOG.md` | 155 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/MATERIAL_RATINGS_PLATFORM_LABEL_AUDIT.md` | 241 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/MECHANICS_TABLE_FOR_OWNER.md` | 117 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/ORCHESTRATOR_BRIEF.md` | 268 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/ORCHESTRATOR_CHECKLIST.md` | 70 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_DECISIONS_FOR_REVIEW.md` | 155 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-01.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-02.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-03.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/acceptance-ST-04.md` | 40 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/owner-intent-reconciliation.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/process-audit-status.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-01-final-PASS.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-02-final-PASS.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-curated-system-health-closure.md` | 31 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-03-final-PASS.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/audit/ST-04-integration-PASS.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/log.md` | 508 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/ROADMAP.md` | 93 | ПЛАН (20/38, 53%) | открытый чек-лист: 20/38 закрыто (53%) |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/TEST_VISUAL_GLOBAL_ADMIN_SESSION.md` | 95 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` | 214 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` | 43 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_FOUNDATION/P0_4_BATCHES.md` | 58 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md` | 108 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/P0_5B_GRANTS.md` | 429 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS_CHECKLIST.md` | 148 | ПЛАН (20/28, 71%) | открытый чек-лист: 20/28 закрыто (71%) |
| `docs/_TODO/SAAS_FOUNDATION/P0_7_WRITER_CENSUS.md` | 139 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/P0_8_3_PREFLIGHT.md` | 258 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/SAAS_FOUNDATION/P0_8_CODE_FACTS.md` | 383 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/P0_UNPRINCIPLED_READ_INVENTORY.md` | 157 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` | 719 | ПЛАН (0/18, 0%) | открытый чек-лист: 0/18 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` | 197 | ПЛАН (17/25, 68%) | открытый чек-лист: 17/25 закрыто (68%) |
| `docs/_TODO/SAAS_FOUNDATION/PHASE0_MULTITENANT_DESIGN_LOCK.md` | 362 | ПЛАН (14/15, 93%) | открытый чек-лист: 14/15 закрыто (93%) |
| `docs/_TODO/SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md` | 64 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md` | 487 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/PHASE3_ORCHESTRATION.md` | 69 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/PHASE4_ROLLOUT_RUNBOOK.md` | 210 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/PLATFORM_READ_COMPLEX_TEMPLATES_AUDIT.md` | 246 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/PROMO_ENTITLEMENT_VISIBILITY_AUDIT_2026-08-02.md` | 64 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` | 643 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md` | 795 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/R1_TABLE_TAXONOMY.md` | 67 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md` | 117 | ПЛАН (3/11, 27%) | открытый чек-лист: 3/11 закрыто (27%) |
| `docs/_TODO/SAAS_FOUNDATION/R2_MVP_MASTER_CHECKLIST.md` | 260 | ПЛАН (12/25, 48%) | открытый чек-лист: 12/25 закрыто (48%) |
| `docs/_TODO/SAAS_FOUNDATION/RAW_SQL_AUDIT.md` | 472 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/README.md` | 32 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/_TODO/SAAS_FOUNDATION/REMOVE_ONLINE_INTAKE_BLIND_AUDIT_2026-08-02.md` | 81 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/REVIEW_2026-06-17_FRESH.md` | 59 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/RLS_UNPRINCIPLED_READ_FIX_PLAN.md` | 357 | ПЛАН (0/6, 0%) | открытый чек-лист: 0/6 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/ROADMAP_TO_SAAS.md` | 248 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/S4_0_S4_1_CONTRACT_INVENTORY.md` | 85 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` | 1247 | МЁРТВОЕ | план/чек-лист закрыт полностью: 22/22 (100%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` | 172 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C0_LOCKED_TOPOLOGY_ADR.md` | 80 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C1_WEBAPP_DUAL_POOL_FANOUT.md` | 34 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md` | 93 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md` | 79 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_C4_SCHEDULER_MEDIA_CRON_FANOUT.md` | 202 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_D1_664_WITH_CHECK_REVERIFY.md` | 92 | ПЛАН (7/8, 88%) | открытый чек-лист: 7/8 закрыто (88%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_D2_FB1_BOOTSTRAP_PHONE_WRITE.md` | 108 | ПЛАН (7/8, 88%) | открытый чек-лист: 7/8 закрыто (88%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md` | 116 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_E1_REMINDER_M2M_ORG_CONTEXT.md` | 32 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` | 916 | ПЛАН (29/56, 52%) | открытый чек-лист: 29/56 закрыто (52%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` | 521 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md` | 204 | ПЛАН (4/9, 44%) | открытый чек-лист: 4/9 закрыто (44%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` | 150 | ПЛАН (2/6, 33%) | открытый чек-лист: 2/6 закрыто (33%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_R3_CUT_INVENTED_SCOPE.md` | 314 | ПЛАН (82/96, 85%) | открытый чек-лист: 82/96 закрыто (85%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md` | 251 | ПЛАН (0/31, 0%) | открытый чек-лист: 0/31 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md` | 314 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md` | 668 | ПЛАН (21/53, 40%) | открытый чек-лист: 21/53 закрыто (40%) |
| `docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` | 643 | ПЛАН (0/36, 0%) | открытый чек-лист: 0/36 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/method-code.md` | 637 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/method-fk.md` | 330 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/scope-derivation/VERIFIED_SCOPE.md` | 70 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2_2026-08-19.md` | 259 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_R15_BLIND_AUDIT_2026-08-19.md` | 167 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_INVOICE_WORLD_PRACTICE_2026-08-19.md` | 337 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/SEAT_UNPAID_PRACTICE_2026-08-19.md` | 520 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md` | 170 | ПЛАН (0/17, 0%) | открытый чек-лист: 0/17 закрыто (0%) |
| `docs/_TODO/SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md` | 127 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md` | 80 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/_TODO/SAAS_FOUNDATION/T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md` | 212 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md` | 38 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_INTEGRATOR_SCHEMA_CLEANUP_PLAN.md` | 111 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md` | 103 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` | 185 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_FOUNDATION/T0_5_T0_8_READINESS_REVIEW.md` | 32 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md` | 267 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` | 1896 | ПЛАН (106/110, 96%) | открытый чек-лист: 106/110 закрыто (96%) |
| `docs/_TODO/SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md` | 315 | ПЛАН (18/25, 72%) | открытый чек-лист: 18/25 закрыто (72%) |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md` | 34 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_ARCHITECTURE.md` | 98 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_ISOLATION_MATRIX_2026-08-04.md` | 313 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` | 133 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_FOUNDATION/UPSTREAM_SYNC_POLICY.md` | 104 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_FOUNDATION/UPSTREAM_SYNC_REGRESSION_CHECKLIST.md` | 47 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_CAPABILITY_MATRIX.md` | 225 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md` | 702 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/CURRENT_STATE_BASELINE.md` | 78 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md` | 653 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` | 1831 | ПЛАН (12/27, 44%) | открытый чек-лист: 12/27 закрыто (44%) |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/LOG.md` | 5240 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OPERATING_MODEL.md` | 433 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_DECISION_PACKET.md` | 537 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` | 1032 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md` | 133 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/README.md` | 125 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/REQUIREMENTS.md` | 171 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` | 242 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md` | 156 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_COMPOSITION.md` | 186 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_PATIENT_PUBLIC.md` | 225 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/SCREEN_INVENTORY_SPECIALIST.md` | 162 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md` | 383 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_ACCEPTANCE.md` | 104 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_EVIDENCE_MANIFEST.md` | 85 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_FRESH_AUDIT_2026-07-15.md` | 36 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_INDEPENDENT_AUDIT.md` | 86 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` | 45 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_RECONCILIATION_REVIEW.md` | 202 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX01_VISUAL_ATTEMPT_LEDGER.md` | 59 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_PRODUCT_PATTERNS.md` | 576 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_RESEARCH_AUDIT.md` | 21 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX02_TECHNICAL_PATTERNS.md` | 370 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_CAPABILITY_ARCH_REVIEW.md` | 385 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX03_OPERATING_MODEL_DRAFT.md` | 486 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/UX04_SCREEN_STATE_LIST.md` | 103 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/SEAM_OWNERS_CENSUS_2026-08-19.md` | 1169 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS_AND_OPTIONS.md` | 817 | ПЛАН (2/22, 9%) | открытый чек-лист: 2/22 закрыто (9%) |
| `docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md` | 422 | ЖУРНАЛ | датированный audit findings ledger; запись события, не authority |
| `docs/_TODO/SECURITY_CI_STACK_PLAN.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/_TODO/SERVICE_IS_ENABLED_ONLY_WHEN_SOMEBODY_DOES_IT_2026-09-11.md` | 252 | МЁРТВОЕ | план/чек-лист закрыт полностью: 6/6 (100%) |
| `docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md` | 151 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SETTINGS_TABS_RESTRUCTURE_2026-09-15.md` | 169 | ПЛАН (14/19, 74%) | открытый чек-лист: 14/19 закрыто (74%) |
| `docs/_TODO/SILENT_CODE_CENSUS_2026-08-19.md` | 144 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` | 208 | МЁРТВОЕ | план/чек-лист закрыт полностью: 13/13 (100%) |
| `docs/_TODO/SMTP_ROUND_TRIP_P5_AUDIT_2026-09-09.md` | 107 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/SOURCE_MEDIA_RETENTION_CANON_2026-09-13.md` | 219 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/_TODO/STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` | 812 | ПЛАН (45/75, 60%) | открытый чек-лист: 45/75 закрыто (60%) |
| `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md` | 96 | ПЛАН (4/10, 40%) | открытый чек-лист: 4/10 закрыто (40%) |
| `docs/_TODO/STATE_2026-07-28_EVENING.md` | 56 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md` | 580 | ПЛАН (34/40, 85%) | открытый чек-лист: 34/40 закрыто (85%) |
| `docs/_TODO/SUPPORT_HELPDESK_COMPARISON_2026-09-13.md` | 89 | ПЛАН (0/5, 0%) | открытый чек-лист: 0/5 закрыто (0%) |
| `docs/_TODO/SUPPORT_TICKETS_1070.md` | 43 | ПЛАН (0/4, 0%) | открытый чек-лист: 0/4 закрыто (0%) |
| `docs/_TODO/SUPPORT_WITHOUT_TICKETS_2026-09-13.md` | 69 | ПЛАН (0/4, 0%) | открытый чек-лист: 0/4 закрыто (0%) |
| `docs/_TODO/SWALLOWED_ERRORS_CENSUS_2026-08-19.md` | 253 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` | 1623 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/TELEGRAM_MAX_MINIAPP_AND_MENU_2026-08-19.md` | 52 | ПЛАН (4/5, 80%) | открытый чек-лист: 4/5 закрыто (80%) |
| `docs/_TODO/TELEGRAM_PLATFORM_CREDENTIALS_ADMIN_2026-08-20.md` | 47 | ПЛАН (0/4, 0%) | открытый чек-лист: 0/4 закрыто (0%) |
| `docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md` | 242 | ПЛАН (4/6, 67%) | открытый чек-лист: 4/6 закрыто (67%) |
| `docs/_TODO/TENANT_WALL_DEBT_2026-09-12.md` | 383 | ПЛАН (5/7, 71%) | открытый чек-лист: 5/7 закрыто (71%) |
| `docs/_TODO/TEST_DEPLOY_2026-09-15.md` | 327 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/TEST_DEPLOY_EVIDENCE_2026-09-15.md` | 479 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/TEST_LIVE_FINDINGS_2026-08-04.md` | 117 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` | 1669 | ЖУРНАЛ | датированный отчёт/аудит/история прохода; не authority |
| `docs/_TODO/TEXT_SQL_TO_BUILDER_PLAN_2026-08-19.md` | 423 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/_TODO/THERAPYSTO_JOURNAL_GATE_SUDOERS_2026-09-15.md` | 123 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_787_CLINIC_BRANDED_BOTS_2026-09-09.md` | 159 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_APP_TEST_EDGE_REAUDIT_2026-09-10.md` | 73 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_2026-09-09.md` | 65 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_BERSON_TEST_CUSTOM_DOMAIN_SECURITY_REAUDIT_2026-09-09.md` | 68 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_DNS_ALTERNATIVES_2026-09-10.md` | 65 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_READINESS_2026-09-07.md` | 127 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_TLS_EDGE_2026-09-07.md` | 53 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_CUSTOM_DOMAIN_UI_2026-09-07.md` | 90 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_FINAL_INTEGRATED_PATIENT_ORIGIN_HOST_DB_2026-09-07.md` | 36 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_HOST_TENANT_DOMAIN_CORE_2026-09-07.md` | 220 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_LOGIN_SURFACE_SPLIT_2026-09-07.md` | 203 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_NEW_PROD_SPLIT_SURFACE_CONFIGURATION_2026-09-07.md` | 66 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PATIENT_ABSOLUTE_LINKS_2026-09-07.md` | 89 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_PLATFORM_CLINIC_BRAND_DOMAIN_STATUS_2026-09-10.md` | 144 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_SAME_ORG_CUSTOM_DOMAIN_RECLAIM_2026-09-10.md` | 90 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_TRUSTED_REMINDER_ORIGIN_RUBITIME_RETIREMENT_2026-09-07.md` | 74 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/EXTERNAL_PRODUCT_RESEARCH.md` | 129 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` | 1213 | ПЛАН (41/65, 63%) | открытый чек-лист: 41/65 закрыто (63%) |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/LEGAL_PAGE_BRANDING_WORLD_PRACTICE.md` | 288 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/MULTI_BRAND_DOMAIN_WORLD_PRACTICE.md` | 1360 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/OTP_SENDER_BRANDING_WORLD_PRACTICE.md` | 96 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/PASSKEY_ACROSS_DOMAINS_RESEARCH.md` | 358 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/PHONE_AUTH_CHANNELS_RESEARCH.md` | 229 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md` | 255 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md` | 174 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/NIGHT_2026-07-23_AUTONOMOUS_WORK_REPORT.md` | 86 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/ORCHESTRATOR_PROMPT.md` | 155 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PROCESS_AUDIT_LOG.md` | 102 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` | 139 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SECURITY_REVIEW_2026-07-23.md` | 117 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_AND_TEST_DEPLOY_KICKOFF.md` | 17 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/SERVER_FINISH_EXECUTION_LEDGER_2026-07-24.md` | 73 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` | 17 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md` | 180 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_DNA_LIVE_EVIDENCE.md` | 54 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_EVIDENCE_MATRIX.md` | 356 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_ROADMAP_DAG_REALITY_AUDIT.md` | 134 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_TODAY_CLIENTS_MESSAGES_REAUDIT.md` | 248 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI0_REALITY_AUDIT.md` | 59 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI1_REALITY_AUDIT.md` | 128 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI2_REALITY_AUDIT.md` | 122 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI3_REALITY_AUDIT.md` | 131 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_LIVE_EVIDENCE.md` | 96 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI4_REALITY_AUDIT.md` | 67 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI5A_REALITY_AUDIT.md` | 67 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI6_REALITY_AUDIT.md` | 160 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UI8_UI9_CLIENT_REALITY_AUDIT.md` | 96 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_A_UIP_REALITY_AUDIT.md` | 129 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TRACK_B_B4_OWNER_HANDOFF.md` | 112 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/U6A_PUBLIC_ENTRY_RECONCILIATION_2026-07-23.md` | 49 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` | 1675 | ПЛАН (64/67, 96%) | открытый чек-лист: 64/67 закрыто (96%) |
| `docs/_TODO/UI_LAYOUT_SYSTEMIC_2026-08-08.md` | 435 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/UI_WALKTHROUGH_2026-07-25.md` | 74 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/UNIVERSAL_OUTBOUND_2026-08-19.md` | 256 | МЁРТВОЕ | план/чек-лист закрыт полностью: 13/13 (100%) |
| `docs/_TODO/UNSCHEDULED_OPERATOR_JOBS_2026-08-19.md` | 349 | ПЛАН (13/16, 81%) | открытый чек-лист: 13/16 закрыто (81%) |
| `docs/_TODO/UNSUPPORTED_CLIENT_FALLBACK_PLAN.md` | 177 | ПЛАН (2/5, 40%) | открытый чек-лист: 2/5 закрыто (40%) |
| `docs/_TODO/UPLOADED_DOCUMENTS_ACTIVE_CONTENT_2026-08-19.md` | 50 | ПЛАН (0/6, 0%) | открытый чек-лист: 0/6 закрыто (0%) |
| `docs/_TODO/UZ3_COMPLIANCE_BACKLOG_2026-08-03.md` | 100 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/_TODO/VETOED_FEATURES_AUDIT_2026-08-04.md` | 117 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md` | 796 | ПЛАН (24/34, 71%) | открытый чек-лист: 24/34 закрыто (71%) |
| `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md` | 614 | МЁРТВОЕ | план/чек-лист закрыт полностью: 48/48 (100%) |
| `docs/_TODO/VIDEO_MEETINGS_JITSI_AUDIT_2026-09-08.md` | 56 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/_TODO/VISIBILITY_MODEL_DESIGN_2026-08-04.md` | 354 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/VISIBILITY_MODEL_GAP_2026-08-04.md` | 244 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/_TODO/WEB_PUSH_REMINDER_TICK_809.md` | 118 | МЁРТВОЕ | план/чек-лист закрыт полностью: 5/5 (100%) |
| `docs/ACQUIRING_INTEGRATION/LOG.md` | 84 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ACTIVE_WORKQUEUE.md` | 95 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/AGENT_AUTORUN_SCHEME.md` | 12 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md` | 390 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/APP_RESTRUCTURE_INITIATIVE/CLINICAL_TEST_SCORING_CURRENT_SYSTEM.md` | 98 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/APP_RESTRUCTURE_INITIATIVE/CMS_AUDIT.md` | 202 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/CONTENT_PLAN.md` | 108 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` | 615 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/CMS_RESTRUCTURE_EXECUTION_AUDIT.md` | 107 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/CMS_RESTRUCTURE_PLAN.md` | 160 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md` | 80 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_CLIENT_PROFILE_REPACK_PLAN.md` | 312 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md` | 151 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MENU_RESTRUCTURE_PLAN.md` | 284 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md` | 305 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md` | 457 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_NAV_BADGES_PLAN.md` | 332 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_TODAY_DASHBOARD_PLAN.md` | 928 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md` | 168 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md` | 258 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md` | 170 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_BATCH_PATCH_AND_PHONE_PREVIEW_PLAN.md` | 52 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/MODES_SETTINGS_CLEANUP_PLAN.md` | 39 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/PATIENT_MAINTENANCE_MODE_EXECUTION_AUDIT.md` | 141 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/README.md` | 5 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/done/STAGE1_PLAN_CLOSEOUT.md` | 20 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/APP_RESTRUCTURE_INITIATIVE/E2E_ACCEPTANCE_AFTER_AB.md` | 318 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md` | 1555 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md` | 559 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md` | 468 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/APP_RESTRUCTURE_INITIATIVE/README.md` | 81 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md` | 637 | ПЛАН (6/7, 86%) | открытый чек-лист: 6/7 закрыто (86%) |
| `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md` | 692 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md` | 203 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md` | 462 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_PATIENT.md` | 366 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md` | 137 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/ADMIN_NAME_MATCH_HINTS_PLAN_AND_EXECUTION_LOG.md` | 51 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md` | 35 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` | 1211 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/BERSONCARE_SCREEN_SPECIFICATION.md` | 262 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/CHAT_READ_RECEIPTS.md` | 77 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` | 155 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md` | 57 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md` | 47 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DB_DUMPS/README.md` | 115 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DB_STRUCTURE.md` | 310 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` | 1100 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/DOCTOR_BROADCASTS.md` | 189 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md` | 152 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DOCTOR_CATALOG_REGIONS_LOG.md` | 22 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md` | 48 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md` | 143 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md` | 33 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/ERROR_TRACKING.md` | 42 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/EXERCISES_CATALOG_PERFORMANCE_PRIMITIVES.md` | 91 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/FULL PLATFORM MODEL.md` | 502 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/GITHUB_ACCAUNTS.md` | 227 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/INTEGRATOR_PLATFORM_USER_MIGRATION_EXECUTION_LOG.md` | 109 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` | 384 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/LOG_DOCTOR_ONLY_STAGE_COMPLETION.md` | 104 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` | 633 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/MATERIAL_RATINGS.md` | 61 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md` | 68 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/MAX_MAIN_MENU_EXECUTION_LOG.md` | 131 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md` | 27 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/MAX_SETUP.md` | 206 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md` | 96 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/MEDIA_PREVIEW_FRONTEND.md` | 91 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/MESSAGING_CONTRACT.md` | 59 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/MINIAPP_AUTH_AUDIT_2026-04-19.md` | 54 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md` | 274 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md` | 73 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md` | 60 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/OUTGOING_DISPATCH_CLASSIFICATION.md` | 30 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` | 1640 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` | 172 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/PATIENT_MEDIA_PLAYBACK_VIDEO.md` | 74 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md` | 116 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` | 70 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/PLATFORM_ACCESS_TIER_VS_PRODUCT_STATUS.md` | 162 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md` | 274 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md` | 179 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` | 326 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/ARCHITECTURE/PRODUCTION_DB_INVENTORY_2026-04-13.md` | 235 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md` | 148 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/SCENARIO_LOGIC_SUMMARY.md` | 35 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/SCREEN_ARCHITECTURE_GUIDE.md` | 441 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/SECURITY_CANON.md` | 544 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/SERVER CONVENTIONS.md` | 1325 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md` | 466 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/STAGE12_E2E_SCENARIO.md` | 30 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/STAGE12_RECONCILIATION.md` | 14 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md` | 74 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md` | 168 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/ARCHITECTURE/VK_MESSENGER_SETUP.md` | 36 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/audit/active-patient-card-daily-notes-1100-independent-audit-2026-09-08.md` | 89 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/blind-killset-booking-webhook-215.md` | 25 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/blind-killset-encoding-mode-2026-09-11.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/c3m-09-communications-2026-09-07.md` | 158 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/c3m-encounters-independence-2026-09-07.md` | 102 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/clinical-encounters-ui-2026-09-06.md` | 190 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-cr-10.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-CR-123.md` | 23 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-CR-5.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-CR-8.md` | 101 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-cr7-d1.md` | 110 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-extra-02.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-pfi-st-01.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-a1.md` | 110 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-a2-b5.md` | 64 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-a3.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-a4.md` | 195 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-b5-a2.md` | 258 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-b7.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-d9.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-e10-batch1.md` | 175 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-qw-e10-batch2.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-sch-r-04.md` | 122 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-sch-r-05.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-sch-r-06.md` | 145 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-1-SCH-R-C8.md` | 360 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-cr-10.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-CR-123.md` | 109 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-CR-5.md` | 231 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-CR-8.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-cr7-d1.md` | 185 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-extra-02.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-a1.md` | 147 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-a3.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-a4.md` | 290 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-b5-a2.md` | 232 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-b7.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-d9.md` | 138 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-e10-batch1.md` | 123 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-qw-e10-batch2.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-sch-r-04.md` | 196 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-sch-r-05.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-sch-r-06.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2-SCH-R.md` | 100 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2b-qw-b7.md` | 94 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2b-qw-d9.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2b-qw-e10-batch2.md` | 20 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2c-qw-b7.md` | 58 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-2d-qw-b7.md` | 255 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-3-CR-5.md` | 168 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-3-qw-e10-batch1.md` | 110 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-3-qw-e10-batch2.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-4-qw-e10-batch1.md` | 173 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-audit-money-13-booking-webhook.md` | 178 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/code-reaudit-1-qw-a4.md` | 189 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/daily-notes-1100-independent-audit-2026-09-08.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/doctor-catalog-form-canonical-audit-2026-09-11.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/encoding-mode-crf-ceiling-2026-09-11.md` | 212 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/encoding-mode-f1-round2-2026-09-11.md` | 243 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/exercise-store-tariff-gate-2026-09-11.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/identity-fio-latin-ban-2026-09-14.md` | 246 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/identity-fio-latin-ban-round2-2026-09-14.md` | 171 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/jitsi-coturn-test-package-2026-09-08.md` | 127 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/jitsi-live-infra-2026-09-08.md` | 306 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/jitsi-turn-global-external-services-2026-09-08.md` | 151 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/login-history-2026-09-13.md` | 361 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/login-security-action-explicit-columns-2026-09-14.md` | 158 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-e3-adversarial-round4-2026-09-15.md` | 168 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-e3-human-confirmation-round2-2026-09-15.md` | 261 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-e3-round3-fixes-2026-09-15.md` | 180 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-e3-round4-fix-2026-09-15.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-org-gate-adversarial-audit-2026-09-14.md` | 347 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-org-gate-fifth-audit-2026-09-15.md` | 276 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-org-gate-fourth-audit-2026-09-15.md` | 207 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-org-gate-recheck-2026-09-14.md` | 251 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/merge-org-gate-third-audit-2026-09-15.md` | 204 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/mobile-patient-card-2026-09-04.md` | 190 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/PATIENT_BOOKING_CARD_AUDIT_2_2026-09-12.md` | 258 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/PREPAYMENT_S5_DELIVERY_AUDIT_2026-09-11.md` | 153 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/PREPAYMENT_S8_ONE_MESSAGE_AUDIT_2026-09-12.md` | 214 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/PREPAYMENT_S9_PATIENT_PAYMENT_DOOR_AUDIT_2026-09-12.md` | 351 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/reaudit-1-qw-a3.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-appointment-format-2026-09-08.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-appointment-format-plan-2026-09-08.md` | 257 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-delivery-byte-metering-2026-09-11.md` | 380 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-guest-tenant-gate-2026-09-08.md` | 88 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-guest-tenant-gate-fix-2026-09-08.md` | 49 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-invite-patient-binding-2026-09-08.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-live-ui-final-verification-2026-09-08.md` | 194 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-live-ui-owner-correction-2026-09-08.md` | 200 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-live-ui-postfix-2026-09-08.md` | 246 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-meetings-full-surface-2026-09-08.md` | 288 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-meetings-test-acceptance-2026-09-08.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-meetings-workspace-gate-correction-2026-09-08.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/audit/video-vpn-reconciler-2026-09-08.md` | 21 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/BACKLOG_TAILS.md` | 55 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/BIG_ITEMS_SCOPING_2026-06-28.md` | 357 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md` | 200 | ПЛАН (11/12, 92%) | открытый чек-лист: 11/12 закрыто (92%) |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE2.md` | 109 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE3.md` | 150 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE4.md` | 175 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE5.md` | 111 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/BOOKING_MIRROR_INTEGRITY_CONTRACT.md` | 72 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/BOOKING_REWORK_INITIATIVE/INVENTORY_AND_IA.md` | 427 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/LOG.md` | 615 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/BOOKING_REWORK_INITIATIVE/README.md` | 51 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/ROADMAP.md` | 900 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE2_DECOMPOSITION.md` | 328 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE3_DECOMPOSITION.md` | 442 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/BOOKING_REWORK_INITIATIVE/STAGE4_DECOMPOSITION.md` | 441 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/CONTENT_CMS_REPORT.md` | 98 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/COURSES_INITIATIVE/README.md` | 210 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/CURRENT_AUTHORITY_MAP.md` | 82 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/CURSOR_PLANS_REVIEW_2026-05-01.md` | 130 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/DEDUP_REPORT_2026-06-28.md` | 134 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md` | 124 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/design/bersoncare-карточка-пациента-бэклог.md` | 158 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/design/dna/README.md` | 11 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/DOCTOR_AI_PHI_PLAN.md` | 67 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_POLISH_PLAN.md` | 49 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_REWORK_PLAN.md` | 452 | МЁРТВОЕ | сам документ в заголовке/self-status помечен закрытым, historical, superseded или неисполняемым |
| `docs/DOCTOR_UI_REBUILD_REVIEW/CONTENT_STEP4_EDITOR_PLAN.md` | 105 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/DOCTOR_UI_REBUILD_REVIEW/PAGES_REBUILD_PLAN.md` | 172 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/DOCTOR_UI_REBUILD_REVIEW/PATIENT_PAGE_BUILD_PLAN.md` | 143 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/DOCTOR_UI_REBUILD_REVIEW/REMAINING_FOLLOWUPS.md` | 54 | ПЛАН (0/5, 0%) | открытый чек-лист: 0/5 закрыто (0%) |
| `docs/DOCTOR_UI_REBUILD_REVIEW/REVIEW_2026-06-13.md` | 140 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/DOCTOR_UI_REBUILD_REVIEW/ROADMAP.md` | 267 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/DOCTOR_UI_REBUILD_REVIEW/TODO_REGISTER.md` | 22 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/FINANCES_BIG07_DESIGN.md` | 161 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/LOG.md` | 255 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md` | 478 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/INITIATIVES.md` | 90 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/DRIZZLE_TRANSITION_PLAN.md` | 96 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/LOG.md` | 1019 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/RAW_SQL_INVENTORY.md` | 570 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/README.md` | 18 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/INTEGRATOR_DRIZZLE_MIGRATION/TEST_BEHAVIOR_AUDIT.md` | 102 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/MEDIA_PREVIEW_PIPELINE.md` | 139 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/OPERATIONS/OWNER_IDENTITY_CONSOLIDATION.md` | 156 | ПЛАН (1/3, 33%) | открытый чек-лист: 1/3 закрыто (33%) |
| `docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md` | 78 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/OPERATIONS/REMINDER_SCHEDULER_ROLLOUT_LOG.md` | 5 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/OPERATIONS/RESCHEDULE_COUNT_SANITATION.md` | 93 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/OPERATIONS/SPECIALIST_IDENTITY_CONSOLIDATION.md` | 116 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md` | 127 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/ORCHESTRATION_BINDINGS.md` | 125 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/ORCHESTRATOR_CHECKLIST.md` | 4 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/OWNER_BACKLOG_INPUT_2026-06-28.md` | 57 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/OWNER_DECISION_2026-06-23_client-comms-tab.md` | 49 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/OWNER_DECISIONS.md` | 1038 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/OWNER_TASKS_STATUS_2026-06-26.md` | 271 | ЖУРНАЛ | датированный снимок статусов; текущая очередь только в taskdb |
| `docs/OWNER_VISION_BRAINDUMP_2026-06-17.md` | 113 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-01.md` | 137 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-02-03.md` | 102 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-04.md` | 185 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-05.md` | 110 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-06.md` | 114 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-07.md` | 154 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-08.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-09.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-1-pfi-st-10.md` | 99 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-01.md` | 86 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-02-03.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-04.md` | 232 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-05.md` | 152 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-06.md` | 104 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-07.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-08.md` | 139 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-09.md` | 128 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/code-audit-2-pfi-st-10.md` | 111 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/audit/plan-audit.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` | 96 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/REQUIREMENTS.md` | 162 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/PATIENT_FILES_ISOLATION_INITIATIVE/ROADMAP.md` | 169 | МЁРТВОЕ | плановый документ без открытого checkbox и без подтверждённого active-статуса |
| `docs/PATIENT_UX_AUTH_MENU_LOG.md` | 75 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/PRODUCT_OVERVIEW.md` | 149 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/PROMO_ASSIGNMENT_SOURCE.md` | 166 | КАНОН | документ прямо объявляет себя единым действующим каноном реализованной области |
| `docs/QUICK_WINS_REVISION_2026-06-19.md` | 110 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/QUICK_WINS_USER_2026-06-17.md` | 40 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/RASSL-06_broadcast-image-attachment-scope.md` | 46 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/README.md` | 113 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/REPORTS/AB_PATH_EXECUTABLE_FIX_2026-08-20.md` | 180 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_4BBBDA02F_D20_PRIVILEGE_PRINCIPAL_2026-08-20.md` | 113 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_70B08FFEB_SCHEMA_DERIVATION_2026-08-20.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_AB_PATH_REAUDIT_2026-08-20.md` | 161 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_APPOWNER_2026-08-20.md` | 286 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_CABINET_ORG_ACTIVE_2026-08-20.md` | 177 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_D39_DELIVERY_SEAMS_2026-08-20.md` | 344 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_DROP_REISSUE_2026-08-20.md` | 71 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_FINAL_ENCODE_SHAPE_2026-09-11.md` | 209 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_LEDGER_DOWN_OP_2026-08-20.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_LEDGER_ORPHAN_2026-08-20.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_MEDIA_DELIVERY_WALLS_2026-09-12.md` | 192 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_MEDIA_RAW_ORIGINAL_DOWNLOAD_2026-09-10.md` | 100 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_MIGRATION_LEDGER_2026-08-20.md` | 190 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_MIGRATION_LEDGER_REAUDIT_2026-08-20.md` | 160 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_RAW_ORIGINALS_MIGRATION_2026-09-12.md` | 311 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_RAW_UPLOAD_BUCKET_2026-09-11.md` | 432 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_RESTORE_AB_2026-08-20.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_SEAT_SINGLE_DOOR_2026-08-20.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_TEST_OWNERSHIP_2026-08-20.md` | 150 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_TEST_RESET_PATH_2026-08-20.md` | 79 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/AUDIT_WALLTEST_2026-08-20.md` | 388 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/B0_NAMED_DEV_DB_CORRECTED_REAUDIT_ONE_2026-08-17.md` | 123 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_CARD_SWITCH_AND_SPECIALIST_CARDS_AUDIT_2026-09-11.md` | 240 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_DOMAIN_WRITE_CONSTRAINTS_FIX_2026-08-23.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md` | 80 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_UI_AUDIT_2026-09-07.md` | 93 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_ROOT_AND_SPECIALIST_LINK_AUDIT_2026-09-11.md` | 182 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_SLUG_POLICY_BLIND_AUDIT_2026-08-19.md` | 300 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_SLUG_POLICY_REAUDIT_2026-08-20.md` | 204 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CLINIC_TARIFF_PICKER_FIX_2026-08-20.md` | 37 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/COUNTERS_NAME_CENSUS_BLIND_AUDIT_2026-08-19.md` | 14 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/CUTOVER_STEP_LOGGING_2026-08-20.md` | 250 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/D10A_SINGLE_WRITER_AUDIT_2026-08-20.md` | 164 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/D39_DELIVERY_SEAM_CENSUS_2026-08-20.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/D39_FIX_F1_2026-08-20.md` | 30 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/D39_REMAINING_SEAMS_SWEEP_2026-08-20.md` | 188 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/DEV_DOCTOR_API_PORT_CONTEXT_AUDIT_2026-08-16.md` | 90 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/DEV_DOCTOR_BROWSER_RUNTIME_AUDIT_2026-08-16.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/DEV_PORT_CONTEXT_LATENCY_AUDIT_2026-08-16.md` | 78 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/DOCTOR_CLIENT_ARCHIVE_AND_PURGE.md` | 171 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/DOCTOR_UI_TWEAKCN_DNA_AUDIT_2026-07-13.md` | 129 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/GLOBAL_ADMIN_VIDEO_ACCESS_REAUDIT_2026-08-20.md` | 284 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/GLOBAL_PAID_ACCESS_AUDIT_2026-08-20.md` | 144 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/GLOBAL_SINGLETON_POLICY_UPSERT_AUDIT_2026-08-16.md` | 51 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/INVOICE_REISSUE_AUDIT_2026-08-19.md` | 254 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/INVOICE_REISSUE_FIX_2026-08-19.md` | 255 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/INVOICE_REISSUE_REAUDIT_2026-08-20.md` | 323 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/LEDGER_DOWN_OP_2026-08-20.md` | 180 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/LIVE_DEV_AUDIT_A_2026-08-17.md` | 160 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MEDIA_WORKER_DISPATCH_AUDIT_2026-08-20.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MEDIA_WORKER_QUEUE_ROOT_2026-08-19.md` | 205 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MERGE_ORG_GATE_E1_ADVERSARIAL_AUDIT_2026-09-15.md` | 284 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MERGE_ORG_GATE_E1_ROUND_7_AUDIT_2026-09-15.md` | 276 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_BYPASS_FIX_2026-08-19.md` | 254 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_BYPASS_REAUDIT_2026-08-20.md` | 237 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_LEDGER_ORPHANS_2026-08-20.md` | 289 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_LEDGER_RED_FIX_2026-08-20.md` | 273 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_ORDER_AUDIT_2026-08-19.md` | 415 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_TIMESTAMP_FIX_2026-08-20.md` | 382 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_TIMESTAMP_NAMES_2026-08-19.md` | 192 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/MIGRATION_TIMESTAMP_NAMES_AUDIT_2026-08-20.md` | 346 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/OPEN_ITEMS_A_2026-08-20.md` | 438 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/OPERATOR_ALERT_ENV_LABEL_2026-08-20.md` | 137 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PATIENT_COUNT_LIMIT_REMOVAL_2026-08-19.md` | 175 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_2026-08-19.md` | 196 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_AUDIT_2026-08-19.md` | 411 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PATIENT_COUNT_REMOVAL_REAUDIT_2026-08-20.md` | 205 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PATIENT_REMINDER_MATERIALIZER_500_FORENSIC_2026-08-17.md` | 168 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PLAN_CENSUS_RAW_2026-08-20.md` | 1807 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PLAN_VERIFICATION_SUMMARY_2026-08-20.md` | 138 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PLATFORM_MERGE_V2_CUTOVER_RUNBOOK.md` | 85 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PROGRAM_ITEM_WRITE_GRANT_FIX_2026-08-20.md` | 225 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_ROOTS_BLIND_AUDIT_2026-08-19.md` | 189 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLIND_AUDIT_2026-08-19.md` | 193 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLOCKERS_FIXED_2026-08-19.md` | 277 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_BLOCKERS_REAUDIT_2026-08-20.md` | 197 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_REAUDIT_2026-08-19.md` | 343 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/PUBLIC_BOOKING_WRITE_THIRD_AUDIT_2026-08-19.md` | 466 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/README.md` | 12 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/REMINDER_MATERIALIZATION_NARROW_READS_AUDIT_2026-08-17.md` | 285 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/RUNTIME_MIGRATION_WRAPPER_AUDIT_2026-08-17.md` | 86 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/RUNTIME_MIGRATION_WRAPPER_FINAL_AUDIT_2026-08-17.md` | 105 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/S3_PRIVATE_MEDIA_EXECUTION_LOG.md` | 149 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/SCHEDULER_MATERIALIZE_WAKE_CONTRACT_AUDIT_2026-08-17.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/SEAT_SINGLE_DOOR_2026-08-20.md` | 197 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/SLUG_SELF_RENAME_ALLOWANCE_AUDIT_2026-08-19.md` | 48 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md` | 683 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TASKDB_TRIAGE_2026-08-20.md` | 96 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TEST_RESET_2026-08-20_RUN2_BIRTH_WALL.md` | 136 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TEST_RESET_2026-08-20_RUN3_APP_OWNER.md` | 253 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TEST_RESET_OWNERSHIP_2026-08-20.md` | 287 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TIMEZONE_RULE_34_2026-08-19.md` | 136 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/TIMEZONE_RULE_34_AUDIT_2026-08-19.md` | 181 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_2026-08-20.md` | 79 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/REPORTS/UI_GATE_EXHAUSTIVE_MERGE_AUDIT_2026-08-20.md` | 103 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/RESPONSIVE_PWA_LAYOUT_PASS.md` | 41 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/ROADMAP_BACKLOG_2026-06-28.md` | 131 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/round3/ESCALATIONS.md` | 26 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/RULES/OPERATIONS/REMINDER_SCHEDULER_ROLLOUT_LOG.md` | 38 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/RULES/README.md` | 12 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/LOG.md` | 129 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md` | 45 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/STAGE_PLAN.md` | 85 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md` | 51 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` | 94 | КАНОН | явный действующий authority, owner-источник или нормативный контракт |
| `docs/SCHEDULE_REDESIGN_2026-06-19.md` | 368 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/SESSION_REPORT_2026-06-28.md` | 57 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/SETTINGS_RESEARCH_MAP_2026-06-19.md` | 725 | ЖУРНАЛ | датированный снимок/разбор события; не текущая authority |
| `docs/SHARED_TASKDB.md` | 9 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/SUBSCRIPTION_INITIATIVE/audit/2026-07-07-full-initiative-audit.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `docs/SUBSCRIPTION_INITIATIVE/LOG.md` | 631 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/SUBSCRIPTION_INITIATIVE/OPEN_QUESTIONS.md` | 85 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `docs/SUBSCRIPTION_INITIATIVE/REQUIREMENTS.md` | 106 | КАНОН | действующий нормативный контракт, правило или owner-решение |
| `docs/SUBSCRIPTION_INITIATIVE/ROADMAP.md` | 185 | ПЛАН (0/35, 0%) | открытый чек-лист: 0/35 закрыто (0%) |
| `docs/TASKDB_RULES.md` | 5 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/TENANT_ISOLATION_PROOF_BLIND_AUDIT_2026-08-19.md` | 236 | ЖУРНАЛ | отчёт, аудит, brief, лог или evidence прошлого события; не authority |
| `docs/TODO_NOT_NOW/login-register-mass-setup-email.md` | 34 | ПЛАН (0/5, 0%) | открытый чек-лист: 0/5 закрыто (0%) |
| `docs/TODO_NOT_NOW/product-platform-mass-patient.md` | 36 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/TODO_NOT_NOW/public_landing_metadata.md` | 19 | ОПИСАНИЕ | справочное описание текущего состояния; самостоятельных правил не заявляет |
| `docs/TODO_NOT_NOW/README.md` | 35 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
| `docs/TODO.md` | 235 | ПЛАН (15/16, 94%) | открытый чек-лист: 15/16 закрыто (94%) |
| `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md` | 5 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `docs/TREATMENT_PROGRAM_LFK_TEMPLATE_LEGACY_TODO.md` | 35 | ПЛАН (0/0, 0%) | незакрытая работа перечислена без Markdown-checkbox; доля `- [x]` неприменима (0/0) |
| `FIX PROBLEMS.md` | 101 | МЁРТВОЕ | закрытый, вытесненный или дублирующий документ; действующий источник указан в разделе 2 |
| `PORTFOLIO_CHAT_SUMMARY.md` | 267 | ЖУРНАЛ | датированный отчёт/аудит/история прохода; не authority |
| `README.md` | 152 | ОПИСАНИЕ | актуальный указатель либо описание runtime/архитектуры без самостоятельной authority |
| `runs/ALARM_REVIVE_REMOVED.md` | 16 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/ALARM.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/audit-1102/KILLSET_BLIND.md` | 90 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/audit-926-2b/KILLSET_BLIND.md` | 97 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/audit-926-stage2a/KILLSET-blind.md` | 101 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/audit-926-stage2a/REPORT.md` | 90 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-absolute-links-audit-brief-20260907.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-absolute-links-audit-continuation-brief-20260907.md` | 17 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-absolute-links-continuation-brief-20260907.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-absolute-links-fixer-brief-20260907.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-audit-brief-20260907.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-brief-20260907.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-correction-brief-20260907.md` | 129 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-correction2-brief-20260907.md` | 103 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-correction3-brief-20260907.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-readiness-audit-brief-20260907.md` | 84 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-core-readiness-audit-continuation-brief-20260907.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-edge-audit-brief-20260907.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-edge-brief-20260907.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-edge-correction-brief-20260907.md` | 47 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-final-audit-salvage-brief-20260907.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-final-live-audit-brief-20260907.md` | 53 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-prod-config-audit-brief-20260907.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-prod-config-brief-20260907.md` | 56 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-reminder-origin-final-brief-20260907.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-ui-audit-brief-20260907.md` | 23 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-ui-brief-20260907.md` | 43 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-domain-ui-live-continuation-brief-20260907.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-login-auth-policy-audit-brief-20260907.md` | 20 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-login-auth-policy-followup-brief-20260907.md` | 27 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-login-surfaces-audit-brief-20260907.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-login-surfaces-initial-audit-brief-20260907.md` | 24 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-login-surfaces-worker-brief-20260907.md` | 31 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/branding-reminder-rubitime-reaudit-brief-20260907.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-audit-brief-20260907.md` | 38 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-behavior-audit-continuation-brief-20260907.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-continuation-brief-20260907.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-final-audit-brief-20260907.md` | 47 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-recovery-brief-20260907.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-communications-slice-brief-20260907.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-encounters-audit-brief-20260907.md` | 31 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-encounters-audit-resume-brief-20260907.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-encounters-slice-brief-20260907.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-integration-acceptance-brief-20260907.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-medical-record-audit-366f65f63.md` | 149 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-medical-record-audit-brief-20260907.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-medical-record-audit-continuation-brief-20260907.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-medical-record-slice-brief-20260907.md` | 44 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-portal-symptom-audit-brief-20260907.md` | 39 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-portal-symptom-audit-e82c4a43a.md` | 211 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-portal-symptom-fix-brief-20260907.md` | 28 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-portal-symptom-slice-brief-20260907.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-audit-brief-20260907.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-audit-d77f7dbaf.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-audit-resume-brief-20260907.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-continuation-brief-20260907.md` | 33 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-dev-closure-20260907.md` | 41 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-rehabilitation-slice-brief-20260907.md` | 45 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-specialist-shell-routes-audit-8a83a0788.md` | 165 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-specialist-shell-routes-audit-brief-20260907.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-specialist-shell-routes-brief-20260907.md` | 63 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-identity-audit-251b9f1fc.md` | 159 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-identity-audit-brief-20260907.md` | 79 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-identity-brief-20260907.md` | 31 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-terminology-ui-audit-6b8fd2732.md` | 161 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-terminology-ui-audit-brief-20260907.md` | 34 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-terminology-ui-brief-20260907.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-support-terminology-ui-fix-brief-20260907.md` | 27 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-foundation-audit-brief-20260907.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-foundation-audit-d4446a453.md` | 73 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-foundation-brief-20260907.md` | 35 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-settings-audit-5bee7711a.md` | 147 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-settings-audit-brief-20260907.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m-workspace-settings-brief-20260907.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-calendar-analytics-broadcasts-worker-brief-20260907.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-cms-catalog-programs-worker-brief-20260907.md` | 28 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-core-doctor-ui-terminology-worker-brief-20260907.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-doctor-pages-terminology-worker-brief-20260907.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-patient-server-terminology-worker-brief-20260907.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-terms-card-programs-brief-20260908.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-terms-server-presentations-brief-20260908.md` | 15 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-terms-settings-broadcasts-patient-brief-20260908.md` | 13 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/c3m11-terms-today-calendar-analytics-brief-20260908.md` | 21 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-audit-brief-20260907.md` | 60 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-audit-continuation-brief-20260907.md` | 46 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-brief-20260907.md` | 52 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-correction-brief-20260907.md` | 59 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-ui-audit-brief-20260907.md` | 62 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-ui-completion-brief-20260907.md` | 70 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/clinic-management-workspace-ui-correction-brief-20260907.md` | 50 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/dev-interactive-audit/EXECUTION-MATRIX-2026-08-16.md` | 79 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/dev-interactive-audit/README.md` | 80 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/lead-revive-mission.md` | 16 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/audit-dirty-tree-salvage-20260817.md` | 118 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/clinic-owner-systemic-audit1-20260817.md` | 237 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/clinic-owner-systemic-worker-20260817.md` | 57 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/correction-dirty-tree-salvage-20260817.md` | 26 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/diary-snapshot-conflict-select-audit-20260817.md` | 92 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/diary-snapshot-conflict-select-fix-20260817.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/final-fix-db-chart-20260817.md` | 40 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/final-fix-invoice-20260817.md` | 115 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/final-fix-profile-sms-20260817.md` | 32 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/full-function-surface-closure-20260817.md` | 91 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/full-function-surface-final-audit-20260817.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/full-function-surface-forensic-20260817.md` | 110 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/function-return-shape-closure-20260817.md` | 74 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/function-return-shape-final-audit-20260817.md` | 107 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/function-return-shape-forensic-20260817.md` | 107 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/gitleaks-bot-token-visibility-20260817.md` | 54 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/global-admin-systemic-audit1-20260817.md` | 218 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/global-admin-systemic-correction-20260817.md` | 77 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/global-admin-systemic-correction2-20260817.md` | 150 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/global-admin-systemic-reaudit2-20260817.md` | 181 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/global-admin-systemic-worker-20260817.md` | 100 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/migrate-dev-owner-metadata-audit-20260817.md` | 83 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/migrate-dev-owner-metadata-fix-20260817.md` | 42 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/migrate-dev-stale-test-fix-20260817.md` | 68 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/patient-b0-capability-salvage-20260817.md` | 36 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/patient-capability-batch1-20260817.md` | 29 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/patient-root-surface-closure-fix-20260817.md` | 67 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/patient-root-surface-final-audit-20260817.md` | 69 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/patient-root-surface-forensic-audit-20260817.md` | 151 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-final-correction-integration-20260817.md` | 66 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-final-independent-audit-a-20260817.md` | 279 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-final-independent-audit-b-20260817.md` | 256 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-integration-clinic-stage-20260817.md` | 119 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-integration-global-stage-20260817.md` | 316 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/orchestration/systemic-integration-security-stage-20260817.md` | 108 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/owner-inbox.md` | 4 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/owner-questions.md` | 65 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `runs/video-notifications-audit-b0c1085d6.md` | 98 | ЖУРНАЛ | brief/report/audit/evidence завершённого прогона; датированная запись, не authority |
| `tools/testsuite/README.md` | 21 | ОПИСАНИЕ | описание текущего устройства, модуля или операционной поверхности |
<!-- INVENTORY_END -->
