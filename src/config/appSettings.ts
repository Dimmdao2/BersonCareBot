import type { SupportRelayMessageType } from '../kernel/domain/supportRelay/messageTypes.js';

export type AppSettings = {
  debug: {
    forwardAllEventsToAdmin: boolean;
  };
  supportRelay: {
    allowedUserToAdminMessageTypes: SupportRelayMessageType[];
    allowedAdminToUserMessageTypes: SupportRelayMessageType[];
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

const DEFAULT_ALLOWED_USER_TO_ADMIN: SupportRelayMessageType[] = ['text', 'photo', 'document'];
const DEFAULT_ALLOWED_ADMIN_TO_USER: SupportRelayMessageType[] = [
  'text', 'photo', 'document', 'voice', 'audio', 'video', 'video_note', 'animation', 'sticker', 'contact', 'location',
];

// Non-secret runtime settings. Kept out of .env on purpose.
export const appSettings: AppSettings = {
  debug: {
    forwardAllEventsToAdmin: false,
  },
  supportRelay: {
    allowedUserToAdminMessageTypes: DEFAULT_ALLOWED_USER_TO_ADMIN,
    allowedAdminToUserMessageTypes: DEFAULT_ALLOWED_ADMIN_TO_USER,
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
