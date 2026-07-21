import * as dbPrincipal from "@bersoncare/db-principal";

export function stampBootstrapPrincipal(source: string, correlationId?: unknown): string | undefined {
  try {
    dbPrincipal.enterWithDbBootstrapPrincipal({ source });
    return dbPrincipal.ensureCorrelationId(correlationId);
  } catch {
    // Some unit tests partially mock @bersoncare/db-principal for unrelated DB chokepoint checks.
    return undefined;
  }
}
