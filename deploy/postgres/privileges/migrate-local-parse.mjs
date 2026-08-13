/** Parse one Drizzle migration into exact owner-ordered or local-postgres backfill steps. */
export function parseOwnerStatements(source, tag) {
  return source.split('--> statement-breakpoint').map((statement, index) => {
    const backfillMatch = /^\s*--\s*BCB-MIGRATION-BACKFILL\s*(?:\r?\n|$)/u.exec(statement);
    if (backfillMatch) {
      const sql = statement.slice(backfillMatch[0].length).trim();
      if (!sql) throw new Error(`pending migration ${tag} statement ${index + 1} has an empty backfill`);
      return { owner: null, schemaCreate: null, languageUsage: null, sql, backfill: true };
    }
    const match = /^\s*--\s*BCB-MIGRATION-OWNER:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\r?\n|$)/u.exec(statement);
    if (!match?.[1]) {
      throw new Error(
        `pending migration ${tag} statement ${index + 1} has neither BCB-MIGRATION-OWNER nor BCB-MIGRATION-BACKFILL`,
      );
    }
    if (match[1] === 'postgres') {
      throw new Error(`pending migration ${tag} statement ${index + 1} cannot use postgres as a schema owner`);
    }
    let remainder = statement.slice(match[0].length);
    const schemaCreateMatch = /^\s*--\s*BCB-MIGRATION-SCHEMA-CREATE:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\r?\n|$)/u.exec(remainder);
    if (schemaCreateMatch) remainder = remainder.slice(schemaCreateMatch[0].length);
    const languageUsageMatch = /^\s*--\s*BCB-MIGRATION-LANGUAGE-USAGE:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\r?\n|$)/u.exec(remainder);
    if (languageUsageMatch) remainder = remainder.slice(languageUsageMatch[0].length);
    const sql = remainder.trim();
    if (!sql) throw new Error(`pending migration ${tag} statement ${index + 1} is empty`);
    return {
      owner: match[1],
      schemaCreate: schemaCreateMatch?.[1] ?? null,
      languageUsage: languageUsageMatch?.[1] ?? null,
      sql,
      backfill: false,
    };
  });
}

/** The post-state membership assertion is omitted for a valid data-only migration. */
export function renderTemporaryMembershipAssertion(migrator, owners) {
  if (owners.length === 0) return null;
  const quotedRoles = owners.map((owner) => `'${owner.replaceAll("'", "''")}'::regrole`).join(', ');
  return `IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
                WHERE m.member = '${migrator.replaceAll("'", "''")}'::regrole
                  AND m.roleid = ANY (ARRAY[${quotedRoles}])) THEN
       RAISE EXCEPTION 'temporary migration membership survived';
     END IF;`;
}
