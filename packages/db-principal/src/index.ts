import { AsyncLocalStorage } from "node:async_hooks";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DbPrincipalContext = {
  organizationId: string;
};

type DbPrincipalQueryable = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
};

const principalStorage = new AsyncLocalStorage<DbPrincipalContext>();

export function normalizeDbPrincipalOrganizationId(organizationId: string): string {
  const trimmed = organizationId.trim();
  if (!UUID_RE.test(trimmed)) {
    throw new Error("Invalid DB principal organization id");
  }
  return trimmed.toLowerCase();
}

export function getCurrentDbPrincipalOrganizationId(): string | undefined {
  return principalStorage.getStore()?.organizationId;
}

export function runWithDbOrganizationPrincipal<T>(organizationId: string, fn: () => T): T {
  return principalStorage.run(
    { organizationId: normalizeDbPrincipalOrganizationId(organizationId) },
    fn,
  );
}

export async function applyCurrentDbPrincipalToTransaction(client: DbPrincipalQueryable): Promise<boolean> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) {
    return false;
  }
  await client.query("SELECT set_config('app.org', $1, true)", [organizationId]);
  return true;
}
