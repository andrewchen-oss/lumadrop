import { bytesEqual, FrameHeader, FrameType, packFrame, parseFrame, ParsedFrame, splitmix32 } from "./protocol.js";

export type EncoderOptions = {
  sessionId: number;
  blockLen: number;
  payloadSha256: Uint8Array;
};

export type DecoderState = {
  neededBlocks: number;
  equations: number;
  complete: boolean;
};

type Equation = {
  pivots: Set<number>;
  data: Uint8Array;
};

export function frameIndices(k: number, seed: number, seq?: number): number[] {
  if (k <= 0) {
    throw new Error("k must be positive");
  }

  if (seq !== undefined) {
    const repairFrames = Math.max(1, Math.ceil(k * 0.35));
    const cycleOffset = (seq >>> 0) % (k + repairFrames);
    if (cycleOffset < k) {
      return [cycleOffset];
    }
  }

  const rand = splitmix32(seed);
  const degree = sampleDegree(k, rand);
  const picked = new Set<number>();
  while (picked.size < degree) {
    picked.add(rand() % k);
  }
  return [...picked].sort((a, b) => a - b);
}

export class LTEncoder {
  readonly blockLen: number;
  readonly k: number;
  readonly totalLen: number;

  private readonly sessionId: number;
  private readonly payloadSha256: Uint8Array;
  private readonly blocks: Uint8Array[];

  constructor(payload: Uint8Array, options: EncoderOptions) {
    if (options.blockLen <= 0) {
      throw new Error("blockLen must be positive");
    }

    this.sessionId = options.sessionId >>> 0;
    this.blockLen = options.blockLen;
    this.totalLen = payload.length;
    this.payloadSha256 = options.payloadSha256;
    this.k = Math.ceil(payload.length / options.blockLen);
    this.blocks = [];

    for (let i = 0; i < this.k; i += 1) {
      const block = new Uint8Array(this.blockLen);
      block.set(payload.subarray(i * this.blockLen, Math.min((i + 1) * this.blockLen, payload.length)));
      this.blocks.push(block);
    }
  }

  encode(seq: number): Uint8Array {
    const indices = frameIndices(this.k, this.seedForSeq(seq), seq);
    const mixed = new Uint8Array(this.blockLen);
    for (const index of indices) {
      xorInto(mixed, this.blocks[index]!);
    }

    const header: FrameHeader = {
      type: FrameType.Data,
      sessionId: this.sessionId,
      seq: seq >>> 0,
      k: this.k,
      blockLen: this.blockLen,
      totalLen: this.totalLen,
      flags: 0,
      payloadSha256: this.payloadSha256
    };

    return packFrame(header, mixed);
  }

  private seedForSeq(seq: number): number {
    return ((this.sessionId ^ Math.imul(seq >>> 0, 0x85ebca6b)) >>> 0);
  }
}

export class LTDecoder {
  private readonly equationsByPivot = new Map<number, Equation>();
  private readonly solved = new Map<number, Uint8Array>();
  private header?: FrameHeader;

  readonly sessionId: number;
  readonly k: number;
  readonly blockLen: number;
  readonly totalLen: number;
  readonly payloadSha256: Uint8Array;

  constructor(firstFrame: ParsedFrame) {
    this.header = firstFrame.header;
    this.sessionId = firstFrame.header.sessionId;
    this.k = firstFrame.header.k;
    this.blockLen = firstFrame.header.blockLen;
    this.totalLen = firstFrame.header.totalLen;
    this.payloadSha256 = firstFrame.header.payloadSha256;
    this.addParsedFrame(firstFrame);
  }

  static fromFrameBytes(frameBytes: Uint8Array): LTDecoder | null {
    const parsed = parseFrame(frameBytes);
    return parsed ? new LTDecoder(parsed) : null;
  }

  addFrameBytes(frameBytes: Uint8Array): DecoderState {
    const parsed = parseFrame(frameBytes);
    if (!parsed) {
      return this.state();
    }
    return this.addParsedFrame(parsed);
  }

  addParsedFrame(frame: ParsedFrame): DecoderState {
    if (!this.isCompatible(frame.header)) {
      return this.state();
    }

    const equation: Equation = {
      pivots: new Set(frameIndices(this.k, this.seedForSeq(frame.header.seq), frame.header.seq)),
      data: frame.block.slice()
    };

    this.reduceAndInsert(equation);
    return this.state();
  }

  isComplete(): boolean {
    return this.solved.size === this.k;
  }

  assemble(): Uint8Array | null {
    if (!this.isComplete()) {
      return null;
    }

    const padded = new Uint8Array(this.k * this.blockLen);
    for (let i = 0; i < this.k; i += 1) {
      const block = this.solved.get(i);
      if (!block) {
        return null;
      }
      padded.set(block, i * this.blockLen);
    }
    return padded.slice(0, this.totalLen);
  }

  state(): DecoderState {
    return {
      neededBlocks: Math.max(0, this.k - this.solved.size),
      equations: this.equationsByPivot.size,
      complete: this.isComplete()
    };
  }

  private reduceAndInsert(equation: Equation): void {
    for (const [index, block] of this.solved) {
      if (equation.pivots.delete(index)) {
        xorInto(equation.data, block);
      }
    }

    while (equation.pivots.size > 0) {
      const pivot = Math.min(...equation.pivots);
      const existing = this.equationsByPivot.get(pivot);
      if (!existing) {
        if (equation.pivots.size === 1) {
          this.markSolved(pivot, equation.data);
        } else {
          this.equationsByPivot.set(pivot, equation);
        }
        return;
      }

      for (const index of existing.pivots) {
        if (equation.pivots.has(index)) {
          equation.pivots.delete(index);
        } else {
          equation.pivots.add(index);
        }
      }
      xorInto(equation.data, existing.data);
    }
  }

  private markSolved(index: number, block: Uint8Array): void {
    const existing = this.solved.get(index);
    if (existing) {
      if (!bytesEqual(existing, block)) {
        throw new Error(`conflicting solved block at index ${index}`);
      }
      return;
    }

    this.solved.set(index, block.slice());
    this.equationsByPivot.delete(index);

    for (const [pivot, equation] of [...this.equationsByPivot]) {
      if (equation.pivots.delete(index)) {
        xorInto(equation.data, block);
        if (equation.pivots.size === 0) {
          this.equationsByPivot.delete(pivot);
        } else if (equation.pivots.size === 1) {
          this.equationsByPivot.delete(pivot);
          const solvedIndex = [...equation.pivots][0]!;
          this.markSolved(solvedIndex, equation.data);
        }
      }
    }
  }

  private isCompatible(header: FrameHeader): boolean {
    return header.type === FrameType.Data
      && header.sessionId === this.sessionId
      && header.k === this.k
      && header.blockLen === this.blockLen
      && header.totalLen === this.totalLen
      && bytesEqual(header.payloadSha256, this.payloadSha256);
  }

  private seedForSeq(seq: number): number {
    return ((this.sessionId ^ Math.imul(seq >>> 0, 0x85ebca6b)) >>> 0);
  }
}

function sampleDegree(k: number, rand: () => number): number {
  if (k === 1) {
    return 1;
  }

  const r = (rand() >>> 0) / 0x100000000;
  if (r < 0.55) {
    return 1;
  }
  if (r < 0.85) {
    return 2;
  }
  if (r < 0.97) {
    return Math.min(4, k);
  }
  return 1 + (rand() % Math.min(16, k));
}

function xorInto(target: Uint8Array, source: Uint8Array): void {
  if (target.length !== source.length) {
    throw new Error("cannot xor blocks with different lengths");
  }
  for (let i = 0; i < target.length; i += 1) {
    target[i] = target[i]! ^ source[i]!;
  }
}
