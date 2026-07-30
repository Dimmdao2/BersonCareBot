import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { defaultOperatorHealthAlertConfig } from '@/modules/operator-alerts/operatorHealthAlertConfig';
import { OperatorHealthAlertsSection } from './OperatorHealthAlertsSection';

describe('operator health alerts admin UI', () => {
  it('keeps the critical topic and every mandatory channel visibly enabled and locked', () => {
    const config = defaultOperatorHealthAlertConfig();
    config.topics.critical_enabled = false;
    config.channels.critical = {
      telegram: false,
      max: false,
      web_push: false,
      sms: false,
      email: false,
    };

    render(<OperatorHealthAlertsSection initialConfig={config} initialFallbackEmail="" />);

    for (const name of [
      'Критичные сбои',
      'Критичные сбои — Telegram',
      'Критичные сбои — Max',
      'Критичные сбои — Push',
      'Критичные сбои — SMS',
      'Критичные сбои — E-mail',
    ]) {
      const toggle = screen.getByRole('switch', { name });
      expect(toggle).toBeChecked();
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
      expect(toggle).toHaveAttribute('tabindex', '-1');
    }
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Резервный e-mail не настроен: уведомление с пустой аудиторией останется без резервной доставки.',
    );
  });
});
