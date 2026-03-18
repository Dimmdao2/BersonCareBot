import type { UserRole } from "@/shared/types/session";

export function canAccessPatient(role: UserRole): boolean {
  return role === "client";
}

export function canAccessDoctor(role: UserRole): boolean {
  return role === "doctor" || role === "admin";
}
