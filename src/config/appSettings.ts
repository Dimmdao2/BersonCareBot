export type AppSettings = {
  debug: {
    forwardAllEventsToAdmin: boolean;
  };
  worker: {
    pollIntervalMs: number;
  };
  runtime: {
    worker: {
      retryDelaySeconds: number;
      pollIntervalMs: number;
      batchSize: number;
    };
    scheduler: {
      pollIntervalMs: number;
    };
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
  runtime: {
    worker: {
      retryDelaySeconds: 60,
      pollIntervalMs: 5000,
      batchSize: 1,
    },
    scheduler: {
      pollIntervalMs: 5000,
    },
  },
  rubitime: {
    createRecordDelivery: {
      firstAttemptDelaySeconds: 60,
      retryDelaySeconds: 60,
      maxAttemptsBeforeSms: 2,
    },
  },
};
