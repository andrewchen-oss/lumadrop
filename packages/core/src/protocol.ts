import { sha256 } from "./hash.js";

export const FRAME_MAGIC = new Uint8Array([0x4c, 0x44, 0x30, 0x31]); // LD01
export const FRAME_VERSION = 1;
export const FRAME_HEADER_LEN = 64;
export const PAYLOAD_HASH_LEN = 32;
export const FRAME_FLAG_CYCLE_SHIFT = 1 << 0;

export enum FrameType {
  Data = 1,
  Manifest = 2,
  Done = 3,
  SignedResponse = 4
}

export type FrameHeader = {
  type: FrameType;
  sessionId: number;
  seq: number;
  k: number;
  blockLen: number;
  totalLen: number;
  flags: number;
  payloadSha256: Uint8Array;
};

export type ParsedFrame = {
  header: FrameHeader;
  block: Uint8Array;
};

export function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function packFrame(header: FrameHeader, block: Uint8Array): Uint8Array {
  validateHeader(header);
  if (block.length !== header.blockLen) {
    throw new Error(`block length ${block.length} does not match header blockLen ${header.blockLen}`);
  }

  const out = new Uint8Array(FRAME_HEADER_LEN + block.length);
  out.set(FRAME_MAGIC, 0);
  out[4] = FRAME_VERSION;
  out[5] = header.type;

  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint16(6, FRAME_HEADER_LEN, true);
  view.setUint32(8, header.sessionId >>> 0, true);
  view.setUint32(12, header.seq >>> 0, true);
  view.setUint32(16, header.k >>> 0, true);
  view.setUint32(20, header.blockLen >>> 0, true);
  view.setUint32(24, header.totalLen >>> 0, true);
  view.setUint32(28, header.flags >>> 0, true);
  out.set(header.payloadSha256, 32);
  out.set(block, FRAME_HEADER_LEN);
  return out;
}

export function parseFrame(bytes: Uint8Array): ParsedFrame | null {
  if (bytes.length < FRAME_HEADER_LEN) {
    return null;
  }

  for (let i = 0; i < FRAME_MAGIC.length; i += 1) {
    if (bytes[i] !== FRAME_MAGIC[i]) {
      return null;
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[4];
  const type = bytes[5] as FrameType;
  const headerLen = view.getUint16(6, true);
  if (version !== FRAME_VERSION || headerLen !== FRAME_HEADER_LEN) {
    return null;
  }

  const blockLen = view.getUint32(20, true);
  if (bytes.length !== FRAME_HEADER_LEN + blockLen) {
    return null;
  }

  const header: FrameHeader = {
    type,
    sessionId: view.getUint32(8, true),
    seq: view.getUint32(12, true),
    k: view.getUint32(16, true),
    blockLen,
    totalLen: view.getUint32(24, true),
    flags: view.getUint32(28, true),
    payloadSha256: bytes.slice(32, 32 + PAYLOAD_HASH_LEN)
  };

  try {
    validateHeader(header);
  } catch {
    return null;
  }

  return {
    header,
    block: bytes.slice(FRAME_HEADER_LEN)
  };
}

export async function verifyPayloadHash(payload: Uint8Array, expectedSha256: Uint8Array): Promise<boolean> {
  return bytesEqual(await sha256(payload), expectedSha256);
}

function validateHeader(header: FrameHeader): void {
  if (!Object.values(FrameType).includes(header.type)) {
    throw new Error(`invalid frame type ${header.type}`);
  }
  if (!Number.isInteger(header.sessionId) || header.sessionId < 0 || header.sessionId > 0xffffffff) {
    throw new Error("sessionId must be a uint32");
  }
  if (!Number.isInteger(header.seq) || header.seq < 0 || header.seq > 0xffffffff) {
    throw new Error("seq must be a uint32");
  }
  if (!Number.isInteger(header.k) || header.k <= 0 || header.k > 0xffffffff) {
    throw new Error("k must be a positive uint32");
  }
  if (!Number.isInteger(header.blockLen) || header.blockLen <= 0 || header.blockLen > 0xffffffff) {
    throw new Error("blockLen must be a positive uint32");
  }
  if (!Number.isInteger(header.totalLen) || header.totalLen <= 0 || header.totalLen > 0xffffffff) {
    throw new Error("totalLen must be a positive uint32");
  }
  if (!Number.isInteger(header.flags) || header.flags < 0 || header.flags > 0xffffffff) {
    throw new Error("flags must be a uint32");
  }
  if (header.payloadSha256.length !== PAYLOAD_HASH_LEN) {
    throw new Error(`payloadSha256 must be ${PAYLOAD_HASH_LEN} bytes`);
  }
}
