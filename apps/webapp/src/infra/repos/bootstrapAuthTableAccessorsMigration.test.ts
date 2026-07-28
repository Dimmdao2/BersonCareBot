import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  repoDir,
  "../../../db/drizzle-migrations/0258_bootstrap_auth_table_accessors.sql",
);
const journalPath = join(repoDir, "../../../db/drizzle-migrations/meta/_journal.json");
const deployPath = join(repoDir, "../../../../../deploy/host/deploy-test-saas.sh");
const bootstrapGrantsPath = join(
  repoDir,
  "../../../../../deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql",
);
const inviteOwnershipPath = join(
  repoDir,
  "../../../../../deploy/postgres/organization-member-invites-rls.sql",
);

type AccessorContract = {
  name: string;
  signature: string;
  predicates: string[];
};

const ACCESSORS: AccessorContract[] = [
  { name: "auth_user_pin_read", signature: "auth_user_pin_read(uuid)", predicates: ["pin.user_id = p_user_id"] },
  {
    name: "auth_user_pin_upsert",
    signature: "auth_user_pin_upsert(uuid, text)",
    predicates: ["WHERE pin.user_id = p_user_id", "attempts_failed = 0", "locked_until = NULL"],
  },
  {
    name: "auth_user_pin_increment_failed",
    signature: "auth_user_pin_increment_failed(uuid)",
    predicates: ["pin.user_id = p_user_id", "pin.attempts_failed + 1 >= 5", "make_interval(mins => 15)"],
  },
  {
    name: "auth_user_pin_reset_attempts",
    signature: "auth_user_pin_reset_attempts(uuid)",
    predicates: ["pin.user_id = p_user_id", "attempts_failed = 0", "locked_until = NULL"],
  },
  {
    name: "auth_channel_link_replace_secret",
    signature: "auth_channel_link_replace_secret(uuid, text, text, timestamptz)",
    predicates: [
      "secret.user_id = p_user_id",
      "secret.channel_code = p_channel_code",
      "p_token_hash !~ '^[0-9a-f]{64}$'",
      "interval '15 minutes'",
    ],
  },
  {
    name: "auth_channel_link_read_secret",
    signature: "auth_channel_link_read_secret(text, text)",
    predicates: ["secret.channel_code = p_channel_code", "secret.token_hash = p_token_hash"],
  },
  {
    name: "auth_channel_link_mark_secret_used",
    signature: "auth_channel_link_mark_secret_used(uuid)",
    predicates: ["secret.id = p_secret_id"],
  },
  {
    name: "auth_channel_link_lock_unused_secret",
    signature: "auth_channel_link_lock_unused_secret(uuid)",
    predicates: ["secret.id = p_secret_id", "secret.used_at IS NULL", "FOR UPDATE"],
  },
  {
    name: "auth_channel_link_mark_secret_used_if_unused",
    signature: "auth_channel_link_mark_secret_used_if_unused(uuid)",
    predicates: ["secret.id = p_secret_id", "secret.used_at IS NULL"],
  },
  {
    name: "auth_email_setup_revoke_active",
    signature: "auth_email_setup_revoke_active(uuid, text)",
    predicates: ["token.user_id = p_user_id", "token.email_normalized = p_email_normalized"],
  },
  {
    name: "auth_email_setup_insert",
    signature: "auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid)",
    predicates: ["p_token_hash !~ '^[0-9a-f]{64}$'", "interval '25 hours'", "p_source NOT IN"],
  },
  {
    name: "auth_email_setup_delete",
    signature: "auth_email_setup_delete(uuid)",
    predicates: ["token.id = p_token_id"],
  },
  {
    name: "auth_email_setup_read",
    signature: "auth_email_setup_read(text)",
    predicates: ["token.token_hash = p_token_hash"],
  },
  {
    name: "auth_email_setup_mark_used",
    signature: "auth_email_setup_mark_used(uuid)",
    predicates: [
      "token.id = p_token_id",
      "token.used_at IS NULL",
      "token.revoked_at IS NULL",
      "token.expires_at >= statement_timestamp()",
    ],
  },
  {
    name: "auth_oauth_list_user_providers",
    signature: "auth_oauth_list_user_providers(uuid)",
    predicates: ["binding.user_id = p_user_id", "binding.provider IN ('google', 'apple', 'yandex')"],
  },
  {
    name: "auth_oauth_find_user",
    signature: "auth_oauth_find_user(text, text)",
    predicates: ["binding.provider = p_provider", "binding.provider_user_id = p_provider_user_id"],
  },
  {
    name: "auth_oauth_upsert_binding",
    signature: "auth_oauth_upsert_binding(uuid, text, text, text)",
    predicates: [
      "ON CONFLICT (provider, provider_user_id) DO NOTHING",
      "binding.provider = p_provider",
      "binding.provider_user_id = p_provider_user_id",
    ],
  },
  {
    name: "auth_login_token_create",
    signature: "auth_login_token_create(text, uuid, text, timestamptz)",
    predicates: ["p_token_hash !~ '^[0-9a-f]{64}$'", "p_method NOT IN ('telegram', 'max')", "interval '15 minutes'"],
  },
  {
    name: "auth_login_token_read",
    signature: "auth_login_token_read(text)",
    predicates: ["token.token_hash = p_token_hash"],
  },
  {
    name: "auth_login_token_expire_past",
    signature: "auth_login_token_expire_past()",
    predicates: ["token.status = 'pending'", "token.expires_at < statement_timestamp()"],
  },
  {
    name: "auth_login_token_confirm",
    signature: "auth_login_token_confirm(text)",
    predicates: [
      "token.token_hash = p_token_hash",
      "token.status = 'pending'",
      "token.expires_at >= statement_timestamp()",
    ],
  },
  {
    name: "auth_login_token_mark_session_issued",
    signature: "auth_login_token_mark_session_issued(text)",
    predicates: [
      "token.token_hash = p_token_hash",
      "token.status = 'confirmed'",
      "token.session_issued_at IS NULL",
    ],
  },
];

const TARGET_TABLES = [
  "user_pins",
  "channel_link_secrets",
  "user_email_setup_tokens",
  "user_oauth_bindings",
  "login_tokens",
] as const;

function functionStatement(migration: string, name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION app.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  const bodyEnd = migration.indexOf("$function$", bodyStart + "$function$".length);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return migration.slice(start, bodyEnd + "$function$".length);
}

function markedBlock(source: string, marker: string, nextMarker: string): string {
  const start = source.indexOf(marker);
  const end = source.indexOf(nextMarker, start + marker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("0258 bootstrap auth table accessors", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const grants = readFileSync(bootstrapGrantsPath, "utf8");
  const downGrantBlock = markedBlock(
    grants,
    "-- 0258 bootstrap auth tables:",
    "REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown",
  );
  const upGrantBlock = markedBlock(
    grants,
    "-- 0258: all listed auth routes",
    "GRANT EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown",
  );

  it("registers migration 0258 immediately after applied 0257", () => {
    const journal = readFileSync(journalPath, "utf8");
    expect(journal).toContain('"idx": 258');
    expect(journal).toContain('"version": "7"');
    expect(journal).toContain('"when": 1793539200055');
    expect(journal).toContain('"tag": "0258_bootstrap_auth_table_accessors"');
    expect(journal).toContain('"breakpoints": true');
  });

  it.each(ACCESSORS)(
    "$signature is an app_owner definer with exact predicates and exact bootstrap grant wiring",
    ({ name, signature, predicates }) => {
      const fn = functionStatement(migration, name);
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = pg_catalog");
      for (const predicate of predicates) expect(fn).toContain(predicate);

      expect(migration).toContain(`ALTER FUNCTION app.${signature} OWNER TO app_owner;`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION app.${signature} FROM PUBLIC;`);
      expect(migration).not.toContain(`GRANT EXECUTE ON FUNCTION app.${signature} TO app_patient;`);

      expect(downGrantBlock).toContain(`('app.${signature}')`);
      expect(upGrantBlock).toContain(`('app.${signature}')`);
      expect(downGrantBlock).toContain(":'d3_4_bootstrap_base_role'");
      expect(upGrantBlock).toContain(":'d3_4_bootstrap_base_role'");
      expect(downGrantBlock).toContain("'REVOKE EXECUTE ON FUNCTION %s FROM %I'");
      expect(upGrantBlock).toContain("'GRANT EXECUTE ON FUNCTION %s TO %I'");
    },
  );

  it("keeps all five auth tables denied to the bootstrap login and app_patient", () => {
    const runtimeSources = `${migration}\n${grants}`;
    const grantStatements = runtimeSources
      .split(";")
      .filter((statement) => /\bGRANT\b/i.test(statement) && /\bON TABLE\b/i.test(statement));
    for (const table of TARGET_TABLES) {
      expect(
        grantStatements.filter(
          (statement) =>
            new RegExp(`\\b(?:public\\.)?${table}\\b`, "i").test(statement) &&
            /(?:app_patient|d3_4_bootstrap_base_role)/i.test(statement),
        ),
      ).toEqual(
        [],
      );
    }
  });

  it("pins 22 new definers and every newly required app_owner table privilege", () => {
    expect(migration.match(/OWNER TO app_owner;/g)).toHaveLength(22);
    expect(migration.match(/REVOKE ALL ON FUNCTION app\.auth_/g)).toHaveLength(22);

    const deploy = readFileSync(deployPath, "utf8");
    expect(deploy).toContain("83 -> 105 (2026-07-27, taskdb #1062)");
    // 106 -> 107: 0267 adds the staff-name directory accessor, 0268 adds the delivery-audit
    // writer, and 0269 removes the superseded signup-slug reservation function.
    expect(deploy).toContain("local expected_secdef_count=110");
    for (const row of [
      "('public.user_pins', 'SELECT')",
      "('public.user_pins', 'INSERT')",
      "('public.user_pins', 'UPDATE')",
      "('public.channel_link_secrets', 'SELECT')",
      "('public.channel_link_secrets', 'INSERT')",
      "('public.channel_link_secrets', 'UPDATE')",
      "('public.channel_link_secrets', 'DELETE')",
      "('public.user_email_setup_tokens', 'SELECT')",
      "('public.user_email_setup_tokens', 'INSERT')",
      "('public.user_email_setup_tokens', 'UPDATE')",
      "('public.user_email_setup_tokens', 'DELETE')",
      "('public.user_oauth_bindings', 'SELECT')",
      "('public.user_oauth_bindings', 'INSERT')",
      "('public.login_tokens', 'SELECT')",
      "('public.login_tokens', 'INSERT')",
      "('public.login_tokens', 'UPDATE')",
    ]) {
      expect(deploy).toContain(row);
    }
  });

  it("routes every target repository operation through app accessors", () => {
    const repositories = new Map<string, string[]>([
      ["pgUserPins.ts", ["auth_user_pin_read", "auth_user_pin_upsert", "auth_user_pin_increment_failed", "auth_user_pin_reset_attempts"]],
      [
        "pgChannelLinkStart.ts",
        [
          "auth_channel_link_replace_secret",
          "auth_channel_link_read_secret",
          "auth_channel_link_mark_secret_used",
          "auth_channel_link_mark_secret_used_if_unused",
        ],
      ],
      [
        "pgChannelLinkClaim.ts",
        [
          "auth_oauth_list_user_providers",
          "auth_channel_link_lock_unused_secret",
          "auth_channel_link_mark_secret_used_if_unused",
        ],
      ],
      [
        "pgEmailSetupTokens.ts",
        [
          "auth_email_setup_revoke_active",
          "auth_email_setup_insert",
          "auth_email_setup_delete",
          "auth_email_setup_read",
          "auth_email_setup_mark_used",
        ],
      ],
      ["pgEmailSetupFlowPort.ts", ["auth_email_setup_mark_used"]],
      ["pgOAuthBindings.ts", ["auth_oauth_list_user_providers", "auth_oauth_find_user"]],
      ["pgOAuthUserResolve.ts", ["auth_oauth_upsert_binding"]],
      [
        "pgLoginTokens.ts",
        [
          "auth_login_token_create",
          "auth_login_token_read",
          "auth_login_token_expire_past",
          "auth_login_token_confirm",
          "auth_login_token_mark_session_issued",
        ],
      ],
    ]);

    for (const [file, accessorNames] of repositories) {
      const source = readFileSync(join(repoDir, file), "utf8");
      for (const accessorName of accessorNames) expect(source).toContain(`app.${accessorName}`);
      expect(source).not.toMatch(
        /\b(?:FROM|INTO|UPDATE|DELETE FROM)\s+(?:public\.)?(?:user_pins|channel_link_secrets|user_email_setup_tokens|user_oauth_bindings|login_tokens)\b/i,
      );
    }
  });

  it("does not enter the deploy re-ownership trap", () => {
    const ownershipOverlay = readFileSync(inviteOwnershipPath, "utf8");
    for (const { name } of ACCESSORS) expect(ownershipOverlay).not.toContain(name);
  });
});
