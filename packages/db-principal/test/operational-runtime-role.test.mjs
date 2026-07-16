import assert from "node:assert/strict";
import test from "node:test";

import { resetDbOperationalRuntimeRole, setDbOperationalRuntimeRole } from "../dist/index.js";

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
  ]) {
    await setDbOperationalRuntimeRole(client, role);
  }

  assert.deepEqual(queries, [
    "SET ROLE app_operational_diagnostic",
    "SET ROLE app_operational_delivery_worker",
    "SET ROLE app_operational_media_worker",
    "SET ROLE app_operational_scheduler",
    "SET ROLE app_operational_web_push_reminder",
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
