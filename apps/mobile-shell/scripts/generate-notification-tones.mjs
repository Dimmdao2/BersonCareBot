import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Deterministic, original sine-wave tones. No sampled or licensed audio is used.
const sampleRate = 44_100;
const tones = {
  tone_message: { frequency: 660, milliseconds: 140 },
  tone_reminder: { frequency: 523.25, milliseconds: 220 },
  tone_call: { frequency: 784, milliseconds: 300 },
};

function wav({ frequency, milliseconds }) {
  const samples = Math.floor((sampleRate * milliseconds) / 1000);
  const dataSize = samples * 2;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 220, (samples - index) / 880);
    bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 4500 * envelope), 44 + index * 2);
  }
  return bytes;
}

for (const [name, definition] of Object.entries(tones)) {
  const output = resolve(import.meta.dirname, '../android/app/src/main/res/raw', `${name}.wav`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, wav(definition));
}
