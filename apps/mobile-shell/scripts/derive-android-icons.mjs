import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import sharp from 'sharp';

const packageRoot = resolve(import.meta.dirname, '..');
const sources = {
  therapygo: {
    source: resolve(packageRoot, '../webapp/public/brand/therapygo-app-icon-source.png'),
    background: '#0B5FFF',
  },
  therapysto: {
    source: resolve(packageRoot, '../webapp/public/brand/therapysto-app-icon-source.png'),
    background: '#0B2458',
  },
};
const densitySizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

async function writePng(path, image) {
  await mkdir(dirname(path), { recursive: true });
  await image.png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(path);
}

async function buildBrand(brand, definition) {
  const resourceRoot = resolve(packageRoot, `android/app/src/${brand}/res`);
  await Promise.all([
    ...Object.keys(densitySizes).map((density) => rm(resolve(resourceRoot, `mipmap-${density}`), { recursive: true, force: true })),
    rm(resolve(resourceRoot, 'mipmap-nodpi'), { recursive: true, force: true }),
    rm(resolve(resourceRoot, 'drawable-nodpi'), { recursive: true, force: true }),
  ]);

  // The source artwork is non-square. A 66% centred mark leaves Android's
  // adaptive-icon safe zone intact at every density.
  const master = await sharp(definition.source)
    .resize({ width: 676, height: 676, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 174, bottom: 174, left: 174, right: 174, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  for (const [density, size] of Object.entries(densitySizes)) {
    const mark = await sharp(master)
      .resize({ width: Math.ceil(size * 0.66), height: Math.ceil(size * 0.66), fit: 'contain' })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
    const launcher = sharp({ create: { width: size, height: size, channels: 4, background: definition.background } })
      .composite([{ input: mark, gravity: 'centre' }]);
    await writePng(resolve(resourceRoot, `mipmap-${density}/ic_launcher.png`), launcher.clone());
    await writePng(resolve(resourceRoot, `mipmap-${density}/ic_launcher_round.png`), launcher);
  }

  await writePng(resolve(resourceRoot, 'mipmap-nodpi/ic_launcher_foreground.png'), sharp(master));
  const splashMark = await sharp(master)
    .resize({ width: 338, height: 338, fit: 'contain' })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  await writePng(
    resolve(resourceRoot, 'drawable-nodpi/splash.png'),
    sharp({ create: { width: 512, height: 512, channels: 4, background: definition.background } }).composite([{ input: splashMark, gravity: 'centre' }]),
  );
}

await Promise.all(Object.entries(sources).map(([brand, definition]) => buildBrand(brand, definition)));
