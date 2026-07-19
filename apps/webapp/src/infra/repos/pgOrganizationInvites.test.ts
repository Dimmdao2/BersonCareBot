import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoSource = readFileSync(join(__dirname, "pgOrganizationInvites.ts"), "utf8");
const overlaySource = readFileSync(
  join(__dirname, "../../../../../deploy/postgres/organization-member-invites-rls.sql"),
  "utf8",
);

describe("organization invite PostgreSQL contract", () => {
  it("replaces only a pending same-org email invite inside a transaction", () => {
    const createSource = repoSource.slice(
      repoSource.indexOf("async createReplacingPending"),
      repoSource.indexOf("async listPendingByOrganization"),
    );

    expect(createSource).toContain("runWebappTransaction");
    expect(createSource).toContain("status = 'revoked'");
    expect(createSource).toContain("organization_id = $1");
    expect(createSource).toContain("invited_email = $2");
    expect(createSource).toContain("status = 'pending'");
    expect(createSource).toContain("m.status = 'active'");
  });

  it("keeps accept single-use and creates only the membership in its pre-session transaction", () => {
    const acceptStart = overlaySource.indexOf("CREATE OR REPLACE FUNCTION app.accept_org_invite");
    const acceptEnd = overlaySource.indexOf("COMMENT ON FUNCTION app.accept_org_invite", acceptStart);
    const acceptSource = overlaySource.slice(acceptStart, acceptEnd);

    expect(acceptSource).toContain("FOR UPDATE");
    expect(acceptSource).toContain("IF v_invite.status <> 'pending'");
    expect(acceptSource).toContain("ON CONFLICT (organization_id, platform_user_id)");
    expect(acceptSource).toContain("SET status = 'accepted'");
    expect(acceptSource).toContain("v_specialist_id := NULL");
    expect(acceptSource).not.toContain("INSERT INTO public.be_specialists");
  });
});
