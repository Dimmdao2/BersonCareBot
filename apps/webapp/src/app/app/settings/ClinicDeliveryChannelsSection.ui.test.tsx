import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClinicDeliveryChannelsSection } from './ClinicDeliveryChannelsSection';

describe('ClinicDeliveryChannelsSection', () => {
  it('shows configured status for its shared write-only credential inputs', () => {
    render(
      <ClinicDeliveryChannelsSection
        initial={{
          smtp: {
            configured: false,
            host: '',
            port: '',
            secure: false,
            user: '',
            from: '',
          },
          smsConfigured: true,
          telegramConfigured: true,
          maxConfigured: true,
          telegramWebhookPath: null,
          maxWebhookPath: null,
        }}
      />,
    );

    expect(screen.getAllByText('Подключён')).toHaveLength(3);
  });
});
