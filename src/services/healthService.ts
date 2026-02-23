/**
 * Фасад для проверки состояния инфраструктуры (БД).
 * Граница: adapters → services → persistence.
 */
import { healthCheckDb } from '../persistence/client.js';

export async function checkDb(): Promise<boolean> {
  return healthCheckDb();
}
