import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@/shared/ui/patient/primitives/tabs';
import {
  PatientSegmentedTab,
  PatientSegmentedTabList,
  PatientSegmentedTabPanel,
} from './PatientSegmentedStrip';

function SegmentedTabsFixture() {
  return (
    <Tabs defaultValue="program">
      <PatientSegmentedTabList>
        <PatientSegmentedTab value="program" label="Программа" subtitle="3 этапа" />
        <PatientSegmentedTab
          value="recommendations"
          label="Рекомендации"
          subtitle="2 рекомендации"
        />
        <PatientSegmentedTab value="progress" label="Прогресс" subtitle="7 дней" />
      </PatientSegmentedTabList>
      <PatientSegmentedTabPanel value="program">Содержимое программы</PatientSegmentedTabPanel>
      <PatientSegmentedTabPanel value="recommendations">
        Содержимое рекомендаций
      </PatientSegmentedTabPanel>
      <PatientSegmentedTabPanel value="progress">Содержимое прогресса</PatientSegmentedTabPanel>
    </Tabs>
  );
}

describe('PatientSegmentedStrip tabs', () => {
  it('switches the visible panel by click and keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<SegmentedTabsFixture />);

    const program = screen.getByRole('tab', { name: /Программа/ });
    const recommendations = screen.getByRole('tab', { name: /Рекомендации/ });
    const progress = screen.getByRole('tab', { name: /Прогресс/ });

    expect(program).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Содержимое программы')).toBeVisible();

    await user.click(recommendations);
    expect(recommendations).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Содержимое рекомендаций')).toBeVisible();

    await user.keyboard('{ArrowRight}');
    expect(progress).toHaveFocus();
    expect(progress).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Содержимое прогресса')).toBeVisible();

    await user.keyboard('{Home}');
    expect(program).toHaveFocus();
    expect(program).toHaveAttribute('aria-selected', 'true');
  });
});
