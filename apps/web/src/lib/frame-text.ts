const FRAME_PREFIX = "LD1:";
const BASE45_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const BASE45_LOOKUP = new Map([...BASE45_CHARSET].map((character, index) => [character, index]));

export function encodeFrameText(bytes: Uint8Array): string {
  let encoded = FRAME_PREFIX;

  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index]! * 256 + bytes[index + 1]!;
      const first = value % 45;
      value = Math.floor(value / 45);
      const second = value % 45;
      const third = Math.floor(value / 45);
      encoded += BASE45_CHARSET[first]! + BASE45_CHARSET[second]! + BASE45_CHARSET[third]!;
    } else {
      const value = bytes[index]!;
      encoded += BASE45_CHARSET[value % 45]! + BASE45_CHARSET[Math.floor(value / 45)]!;
    }
  }

  return encoded;
}

export function decodeFrameText(text: string): Uint8Array | null {
  const normalized = text.trim();
  if (!normalized.startsWith(FRAME_PREFIX)) {
    return null;
  }

  const encoded = normalized.slice(FRAME_PREFIX.length);
  if (encoded.length === 0 || encoded.length % 3 === 1) {
    return null;
  }

  const output: number[] = [];
  for (let index = 0; index < encoded.length; index += 3) {
    const remaining = encoded.length - index;
    const first = BASE45_LOOKUP.get(encoded[index]!);
    const second = BASE45_LOOKUP.get(encoded[index + 1]!);
    if (first === undefined || second === undefined) {
      return null;
    }

    if (remaining >= 3) {
      const third = BASE45_LOOKUP.get(encoded[index + 2]!);
      if (third === undefined) {
        return null;
      }
      const value = first + second * 45 + third * 45 * 45;
      if (value > 0xffff) {
        return null;
      }
      output.push(Math.floor(value / 256), value % 256);
    } else {
      const value = first + second * 45;
      if (value > 0xff) {
        return null;
      }
      output.push(value);
    }
  }

  return new Uint8Array(output);
}
