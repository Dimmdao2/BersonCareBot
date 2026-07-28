import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: ['purge-placeholder-bookings-safety.test.ts'],
    maxWorkers: 1,
  },
});
