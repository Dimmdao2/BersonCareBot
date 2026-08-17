import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PatientRuntimeFeaturesProvider } from '@/shared/ui/patient/PatientRuntimeFeaturesContext';
import { MaterialRatingBlock } from './MaterialRatingBlock';

describe('MaterialRatingBlock global patient switch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not mount stars or issue a rating request while the switch is false', () => {
    const { container } = render(
      <PatientRuntimeFeaturesProvider materialRatingsEnabled={false}>
        <MaterialRatingBlock
          targetKind="content_page"
          targetId="00000000-0000-4000-8000-000000000318"
        />
      </PatientRuntimeFeaturesProvider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
