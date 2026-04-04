/** Stage 8 contract fixtures (S8.T01): Rubitime webhook bodies, same naive wall clock. */

/** Shared naive datetime string for Moscow vs Samara branch-timezone contract tests. */
export const STAGE8_NAIVE_WALL_CLOCK = "2026-04-07 11:00:00";

/** Expected UTC instants after ingest normalization (S8.T02 / S8.T03). */
export const STAGE8_EXPECTED_MOSCOW_UTC_ISO = "2026-04-07T08:00:00.000Z";
export const STAGE8_EXPECTED_SAMARA_UTC_ISO = "2026-04-07T07:00:00.000Z";

export const stage8MoscowWebhookBody = {
  from: "rubitime" as const,
  event: "event-update-record" as const,
  data: {
    record: {
      id: "stage8-contract-moscow",
      datetime: STAGE8_NAIVE_WALL_CLOCK,
      branch_id: 17356,
    },
  },
};

export const stage8SamaraWebhookBody = {
  from: "rubitime" as const,
  event: "event-update-record" as const,
  data: {
    record: {
      id: "stage8-contract-samara",
      datetime: STAGE8_NAIVE_WALL_CLOCK,
      branch_id: 17356,
    },
  },
};

/** Invalid raw datetime for negative contract (S8.T04). */
export const stage8InvalidDatetimeWebhookBody = {
  from: "rubitime" as const,
  event: "event-create-record" as const,
  data: {
    record: {
      id: "stage8-contract-invalid-dt",
      datetime: "not-a-valid-datetime",
      branch_id: 17356,
    },
  },
};
