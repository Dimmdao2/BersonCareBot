#!/usr/bin/env node
/**
 * Post-cutover reconciliation for communication domain: compare integrator
 * conversations, conversation_messages, user_questions, question_messages,
 * delivery_attempt_logs with webapp support_conversations, support_conversation_messages,
 * support_questions, support_question_messages, support_delivery_events.
 *
 * Usage: node scripts/reconcile-communication-domain.mjs [--max-mismatch-percent=N] [--sample-size=N]
 * Requires: DATABASE_URL (webapp), INTEGRATOR_DATABASE_URL (integrator).
 * Exit: 0 when within threshold; 1 when thresholds violated or DB error.
 */
import "dotenv/config";
import pg from "pg";
import { loadCutoverEnv } from "../../../scripts/load-cutover-env.mjs";

const { Client } = pg;

loadCutoverEnv();

function parseArgs(argv) {
  let maxMismatchPercent = 0;
  let sampleSize = 10;
  for (const arg of argv) {
    if (arg.startsWith("--max-mismatch-percent="))
      maxMismatchPercent = Math.max(0, parseInt(arg.slice("--max-mismatch-percent=".length), 10) || 0);
    if (arg.startsWith("--sample-size="))
      sampleSize = Math.max(1, Math.min(500, parseInt(arg.slice("--sample-size=".length), 10) || 10));
  }
  return { maxMismatchPercent, sampleSize };
}

async function main() {
  const { maxMismatchPercent, sampleSize } = parseArgs(process.argv.slice(2));
  const webappUrl = process.env.DATABASE_URL;
  const integratorUrl = process.env.INTEGRATOR_DATABASE_URL;
  if (!webappUrl?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (!integratorUrl?.trim()) {
    console.error("INTEGRATOR_DATABASE_URL is not set");
    process.exit(1);
  }

  const webappClient = new Client({ connectionString: webappUrl });
  const integratorClient = new Client({ connectionString: integratorUrl });
  try {
    await webappClient.connect();
    await integratorClient.connect();
  } catch (err) {
    console.error("DB connect error:", err.message);
    process.exit(1);
  }

  const report = {
    conversations: null,
    conversation_messages: null,
    questions: null,
    question_messages: null,
    delivery_events: null,
  };

  try {
    // Conversations: integrator id = webapp integrator_conversation_id
    const convSrc = await integratorClient.query("SELECT id FROM conversations");
    const convTgt = await webappClient.query(
      "SELECT integrator_conversation_id FROM support_conversations"
    );
    const srcConvIds = new Set(convSrc.rows.map((r) => r.id));
    const tgtConvIds = new Set(convTgt.rows.map((r) => r.integrator_conversation_id));
    const missingConv = [...srcConvIds].filter((id) => !tgtConvIds.has(id));
    report.conversations = {
      sourceCount: convSrc.rowCount ?? 0,
      targetCount: convTgt.rowCount ?? 0,
      missingInWebappCount: missingConv.length,
      missingInWebappSample: missingConv.slice(0, sampleSize),
    };

    // Conversation messages
    const msgSrc = await integratorClient.query(
      "SELECT id FROM conversation_messages"
    );
    const msgTgt = await webappClient.query(
      "SELECT integrator_message_id FROM support_conversation_messages"
    );
    const srcMsgIds = new Set(msgSrc.rows.map((r) => r.id));
    const tgtMsgIds = new Set(msgTgt.rows.map((r) => r.integrator_message_id));
    const missingMsg = [...srcMsgIds].filter((id) => !tgtMsgIds.has(id));
    report.conversation_messages = {
      sourceCount: msgSrc.rowCount ?? 0,
      targetCount: msgTgt.rowCount ?? 0,
      missingInWebappCount: missingMsg.length,
      missingInWebappSample: missingMsg.slice(0, sampleSize),
    };

    // User questions
    const qSrc = await integratorClient.query("SELECT id FROM user_questions");
    const qTgt = await webappClient.query(
      "SELECT integrator_question_id FROM support_questions"
    );
    const srcQIds = new Set(qSrc.rows.map((r) => r.id));
    const tgtQIds = new Set(qTgt.rows.map((r) => r.integrator_question_id));
    const missingQ = [...srcQIds].filter((id) => !tgtQIds.has(id));
    report.questions = {
      sourceCount: qSrc.rowCount ?? 0,
      targetCount: qTgt.rowCount ?? 0,
      missingInWebappCount: missingQ.length,
      missingInWebappSample: missingQ.slice(0, sampleSize),
    };

    // Question messages
    const qmSrc = await integratorClient.query(
      "SELECT id FROM question_messages"
    );
    const qmTgt = await webappClient.query(
      "SELECT integrator_question_message_id FROM support_question_messages"
    );
    const srcQmIds = new Set(qmSrc.rows.map((r) => r.id));
    const tgtQmIds = new Set(qmTgt.rows.map((r) => r.integrator_question_message_id));
    const missingQm = [...srcQmIds].filter((id) => !tgtQmIds.has(id));
    report.question_messages = {
      sourceCount: qmSrc.rowCount ?? 0,
      targetCount: qmTgt.rowCount ?? 0,
      missingInWebappCount: missingQm.length,
      missingInWebappSample: missingQm.slice(0, sampleSize),
    };

    // Delivery logs: ID matching by intent_event_id (stored as integrator_intent_event_id in webapp)
    const delSrc = await integratorClient.query(
      "SELECT intent_event_id FROM delivery_attempt_logs WHERE intent_event_id IS NOT NULL"
    );
    const delTgt = await webappClient.query(
      "SELECT integrator_intent_event_id FROM support_delivery_events WHERE integrator_intent_event_id IS NOT NULL"
    );
    const srcDelIds = new Set(delSrc.rows.map((r) => r.intent_event_id));
    const tgtDelIds = new Set(delTgt.rows.map((r) => r.integrator_intent_event_id));
    const missingDel = [...srcDelIds].filter((id) => !tgtDelIds.has(id));
    report.delivery_events = {
      sourceCount: srcDelIds.size,
      targetCount: tgtDelIds.size,
      missingInWebappCount: missingDel.length,
      missingInWebappSample: missingDel.slice(0, sampleSize),
    };
  } finally {
    await webappClient.end();
    await integratorClient.end();
  }

  console.log(JSON.stringify(report, null, 2));

  // Exit 0 only if mismatch percent is within threshold for *all* tables (plan: "for all tables").
  const tables = [
    { name: "conversations", ...report.conversations },
    { name: "conversation_messages", ...report.conversation_messages },
    { name: "questions", ...report.questions },
    { name: "question_messages", ...report.question_messages },
    { name: "delivery_events", ...report.delivery_events },
  ];
  for (const t of tables) {
    const sourceCount = t.sourceCount ?? 0;
    const missing = t.missingInWebappCount ?? 0;
    const pct = sourceCount > 0 ? (100 * missing) / sourceCount : 0;
    if (pct > maxMismatchPercent) {
      console.error(
        `[reconcile-communication-domain] ${t.name}: mismatch ${pct.toFixed(2)}% > ${maxMismatchPercent}%`
      );
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
