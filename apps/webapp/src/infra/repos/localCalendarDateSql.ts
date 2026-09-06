import { sql, type SQL, type Column } from 'drizzle-orm';

/**
 * Local calendar date (`YYYY-MM-DD`) of a `timestamptz` column in a given business timezone.
 *
 * Single chokepoint for this SQL fragment (AGENTS.md §5): the same pattern first appeared in
 * `pgProgramActionLog.ts` for `program_action_log.created_at`; doctor-appointments/doctor-program-
 * activity daily series need the identical fragment over `be_appointments`/`program_action_log`
 * columns, so it is parametrized here instead of copied.
 *
 * The IANA name is allowlist-validated and then BOUND as a parameter — it is not escaped into the
 * SQL text by hand. Callers that also GROUP BY this expression must use a positional `GROUP BY`
 * ordinal rather than repeating the fragment: PostgreSQL matches a GROUP BY entry to the select
 * list by parse-node equality, and Drizzle emits a distinct `$n` for every occurrence of a bound
 * value, so two spelled-out copies stop matching (SQLSTATE 42803). Grouping by ordinal selects the
 * very same expression, so the grouping is unchanged.
 */
export function localCalendarDateSql(column: Column, displayIana: string): SQL {
  if (!/^[-+/_0-9a-zA-Z]+$/.test(displayIana)) {
    throw new Error('invalid_timezone');
  }
  return sql`((${column} AT TIME ZONE ${displayIana})::date)`;
}
