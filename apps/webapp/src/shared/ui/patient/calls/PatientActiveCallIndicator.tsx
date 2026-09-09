'use client';

import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { useActiveCall } from '@/shared/ui/video/ActiveCallCoordinator';

/** Patient-zone mobile return control; it deliberately owns no call state or renderer. */
export function PatientActiveCallIndicator() {
  const router = useRouter();
  const { activeCall, isMobile, isActiveRoute } = useActiveCall();
  if (!activeCall || !isMobile || isActiveRoute) return null;
  return (
    <Button
      type="button"
      size="icon"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] right-4 z-[60] size-10 rounded-full shadow-sm"
      aria-label="Вернуться к звонку"
      onClick={() => router.push(activeCall.returnUrl)}
    >
      <Camera className="size-4" aria-hidden="true" />
      <span className="absolute right-1 top-1 size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
    </Button>
  );
}
