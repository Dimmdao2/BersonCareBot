import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PatientLiveMeetingClient } from './PatientLiveMeetingClient';

export default async function PatientLiveMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) notFound();
  return <PatientLiveMeetingClient meetingId={meetingId} />;
}
