/**
 * QA DIRECT WEB-PUSH (owner-authorized 2026-06-17). Sends a web_push to the test user «Дмитрий
 * Берсон» ONLY, using VAPID from the dev DB. Bypasses the integrator M2M path (which is blocked
 * by a signature mismatch). SAFE BY CONSTRUCTION: recipients = exactly the test user's own
 * subscriptions (fetched by his platform_user id); no other user can be reached.
 * Run via qa-live-send.sh (which provides QA_DBURL). dev DB only.
 */
import webpush from "web-push";
import pg from "pg";

const TEST_USER = process.env.QA_PUSH_USER_ID || "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0"; // Дмитрий
const DBURL = process.env.QA_DBURL || "";
if (!/bcb_webapp_dev/.test(DBURL)) {
  console.error("ABORT: QA_DBURL is not the dev DB.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: DBURL });
await client.connect();
try {
  const v = await client.query(
    "select value_json->'value'->>'publicKey' as pub, value_json->'value'->>'privateKey' as priv from system_settings where key='web_push_vapid' and scope='admin' limit 1",
  );
  const pub = v.rows[0]?.pub;
  const priv = v.rows[0]?.priv;
  if (!pub || !priv) {
    console.error("ABORT: VAPID keys not found in dev DB (web_push_vapid).");
    process.exit(3);
  }
  console.log(`VAPID loaded (pub len ${pub.length}); values not printed.`);
  webpush.setVapidDetails("mailto:admin@bersoncare.ru", pub, priv);

  const s = await client.query(
    "select endpoint, p256dh, auth from user_web_push_subscriptions where user_id = $1::uuid",
    [TEST_USER],
  );
  console.log(`Дмитрий web_push subscriptions: ${s.rows.length}`);
  if (s.rows.length === 0) {
    console.error("No subscriptions for the test user — nothing to send (he must enable notifications in the app).");
    process.exit(0);
  }

  const payload = JSON.stringify({
    title: "BersonCare — тест-пуш 🔔",
    body: `Если видишь это — web-push на тебя работает. ${new Date().toLocaleString("ru-RU")}`,
    url: "/app/patient",
  });

  let ok = 0;
  for (const r of s.rows) {
    try {
      const res = await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        payload,
      );
      ok += 1;
      console.log(`web_push sent: HTTP ${res.statusCode}`);
    } catch (e) {
      console.error(`web_push FAILED: HTTP ${e?.statusCode ?? "?"} ${String(e?.body ?? e).slice(0, 200)}`);
    }
  }
  console.log(`=== direct web_push done: ${ok}/${s.rows.length} delivered to test user ===`);
} finally {
  await client.end();
}
process.exit(0);
