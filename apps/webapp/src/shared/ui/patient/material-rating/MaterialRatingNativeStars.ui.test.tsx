import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MaterialRatingNativeStars } from './MaterialRatingNativeStars';

function EditableRating() {
  const [value, setValue] = useState(2);
  return (
    <MaterialRatingNativeStars
      value={value}
      readOnly={false}
      onChange={setValue}
      aria-label="Оценка упражнения"
    />
  );
}

describe('MaterialRatingNativeStars', () => {
  it('moves the single radio focus and selection with arrows, Home and End', async () => {
    const user = userEvent.setup();
    render(<EditableRating />);

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, 0, -1, -1, -1]);

    radios[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(radios[2]).toHaveFocus();
    expect(radios[2]).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{End}');
    expect(radios[4]).toHaveFocus();
    expect(radios[4]).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{Home}');
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a read-only rating out of the tab order and ignores pointer changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MaterialRatingNativeStars value={3} readOnly onChange={onChange} />);

    const radios = screen.getAllByRole('radio');
    expect(radios.every((radio) => radio.tabIndex === -1)).toBe(true);
    await user.click(radios[4]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
