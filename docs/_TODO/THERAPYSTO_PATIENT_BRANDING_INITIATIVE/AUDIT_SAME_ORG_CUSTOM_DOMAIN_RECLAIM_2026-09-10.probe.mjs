// One-time audit evidence for #787; not registered in CI or the permanent test suite.
// Oracle and TEST/VIEW classification: AUDIT_SAME_ORG_CUSTOM_DOMAIN_RECLAIM_2026-09-10.md.
// Run from the exact candidate checkout; every SQL transaction ends in ROLLBACK.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = process.cwd();
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), '21da71e0509ce0b96f0018cad5aee593726ba759', 'probe is pinned to the audited product candidate');
const migration = readFileSync(resolve(root, 'apps/webapp/db/drizzle-migrations/20260910T023451_allow_same_org_custom_domain_reclaim.sql'), 'utf8');
const generated = readFileSync(resolve(root, 'deploy/postgres/generated/privileges.bcb_webapp_dev.sql'), 'utf8');
const tableStart = generated.indexOf('-- ── public.org_custom_domain_bindings ');
const tableEnd = generated.indexOf('-- ── ', tableStart + 10);
const tableAcl = generated.slice(tableStart, tableEnd);
const doorAcl = generated.split('\n').filter(line => /^(ALTER FUNCTION|REVOKE ALL ON FUNCTION|GRANT EXECUTE ON FUNCTION) app\.save_custom_domain_binding_intent\(/.test(line)).join('\n');
const ownerAccess = execFileSync(process.execPath, ['deploy/postgres/privileges/generate-cli.mjs', '--db', 'bcb_webapp_dev', '--migration-owner-access', '--migration-owners', 'app_seam_custom_domain_owner'], {encoding:'utf8'});
const setup = `
CREATE TEMP TABLE probe_ids AS SELECT organization_id AS a, platform_user_id AS actor, gen_random_uuid() AS b FROM public.be_organization_members WHERE status='active' LIMIT 1;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM probe_ids) THEN RAISE EXCEPTION 'active DEV membership required'; END IF; END $$;
UPDATE public.org_custom_domain_bindings SET status='quarantine' WHERE organization_id=(SELECT a FROM probe_ids);
INSERT INTO app_ext.variant_a_identity_refs(physical_user_id,opaque_ref,ref_kind) SELECT actor,gen_random_uuid(),'actor' FROM probe_ids ON CONFLICT DO NOTHING;
CREATE TEMP TABLE probe_out(k text, v jsonb);
CREATE FUNCTION pg_temp.accept_intent(org uuid, act text, argorg uuid, base text, placement text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
 DELETE FROM app_ext.accepted_port_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 INSERT INTO app_ext.accepted_port_contexts(database_oid,backend_pid,transaction_id,capability_id,session_login,port,target_role,context_class,purpose,function_identity,typed_args_hash,actor_ref,organization_id)
 SELECT d.oid,pg_backend_pid(),pg_current_xact_id(),c.capability_id,session_user,'webapp','app_staff','staff','branding.custom-domain.intent.save','app.save_custom_domain_binding_intent(text,uuid,text,text)'::regprocedure,
 app.hash_port_typed_args(ARRAY[ROW('text@1',textsend(act))::app.port_typed_arg,ROW('uuid@1',uuid_send(argorg))::app.port_typed_arg,ROW('text@1',textsend(base))::app.port_typed_arg,ROW('text@1',textsend(placement))::app.port_typed_arg]),(SELECT opaque_ref FROM app_ext.variant_a_identity_refs WHERE physical_user_id=p.actor AND ref_kind='actor'),org
 FROM pg_database d,app_ext.port_context_capabilities c,probe_ids p WHERE d.datname=current_database() AND c.target_role='app_staff' LIMIT 1;
END $f$;
CREATE FUNCTION pg_temp.intent(org uuid,act text,base text,placement text DEFAULT 'apex') RETURNS jsonb LANGUAGE plpgsql AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM pg_temp.accept_intent(org,act,org,base,placement);
 SET LOCAL ROLE app_staff;
 result:=app.save_custom_domain_binding_intent(act,org,base,placement);
 RESET ROLE;
 RETURN result;
END $f$;
`;
const body = `
DO $probe$
DECLARE a uuid; b uuid; r jsonb; saved uuid; oldrow jsonb; good boolean;
BEGIN
 SELECT p.a,p.b INTO a,b FROM probe_ids p;
 -- B is a distinct accepted organization UUID; no persistent/synthetic organization is needed.
 -- The intent door consumes accepted organization identity, not the membership/login handshake.
 r:=pg_temp.intent(a,'set','reclaim-audit.example.test');
 IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'initial claim failed: %',r; END IF;
 SELECT id INTO saved FROM public.org_custom_domain_bindings WHERE hostname='reclaim-audit.example.test';
 PERFORM pg_temp.intent(a,'clear',NULL,NULL);
 UPDATE public.org_custom_domain_bindings SET status_reason='old proof',activated_at='2020-01-01' WHERE id=saved;
 r:=pg_temp.intent(a,'set','RECLAIM-AUDIT.EXAMPLE.TEST');
 INSERT INTO probe_out VALUES ('K1',to_jsonb(r->>'ok'='true' AND r#>>'{state,status}'='pending' AND (SELECT id=saved AND organization_id=a FROM public.org_custom_domain_bindings WHERE hostname='reclaim-audit.example.test')));
 INSERT INTO probe_out VALUES ('K7',to_jsonb(r#>>'{state,status}'='pending' AND r#>>'{state,statusReason}' IS NULL AND r#>>'{state,activatedAt}' IS NULL));
 PERFORM pg_temp.intent(a,'clear',NULL,NULL);
 SELECT to_jsonb(x) INTO oldrow FROM public.org_custom_domain_bindings x WHERE id=saved;
 r:=pg_temp.intent(b,'set','reclaim-audit.example.test');
 INSERT INTO probe_out VALUES ('K2',to_jsonb(r->>'code'='hostname_taken' AND (SELECT to_jsonb(x)=oldrow FROM public.org_custom_domain_bindings x WHERE id=saved)));
 PERFORM pg_temp.intent(a,'set','second-reclaim-audit.example.test','subdomain');
 r:=pg_temp.intent(a,'set','reclaim-audit.example.test');
 INSERT INTO probe_out VALUES ('K3',to_jsonb(r#>>'{state,status}'='pending' AND (SELECT count(*)=1 FROM public.org_custom_domain_bindings WHERE organization_id=a AND status<>'quarantine') AND (SELECT status='quarantine' FROM public.org_custom_domain_bindings WHERE hostname='app.second-reclaim-audit.example.test')));
 INSERT INTO public.org_custom_domain_bindings(organization_id,base_domain,hostname,status) VALUES(NULL,'orphan-reclaim-audit.example.test','orphan-reclaim-audit.example.test','quarantine');
 r:=pg_temp.intent(a,'set','orphan-reclaim-audit.example.test');
 INSERT INTO probe_out VALUES ('K4',to_jsonb(r->>'code'='hostname_taken' AND (SELECT organization_id IS NULL AND status='quarantine' FROM public.org_custom_domain_bindings WHERE hostname='orphan-reclaim-audit.example.test') AND (SELECT status='pending' FROM public.org_custom_domain_bindings WHERE id=saved)));
 -- Accepted arguments must still match at the SQL boundary.
 PERFORM pg_temp.accept_intent(a,'set',a,'expected-reclaim-audit.example.test','apex');
 good:=false;
 BEGIN
  SET LOCAL ROLE app_staff;
  PERFORM app.save_custom_domain_binding_intent('set',a,'spoof-reclaim-audit.example.test','apex');
 EXCEPTION WHEN insufficient_privilege THEN good:=true;
 END;
 RESET ROLE;
 INSERT INTO probe_out VALUES ('K5-context',to_jsonb(good));
 PERFORM pg_temp.accept_intent(a,'set',b,'spoof-org-reclaim-audit.example.test','apex');
 good:=false;
 BEGIN
  SET LOCAL ROLE app_staff;
  PERFORM app.save_custom_domain_binding_intent('set',b,'spoof-org-reclaim-audit.example.test','apex');
 EXCEPTION WHEN insufficient_privilege THEN good:=true;
 END;
 RESET ROLE;
 INSERT INTO probe_out VALUES ('K5-org',to_jsonb(good));
 DELETE FROM app_ext.accepted_port_contexts WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 good:=false;
 BEGIN
  SET LOCAL ROLE app_staff;
  PERFORM app.save_custom_domain_binding_intent('set',a,'no-context-reclaim-audit.example.test','apex');
 EXCEPTION WHEN insufficient_privilege THEN good:=true;
 END;
 RESET ROLE;
 INSERT INTO probe_out VALUES ('K5-no-context',to_jsonb(good));
 INSERT INTO probe_out VALUES ('K5-acl',to_jsonb(NOT has_any_column_privilege('app_staff','public.org_custom_domain_bindings','INSERT') AND NOT has_any_column_privilege('app_staff','public.org_custom_domain_bindings','UPDATE')));
 INSERT INTO probe_out VALUES ('K6-owner',to_jsonb(NOT has_column_privilege('app_seam_custom_domain_owner','public.org_custom_domain_bindings','organization_id','UPDATE')));
 good:=false;
 BEGIN
  INSERT INTO public.org_custom_domain_bindings(organization_id,base_domain,hostname,status) VALUES(NULL,'reclaim-audit.example.test','reclaim-audit.example.test','quarantine');
 EXCEPTION WHEN unique_violation THEN good:=true;
 END;
 INSERT INTO probe_out VALUES ('K6-unique',to_jsonb(good));
 good:=false;
 BEGIN
  INSERT INTO public.org_custom_domain_bindings(organization_id,base_domain,hostname,status) VALUES(a,'duplicate-live-reclaim-audit.example.test','duplicate-live-reclaim-audit.example.test','pending');
 EXCEPTION WHEN unique_violation THEN good:=true;
 END;
 INSERT INTO probe_out VALUES ('K6-live',to_jsonb(good));
END $probe$;
SELECT k||'='||v::text FROM probe_out ORDER BY k;
`;
const mutations = {
 baseline: migration,
 'K2-owner': migration.replace('v_reclaim.organization_id IS DISTINCT FROM v_organization_id','false'),
 'K4-null': migration.replace('v_reclaim.organization_id IS DISTINCT FROM v_organization_id','v_reclaim.organization_id <> v_organization_id'),
 'K5-context': migration.replace(/  PERFORM app.require_accepted_context\([\s\S]*?\n  \);/,''),
 'K5-org': migration.replace('p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_organization_id','false'),
 'K7-activation': migration.replace("             status = 'pending',", "             status = 'active',"),
};
for(const [name,source] of Object.entries(mutations)) {
 const sql=`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s';\n${ownerAccess}\nSET LOCAL ROLE app_seam_custom_domain_owner;\n${source}\n${source}\nRESET ROLE;\n${doorAcl}\n${tableAcl}\n${setup}\n${body}\nROLLBACK;`;
 const r=spawnSync('sudo',['-n','-u','postgres','psql','-X','-A','-t','-q','-h','/var/run/postgresql','-p','5432','-d','bcb_webapp_dev','-v','ON_ERROR_STOP=1','-f','-'],{input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
 console.log(name, 'exit='+r.status, r.stdout.trim());
 if(r.status!==0) {console.error(r.stderr);process.exit(1);}
 const values=Object.fromEntries(r.stdout.trim().split('\n').map(line=>line.split('=')));
 if(name==='baseline') {
   assert.ok(Object.values(values).every(v=>v==='true'), 'baseline required consequence failed');
 } else {
   const oracle = {'K2-owner':'K2','K4-null':'K4','K5-context':'K5-context','K5-org':'K5-org','K7-activation':'K7'}[name];
   assert.equal(values[oracle], 'false', `injected ${name} escaped ${oracle}`);
   console.log(`CAUGHT ${name} -> ${oracle}=false`);
 }
}
