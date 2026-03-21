#!/usr/bin/env node
/**
 * Backfills communication history from integrator DB to webapp support_* tables.
 *
 * Reads conversations, conversation_messages, user_questions, question_messages,
 * and delivery_attempt_logs from the source (integrator) DB, and upserts into
 * support_conversations, support_conversation_messages, support_questions,
 * support_question_messages, and support_delivery_events in the target (webapp) DB.
 *
 * Idempotent by integrator_*_id — safe to re-run.
 * message_drafts are explicitly excluded.
 *
 * Usage:
 *   INTEGRATOR_DATABASE_URL=... DATABASE_URL=... node scripts/backfill-communication-history.mjs [--dry-run | --commit] [--limit=N]
 *
 * Defaults to --dry-run.
 */
import "dotenv/config";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

loadCutoverEnv();

const args = process.argv.slice(2);
const dryRun = !args.includes("--commit");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

const sourceUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl) {
  console.error("INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set");
  process.exit(1);
}
if (!targetUrl) {
  console.error("DATABASE_URL is not set (webapp DB)");
  process.exit(1);
}

if (dryRun) {
  console.log("[DRY-RUN] No writes will be performed. Pass --commit to write.");
}

const src = new pg.Client({ connectionString: sourceUrl });
const dst = new pg.Client({ connectionString: targetUrl });

async function resolveWebappPlatformUserId(integratorUserId) {
  if (!integratorUserId) return null;
  const r = await dst.query(
    "SELECT id FROM platform_users WHERE integrator_user_id = $1",
    [String(integratorUserId)]
  );
  return r.rows[0]?.id ?? null;
}

async function backfillConversations() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT c.id, c.source, i.user_id, c.admin_scope, c.status,
            c.opened_at, c.last_message_at, c.closed_at, c.close_reason
     FROM conversations c
     LEFT JOIN identities i ON i.id = c.user_identity_id
     ORDER BY c.opened_at ASC${limitClause}`
  );
  console.log(`Conversations to backfill: ${rows.length}`);
  let upserted = 0;
  for (const row of rows) {
    const platformUserId = await resolveWebappPlatformUserId(row.user_id);
    if (!dryRun) {
      await dst.query(
        `INSERT INTO support_conversations (
          integrator_conversation_id, platform_user_id, integrator_user_id, source, admin_scope, status,
          opened_at, last_message_at, closed_at, close_reason
        ) VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (integrator_conversation_id) DO UPDATE SET
          platform_user_id = COALESCE(EXCLUDED.platform_user_id, support_conversations.platform_user_id),
          integrator_user_id = COALESCE(EXCLUDED.integrator_user_id, support_conversations.integrator_user_id),
          status = EXCLUDED.status,
          last_message_at = EXCLUDED.last_message_at,
          closed_at = EXCLUDED.closed_at,
          close_reason = EXCLUDED.close_reason,
          updated_at = now()`,
        [
          row.id,
          platformUserId,
          row.user_id ? String(row.user_id) : null,
          row.source,
          row.admin_scope,
          row.status,
          row.opened_at,
          row.last_message_at,
          row.closed_at,
          row.close_reason,
        ]
      );
    }
    upserted++;
  }
  console.log(`  Conversations ${dryRun ? "would upsert" : "upserted"}: ${upserted}`);
}

async function backfillConversationMessages() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT cm.id, cm.conversation_id, cm.sender_role, cm.text, cm.source,
            cm.external_chat_id, cm.external_message_id, cm.created_at
     FROM conversation_messages cm
     JOIN conversations c ON c.id = cm.conversation_id
     ORDER BY cm.created_at ASC${limitClause}`
  );
  console.log(`Conversation messages to backfill: ${rows.length}`);
  let upserted = 0;
  for (const row of rows) {
    if (!dryRun) {
      const conv = await dst.query(
        "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
        [row.conversation_id]
      );
      const conversationId = conv.rows[0]?.id;
      if (!conversationId) {
        console.warn(`  WARN: conversation ${row.conversation_id} not found in webapp, skipping message ${row.id}`);
        continue;
      }
      await dst.query(
        `INSERT INTO support_conversation_messages (
          integrator_message_id, conversation_id, sender_role, message_type, text, source,
          external_chat_id, external_message_id, created_at
        ) VALUES ($1, $2, $3, 'text', $4, $5, $6, $7, $8)
        ON CONFLICT (integrator_message_id) DO NOTHING`,
        [
          row.id,
          conversationId,
          row.sender_role,
          row.text,
          row.source,
          row.external_chat_id,
          row.external_message_id,
          row.created_at,
        ]
      );
    }
    upserted++;
  }
  console.log(`  Conversation messages ${dryRun ? "would upsert" : "upserted"}: ${upserted}`);
}

async function backfillQuestions() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT id, user_identity_id, conversation_id, text, created_at, answered, answered_at
     FROM user_questions ORDER BY created_at ASC${limitClause}`
  );
  console.log(`Questions to backfill: ${rows.length}`);
  let upserted = 0;
  for (const row of rows) {
    if (!dryRun) {
      let conversationId = null;
      if (row.conversation_id) {
        const c = await dst.query(
          "SELECT id FROM support_conversations WHERE integrator_conversation_id = $1",
          [row.conversation_id]
        );
        conversationId = c.rows[0]?.id ?? null;
      }
      const status = row.answered ? "answered" : "open";
      await dst.query(
        `INSERT INTO support_questions (
          integrator_question_id, conversation_id, status, created_at, answered_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (integrator_question_id) DO UPDATE SET
          conversation_id = COALESCE(EXCLUDED.conversation_id, support_questions.conversation_id),
          status = EXCLUDED.status,
          answered_at = COALESCE(EXCLUDED.answered_at, support_questions.answered_at),
          updated_at = now()`,
        [
          row.id,
          conversationId,
          status,
          row.created_at,
          row.answered_at,
        ]
      );
    }
    upserted++;
  }
  console.log(`  Questions ${dryRun ? "would upsert" : "upserted"}: ${upserted}`);
}

async function backfillQuestionMessages() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT qm.id, qm.question_id, qm.sender_type, qm.message_text, qm.created_at
     FROM question_messages qm
     JOIN user_questions q ON q.id = qm.question_id
     ORDER BY qm.created_at ASC${limitClause}`
  );
  console.log(`Question messages to backfill: ${rows.length}`);
  let upserted = 0;
  for (const row of rows) {
    if (!dryRun) {
      const q = await dst.query(
        "SELECT id FROM support_questions WHERE integrator_question_id = $1",
        [row.question_id]
      );
      const questionId = q.rows[0]?.id;
      if (!questionId) {
        console.warn(`  WARN: question ${row.question_id} not found in webapp, skipping question message ${row.id}`);
        continue;
      }
      await dst.query(
        `INSERT INTO support_question_messages (
          integrator_question_message_id, question_id, sender_role, text, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (integrator_question_message_id) DO NOTHING`,
        [
          row.id,
          questionId,
          row.sender_type,
          row.message_text,
          row.created_at,
        ]
      );
    }
    upserted++;
  }
  console.log(`  Question messages ${dryRun ? "would upsert" : "upserted"}: ${upserted}`);
}

async function backfillDeliveryAttemptLogs() {
  const limitClause = limit > 0 ? ` LIMIT ${limit}` : "";
  const { rows } = await src.query(
    `SELECT id, intent_event_id, correlation_id, channel, status, attempt, reason, payload_json, occurred_at
     FROM delivery_attempt_logs ORDER BY occurred_at ASC${limitClause}`
  );
  console.log(`Delivery attempt logs to backfill: ${rows.length}`);
  let inserted = 0;
  for (const row of rows) {
    if (!dryRun) {
      await dst.query(
        `INSERT INTO support_delivery_events (
          integrator_intent_event_id, correlation_id, channel_code, status, attempt,
          reason, payload_json, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (integrator_intent_event_id) WHERE (integrator_intent_event_id IS NOT NULL) DO NOTHING`,
        [
          row.intent_event_id,
          row.correlation_id,
          row.channel,
          row.status,
          row.attempt,
          row.reason,
          JSON.stringify(row.payload_json ?? {}),
          row.occurred_at,
        ]
      );
    }
    inserted++;
  }
  console.log(`  Delivery events ${dryRun ? "would insert" : "inserted"}: ${inserted}`);
}

async function main() {
  await src.connect();
  await dst.connect();
  console.log("Connected to source (integrator) and target (webapp) databases.\n");

  try {
    await backfillConversations();
    await backfillConversationMessages();
    await backfillQuestions();
    await backfillQuestionMessages();
    await backfillDeliveryAttemptLogs();
  } finally {
    await src.end();
    await dst.end();
  }

  console.log("\nBackfill complete.");
  if (dryRun) {
    console.log("This was a DRY-RUN. Pass --commit to actually write data.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
