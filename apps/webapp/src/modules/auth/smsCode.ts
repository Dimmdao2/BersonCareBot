import { randomInt } from "node:crypto";

const SMS_CODE_LENGTH = 6;
const SMS_CODE_MAX = 10 ** SMS_CODE_LENGTH - 1;

/**
 * Генерирует уникальный 6-значный код для SMS-подтверждения.
 * Используется вебапп при отправке кода через интегратор; проверка кода — только в вебапп.
 */
export function generateSmsCode(): string {
  const n = randomInt(0, SMS_CODE_MAX + 1);
  return n.toString().padStart(SMS_CODE_LENGTH, "0");
}
