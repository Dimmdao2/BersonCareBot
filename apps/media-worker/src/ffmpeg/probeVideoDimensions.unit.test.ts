import { describe, expect, it } from 'vitest';
import { parseFfmpegStderrSourceProbe, parseFfprobeSourceProbeJson } from './probeVideoDimensions.js';

/**
 * ОРАКУЛ: `VIDEO_DELIVERY_COST_AND_METERING_2026-09-11.md`, «Решение по режиму кодирования» —
 * «Не кодировать ступень с битрейтом выше битрейта исходника». Потолок видео и потолок звука — два
 * разных факта, поэтому проба обязана вернуть их отдельно от контейнерного числа: контейнер несёт
 * ещё звук и накладные (замер живой библиотеки владельца 11.09.2026: контейнер больше видеопотока
 * в среднем на 110 кбит/с, у слабых источников — в разы).
 */
describe('parseFfprobeSourceProbeJson', () => {
  it('разбирает кадр, битрейт видеопотока, битрейт звука и контейнер одним вызовом', () => {
    const raw = JSON.stringify({
      streams: [
        { codec_type: 'video', width: 1920, height: 1080, bit_rate: '10600000' },
        { codec_type: 'audio', bit_rate: '64860' },
      ],
      format: { bit_rate: '10739200' },
    });
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({
      width: 1920,
      height: 1080,
      bitrateBps: 10_739_200,
      videoBitrateBps: 10_600_000,
      audioBitrateBps: 64_860,
    });
  });

  it('видеопоток находится и тогда, когда ffprobe не печатает codec_type', () => {
    const raw = '{"streams":[{"width":1280,"height":720,"bit_rate":"1200000"}],"format":{}}';
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: null,
      videoBitrateBps: 1_200_000,
      audioBitrateBps: null,
    });
  });

  it('видеопоток берётся именно видеопотоком, даже если звук идёт первым', () => {
    const raw = JSON.stringify({
      streams: [
        { codec_type: 'audio', bit_rate: '128000' },
        { codec_type: 'video', width: 848, height: 656, bit_rate: '1618043' },
      ],
      format: { bit_rate: '1687978' },
    });
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({
      width: 848,
      height: 656,
      bitrateBps: 1_687_978,
      videoBitrateBps: 1_618_043,
      audioBitrateBps: 128_000,
    });
  });

  it('отсутствующие числа остаются null — выдуманных значений нет', () => {
    const raw = '{"streams":[{"codec_type":"video","width":1280,"height":720}],"format":{}}';
    expect(parseFfprobeSourceProbeJson(raw)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: null,
      videoBitrateBps: null,
      audioBitrateBps: null,
    });
  });

  it('пустой/битый вывод — null, а не выдуманный размер', () => {
    expect(parseFfprobeSourceProbeJson('')).toBeNull();
    expect(parseFfprobeSourceProbeJson('not-json')).toBeNull();
    expect(parseFfprobeSourceProbeJson('{"streams":[]}')).toBeNull();
  });
});

describe('parseFfmpegStderrSourceProbe', () => {
  it('разбирает кадр и все три битрейта из одного и того же баннера `ffmpeg -i`', () => {
    const stderr = [
      'Duration: 00:00:05.03, start: 0.000000, bitrate: 752 kb/s',
      '  Stream #0:0(und): Video: h264 (High), yuv420p(tv, bt709), 1280x720 [SAR 1:1 DAR 16:9], 680 kb/s, 30 fps',
      '  Stream #0:1(und): Audio: aac (LC), 44100 Hz, stereo, fltp, 64 kb/s',
    ].join('\n');
    expect(parseFfmpegStderrSourceProbe(stderr)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: 752_000,
      videoBitrateBps: 680_000,
      audioBitrateBps: 64_000,
    });
  });

  it('битрейты остаются null, когда баннер их не печатает', () => {
    const stderr = 'Stream #0:0(und): Video: h264, yuv420p, 1280x720, 30 fps';
    expect(parseFfmpegStderrSourceProbe(stderr)).toEqual({
      width: 1280,
      height: 720,
      bitrateBps: null,
      videoBitrateBps: null,
      audioBitrateBps: null,
    });
  });

  it('без строки видеопотока — null', () => {
    expect(parseFfmpegStderrSourceProbe('Stream #0:1: Audio: aac')).toBeNull();
  });
});
