import * as dbPrincipal from "@bersoncare/db-principal";

export function stampBootstrapPrincipal(source: string): void {
  try {
    dbPrincipal.enterWithDbBootstrapPrincipal({ source });
  } catch {
    // Some unit tests partially mock @bersoncare/db-principal for unrelated DB chokepoint checks.
  }
}
