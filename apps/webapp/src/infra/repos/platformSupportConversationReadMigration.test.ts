import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../db/drizzle-migrations/0265_platform_support_conversations_read.sql",
    import.meta.url,
  ),
  "utf8",
);
const overlay = readFileSync(
  new URL(
    "../../../../../deploy/postgres/c5a-platform-operations-runtime.sql",
    import.meta.url,
  ),
  "utf8",
);
const journal = readFileSync(
  new URL("../../../db/drizzle-migrations/meta/_journal.json", import.meta.url),
  "utf8",
);
const platformInbox = readFileSync(
  new URL(
    "../../app/app/admin/support/PlatformSupportInbox.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("platform support read boundary", () => {
  it("grants the platform role SELECT-only access to the two support thread tables", () => {
    expect(migration).toContain("public.support_conversations");
    expect(migration).toContain("public.support_conversation_messages");
    expect(migration).toContain("TO app_platform_settings");
    expect(migration).toContain("FOR SELECT TO app_platform_settings");
    expect(migration).not.toMatch(/GRANT\\s+(?:INSERT|UPDATE|DELETE)/i);
    expect(migration).not.toContain("GRANT SELECT ON TABLE public.platform_users");
  });

  it("rehydrates the same policies after a no-ACL TEST restore", () => {
    expect(overlay).toContain("$c5a_platform_support_read$");
    expect(overlay).toContain(
      "support_conversations_platform_operations_select",
    );
    expect(overlay).toContain(
      "support_conversation_messages_platform_operations_select",
    );
  });

  it("registers the additive migration", () => {
    expect(journal).toContain(
      '"tag": "0265_platform_support_conversations_read"',
    );
  });

  it("keeps the platform card outside clinical patient navigation", () => {
    expect(platformInbox).not.toContain("patientCardHref");
    expect(platformInbox).not.toContain("ChatClientOverviewPanel");
    expect(platformInbox).not.toMatch(/diagnos|treatmentProgram|patientClinical/i);
    expect(platformInbox).not.toContain("<Link");
  });
});
