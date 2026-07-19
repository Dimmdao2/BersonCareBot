import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDbOperationalOrganizationContextToConnection,
  clearDbOperationalOrganizationContextFromConnection,
  resetDbOperationalRuntimeRole,
  setDbOperationalRuntimeRole,
} from "../dist/index.js";

test("sets each supported operational runtime role with fixed SQL", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
    },
  };

  for (const role of [
    "app_operational_diagnostic",
    "app_operational_delivery_worker",
    "app_operational_media_worker",
    "app_operational_scheduler",
    "app_operational_web_push_reminder",
    "app_config_reader",
  ]) {
    await setDbOperationalRuntimeRole(client, role);
  }

  assert.deepEqual(queries, [
    "SET ROLE app_operational_diagnostic",
    "SET ROLE app_operational_delivery_worker",
    "SET ROLE app_operational_media_worker",
    "SET ROLE app_operational_scheduler",
    "SET ROLE app_operational_web_push_reminder",
    "SET ROLE app_config_reader",
  ]);
});

test("installs and clears legacy operational organization context without changing role", async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push([sql, values]);
    },
  };
  await applyDbOperationalOrganizationContextToConnection(
    client,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  await clearDbOperationalOrganizationContextFromConnection(client);
  assert.deepEqual(queries, [
    ["SELECT set_config('app.org', $1, false)", ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]],
    ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
    ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
    ["SELECT set_config('app.org', $1, false)", [""]],
    ["SELECT set_config('app.patient_user_id', $1, false)", [""]],
    ["SELECT set_config('app.integrator_user_id', $1, false)", [""]],
  ]);
});

test("clears a missing locked operational organization context through the protected helper", async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); } };
  const options = { mode: "locked", signer: { secret: "unit-test-secret" } };
  await applyDbOperationalOrganizationContextToConnection(client, undefined, options);
  await clearDbOperationalOrganizationContextFromConnection(client, options);
  assert.deepEqual(queries, [
    "SELECT app.release_principal_context()",
    "SELECT app.release_principal_context()",
  ]);
});

test("rejects an unsupported role before querying", async () => {
  let queried = false;
  const client = {
    async query() {
      queried = true;
    },
  };

  await assert.rejects(
    setDbOperationalRuntimeRole(client, "app_owner"),
    /Unsupported DB operational runtime role/,
  );
  assert.equal(queried, false);
});

test("resets an operational runtime role with fixed SQL", async () => {
  const queries = [];
  await resetDbOperationalRuntimeRole({
    async query(sql) {
      queries.push(sql);
    },
  });
  assert.deepEqual(queries, ["RESET ROLE"]);
});
