import { notFound, permanentRedirect } from 'next/navigation';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { resolvePublicOrganizationBySlugRsc } from '../publicOrganizationBooking';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Прежний канонический адрес записи `/book/{slug}` — теперь ВЕЧНЫЙ РЕДИРЕКТ на `/{slug}/booking`
 * (решение владельца 19.08: «должно быть не domain/booking/clinic, а domain/clinic/booking»).
 *
 * Маршрут не удаляется и не удалится: этот адрес уже разослан в письмах подтверждения записи, и
 * ссылка, отправленная полгода назад, обязана открыться. Резолв идёт тем же чокпоинтом, что и
 * раньше, поэтому алиас клиники разрешается здесь же и за ОДИН прыжок: строка `alias` не хранит
 * целевой slug, резолвер джойнит единственную `current`-строку организации.
 *
 * Глубокие шаги мастера (`/book/service`, `/book/slot`, …) остаются общими и на этом этапе не
 * переезжают (план §9 вопрос 3): статический сегмент выигрывает у `[slug]`, поэтому этот
 * редирект их не перехватывает.
 */
export default async function PublicBookOrganizationRedirect({ params }: Props) {
  const { slug } = await params;
  const resolved = await resolvePublicOrganizationBySlugRsc(slug);
  if (!resolved) notFound();
  permanentRedirect(publicBookPaths.forSlug(resolved.canonicalSlug));
}
