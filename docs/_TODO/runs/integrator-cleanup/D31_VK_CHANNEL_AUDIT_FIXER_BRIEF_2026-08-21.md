# D31 VK — закрыть пять findings первичного независимого аудита

Роль: worker/fixer в той же ветке `wt/d31-vk-channel-20260821`. Authority — owner-решение Р-D31 от 31.07
«делать API для VK, инсту удалять», активные D31 1/2 и 2/2 в `WORK_ORDER.md` и единственный первичный аудит
`D31_VK_CHANNEL_AUDIT_RESULT_2026-08-21.md`. Новый blind audit и новый kill-set не запускать: исправить ровно
пять `MUST FIX` из аудита и повторить сохранённые acceptance-проверки.

Перед действием прочитать карту `AGENTS.md`, затем §1 migration rules, §2–§5, §7, §9–§10b и §24. Повторить поиск
более поздних owner-решений в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`WORK_ORDER.md`. Более поздний конфликт — `OWNER QUESTION`, не мягкая трактовка.

## Требуемое поведение

1. **Inbound Callback API.** Принимать официальный `message_new` envelope с сообщением в `object.message`, сохраняя
   совместимость только с реально поддерживаемой VK-схемой. `message_new` и `message_event` после secret/shape
   проверки обязаны доходить до существующего общего `eventGateway` со стабильным event identity, sender, peer,
   text/payload. Confirmation остаётся точной; неверный/отсутствующий secret и unsupported event остаются отказом.
   Не создавать второй VK event engine: расширить существующий parser/mapper/route.
2. **Common outbound path.** Добавить VK в существующую outbound policy/dispatcher так, чтобы `message.send`
   проходил общий retry/delivery-journal путь. Сохранить правильного recipient, стабильный `random_id`, отказ на
   non-2xx/VK error и `recipient_blocked_bot` для VK error 901. Не создавать отдельную очередь или журнал.
3. **Webapp materialization.** Расширить существующие reminder target/topic/channel resolver/materializer paths:
   VK-linked пользователь с разрешённым VK-каналом получает VK delivery intent, а недоступный clinic override
   корректно падает назад на пригодный platform sender. Не создавать отдельный materializer.
4. **DB-backed credentials и безопасность.** Расширить существующие platform settings API/UI и общие
   client/audit redactors для трёх уже объявленных VK setting keys. Секреты никогда не возвращаются клиенту и не
   попадают в durable audit. Availability не должна заявлять пригодный sender без usable clinic/platform
   credentials. Не добавлять secret env, hard-code или второй settings store.
5. **Schema-B migration.** Исправить существующий D31 migration-файл под timestamp/statement-owner/verify контракт
   §1; не добавлять новую миграцию и не добавлять GRANT/REVOKE/policy DDL. Обновить существующий real-migration
   self-test на фактический активный набор без hard-coded stale count, если репозиторный паттерн уже даёт более
   устойчивый oracle. Исправить существующий UI test для обязательного `vkConfigured`.

Сначала для каждого пункта найти существующую общую точку расширения; новая функция/обёртка допустима только если
существующая точка не может нести поведение без нарушения своей границы. Не возвращать Instagram и не смешивать
VK messenger identity (`vk_*`, `user_channel_bindings`) с VK ID OAuth (`vk_id_*`, `user_oauth_bindings`).

## Acceptance

Повторить без изменения смысла уже созданные audit acceptance-наборы:

```bash
pnpm --dir apps/integrator exec vitest --run \
  src/integrations/vk/client.unit.test.ts \
  src/integrations/vk/mapIn.unit.test.ts \
  src/integrations/vk/webhook.route.test.ts \
  src/integrations/clinicDeliveryAdapters.unit.test.ts \
  src/infra/adapters/dispatchPort.test.ts
pnpm --dir apps/webapp exec vitest --run \
  src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts
pnpm --dir apps/integrator typecheck
pnpm --dir apps/integrator lint
pnpm --dir apps/webapp run typecheck
bash apps/webapp/scripts/check-drizzle-migration-order.sh
node scripts/check-migration-privileges.mjs
node --test deploy/postgres/privileges/migration-order.test.mjs
git diff --check
```

Добавить/обновить только поведенческие тесты, необходимые для пяти уже названных gaps; source-string absence
tests не писать. Не делать fault injection повторно. Не обращаться к DEV/TEST/PROD, не читать и не использовать
реальные VK secrets, не создавать fixture/disposable DB, не запускать deploy/full CI/push и не применять миграцию.
Lead отдельно выполнит candidate migration rollback-only preflight на named DEV **до landing**, а live VK gate —
только когда доступны владелец и реальные credentials.

Коммитить только явные D31 paths без `git add -A`. Не заканчивать ход в ожидании фонового процесса; все команды
дождаться на переднем плане. В итоге: SHA, полный file census, команды/exit codes, соответствие findings 1–5 и
`NOT DONE: lead candidate named-DEV rollback preflight / live VK secret gate`.
