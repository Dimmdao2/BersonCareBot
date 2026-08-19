/**
 * Метка окружения в теме письма оператору (владелец, 20.08). Требование владельца в той же реплике:
 * «мне достаточно хоста (test или prod) или DEV… не усложнять главное» — поэтому никакой метки
 * «неизвестно» и никакой отдельной env-переменной здесь нет и быть не должно.
 *
 * Отказ, который ловит тест: чужой хост молча становится PROD — оператор чинит прод из-за письма с
 * тестового стенда.
 */
import { describe, expect, it } from 'vitest';
import { computeOperatorAlertEnvLabel } from './operatorAlertEnvLabel';

describe('метка окружения выводится из адреса приложения', () => {
  it('прод и тест зовутся своими именами', () => {
    expect(computeOperatorAlertEnvLabel('https://bersoncare.ru')).toBe('PROD');
    expect(computeOperatorAlertEnvLabel('https://test.bersoncare.ru')).toBe('TEST');
  });

  it('локальные адреса — DEV', () => {
    expect(computeOperatorAlertEnvLabel('http://127.0.0.1:5200')).toBe('DEV');
    expect(computeOperatorAlertEnvLabel('http://localhost:5200')).toBe('DEV');
  });

  it('незнакомый хост подставляется как есть и НЕ становится продом', () => {
    expect(computeOperatorAlertEnvLabel('https://stage.example.com')).toBe('stage.example.com');
  });

  it('адреса нет вовсе — DEV, потому что так бывает только на локальной машине', () => {
    expect(computeOperatorAlertEnvLabel('')).toBe('DEV');
  });
});
