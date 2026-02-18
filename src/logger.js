import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || '',
  },
});

export function serializeError(err: unknown) {
  if (typeof err === 'object' && err && 'message' in err) {
    return {
      message: (err as { message?: string }).message,
      stack: (err as { stack?: string }).stack,
    };
  }
  return { message: String(err) };
}
