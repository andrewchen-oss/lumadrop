import assert from "node:assert/strict";
import test from "node:test";

import {
  bytesEqual,
  FRAME_FLAG_CYCLE_SHIFT,
  FrameType,
  LTDecoder,
  LTEncoder,
  frameIndices,
  packFrame,
  parseFrame,
  sha256,
  toHex,
  unwrapFilePayload,
  verifyPayloadHash,
  wrapFilePayload
} from "../src/index.js";

const textEncoder = new TextEncoder();

test("file envelope wraps and unwraps bytes with metadata", () => {
  const bytes = textEncoder.encode("hello lumadrop");
  const wrapped = wrapFilePayload(bytes, {
    name: "../hello.txt",
    type: "text/plain",
    size: bytes.length,
    modified: 1_725_000_000,
    kind: "text"
  });

  const unwrapped = unwrapFilePayload(wrapped);
  assert.equal(unwrapped.meta.name, ".._hello.txt");
  assert.equal(unwrapped.meta.type, "text/plain");
  assert.equal(unwrapped.meta.size, bytes.length);
  assert.equal(unwrapped.meta.modified, 1_725_000_000);
  assert.equal(unwrapped.meta.kind, "text");
  assert.ok(bytesEqual(unwrapped.bytes, bytes));
});

test("binary frame packs, parses, and verifies payload hash", async () => {
  const payload = textEncoder.encode("frame payload");
  const block = new Uint8Array(32);
  block.set(payload);
  const digest = await sha256(payload);

  const frame = packFrame({
    type: FrameType.Data,
    sessionId: 0x12345678,
    seq: 42,
    k: 3,
    blockLen: block.length,
    totalLen: payload.length,
    flags: 0,
    payloadSha256: digest
  }, block);

  const parsed = parseFrame(frame);
  assert.ok(parsed);
  assert.equal(parsed.header.sessionId, 0x12345678);
  assert.equal(parsed.header.seq, 42);
  assert.equal(parsed.header.blockLen, block.length);
  assert.ok(bytesEqual(parsed.block, block));
  assert.ok(await verifyPayloadHash(payload, parsed.header.payloadSha256));
});

test("fountain encoder/decoder recover after dropped and out-of-order frames", async () => {
  const payload = deterministicBytes(4096);
  const digest = await sha256(payload);
  const encoder = new LTEncoder(payload, {
    sessionId: 0xdecafbad,
    blockLen: 128,
    payloadSha256: digest
  });

  const frames: Uint8Array[] = [];
  for (let seq = 0; seq < encoder.k * 4; seq += 1) {
    if (seq % 5 !== 0) {
      frames.push(encoder.encode(seq));
    }
  }
  frames.reverse();

  const first = frames.shift();
  assert.ok(first);
  const decoder = LTDecoder.fromFrameBytes(first);
  assert.ok(decoder);

  for (const frame of frames) {
    const state = decoder.addFrameBytes(frame);
    if (state.complete) {
      break;
    }
  }

  const assembled = decoder.assemble();
  assert.ok(assembled, `decoder state: ${JSON.stringify(decoder.state())}`);
  assert.ok(bytesEqual(assembled, payload));
  assert.ok(await verifyPayloadHash(assembled, digest));
});

test("UTF-8 text survives a complete optical transfer", async () => {
  const sourceText = "LumaDrop text: 离线传输 ✓\nline two";
  const textBytes = textEncoder.encode(sourceText);
  const payload = wrapFilePayload(textBytes, {
    name: "LumaDrop Text.txt",
    type: "text/plain;charset=utf-8",
    size: textBytes.length,
    kind: "text"
  });
  const digest = await sha256(payload);
  const encoder = new LTEncoder(payload, {
    sessionId: 0x10203040,
    blockLen: 32,
    payloadSha256: digest
  });
  const decoder = LTDecoder.fromFrameBytes(encoder.encode(0));
  assert.ok(decoder);

  for (let sequence = 1; !decoder.state().complete && sequence < encoder.k * 4; sequence += 1) {
    decoder.addFrameBytes(encoder.encode(sequence));
  }

  const assembled = decoder.assemble();
  assert.ok(assembled);
  assert.ok(await verifyPayloadHash(assembled, digest));
  const recovered = unwrapFilePayload(assembled);
  assert.equal(recovered.meta.kind, "text");
  assert.equal(new TextDecoder().decode(recovered.bytes), sourceText);
});

test("fountain output is deterministic for the same session and sequence", async () => {
  const payload = textEncoder.encode("LumaDrop deterministic payload");
  const digest = await sha256(payload);
  const options = {
    sessionId: 0x1a2b3c4d,
    blockLen: 16,
    payloadSha256: digest
  };

  const a = new LTEncoder(payload, options);
  const b = new LTEncoder(payload, options);
  const frameA0 = a.encode(0);
  const frameB0 = b.encode(0);
  const frameA1 = a.encode(1);

  assert.equal(toHex(frameA0), toHex(frameB0));
  assert.notEqual(toHex(frameA0), toHex(frameA1));
});

test("fountain stream starts systematically and then emits repair frames", () => {
  const k = 24;
  const direct = Array.from({ length: k }, (_, seq) => frameIndices(k, seq, seq));
  assert.deepEqual(direct, Array.from({ length: k }, (_, index) => [index]));

  const repair = frameIndices(k, 0xdecafbad, k);
  assert.ok(repair.length >= 1);
  assert.ok(repair.every((index) => index >= 0 && index < k));
});

test("cycle-shift schedule changes systematic order between broadcast cycles", () => {
  const k = 24;
  const repairFrames = Math.ceil(k * 0.35);
  const cycleLength = k + repairFrames;

  assert.deepEqual(frameIndices(k, 1, 0, FRAME_FLAG_CYCLE_SHIFT), [0]);
  assert.deepEqual(frameIndices(k, 1, cycleLength, FRAME_FLAG_CYCLE_SHIFT), [1]);
  assert.deepEqual(frameIndices(k, 1, cycleLength * 2, FRAME_FLAG_CYCLE_SHIFT), [2]);
});

function deterministicBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (i * 31 + 7) & 0xff;
  }
  return out;
}
