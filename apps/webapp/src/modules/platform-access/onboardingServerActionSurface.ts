import { headers } from "next/headers";
import { patientServerActionPageAllowsOnboardingOnly, resolvePatientLayoutPathname } from "./patientRouteApiPolicy";

/**
 * Runtime enforcement для onboarding-only server actions (DoD §3 / SPEC §4): вызов разрешён только если
 * pathname запроса попадает в {@link patientServerActionPageAllowsOnboardingOnly}.
 *
 * Источник pathname — тот же, что в patient layout: **`x-bc-pathname`** (middleware для `/app/patient/*`)
 * и fallback по **`referer`** ({@link resolvePatientLayoutPathname}).
 */
export async function patientOnboardingServerActionSurfaceOk(): Promise<boolean> {
  const h = await headers();
  const pathname = resolvePatientLayoutPathname((name) => h.get(name));
  const ok = patientServerActionPageAllowsOnboardingOnly(pathname);
  if (!ok) {
    console.info(
      "[platform_access] onboarding_server_action_rejected resolved_path=%s",
      pathname.trim() ? pathname : "(empty)",
    );
  }
  return ok;
}
