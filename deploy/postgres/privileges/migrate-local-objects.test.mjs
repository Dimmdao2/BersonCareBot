import assert from 'node:assert/strict';
import test from 'node:test';

import { functionsPromisedByLedger, parseFunctionStatements } from './migrate-local-objects.mjs';

function migration(when, tag, source) {
  return { when, tag, source };
}

test('a created function is promised under the identity regprocedure prints', () => {
  const statements = parseFunctionStatements(
    `-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
     CREATE OR REPLACE FUNCTION app.enroll_current_patient_in_public_booking_clinic(
       p_organization_id uuid,
       p_confirmation_channel text
     ) RETURNS jsonb LANGUAGE plpgsql AS $function$ BEGIN RETURN '{}'::jsonb; END; $function$;`,
    '0053_probe',
  );

  assert.deepEqual(statements, [
    { kind: 'create', identity: 'app.enroll_current_patient_in_public_booking_clinic(uuid,text)' },
  ]);
});

test('argument defaults, modes and multi-word types do not disturb the identity', () => {
  const statements = parseFunctionStatements(
    `CREATE FUNCTION app.probe(
       p_payload_json text DEFAULT '{}',
       p_now timestamp with time zone,
       p_roles name[],
       VARIADIC p_rest text[],
       OUT o_result text
     ) RETURNS record LANGUAGE sql AS $$ SELECT NULL::text $$;
     CREATE FUNCTION app.unnamed(timestamp with time zone, uuid) RETURNS void LANGUAGE sql AS $$ $$;`,
    '0001_probe',
  );

  assert.deepEqual(statements.map((statement) => statement.identity), [
    'app.probe(text,timestamp with time zone,name[],text[])',
    'app.unnamed(timestamp with time zone,uuid)',
  ]);
});

test('a drop inside the same migration retires exactly the signature it names', () => {
  const promised = functionsPromisedByLedger(
    [
      migration(10, '0051_creates', 'CREATE FUNCTION app.door(p_organization_id uuid) RETURNS void LANGUAGE sql AS $$ $$;'),
      migration(
        20,
        '0052_replaces',
        `DROP FUNCTION IF EXISTS app.door(uuid);
         CREATE FUNCTION app.door(p_organization_id uuid, p_channel text) RETURNS void LANGUAGE sql AS $$ $$;`,
      ),
    ],
    new Set([10, 20]),
  );

  assert.deepEqual([...promised.entries()], [['app.door(uuid,text)', '0052_replaces']]);
});

test('the newest applied creator owns the promise, whatever order the journal is read in', () => {
  const promised = functionsPromisedByLedger(
    [
      migration(20, '0053_recreates', 'CREATE OR REPLACE FUNCTION app.door(p_id uuid) RETURNS void LANGUAGE sql AS $$ $$;'),
      migration(10, '0051_creates', 'CREATE OR REPLACE FUNCTION app.door(p_id uuid) RETURNS void LANGUAGE sql AS $$ $$;'),
    ],
    new Set([10, 20]),
  );

  assert.deepEqual([...promised.entries()], [['app.door(uuid)', '0053_recreates']]);
});

test('a pending migration promises nothing and retires nothing', () => {
  const migrations = [
    migration(10, '0051_creates', 'CREATE FUNCTION app.door(p_id uuid) RETURNS void LANGUAGE sql AS $$ $$;'),
    migration(20, '0052_drops', 'DROP FUNCTION IF EXISTS app.door(uuid);'),
    migration(30, '0053_creates', 'CREATE FUNCTION app.later(p_id uuid) RETURNS void LANGUAGE sql AS $$ $$;'),
  ];

  const promised = functionsPromisedByLedger(migrations, new Set([10]));

  // 0052 has not dropped anything yet, so the door is still owed; 0053 has not created anything.
  assert.deepEqual([...promised.keys()], ['app.door(uuid)']);
});

test('a function name inside a comment or a body string is not a promise', () => {
  const statements = parseFunctionStatements(
    `-- CREATE FUNCTION app.commented_out(p_id uuid) RETURNS void
     CREATE FUNCTION app.real(p_id uuid) RETURNS void LANGUAGE plpgsql AS $function$
     BEGIN
       RAISE NOTICE 'see app.real(uuid)';
     END;
     $function$;`,
    '0001_probe',
  );

  assert.deepEqual(statements, [{ kind: 'create', identity: 'app.real(uuid)' }]);
});
