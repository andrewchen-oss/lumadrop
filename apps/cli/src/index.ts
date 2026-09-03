#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { FRAME_FLAG_CYCLE_SHIFT, LTEncoder, sha256, wrapFilePayload } from "@lumadrop/core";
import QRCode from "qrcode";

import { encodeFrameText } from "./frame-text.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BLOCK_LENGTH = 300;
const FPS = 4;
const REPAIR_RATIO = 0.35;
function transferCode(sessionId: number): string {
  const hex = sessionId.toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

async function main(): Promise<void> {
  const fileArg = process.argv[2];
  if (!fileArg || fileArg === "--help" || fileArg === "-h") {
    console.log("Usage: npm run send -- /path/to/file");
    process.exitCode = fileArg ? 0 : 1;
    return;
  }

  const path = resolve(fileArg);
  const fileStat = await stat(path);
  if (!fileStat.isFile()) throw new Error(`not a file: ${path}`);
  if (fileStat.size > MAX_FILE_BYTES) throw new Error("LumaDrop supports files up to 8 MB");

  const bytes = new Uint8Array(await readFile(path));
  const payload = wrapFilePayload(bytes, {
    name: basename(path),
    size: bytes.length,
    modified: fileStat.mtimeMs,
    type: "application/octet-stream",
    kind: "file"
  });
  const sessionId = randomBytes(4).readUInt32LE();
  const encoder = new LTEncoder(payload, {
    sessionId,
    blockLen: BLOCK_LENGTH,
    payloadSha256: await sha256(payload),
    flags: FRAME_FLAG_CYCLE_SHIFT
  });
  const cycleFrames = encoder.k + Math.max(1, Math.ceil(encoder.k * REPAIR_RATIO));
  let sequence = 0;

  process.stdout.write("\u001B[2J\u001B[?25l");
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const render = async () => {
    const frame = encoder.encode(sequence);
    const qr = await QRCode.toString(encodeFrameText(frame), {
      type: "terminal",
      errorCorrectionLevel: "L",
      margin: 2,
      small: true
    });
    const position = (sequence % cycleFrames) + 1;
    process.stdout.write(`\u001B[H${qr}\nLumaDrop | ${basename(path)} | code ${transferCode(sessionId)} | frame ${position}/${cycleFrames} | Ctrl+C to stop\u001B[J`);
    sequence = (sequence + 1) >>> 0;
    if (!stopped) timer = setTimeout(() => void render(), 1000 / FPS);
  };
  await render();

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    process.stdout.write("\u001B[0m\u001B[?25h\n");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((cause: unknown) => {
  process.stderr.write(`error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
