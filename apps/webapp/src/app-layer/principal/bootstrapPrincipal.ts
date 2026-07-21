import * as dbPrincipal from "@bersoncare/db-principal";

/**
 * Establishes the bootstrap principal and adopts only the standard correlation header that the
 * webapp proxy already normalized. Legacy/free-form headers are never read at route level.
 */
export function stampBootstrapPrincipal(source: string, request?: Request): string | undefined {
  try {
    dbPrincipal.enterWithDbBootstrapPrincipal({ source });
    return dbPrincipal.enterWithCorrelationId(
      request?.headers.get(dbPrincipal.BC_CORRELATION_ID_HEADER),
    );
  } catch {
    // Some unit tests partially mock @bersoncare/db-principal for unrelated DB chokepoint checks.
    return undefined;
  }
}
