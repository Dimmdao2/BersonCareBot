export type MergePreviewIntegratorUserPresence = {
  target: {
    webappIntegratorUserId: string | null;
    rowExistsInIntegratorDb: null;
  };
  duplicate: {
    webappIntegratorUserId: string | null;
    rowExistsInIntegratorDb: null;
  };
  checkStatus: 'skipped_no_integrator_db';
};

const NUMERIC_ID = /^\d+$/;

function normalizeIntegratorUserId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!NUMERIC_ID.test(value)) return null;
  try {
    return String(BigInt(value));
  } catch {
    return null;
  }
}

/**
 * The canonical merge is owned by public.platform_users and user_channel_bindings.
 * The retired integrator.users table is deliberately not consulted.
 */
export async function resolveMergePreviewIntegratorUserPresence(params: {
  targetIntegratorUserId: string | null | undefined;
  duplicateIntegratorUserId: string | null | undefined;
}): Promise<MergePreviewIntegratorUserPresence> {
  return {
    target: {
      webappIntegratorUserId: normalizeIntegratorUserId(params.targetIntegratorUserId),
      rowExistsInIntegratorDb: null,
    },
    duplicate: {
      webappIntegratorUserId: normalizeIntegratorUserId(params.duplicateIntegratorUserId),
      rowExistsInIntegratorDb: null,
    },
    checkStatus: 'skipped_no_integrator_db',
  };
}
