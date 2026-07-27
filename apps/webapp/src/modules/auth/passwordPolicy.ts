import { z } from "zod";

/**
 * The single password policy used by password reset and authenticated password change.
 * Keep both credential-write surfaces on this schema instead of duplicating constraints.
 */
export const newPasswordSchema = z.string().min(8).max(128);
