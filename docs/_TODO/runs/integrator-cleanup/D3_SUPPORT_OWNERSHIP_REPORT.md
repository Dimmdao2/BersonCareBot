# D3 support ownership — отчёт worker-d3-support-ownership

Дата: 2026-07-31.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D3 с поправкой
`SUPERSEDED`: продуктовый канон принадлежит webapp; прежние direct-public writers integrator не являются
целевой границей.

## Карта записей

| Операция | До D3 ownership handoff | После handoff | Доказательство |
|---|---|---|---|
| Открытие обращения | `conversation.open` записывал локальную строку integrator, затем `writePort` вызывал `openSupportConversationDirect` в `public` | webapp `integratorSupportBridge.syncUserMessage` однозначно разрешает активную организацию, входит под explicit organization principal и вызывает `ensureWebappConversationForUser`; integrator сохраняет только локальную техническую строку и пропускает direct-public write после подтверждённого `canonicalWrite` | `integratorSupportBridge.unit.test.ts`; `supportRelay.d3.test.ts`; `writePort.ts` guard `canonicalWriteHandled === true` |
| Сообщение пациента | `conversation.message.add` записывал integrator-local и затем напрямую `public.support_conversation_messages` | webapp под тем же principal вызывает `appendWebappMessage`; контракт переносит `integratorMessageId`, source, timestamps, `externalChatId`, `externalMessageId`; integrator исполняет возвращённый canonical conversation id и оставляет local техническую копию | те же два теста; idempotency доказана replay-вызовом: повторный `integratorMessageId` не создаёт второе уведомление |
| Смена статуса | `conversation.state.set` записывал local и затем напрямую менял `public.support_conversations` | signed `/api/integrator/support/status` передаёт решение в webapp; webapp разрешает tenant и меняет organization-scoped conversation; local state остаётся техническим | `integratorSupportBridge.unit.test.ts` проверяет organization-scoped key и все поля закрытия; отсутствие `canonicalWrite` оставляет прежний direct-public путь |
| Доставка уведомления врачу | integrator строил fallback intent, если sync webapp не состоялся | после успешной webapp-записи webapp вызывает `notifyDoctorPatientMessage`; существующий путь передаёт готовое уведомление через relay, integrator выполняет доставку; integrator fallback остаётся только для отсутствующего/неуспешного webapp sync | `integratorSupportBridge.unit.test.ts` проверяет ровно один вызов notify для созданного сообщения и отсутствие повторной доставки при replay; `supportRelay.d3.test.ts` проверяет отсутствие fallback intent после успешного sync |

Новое поле ответа `canonicalWrite` необязательно. Ответ старого webapp `{ok:true}` сохраняет прежний
conversation id, прежние две local mutations, прежний последующий `conversation.mergeLegacyToPlatform` и
прежний direct-public путь (`canonicalWriteHandled: false`). Это закреплено вторым кейсом
`supportRelay.d3.test.ts`.

## Достижимость

Точный поиск по контенту подтвердил живые сценарии:

- `telegram.draft.send` → `draft.send` (`apps/integrator/src/content/telegram/user/scripts.json:611,624`);
- `max.draft.send` → `draft.send` (`apps/integrator/src/content/max/user/scripts.json:1293,1306`);
- Telegram/MAX admin content вызывает `conversation.admin.reply` и `conversation.close`
  (`apps/integrator/src/content/{telegram,max}/admin/scripts.json:304,323`).

BM25 code-search подтвердил цепочку `syncSupportUserMessage` → `webappSupportSync.ts` →
`webappEventsClient.ts` и webapp signed route. Семантический индекс на этом worker недоступен: команда
`bash /home/dev/brain/tools/codeq.sh ... --repo bcb --k 10` дословно завершилась `no DSN
(secrets/storage.env)`. Поэтому отчёт не делает утверждений о недостижимости какого-либо пути.

## Fault injection

Инъекция: временно заменить выбор
`webappSync.canonicalWrite?.conversationId ?? conversationId` на `conversationId`, то есть заставить integrator
игнорировать присланный webapp результат.

До восстановления, дословный существенный вывод:

```text
FAIL  src/kernel/domain/executor/handlers/supportRelay.d3.test.ts > D3 webapp support ownership handoff > executes the canonical result returned by webapp
AssertionError: expected 'legacy-conversation' to be 'webapp:platform:22222222-2222-4222-82…' // Object.is equality

Expected: "webapp:platform:22222222-2222-4222-8222-222222222222"
Received: "legacy-conversation"

Test Files  1 failed (1)
Tests  1 failed | 1 passed (2)
```

После восстановления:

```text
Test Files  1 passed (1)
Tests  2 passed (2)
```

## Две строки `organization_id IS NULL`

Runtime-сверка **не завершена и не выдана за завершённую**. Никакого `NOT NULL`, RLS/grant tightening или
удаления старого пути в этой работе нет.

Фактические попытки на DEV `bcb_webapp_dev`:

1. Канонический `pnpm --dir apps/webapp run reconcile-communication-domain` без env: `DATABASE_URL is not set`.
2. Через канонический `.env.cutover.dev`: `permission denied for function current_integrator_user_id`
   (`SQLSTATE 42501`).
3. Прямое read-only чтение runtime webapp/integrator login: `permission denied for function is_staff`.
4. `DATABASE_URL_STAFF` с `SET LOCAL ROLE app_staff` успешно устанавливает роль, но RLS закономерно скрывает
   platform/null-scope строки и возвращает 0 строк; это не доказательство отсутствия двух строк.
5. Системный owner-path `sudo -u postgres` недоступен worker-контейнеру из-за `no_new_privileges`; SSH на DEV
   host не авторизован.

Для закрытия этой части нужен разрешённый owner/migrator read-write сеанс по существующему
`deploy/host/migrate-dev.sh`: сначала вывести обе строки и их message/question children, однозначно сопоставить
каждую с active enrollment, затем в одной транзакции обновить parent и children и повторить сверку counts/ids.
До этого приемочный пункт про сохранность этих двух строк остаётся открытым.

## Ветка D12b, которую нельзя менять

**Открытый вопрос владельцу №3 сохранён без ответа:** legacy-ветка `handleConversationAdminReply`, которая
локально меняет conversation/question state и решает, закрывает ли ответ связанный вопрос, в D3 не изменялась.
Её переносить или списывать можно только отдельным решением владельца. Ничего из integrator в этой работе не
удалено.

## Проверки

- `pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/messaging/integratorSupportBridge.unit.test.ts` — 1/1 PASS.
- `pnpm --dir apps/integrator exec vitest --run src/kernel/domain/executor/handlers/supportRelay.d3.test.ts` — 2/2 PASS после fault-injection восстановления.
- `pnpm --filter webapp lint` — PASS.
- `pnpm --filter @bersoncare/integrator lint` — PASS.
- `pnpm --filter webapp typecheck` — PASS.
- `pnpm --filter @bersoncare/integrator typecheck` — PASS.

Галочки authority-плана не изменялись. Push/merge не выполнялись.
