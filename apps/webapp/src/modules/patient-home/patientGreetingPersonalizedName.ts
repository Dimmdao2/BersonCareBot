import type { SessionUser } from "@/shared/types/session";

/** Имя в приветствии: `first_name`, иначе полное `display_name`. */
export function patientGreetingPersonalizedName(
  user: Pick<SessionUser, "firstName" | "displayName">,
): string | null {
  const first = user.firstName?.trim();
  if (first) return first;
  const display = user.displayName?.trim();
  return display || null;
}
