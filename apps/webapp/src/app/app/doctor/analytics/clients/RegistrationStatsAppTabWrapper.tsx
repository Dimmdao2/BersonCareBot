"use client";

import { AdminPlatformRegistrationStatsClient } from "./AdminPlatformRegistrationStatsClient";

const DEFAULT_PERIOD = { preset: "week" as const, customFrom: "", customTo: "" };

export function RegistrationStatsAppTabWrapper() {
  return (
    <AdminPlatformRegistrationStatsClient
      period={DEFAULT_PERIOD}
      ready={true}
    />
  );
}
