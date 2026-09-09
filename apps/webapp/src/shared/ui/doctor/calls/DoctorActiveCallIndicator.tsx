'use client';

import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { useActiveCall } from '@/shared/ui/video/ActiveCallCoordinator';

/** Doctor-zone mobile return control; the renderer itself stays provider-neutral. */
export function DoctorActiveCallIndicator() {
  const router = useRouter();
  const { activeCall, isMobile, isActiveRoute } = useActiveCall();
  if (!activeCall || !isMobile || isActiveRoute) return null;
  return (
    <Button
      type="button"
      size="icon"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] right-4 z-[60] size-10 rounded-[var(--doctor-button-radius)] shadow-sm"
      aria-label="Вернуться к звонку"
      onClick={() => router.push(activeCall.returnUrl)}
    >
      <Camera className="size-4" aria-hidden="true" />
      <span className="absolute right-1 top-1 size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
    </Button>
  );
}
