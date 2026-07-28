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
const platformNavigation = readFileSync(
  new URL("../../shared/ui/doctor/platformNavLinks.ts", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("./pgSupportCommunication.ts", import.meta.url),
  "utf8",
);

describe("platform support conversation isolation", () => {
  it("revokes the platform role from the patient-to-clinic communication tables", () => {
    expect(migration).toContain("public.support_conversations");
    expect(migration).toContain("public.support_conversation_messages");
    expect(migration).toContain("FROM app_platform_settings");
    expect(migration).toContain("REVOKE ALL PRIVILEGES");
    expect(migration).not.toContain("FOR SELECT TO app_platform_settings");
  });

  it("rehydrates the same deny boundary after a no-ACL TEST restore", () => {
    expect(overlay).toContain("$c5a_platform_support_isolation$");
    expect(overlay).toContain("REVOKE ALL PRIVILEGES");
    expect(overlay).toContain(
      "support_conversations_platform_operations_select",
    );
    expect(overlay).toContain(
      "support_conversation_messages_platform_operations_select",
    );
  });

  it("keeps the historical migration slot registered", () => {
    expect(journal).toContain(
      '"tag": "0265_platform_support_conversations_read"',
    );
  });

  it("does not expose the mixed communication store through platform code or navigation", () => {
    expect(repository).not.toContain("listPlatformSupportConversations");
    expect(repository).not.toContain("getPlatformSupportConversation");
    expect(platformNavigation).not.toContain('id: "support"');
    expect(platformNavigation).not.toContain('href: "/app/admin/support"');
  });
});
