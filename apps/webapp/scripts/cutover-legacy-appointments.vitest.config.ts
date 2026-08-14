import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: { '@': path.resolve(__dirname, '../src') },
  },
  test: {
    environment: 'node',
    include: ['cutover-legacy-appointments.test.ts'],
    maxWorkers: 1,
  },
});
