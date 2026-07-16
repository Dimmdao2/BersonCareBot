#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/webapp/package.json", import.meta.url));
const { Client } = require("pg");

function fail() {
  process.stderr.write("FATAL: PostgreSQL role password update failed\n");
  process.exit(1);
}

const [, , database, role] = process.argv;
const identifier = /^[a-z_][a-z0-9_]*$/;
if (process.argv.length !== 4 || !identifier.test(database ?? "") || !identifier.test(role ?? "")) fail();

const passwordBuffer = await new Promise((resolve) => {
  const chunks = [];
  let size = 0;
  let settled = false;
  const finish = (terminatorFound) => {
    if (settled) return;
    settled = true;
    process.stdin.pause();
    const input = Buffer.concat(chunks, size);
    for (const chunk of chunks) chunk.fill(0);
    resolve(terminatorFound ? input.subarray(0, input.length - 1) : input);
  };
  process.stdin.on("data", (chunk) => {
    if (settled) return;
    size += chunk.length;
    if (size > 4097 || chunk.includes(0x0d)) fail();
    chunks.push(chunk);
    const newline = chunk.indexOf(0x0a);
    if (newline !== -1) {
      if (newline !== chunk.length - 1 || chunks.slice(0, -1).some((part) => part.includes(0x0a))) fail();
      finish(true);
    }
  });
  process.stdin.on("end", () => finish(false));
  process.stdin.on("error", fail);
});
if (passwordBuffer.length === 0 || passwordBuffer.length > 4096) fail();
const password = passwordBuffer.toString("utf8");
passwordBuffer.fill(0);

const client = new Client({
  database,
  host: process.env.PGHOST || "/var/run/postgresql",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || "postgres",
  application_name: "bcb-c4-role-password-setter",
});

try {
  await client.connect();
  // These are session-local and run before the first password-bearing bind.
  // The password is never SQL text: only an extended-protocol bind parameter.
  await client.query(`
    SET log_statement = 'none';
    SET log_min_messages = 'panic';
    SET log_min_error_statement = 'panic';
    SET log_min_duration_statement = -1;
    SET log_min_duration_sample = -1;
    SET log_statement_sample_rate = 0;
    SET log_transaction_sample_rate = 0;
    SET log_parameter_max_length = 0;
    SET log_parameter_max_length_on_error = 0
  `);
  const auditSetting = await client.query("SELECT current_setting('pgaudit.log', true) AS value");
  if (auditSetting.rows[0]?.value != null) {
    await client.query("SELECT set_config('pgaudit.log', 'none', false)");
  }
  await client.query(`
    CREATE OR REPLACE FUNCTION pg_temp.bcb_set_role_password(p_role text, p_password text)
    RETURNS void
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      EXECUTE format('ALTER ROLE %I PASSWORD %L', p_role, p_password);
    END
    $function$
  `);
  await client.query("SELECT pg_temp.bcb_set_role_password($1, $2)", [role, password]);
  await client.end();
  process.stdout.write("PostgreSQL role password updated: OK\n");
} catch {
  try {
    await client.end();
  } catch {
    // Deliberately suppress all driver/server diagnostics: they may contain bind context.
  }
  fail();
}
