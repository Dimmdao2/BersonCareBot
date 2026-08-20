type ReedSolomonGroup = {
  blocks: number;
  dataCodewords: number;
};

type ReedSolomonLayout = {
  eccCodewords: number;
  groups: readonly ReedSolomonGroup[];
};

// QR Code Model 2, error correction level L, versions 1 through 10.
// Version 10 has two unequal data groups, so its block structure must remain explicit.
const REED_SOLOMON_LAYOUTS_L: readonly ReedSolomonLayout[] = [
  { eccCodewords: 7, groups: [{ blocks: 1, dataCodewords: 19 }] },
  { eccCodewords: 10, groups: [{ blocks: 1, dataCodewords: 34 }] },
  { eccCodewords: 15, groups: [{ blocks: 1, dataCodewords: 55 }] },
  { eccCodewords: 20, groups: [{ blocks: 1, dataCodewords: 80 }] },
  { eccCodewords: 26, groups: [{ blocks: 1, dataCodewords: 108 }] },
  { eccCodewords: 18, groups: [{ blocks: 2, dataCodewords: 68 }] },
  { eccCodewords: 16, groups: [{ blocks: 2, dataCodewords: 78 }] },
  { eccCodewords: 24, groups: [{ blocks: 2, dataCodewords: 97 }] },
  { eccCodewords: 30, groups: [{ blocks: 2, dataCodewords: 116 }] },
  {
    eccCodewords: 18,
    groups: [
      { blocks: 2, dataCodewords: 68 },
      { blocks: 2, dataCodewords: 69 },
    ],
  },
] as const;

const DATA_CODEWORDS_L = REED_SOLOMON_LAYOUTS_L.map((layout) =>
  layout.groups.reduce((total, group) => total + group.blocks * group.dataCodewords, 0),
);
const ALIGNMENT_POSITIONS = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
] as const;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

let gfValue = 1;
for (let index = 0; index < 255; index += 1) {
  GF_EXP[index] = gfValue;
  GF_LOG[gfValue] = index;
  gfValue = (gfValue << 1) ^ (gfValue & 0x80 ? 0x11d : 0);
}
for (let index = 255; index < GF_EXP.length; index += 1) GF_EXP[index] = GF_EXP[index - 255]!;

function multiplyGf(left: number, right: number) {
  return left === 0 || right === 0 ? 0 : GF_EXP[GF_LOG[left]! + GF_LOG[right]!]!;
}

function reedSolomon(data: readonly number[], degree: number) {
  const divisor = new Uint8Array(degree);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let term = 0; term < degree; term += 1) {
      divisor[term] = multiplyGf(divisor[term]!, root);
      if (term + 1 < degree) divisor[term] ^= divisor[term + 1]!;
    }
    root = multiplyGf(root, 0x02);
  }

  const remainder = new Uint8Array(degree);
  for (const value of data) {
    const factor = value ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let index = 0; index < degree; index += 1) remainder[index] ^= multiplyGf(divisor[index]!, factor);
  }
  return [...remainder];
}

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
}

function qrVersionFor(byteLength: number) {
  const version = DATA_CODEWORDS_L.findIndex((codewords, index) => {
    const countBits = index < 9 ? 8 : 16;
    return 4 + countBits + byteLength * 8 <= codewords * 8;
  });
  if (version === -1) throw new Error('Payment link is too long for a local QR code.');
  return version + 1;
}

function makeDataCodewords(text: string, version: number) {
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacity = DATA_CODEWORDS_L[version - 1]! * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  }
  for (let pad = 0; data.length < capacity / 8; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return data;
}

function interleaveWithEcc(data: readonly number[], version: number) {
  const layout = REED_SOLOMON_LAYOUTS_L[version - 1]!;
  const blocks: number[][] = [];
  let offset = 0;
  for (const group of layout.groups) {
    for (let block = 0; block < group.blocks; block += 1) {
      blocks.push(data.slice(offset, offset + group.dataCodewords));
      offset += group.dataCodewords;
    }
  }
  if (offset !== data.length) throw new Error('QR data codeword layout mismatch.');

  const eccBlocks = blocks.map((block) => reedSolomon(block, layout.eccCodewords));
  const result: number[] = [];
  const longestDataBlock = Math.max(...blocks.map((block) => block.length));
  for (let index = 0; index < longestDataBlock; index += 1) {
    for (const block of blocks) {
      if (index < block.length) result.push(block[index]!);
    }
  }
  for (let index = 0; index < layout.eccCodewords; index += 1) {
    for (const block of eccBlocks) result.push(block[index]!);
  }
  return result;
}

function bchRemainder(value: number, polynomial: number) {
  let remainder = value;
  while (remainder.toString(2).length >= polynomial.toString(2).length) {
    remainder ^= polynomial << (remainder.toString(2).length - polynomial.toString(2).length);
  }
  return remainder;
}

function makeMatrix(version: number, codewords: readonly number[]) {
  const size = version * 4 + 17;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const set = (x: number, y: number, value: boolean) => {
    if (x >= 0 && x < size && y >= 0 && y < size) modules[y]![x] = value;
  };
  const finder = (x: number, y: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        set(x + dx, y + dy, inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)));
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  for (let index = 8; index < size - 8; index += 1) {
    set(index, 6, index % 2 === 0);
    set(6, index, index % 2 === 0);
  }
  const alignmentPositions = ALIGNMENT_POSITIONS[version - 1]!;
  const finalAlignmentPosition = alignmentPositions.at(-1);
  for (const y of alignmentPositions) {
    for (const x of alignmentPositions) {
      if (
        (x === 6 && (y === 6 || y === finalAlignmentPosition)) ||
        (x === finalAlignmentPosition && y === 6)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  for (let index = 8; index < size - 8; index += 1) {
    set(index, 6, index % 2 === 0);
    set(6, index, index % 2 === 0);
  }
  for (let index = 0; index < 6; index += 1) {
    set(8, index, false);
    set(index, 8, false);
  }
  set(8, 7, false);
  set(8, 8, false);
  set(7, 8, false);
  for (let index = 0; index < 8; index += 1) set(size - 1 - index, 8, false);
  for (let index = 0; index < 7; index += 1) set(8, size - 7 + index, false);
  set(8, size - 8, true);
  if (version >= 7) {
    const versionBits = (version << 12) | bchRemainder(version << 12, 0x1f25);
    for (let index = 0; index < 18; index += 1) {
      const bit = ((versionBits >>> index) & 1) === 1;
      set(size - 11 + (index % 3), Math.floor(index / 3), bit);
      set(Math.floor(index / 3), size - 11 + (index % 3), bit);
    }
  }
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let offset = 0; offset < size; offset += 1) {
      const y = upward ? size - 1 - offset : offset;
      for (let x = right; x >= right - 1; x -= 1) {
        if (modules[y]![x] !== null) continue;
        const bit = bitIndex < codewords.length * 8 ? (codewords[Math.floor(bitIndex / 8)]! >>> (7 - (bitIndex % 8))) & 1 : 0;
        modules[y]![x] = Boolean(bit) !== ((x + y) % 2 === 0);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
  const formatBits = (((0b01 << 3) | 0) << 10 | bchRemainder(((0b01 << 3) | 0) << 10, 0x537)) ^ 0x5412;
  for (let index = 0; index < 15; index += 1) {
    const bit = ((formatBits >>> index) & 1) === 1;
    set(8, index < 6 ? index : index < 8 ? index + 1 : size - 15 + index, bit);
    if (index < 8) set(size - index - 1, 8, bit);
    else if (index === 8) set(7, 8, bit);
    else set(14 - index, 8, bit);
  }
  return modules as boolean[][];
}

/** Encodes a UTF-8 URL as a self-contained QR Code Model 2 SVG data URI. */
export function localQrCodeDataUri(text: string) {
  const bytes = new TextEncoder().encode(text);
  const version = qrVersionFor(bytes.length);
  const modules = makeMatrix(version, interleaveWithEcc(makeDataCodewords(text, version), version));
  const size = modules.length;
  const cells = modules.flatMap((row, y) => row.map((dark, x) => (dark ? `<path d="M${x + 4} ${y + 4}h1v1h-1z"/>` : '')).filter(Boolean)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${cells}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
