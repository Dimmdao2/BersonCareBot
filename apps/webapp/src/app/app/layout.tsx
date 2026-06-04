/**
 * Shared layout for /app/** — patient product zone CSS.
 * Doctor routes load doctor.css in their nested layout.
 */
import type { ReactNode } from "react";
import "../styles/patient.css";

export default function AppZoneLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
