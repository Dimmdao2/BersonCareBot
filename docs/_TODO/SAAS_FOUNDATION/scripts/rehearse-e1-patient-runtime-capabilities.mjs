#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split("=");
  return [key, rest.join("=")];
}));
const db = args.get("--db") ?? "";
if (!process.argv.includes("--execute") || db !== "bcb_webapp_dev") {
  throw new Error("usage: --execute --db=bcb_webapp_dev");
}

const fixture = String.raw`
INSERT INTO be_organizations(id,title,is_active,sort_order,created_at,updated_at) VALUES
('80410000-0000-4000-8000-00000000000a','capability proof A',true,804,now(),now()),
('80410000-0000-4000-8000-00000000000b','capability proof B',true,804,now(),now());
INSERT INTO platform_users(id,display_name,role,created_at,updated_at,is_blocked,is_archived) VALUES
('80410000-0000-4000-8000-000000000001','shared capability patient','client',now(),now(),false,false);
INSERT INTO org_enrollments(id,organization_id,platform_user_id,status,created_at) VALUES
('80410000-0000-4000-8000-00000000001a','80410000-0000-4000-8000-00000000000a','80410000-0000-4000-8000-000000000001','active',now()),
('80410000-0000-4000-8000-00000000001b','80410000-0000-4000-8000-00000000000b','80410000-0000-4000-8000-000000000001','active',now());
INSERT INTO treatment_program_instances(id,patient_user_id,title,status,created_at,updated_at,assignment_source,organization_id) VALUES
('80410000-0000-4000-8000-00000000002a','80410000-0000-4000-8000-000000000001','A plan','active',now(),now(),'doctor','80410000-0000-4000-8000-00000000000a'),
('80410000-0000-4000-8000-00000000002b','80410000-0000-4000-8000-000000000001','B plan','completed',now(),now(),'doctor','80410000-0000-4000-8000-00000000000b');
INSERT INTO be_appointments(id,organization_id,platform_user_id,start_at,end_at,duration_minutes,source,status,reschedule_count,created_at,updated_at,attribution_json) VALUES
('80410000-0000-4000-8000-00000000003a','80410000-0000-4000-8000-00000000000a','80410000-0000-4000-8000-000000000001',now()+interval '1 day',now()+interval '1 day 1 hour',60,'native','confirmed',0,now(),now(),'{}'),
('80410000-0000-4000-8000-00000000003b','80410000-0000-4000-8000-00000000000b','80410000-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 1 hour',60,'native','confirmed',0,now(),now(),'{}');
INSERT INTO patient_bookings(id,platform_user_id,booking_type,category,slot_start,slot_end,status,contact_phone,contact_name,reminder_24h_sent,reminder_2h_sent,created_at,updated_at,source,canonical_appointment_id) VALUES
('80410000-0000-4000-8000-00000000004a','80410000-0000-4000-8000-000000000001','in_person','general',now()+interval '1 day',now()+interval '1 day 1 hour','confirmed','+70000000804','proof',false,false,now(),now(),'native','80410000-0000-4000-8000-00000000003a'),
('80410000-0000-4000-8000-00000000004b','80410000-0000-4000-8000-000000000001','in_person','general',now()+interval '2 days',now()+interval '2 days 1 hour','confirmed','+70000000804','proof',false,false,now(),now(),'native','80410000-0000-4000-8000-00000000003b');
INSERT INTO product_push_notifications(id,organization_id,user_id,topic_code,push_kind,warmup_slogan_key,created_at) VALUES
('80410000-0000-4000-8000-00000000005a','80410000-0000-4000-8000-00000000000a','80410000-0000-4000-8000-000000000001','proof-a','reminder','a',now()),
('80410000-0000-4000-8000-00000000005b','80410000-0000-4000-8000-00000000000b','80410000-0000-4000-8000-000000000001','proof-b','reminder','b',now());
DELETE FROM app.principal_context WHERE backend_pid=pg_backend_pid();
INSERT INTO app.principal_context(backend_pid,org_id,patient_user_id,nonce,expires_epoch)
VALUES(pg_backend_pid(),'80410000-0000-4000-8000-00000000000a','80410000-0000-4000-8000-000000000001','e1-cap-a',extract(epoch from now()+interval '10 minutes')::bigint);
`;

const proof = String.raw`
SELECT 1 / (NOT has_table_privilege('app_patient','public.product_analytics_events_recent','SELECT,INSERT'))::int;
SELECT 1 / (NOT has_table_privilege('app_patient','public.product_push_notifications','SELECT'))::int;
SELECT 1 / (NOT has_function_privilege('app_staff','app.record_current_patient_push_open(timestamptz,text,uuid)','EXECUTE'))::int;
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / app.touch_current_patient_plan_last_opened('80410000-0000-4000-8000-00000000002a')::int;
SELECT 1 / (NOT app.touch_current_patient_plan_last_opened('80410000-0000-4000-8000-00000000002b'))::int;
SELECT 1 / ((SELECT count(*) FROM app.read_current_patient_booking_rows('upcoming',now()) WHERE booking->>'id'='80410000-0000-4000-8000-00000000004a')=1)::int;
SELECT 1 / ((SELECT count(*) FROM app.read_current_patient_booking_rows('upcoming',now()) WHERE booking->>'id'='80410000-0000-4000-8000-00000000004b')=0)::int;
SELECT 1 / app.record_current_patient_analytics_event(now(),'page_view','webapp','__e1_capability_proof__','a','{}')::int;
SELECT 1 / ((SELECT recorded AND NOT deduped FROM app.record_current_patient_push_open(now(),'pwa','80410000-0000-4000-8000-00000000005a'))=true)::int;
SELECT 1 / ((SELECT recorded AND deduped FROM app.record_current_patient_push_open(now(),'pwa','80410000-0000-4000-8000-00000000005a'))=true)::int;
SELECT 1 / ((SELECT NOT recorded FROM app.record_current_patient_push_open(now(),'pwa','80410000-0000-4000-8000-00000000005b'))=true)::int;
RESET SESSION AUTHORIZATION;
UPDATE treatment_program_instances SET status='completed' WHERE id='80410000-0000-4000-8000-00000000002a';
UPDATE treatment_program_instances SET status='active' WHERE id='80410000-0000-4000-8000-00000000002b';
UPDATE app.principal_context SET org_id='80410000-0000-4000-8000-00000000000b', nonce='e1-cap-b' WHERE backend_pid=pg_backend_pid();
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / app.touch_current_patient_plan_last_opened('80410000-0000-4000-8000-00000000002b')::int;
SELECT 1 / (NOT app.touch_current_patient_plan_last_opened('80410000-0000-4000-8000-00000000002a'))::int;
SELECT 1 / ((SELECT count(*) FROM app.read_current_patient_booking_rows('upcoming',now()) WHERE booking->>'id'='80410000-0000-4000-8000-00000000004b')=1)::int;
SELECT 1 / ((SELECT recorded AND NOT deduped FROM app.record_current_patient_push_open(now(),'pwa','80410000-0000-4000-8000-00000000005b'))=true)::int;
SELECT 1 / ((SELECT NOT recorded FROM app.record_current_patient_push_open(now(),'pwa','80410000-0000-4000-8000-00000000005a'))=true)::int;
RESET SESSION AUTHORIZATION;
SELECT 1 / ((SELECT count(DISTINCT organization_id) FROM product_analytics_events_recent WHERE page_key='__e1_capability_proof__' OR push_tracking_id IN ('80410000-0000-4000-8000-00000000005a','80410000-0000-4000-8000-00000000005b'))=2)::int;
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
  WHERE p.oid='app.record_current_patient_push_open(timestamptz,text,uuid)'::regprocedure
    AND acl.grantee NOT IN (p.proowner,(SELECT oid FROM pg_roles WHERE rolname='app_patient'))
))::int;
`;

const overlayPath = resolve("deploy/postgres/e1-webapp-runtime-config.sql");
const overlay = readFileSync(overlayPath, "utf8").replace(
  /^\\ir\s+(.+)$/gm,
  (_, relativePath) => readFileSync(resolve(dirname(overlayPath), relativePath.trim()), "utf8"),
);
const sql = String.raw`\set e1_webapp_runtime_role app_staff
BEGIN;
${overlay}
GRANT EXECUTE ON FUNCTION app.record_current_patient_push_open(timestamptz,text,uuid) TO app_staff WITH GRANT OPTION;
${overlay}
${fixture}
${proof}
ROLLBACK;
`;

const result = spawnSync("sudo", [
  "-n", "-u", "postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1",
  "-d", db,
], { encoding: "utf8", input: sql });
if (result.status !== 0) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  throw new Error(`E1 capability rehearsal failed: ${result.status}`);
}
console.log("E1 patient runtime capabilities PostgreSQL rehearsal: PASS");
