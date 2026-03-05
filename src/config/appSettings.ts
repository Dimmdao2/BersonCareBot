export type AppSettings = {
  debug: {
    forwardAllEventsToAdmin: boolean;
  };
  worker: {
    pollIntervalMs: number;
  };
  rubitime: {
    createRecordDelivery: {
      firstAttemptDelaySeconds: number;
      retryDelaySeconds: number;
      maxAttemptsBeforeSms: number;
    };
  };
};

// Non-secret runtime settings. Kept out of .env on purpose.
export const appSettings: AppSettings = {
  debug: {
    forwardAllEventsToAdmin: false,
  },
  worker: {
    pollIntervalMs: 5000,
  },
  rubitime: {
    createRecordDelivery: {
      firstAttemptDelaySeconds: 60,
      retryDelaySeconds: 60,
      maxAttemptsBeforeSms: 2,
    },
  },
};
