import { z } from "zod";
import { stampBootstrapPrincipal } from "@/app-layer/principal/bootstrapPrincipal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getSpecialistSignupEnabled } from "@/modules/auth/specialistSignupRollout";
import { jsonError, jsonOk } from "@/shared/http/apiResponse";

const bodySchema = z.object({
  slug: z.string().max(512),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal("api/auth/specialist-signup/slug:POST", request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("invalid_body", {}, { status: 400 });
  }
  if (!(await getSpecialistSignupEnabled())) {
    return jsonError("specialist_signup_disabled", {}, { status: 423 });
  }

  const service = buildAppDeps().clinicDirectory;
  if (!service) {
    return jsonError("directory_unavailable", {}, { status: 503 });
  }
  const result = await service.checkSlugAvailability(parsed.data.slug);
  if (!result.ok) {
    return jsonError(result.code, {}, { status: result.code === "slug_unavailable" ? 409 : 400 });
  }
  return jsonOk({ slug: result.slug, available: true });
}
