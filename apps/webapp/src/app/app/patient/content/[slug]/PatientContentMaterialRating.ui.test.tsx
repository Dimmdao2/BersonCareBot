import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/ui/patient/material-rating/MaterialRatingBlock', () => ({
  MaterialRatingBlock: () => <div data-testid="material-rating-block" />,
}));
vi.mock('./PatientWarmupRatingFeedbackDialog', () => ({
  PatientWarmupRatingFeedbackDialog: () => <div data-testid="material-rating-feedback" />,
}));

import { PatientRuntimeFeaturesProvider } from '@/shared/ui/patient/PatientRuntimeFeaturesContext';
import { PatientContentMaterialRating } from './PatientContentMaterialRating';

describe('PatientContentMaterialRating global switch', () => {
  it('does not mount either rating UI branch while the global switch is false', () => {
    render(
      <PatientRuntimeFeaturesProvider materialRatingsEnabled={false}>
        <PatientContentMaterialRating
          contentPageId="00000000-0000-4000-8000-000000000318"
          guest={false}
          needsActivation={false}
          isDailyWarmup
        />
      </PatientRuntimeFeaturesProvider>,
    );

    expect(screen.queryByTestId('material-rating-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('material-rating-feedback')).not.toBeInTheDocument();
  });

  it('mounts the rating block when the global switch is true', () => {
    render(
      <PatientRuntimeFeaturesProvider materialRatingsEnabled>
        <PatientContentMaterialRating
          contentPageId="00000000-0000-4000-8000-000000000318"
          guest={false}
          needsActivation={false}
        />
      </PatientRuntimeFeaturesProvider>,
    );

    expect(screen.getByTestId('material-rating-block')).toBeInTheDocument();
  });
});
