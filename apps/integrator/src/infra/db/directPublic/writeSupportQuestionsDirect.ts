/**
 * Track D — D4/D17: аудит попытки доставки в канон поддержки (`public.support_delivery_events`).
 *
 * D17 шаг 3: три писателя `public.support_questions` / `public.support_question_messages`
 * (`createSupportQuestionDirect`, `appendSupportQuestionMessageDirect`,
 * `markSupportQuestionAnsweredDirect`) удалены как МЁРТВЫЕ — вызывающих в дереве не было ни одного
 * (D4 перевёл создание вопроса на подписанный `/api/integrator/support/question`, где строку канона
 * пишет вебапп; см. `runs/integrator-cleanup/D4_QUESTIONS_OWNERSHIP_REPORT.md`). Вместе с ними ушли
 * их коды отказа (`conversation_id_required` / `conversation_not_found` / `question_not_found`) и
 * класс `SupportQuestionsDirectWriteError`: их не читал никто, кроме них самих.
 *
 * Что осталось — одна дверь, `appendSupportDeliveryEventDirect`, и она не реляционная: запись идёт
 * именованным корнем `app.record_integrator_support_delivery_attempt` (шаг 1; тот же корень, что уже
 * зовёт вебапп, — второй двери к одной записи не заводили).
 *
 * СТЕНА АРЕНДАТОРА. `organization_id` сюда приходит уже разрешённым — вызывающий
 * (`dispatchPort.ts`, `logDeliveryAttempt`) берёт его из `getCurrentOrganizationPrincipalId()`, то
 * есть из принципала, залоченного на текущий запрос. Тело корня само отказывает, если значение
 * разошлось с `app.current_org_id()` (`rev10_tenant_insert_195`), — проверку не дублируем.
 *
 * ДОЛГОВЕЧНОСТЬ. `writePort.ts` не зовёт эту функцию вовсе, когда организации нет (изъятый ныне
 * потребитель вебаппа отвечал на такое событие `{ accepted: false, retryable: false }`, так что
 * очередь повтора ничего бы не изменила). Любой другой отказ уезжает в долговечный повтор прямой
 * записи; корень идемпотентен по тому же естественному ключу, поэтому повтор сходится.
 *
 * CHOKEPOINT: инъектированный `DbPort`; корень стартует до открытия реляционной транзакции.
 */
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

const RECORD_SUPPORT_DELIVERY_ATTEMPT_ROOT =
  'app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamp with time zone)';

export type AppendSupportDeliveryEventDirectInput = {
  organizationId: string;
  conversationMessageId: string | null;
  integratorIntentEventId: string | null;
  correlationId: string | null;
  channelCode: string;
  status: string;
  attempt: number;
  reason: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
};

export type AppendSupportDeliveryEventDirectResult = { id: string };

/**
 * D4 entrypoint replacing the `support.delivery.attempt.logged` HTTP projection.
 *
 * Unlike the question/conversation writes above, this one takes an ALREADY-RESOLVED `organizationId` —
 * the caller (`dispatchPort.ts`'s `logDeliveryAttempt`) reads it via
 * `getCurrentOrganizationPrincipalId()` (the runtime principal locked for the current send/webhook
 * request), the SAME value RLS's `WITH CHECK` re-verifies against (module header "TENANT MISMATCH
 * DENIED"). `writePort.ts` is responsible for NOT calling this function at all when `organizationId` is
 * absent (module header "DURABILITY" bucket 1) — mirroring the retired webapp consumer's own
 * non-retryable rejection of an org-less delivery event.
 */
export async function appendSupportDeliveryEventDirect(
  db: DbPort,
  input: AppendSupportDeliveryEventDirectInput,
): Promise<AppendSupportDeliveryEventDirectResult> {
  // D17: the relational INSERT is gone. `app.record_integrator_support_delivery_attempt` ALREADY
  // exists for exactly this row (same eleven columns, same partial-unique ON CONFLICT, same
  // `organization_id = app.current_org_id()` wall that `rev10_tenant_insert_195` applies here today),
  // and the webapp already reaches it through `pgIntegratorSupportQuestionOwnership`. A second root
  // would be a second door onto one write, so this is the same root with an integrator-port
  // capability added beside the webapp one.
  //
  // That root always writes `conversation_message_id = NULL`, which is the only value this path has
  // ever produced (`writePort.ts` `delivery.attempt.log` builds the input with a literal `null`, and
  // the durable retry replays that same input). A non-null value could therefore only arrive from a
  // future caller, and dropping it silently is exactly the class of gap D3/D4 had to repair — so it
  // is refused loudly instead.
  if (input.conversationMessageId !== null) {
    throw new Error('support_delivery_attempt_conversation_message_not_supported');
  }
  const payloadJson = JSON.stringify(input.payloadJson ?? {});
  const res = await runIntegratorNamedRoot<{ payload: unknown }>(
    db,
    RECORD_SUPPORT_DELIVERY_ATTEMPT_ROOT,
    [
      input.organizationId,
      input.integratorIntentEventId,
      input.correlationId,
      input.channelCode,
      input.status,
      input.attempt,
      input.reason,
      payloadJson,
      input.occurredAt,
    ],
    sql`SELECT app.record_integrator_support_delivery_attempt(
      ${input.organizationId}::uuid,
      ${input.integratorIntentEventId}::text,
      ${input.correlationId}::text,
      ${input.channelCode}::text,
      ${input.status}::text,
      ${input.attempt}::integer,
      ${input.reason}::text,
      ${payloadJson}::text,
      ${input.occurredAt}::timestamptz
    ) AS payload`,
  );
  const payload = res.rows[0]?.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('support_delivery_attempt_write_failed');
  }
  const row = payload as Record<string, unknown>;
  // A refused organization used to surface as an RLS violation and therefore as a durable retry;
  // this root reports it in its envelope instead, so the same refusal has to be re-thrown here.
  if (row.ok !== true || typeof row.id !== 'string') {
    throw new Error(
      typeof row.code === 'string' ? row.code : 'support_delivery_attempt_write_failed',
    );
  }
  return { id: row.id };
}
