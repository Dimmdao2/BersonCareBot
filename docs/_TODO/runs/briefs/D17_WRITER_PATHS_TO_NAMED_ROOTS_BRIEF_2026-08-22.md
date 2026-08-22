# D17 шаг 1 — шесть реляционных писателей канона в интеграторе переводятся на именованные корни

**Роль:** worker. **Канон:** `AGENTS.md` — сначала карта заголовков (`grep -n "^## \|^### " AGENTS.md`),
затем §5 (Clean Architecture, ЕДИНЫЙ общий проход — не второй параллельный путь), §6 (PostgreSQL/роли),
§1 (миграции: timestamp forwards; «⛔ Миграция не выдаёт и не отзывает права»; «Перед приземлением миграции —
разбор её прав»), §10a/§10b, §24.2/§24.6.
Поиск — `node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт D17 — дословно:
«⛔ Выдавать роль можно только после ФАКТИЧЕСКОГО прекращения записей канона». Там же дословно про причину
порядка: «после них интегратор всё ещё пишет канон поддержки и напоминаний, и узкая роль уронит именно их».

Готовая перепись, с которой начинаешь (не переизмеряй заново, проверь и работай):
`docs/_TODO/runs/integrator-cleanup/D17_CANON_WRITER_CENSUS_2026-08-22.md`, §2.2 — шесть живых реляционных
писателей продуктового канона, каждый с `path:line` и живым маршрутом, и §5 — порядок оставшихся шагов.

## Задача

Перевести ШЕСТЬ путей §2.2 на именованные корни (`app.*`, SECURITY DEFINER), ровно как это уже сделано для
идентичности и привязки телефона в D25. Порядок — по одному пути за раз, каждый доводится до конца прежде,
чем начинается следующий:

1. `public.reminder_rules` — `directPublic/writeReminderRulesDirect.ts:154` (+ `:198` DELETE
   `integrator.user_reminder_occurrences`), живой маршрут `reminderRulesRoute.ts:165` → `writePort.ts:468`.
2. `public.reminder_delivery_events` — `directPublic/writeReminderProjectionDirect.ts:80`.
3. `public.content_access_grants_webapp` — `directPublic/writeReminderProjectionDirect.ts:97`.
4. `public.support_delivery_events` — `directPublic/writeSupportQuestionsDirect.ts:285`.
5. `public.notification_delivery_attempts` — `repos/notificationDeliveryAttempts.ts:67`.
6. `public.broadcast_audit` (UPDATE счётчиков) — `runtime/worker/outgoingDeliveryWorker.ts:268,284,987`.

По каждому пути:

- **Корень — один, миграцией timestamp-forward.** Владелец-шов в заголовке `BCB-MIGRATION-OWNER`,
  `require_accepted_context(...)` ПЕРВЫМ исполняемым оператором после `BEGIN`, `BCB-MIGRATION-VERIFY` есть,
  ни `GRANT`/`REVOKE`/`CREATE POLICY` в миграции. Уже применённые миграции не редактируются.
- **Вызов идёт через СУЩЕСТВУЮЩИЙ chokepoint** (`writeDirectPublic` и его стратегии принципала). Новый
  враппер, второй путь записи, «временный» обход — запрещены. Если кажется, что нужен новый слой — это стоп
  и вопрос ведущему, а не работа.
- **Права — только через декларацию и генератор** (`deploy/postgres/privileges/`), с разбором по §1: под какой
  ролью исполняется тело и что ему нужно, чтобы ИСПОЛНИТЬСЯ. Отдельно `SELECT … FOR UPDATE`/`FOR SHARE` —
  нужна привилегия класса UPDATE, поколоночного `SELECT` не хватает; гейт
  `deploy/postgres/privileges/row-lock-privileges.test.mjs` уже существует и должен остаться зелёным.
- **Поведение сохраняется дословно**, включая путь повтора `directPublicWriteRetryWorker.ts` (строки 71, 74,
  98, 103 переписи) — повтор обязан работать через новый корень так же, как раньше.
- **Тест поведения (§10a):** красный на сломанном продукте, зелёный после. Проверяется, что запись доезжает
  под тем принципалом, под которым идёт живой маршрут, и что чужая организация её не получает. Тест на текст
  исходника, на количество строк или на наличие файла — запрещён.

**Членства логина интегратора (`app_tenant_service`, `app_operational_delivery_worker`) в этом ходе НЕ
снимай** — это шаг 3 переписи и он идёт после снятия оверлея
`deploy/postgres/integrator-login-public-identity-grants.sql` из цепочки TEST-деплоя. Оверлей тоже не трогай.

## Границы

- ⛔ `--execute`/`--apply` на базах, deploy на TEST/PROD, остановка сервисов, push, full CI — запрещены.
  Допустимо и обязательно: `bash deploy/host/migrate-dev.sh --preflight` (rollback-only) и целевые тесты.
- ⛔ Фикстуры, disposable-базы, новые тестовые базы, любая новая машинерия — запрещены прямым словом владельца.
- Если какой-то из шести путей окажется не переводимым без продуктового решения — доведи остальные, а этот
  вынеси отдельным пунктом отчёта. Не выдумывай требование и не заводи из находки свой скоуп (§24.6).
- Галочку D17 сам не закрывай. Допиши в WORK_ORDER фактическое состояние: что переведено, что осталось.
