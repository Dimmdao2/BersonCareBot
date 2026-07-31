# D4 support questions ownership — отчёт worker-d4-questions

Дата: 2026-07-31.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D4 с поправкой
`SUPERSEDED`: продуктовый канон принадлежит webapp; direct-public writers integrator остаются только
совместимым fallback для старого webapp без `canonicalWrite`.

## Карта записей

| Операция                | До D4 ownership handoff                                                                                                                                    | После handoff                                                                                                                                                                                                                                                                                             | Доказательство                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Создание вопроса        | `question.create` сохранял техническую `integrator.user_questions`, затем `writePort` вызывал `createSupportQuestionDirect` для `public.support_questions` | signed `/api/integrator/support/question` передаёт `operation=create`; webapp разрешает пациента и точную организацию, входит под explicit organization principal и вызывает Drizzle-порт `createQuestion`; integrator принимает совпавший `canonicalWrite.questionId` и не вызывает direct-public writer | `integratorSupportBridge.unit.test.ts`; `supportCanonicalWriteHandoff.d4.test.ts`; `writePort.ts` + `supportCanonicalWriteHandoff.ts` |
| Сообщение в вопросе     | `question.message.add` сохранял техническую `integrator.question_messages`, затем напрямую писал `public.support_question_messages`                        | webapp под тем же organization principal вызывает `appendQuestionMessage`; natural key `integrator_question_message_id` передаётся неизменным и `ON CONFLICT DO NOTHING` делает replay идемпотентным; integrator принимает только ответ с теми же question/message ids                                    | те же тесты; `pgIntegratorSupportQuestionOwnership.ts`                                                                                |
| Отметка «отвечено»      | `question.markAnswered` менял local state и затем напрямую `public.support_questions`                                                                      | integrator передаёт question + conversation context; webapp повторно разрешает tenant и выполняет organization-qualified Drizzle `UPDATE`; legacy/random conversation без подтверждённого `canonicalWrite` сохраняет прежний путь                                                                         | `integratorSupportBridge.unit.test.ts`; `executeAction.ts`; `supportRelay.ts`; `writePort.ts`                                         |
| Журнал попыток доставки | `delivery.attempt.log` сохранял `integrator.delivery_attempt_logs`, затем напрямую писал `public.support_delivery_events`                                  | signed `/api/integrator/support/delivery-attempt` передаёт полный нормализованный audit payload; webapp пишет `support_delivery_events` через Drizzle под explicit organization principal; integrator direct-public writer не вызывается после совпавшего `canonicalWrite`                                | `integratorSupportBridge.unit.test.ts`; `dispatchPort.ts`; `writePort.ts`; `pgIntegratorSupportQuestionOwnership.ts`                  |

`integrator.message_drafts` не менялся: это локальное техническое состояние, прямо оставленное D4 в
integrator. Локальные `user_questions` / `question_messages` / `delivery_attempt_logs` тоже не удалялись:
эта работа переносит владение `public`-каноном, а не исполняет последующие D10/D12 удаления.

## Совместимость и отказ tenant mismatch

`canonicalWrite` остаётся необязательным. HTTP 200 `{ok:true}` без поля, недоступный endpoint или ответ с
другим natural key запускает тот же legacy direct-public/outbox код, который существовал до handoff.

Для вопроса webapp сверяет organization-scoped conversation id и отдельно переданный `organizationId` до
вызова порта, затем повторно пишет только внутри explicit principal. Тест с conversation организации A и
переданным organization B возвращает `{ok:false,error:"organization_mismatch"}` и не вызывает канонический
порт. Drizzle-запросы дополнительно квалифицированы `organization_id`; FORCE RLS остаётся последней границей.

## Достижимость

Точный поиск по content и коду подтвердил живые пути:

- Telegram `draft.send`: `apps/integrator/src/content/telegram/user/scripts.json:624`;
- MAX `draft.send`: `apps/integrator/src/content/max/user/scripts.json:1306`;
- admin list/mark-all: `apps/integrator/src/content/{telegram,max}/admin/scripts.json:121,140`;
- каждая provider success/failure ветка вызывает `logDeliveryAttempt`:
  `apps/integrator/src/infra/adapters/dispatchPort.ts:307,338,354`;
- все четыре direct-public entrypoint остались достижимы только внутри `legacyWrite` в `writePort.ts`;
  новый основной путь идёт через `syncSupportQuestionWrite` / `syncSupportDeliveryAttempt`.

BM25 code-search использован до точного поиска. Семантический индекс на worker недоступен: команда
`bash /home/dev/brain/tools/codeq.sh ... --repo bcb --k 15` дословно завершилась
`no DSN (secrets/storage.env)`. Поэтому отчёт не делает утверждений о недостижимости какого-либо пути.

## Fault injection

### Integrator получил `canonicalWrite`, но всё равно пишет канон сам

В `executeCanonicalWriteOrLegacy` временно добавлен вызов `legacyWrite()` перед успешным возвратом.
Дословный существенный вывод:

```text
FAIL  src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts > D4 webapp canonical write handoff > executes the canonical acknowledgement and does not write product canon itself
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
Number of calls: 1
Test Files  1 failed (1)
Tests  1 failed | 2 passed (3)
```

### Integrator игнорирует присланное подтверждение

Успешная ветка временно возвращала `false`. Дословный существенный вывод:

```text
FAIL  src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts > D4 webapp canonical write handoff > executes the canonical acknowledgement and does not write product canon itself
AssertionError: expected false to be true // Object.is equality
- Expected
+ Received
- true
+ false
Test Files  1 failed (1)
Tests  1 failed | 2 passed (3)
```

После восстановления:

```text
Test Files  1 passed (1)
Tests  3 passed (3)
```

## Проверки

- `pnpm --dir apps/webapp exec vitest --run --project=unit src/modules/messaging/integratorSupportBridge.unit.test.ts` — 1 file / 4 tests PASS.
- `pnpm --dir apps/integrator exec vitest --run src/infra/adapters/supportCanonicalWriteHandoff.d4.test.ts` — 1 file / 3 tests PASS после двух fault injections.
- `pnpm --filter webapp lint` — PASS (`check-no-new-raw-sql`, frozen legacy migrations и drizzle journal sync включены).
- `pnpm --filter @bersoncare/integrator lint` — PASS.
- `pnpm --filter webapp typecheck` — PASS.
- `pnpm --filter @bersoncare/integrator typecheck` — PASS.

Галочка authority-плана не изменялась. Push/merge не выполнялись.

`closed 1/1 against docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md D4` — worker evidence;
authority checkbox оставлен открытым для lead/audit.

## NOT DONE

- Live DB/network proof не выполнялся: тестовая сеть worker недоступна; вместо заявления о недостижимости дана
  воспроизводимая content/code/BM25 карта выше.
- Legacy direct-public writers и локальные технические таблицы не удалялись: это не scope D4 ownership handoff.
