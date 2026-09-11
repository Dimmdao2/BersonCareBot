'use client';

import {
  createMarkdownEmbeddedLink,
  type MarkdownMediaPlayers,
} from '@/shared/ui/markdown/embeddedLink';
import { PatientMediaPlaybackVideo } from '@/shared/ui/patient/media/PatientMediaPlaybackVideo';
import { HostedVideoEmbed } from '@/shared/ui/patient/media/HostedVideoEmbed';

/** Пациентская привязка общего рендера: логика одна, плееры зоны свои (§17). */
const players: MarkdownMediaPlayers = {
  PlaybackVideo: PatientMediaPlaybackVideo,
  HostedEmbed: HostedVideoEmbed,
};

export const MarkdownEmbeddedLink = createMarkdownEmbeddedLink(players);
