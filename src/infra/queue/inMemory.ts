import type { QueuePort } from '../../kernel/contracts/index.js';

/** In-memory queue placeholder used during V2 migration. */
export function createInMemoryQueue(): QueuePort {
  const tasks: Array<{ kind: string; payload: Record<string, unknown> }> = [];
  return {
    async enqueue(task): Promise<void> {
      tasks.push(task);
    },
  };
}
