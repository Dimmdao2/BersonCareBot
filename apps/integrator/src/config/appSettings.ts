import type { SupportRelayMessageType } from '../kernel/domain/supportRelay/messageTypes.js';

export type AppSettings = {
  debug: {
    forwardAllEventsToAdmin: boolean;
  };
  supportRelay: {
    allowedUserToAdminMessageTypes: SupportRelayMessageType[];
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
};

const DEFAULT_ALLOWED_USER_TO_ADMIN: SupportRelayMessageType[] = ['text', 'photo', 'document'];

// Non-secret runtime settings. Kept out of .env on purpose.
export const appSettings: AppSettings = {
  debug: {
    forwardAllEventsToAdmin: false,
  },
  supportRelay: {
    allowedUserToAdminMessageTypes: DEFAULT_ALLOWED_USER_TO_ADMIN,
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
};
