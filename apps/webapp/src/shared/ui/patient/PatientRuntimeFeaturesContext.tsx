'use client';

import { createContext, useContext, type ReactNode } from 'react';

type PatientRuntimeFeatures = {
  materialRatingsEnabled: boolean;
};

const PatientRuntimeFeaturesContext = createContext<PatientRuntimeFeatures>({
  materialRatingsEnabled: false,
});

export function PatientRuntimeFeaturesProvider({
  materialRatingsEnabled,
  children,
}: PatientRuntimeFeatures & { children: ReactNode }) {
  return (
    <PatientRuntimeFeaturesContext.Provider value={{ materialRatingsEnabled }}>
      {children}
    </PatientRuntimeFeaturesContext.Provider>
  );
}

export function usePatientRuntimeFeatures(): PatientRuntimeFeatures {
  return useContext(PatientRuntimeFeaturesContext);
}
