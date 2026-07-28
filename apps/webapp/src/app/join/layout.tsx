import type { ReactNode } from 'react';

export default function JoinLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <meta name="referrer" content="no-referrer" />
      {children}
    </>
  );
}
