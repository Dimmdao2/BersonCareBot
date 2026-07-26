import type { AppSession, SessionUser } from "@/shared/types/session";

/**
 * The session user as presented to clients (`/api/me`, and every consumer of
 * `deps.users.getCurrentUser`).
 *
 * `sessionEpoch` is stripped (D8, C-1 2026-07-26). It is the server-side revocation counter: it
 * belongs in the signed, httpOnly cookie and in the DB row, and nowhere else. The predecessor field
 * (`sessionsValidFrom`) was echoed here and that was raised as a finding; re-echoing its replacement
 * would reproduce the same class. Nothing in the UI has any use for it — it is not identity, not
 * authorization, and not display data — so this projection drops it rather than the response route
 * doing it, and every consumer of `getCurrentUser` gets the same guarantee.
 */
export type CurrentUser = Omit<SessionUser, "sessionEpoch">;

export function getCurrentUser(session: AppSession | null): CurrentUser | null {
  if (!session?.user) return null;
  const { sessionEpoch: _serverSideRevocationCounter, ...user } = session.user;
  return user;
}
