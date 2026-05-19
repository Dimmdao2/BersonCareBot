/** Состояние email для register / login / forgot (MAIN PLAN §5–6, PHASE_05). */
export type EmailPasswordAuthState =
  | { kind: "free" }
  | { kind: "pending_registration"; userId: string }
  | { kind: "verified_with_password"; userId: string }
  | { kind: "needs_email_setup"; userId: string }
  | { kind: "email_conflict" };
