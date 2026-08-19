import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * Load order matches `src/config/loadEnv.ts`: `.env.dev` then `.env` override.
 * Canonical runtime validation of env (including `DATABASE_URL`) lives in `src/config/env.ts`
 * after `loadEnv`; this file only mirrors file loading for drizzle-kit CLI (no Zod).
 */
config({ path: path.resolve(process.cwd(), '.env.dev') });
config();

/**
 * drizzle-kit may generate, introspect and check here; it may not APPLY.
 *
 * `drizzle-kit migrate` walks meta/_journal.json and applies everything with `when > max(created_at)`,
 * so a migration whose name sorts below the watermark is skipped permanently and silently, and the
 * rows it writes carry no `tag`. `drizzle-kit push` skips the migration files altogether. Both are
 * refused at the config, which every drizzle-kit subcommand loads, so removing the package.json
 * script is not the only thing standing between the database and the retired migrator.
 */
const RETIRED_APPLY_SUBCOMMANDS = ['migrate', 'push'];
const retired = process.argv.slice(2).find((argument) => RETIRED_APPLY_SUBCOMMANDS.includes(argument));
if (retired) {
  throw new Error(
    `drizzle-kit ${retired} is not how migrations reach a database here: it applies by the ` +
      'meta/_journal.json watermark and writes untagged ledger rows. Use ' +
      '`bash deploy/host/migrate-dev.sh --execute` (DEV), `bash deploy/host/deploy-test.sh <branch>` (TEST) ' +
      'or `pnpm --dir apps/webapp run migrate` (local). Canon: AGENTS.md, "Миграции после baseline B0".',
  );
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit (set in apps/webapp/.env.dev or .env)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './db/schema/schema.ts',
    './db/schema/clinicalTests.ts',
    './db/schema/recommendations.ts',
    './db/schema/treatmentProgramTemplates.ts',
    './db/schema/treatmentProgramInstances.ts',
    './db/schema/treatmentProgramTestAttempts.ts',
    './db/schema/treatmentProgramEvents.ts',
    './db/schema/programActionLog.ts',
    './db/schema/entityComments.ts',
    './db/schema/courses.ts',
    './db/schema/patientPractice.ts',
    './db/schema/materialRatings.ts',
    './db/schema/operatorHealth.ts',
    './db/schema/outgoingDeliveryQueue.ts',
    './db/schema/operatorHealthFailureArchive.ts',
    './db/schema/notificationDeliveryAttempts.ts',
    './db/schema/specialistSignupIntents.ts',
    './db/schema/staffSecurityProfiles.ts',
    './db/schema/productAnalytics.ts',
    './db/schema/bookingEngine.ts',
    './db/schema/clinicDirectory.ts',
    './db/schema/platformUserContacts.ts',
    './db/schema/programItemDiscussion.ts',
    './db/schema/doctorPatientSupport.ts',
    './db/schema/patientFiles.ts',
    './db/schema/patientClinical.ts',
    './db/schema/patientClinicalAnamnesis.ts',
    './db/schema/patientPayments.ts',
    './db/schema/saasIsolationDiagnostics.ts',
  ],
  out: './db/drizzle-migrations',
  dbCredentials: {
    url: databaseUrl,
  },
});
