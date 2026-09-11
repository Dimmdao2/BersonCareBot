'use client';

import {
  createMarkdownEmbeddedLink,
  type MarkdownMediaPlayers,
} from '@/shared/ui/markdown/embeddedLink';
import { DoctorMediaPlaybackVideo } from '@/shared/ui/doctor/media/DoctorMediaPlaybackVideo';
import { HostedVideoEmbed } from '@/shared/ui/doctor/media/HostedVideoEmbed';

/** Докторская привязка общего рендера: логика одна, плееры зоны свои (§17). */
const players: MarkdownMediaPlayers = {
  PlaybackVideo: DoctorMediaPlaybackVideo,
  HostedEmbed: HostedVideoEmbed,
};

export const MarkdownEmbeddedLink = createMarkdownEmbeddedLink(players);
