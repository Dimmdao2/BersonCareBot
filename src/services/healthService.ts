/**
 * Фасад для проверки состояния инфраструктуры (БД).
 * Граница: adapters → services → db.
 */
import { healthCheckDb } from '../db/client.js';

export async function checkDb(): Promise<boolean> {
  return healthCheckDb();
}
