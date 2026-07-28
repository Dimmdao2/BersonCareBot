import { NextResponse } from 'next/server';
import { SystemSettingsOrgContextRequiredError } from '@/modules/system-settings/orgScopedKeys';

/**
 * P0.11.3: `createSystemSettingsService` throws {@link SystemSettingsOrgContextRequiredError} when a
 * PER-ORG setting key is written without a resolvable organization context (see `orgScopedKeys.ts`).
 * Route handlers wrap the write in `try/catch` and use this to turn that specific failure into a 409;
 * any other error should keep propagating (rethrow) to the route's normal error handling.
 */
export function systemSettingsOrgContextErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SystemSettingsOrgContextRequiredError) {
    return NextResponse.json(
      { ok: false, error: 'organization_context_required' },
      { status: 409 },
    );
  }
  return null;
}
