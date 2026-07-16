import { resetDbOperationalRuntimeRole, setDbOperationalRuntimeRole } from "../src/index.js";

const client = {
  async query(_sql: string): Promise<void> {},
};

void setDbOperationalRuntimeRole(client, "app_operational_scheduler");
void setDbOperationalRuntimeRole(client, "app_operational_web_push_reminder");
void resetDbOperationalRuntimeRole(client);

// @ts-expect-error Operational roles are a closed union; arbitrary PostgreSQL roles are forbidden.
void setDbOperationalRuntimeRole(client, "app_owner");
