import { Pool } from "pg";
import fetch from "node-fetch";
import { env } from "../config/env.js";
import { logger, getWorkerLogger } from "../logger.js";

type DbMailing = {
  id: number;
  title: string;
};

type DbUser = {
  id: number;
  telegram_id: number;
  is_active: boolean | null;
};

const pool = new Pool({ connectionString: env.DATABASE_URL });

const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
const RATE_LIMIT_MS = 40;
const MAX_RETRIES = 3;

async function getActiveMailings(): Promise<DbMailing[]> {
  const res = await pool.query("SELECT id, title FROM mailings");
  return res.rows as DbMailing[];
}

async function getActiveUsersForMailing(mailingId: number): Promise<DbUser[]> {
  const res = await pool.query(
    `
    SELECT u.id, u.telegram_id, u.is_active
    FROM users u
    JOIN user_subscriptions s ON s.user_id = u.id
    WHERE s.mailing_id = $1
      AND s.is_active = true
      AND u.is_active IS DISTINCT FROM false
  `,
    [mailingId],
  );
  return res.rows as DbUser[];
}

async function markUserInactive(userId: number): Promise<void> {
  await pool.query("UPDATE users SET is_active = false WHERE id = $1", [userId]);
}

async function logMailingResult(
  userId: number,
  mailingId: number,
  status: "sent" | "error",
  error?: string,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO mailing_logs (user_id, mailing_id, status, sent_at, error)
    VALUES ($1, $2, $3, NOW(), $4)
    ON CONFLICT (user_id, mailing_id)
    DO UPDATE SET status = $3, sent_at = NOW(), error = $4
  `,
    [userId, mailingId, status, error ?? null],
  );
}

async function wasMailingSent(userId: number, mailingId: number): Promise<boolean> {
  const res = await pool.query(
    "SELECT 1 FROM mailing_logs WHERE user_id = $1 AND mailing_id = $2 AND status = $3",
    [userId, mailingId, "sent"],
  );
  return (res.rowCount ?? 0) > 0;
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (res.ok) return;

    const data: unknown = await res.json().catch(() => ({}));

    let errorMsg: string | undefined;
    if (
      typeof data === "object" &&
      data !== null &&
      "description" in data &&
      typeof (data as { description?: unknown }).description === "string"
    ) {
      errorMsg = (data as { description: string }).description;
    }

    if (res.status === 403) throw new Error("blocked");

    if (attempt === MAX_RETRIES) {
      throw new Error(errorMsg || "send failed");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}

export async function runMailings(): Promise<void> {
  const mailings = await getActiveMailings();

  for (const mailing of mailings) {
    const workerLogger = getWorkerLogger(undefined, String(mailing.id));
    const users = await getActiveUsersForMailing(mailing.id);

    const batchSize = users.length;
    let successCount = 0;
    let failCount = 0;

    workerLogger.info({ batchSize, mailingId: mailing.id }, "Mailing batch started");

    for (const user of users) {
      if (await wasMailingSent(user.id, mailing.id)) continue;

      let attemptUsed = 0;

      try {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          attemptUsed = attempt;
          try {
            await sendTelegramMessage(user.telegram_id, mailing.title);
            break;
          } catch (err) {
            if (attempt === MAX_RETRIES) throw err;
            workerLogger.warn({ user_id: user.id, attempt }, "Retry sending message");
          }
        }

        await logMailingResult(user.id, mailing.id, "sent");
        successCount++;

        workerLogger.info(
          { user_id: user.id, mailing_id: mailing.id, attempt: attemptUsed },
          "Mailing sent",
        );
      } catch (err: unknown) {
        failCount++;

        const message = getErrorMessage(err);

        if (message === "blocked") {
          await markUserInactive(user.id);
          workerLogger.warn({ user_id: user.id }, "User blocked bot, marked inactive");
        }

        await logMailingResult(user.id, mailing.id, "error", message);

        workerLogger.error(
          { user_id: user.id, mailing_id: mailing.id, error: message, attempt: attemptUsed },
          "Mailing failed",
        );
      }

      await new Promise<void>((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
    }

    workerLogger.info(
      { batchSize, successCount, failCount, mailingId: mailing.id },
      "Mailing batch completed",
    );
  }

  await pool.end();
}

if (require.main === module) {
  runMailings()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
      logger.error({ err: e }, "Worker failed");
      process.exit(1);
    });
}
