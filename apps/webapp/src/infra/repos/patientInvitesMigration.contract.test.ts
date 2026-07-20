import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webappRoot = resolve(import.meta.dirname, "../../..");
const repoRoot = resolve(webappRoot, "../..");

function readRepo(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

describe("patient invite migration contract", () => {
  const migration = readRepo("apps/webapp/db/drizzle-migrations/0220_patient_portal_invites.sql");
  const schema = readRepo("apps/webapp/db/schema/patientInvites.ts");
  const overlay = readRepo("deploy/postgres/patient-invites-rls.sql");

  it("stores opaque hashes and indexes every hot lookup path", () => {
    expect(migration).toContain("token_hash text NOT NULL");
    expect(migration).toContain("continuation_hash text");
    expect(migration).not.toMatch(/\btoken\s+text\b/);
    expect(migration).toContain("patient_invites_token_hash_key");
    expect(migration).toContain("patient_invites_continuation_hash_key");
    expect(migration).toContain("uq_patient_invites_org_patient_pending");
    expect(migration).toContain("idx_patient_invites_org_patient_status");
    expect(migration).toContain("idx_patient_invites_status_expires");
    expect(migration).toContain("revoked_by_platform_user_id uuid REFERENCES public.platform_users(id)");
    expect(schema).toContain('uniqueIndex("patient_invites_token_hash_key")');
    expect(schema).toContain('index("idx_patient_invites_org_patient_status")');
  });

  it("redeems only the exact invited enrollment and records conflicts without merging", () => {
    expect(migration).toContain("enrollment.id = v_invite.enrollment_id");
    expect(migration).toContain("enrollment.organization_id = v_invite.organization_id");
    expect(migration).toContain("enrollment.platform_user_id = v_invite.patient_user_id");
    expect(migration).toContain("AND enrollment.status = 'invited'");
    expect(migration).toContain("INSERT INTO public.patient_merge_candidates");
    expect(migration).toContain("'invite_redeem_identity_conflict'");
    expect(migration).not.toMatch(/UPDATE\s+public\.platform_users[\s\S]*merged_into_id\s*=/i);
  });

  it("keeps patient table access closed and exposes only narrow SECURITY DEFINER functions", () => {
    expect(overlay).toContain("ALTER TABLE public.patient_invites FORCE ROW LEVEL SECURITY");
    expect(overlay).toContain("REVOKE ALL ON TABLE public.patient_invites FROM app_patient");
    expect(overlay).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*patient_invites[^;]*app_patient/i);
    expect(overlay).toContain("ALTER FUNCTION app.redeem_patient_invite_email(text, uuid, text) OWNER TO app_owner");
    expect(overlay).toContain("GRANT EXECUTE ON FUNCTION app.redeem_patient_invite_email(text, uuid, text) TO app_patient");
    expect(migration.match(/SECURITY DEFINER/g)?.length).toBe(6);
    expect(migration).toContain("REVOKE ALL ON FUNCTION app.exchange_patient_invite");
  });

  it("uses the shared neutral join shell and never creates a patient-specific route tree", () => {
    const exchangeRoute = readRepo("apps/webapp/src/app/api/join/exchange/route.ts");
    const startClient = readRepo("apps/webapp/src/app/join/start/JoinStartClient.tsx");
    const service = readRepo("apps/webapp/src/modules/patient-invites/service.ts");
    expect(startClient).toContain('window.location.hash.slice(1)');
    expect(startClient).toContain('window.history.replaceState(null, "", "/join/start")');
    expect(service).toContain('kind: "patient" as const');
    expect(exchangeRoute).toContain("kind: result.kind");
    expect(exchangeRoute).toContain('redirectTo: `/join/${result.continuation}`');
    expect(exchangeRoute).not.toContain("/join/patient");
  });

  it("derives staff and patient organization scope only from trusted server context", () => {
    const doctorRoute = readRepo("apps/webapp/src/app/api/doctor/patients/[userId]/portal-invite/route.ts");
    const confirmRoute = readRepo("apps/webapp/src/app/api/join/email/confirm/route.ts");
    expect(doctorRoute).toContain("requireDoctorWorkspaceApiContext");
    expect(doctorRoute).toContain("getClientIdentityForOrganization(userId, organizationId)");
    expect(doctorRoute).toContain("withDoctorWorkspacePrincipal");
    expect(doctorRoute).not.toMatch(/bodySchema[\s\S]*organizationId/);
    expect(confirmRoute).toContain("result.organizationId");
    expect(confirmRoute).toContain("PATIENT_ORGANIZATION_PREFERENCE_COOKIE");
    expect(confirmRoute).toContain("setSessionFromUser(user)");
  });
});
