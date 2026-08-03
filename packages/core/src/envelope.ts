const ENVELOPE_MAGIC = new Uint8Array([0x4c, 0x44, 0x45, 0x31]); // LDE1
const ENVELOPE_HEADER_LEN = 8;

export type FilePayloadMeta = {
  name: string;
  type?: string;
  size: number;
  modified?: number;
  kind?: "file" | "text";
};

export type WrappedFilePayload = {
  meta: FilePayloadMeta;
  bytes: Uint8Array;
};

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:\0]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "lumadrop-file";
}

export function wrapFilePayload(bytes: Uint8Array, meta: FilePayloadMeta): Uint8Array {
  if (meta.size !== bytes.length) {
    throw new Error(`metadata size ${meta.size} does not match payload size ${bytes.length}`);
  }

  const normalizedMeta: FilePayloadMeta = {
    ...meta,
    name: safeFileName(meta.name)
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(normalizedMeta));
  const out = new Uint8Array(ENVELOPE_HEADER_LEN + metaBytes.length + bytes.length);
  out.set(ENVELOPE_MAGIC, 0);

  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(4, metaBytes.length, true);

  out.set(metaBytes, ENVELOPE_HEADER_LEN);
  out.set(bytes, ENVELOPE_HEADER_LEN + metaBytes.length);
  return out;
}

export function unwrapFilePayload(payload: Uint8Array): WrappedFilePayload {
  if (payload.length < ENVELOPE_HEADER_LEN) {
    throw new Error("payload is too short for LumaDrop envelope");
  }

  for (let i = 0; i < ENVELOPE_MAGIC.length; i += 1) {
    if (payload[i] !== ENVELOPE_MAGIC[i]) {
      throw new Error("invalid LumaDrop envelope magic");
    }
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const metaLen = view.getUint32(4, true);
  const bytesStart = ENVELOPE_HEADER_LEN + metaLen;

  if (bytesStart > payload.length) {
    throw new Error("invalid LumaDrop envelope metadata length");
  }

  const metaJson = new TextDecoder().decode(payload.subarray(ENVELOPE_HEADER_LEN, bytesStart));
  const parsed = JSON.parse(metaJson) as Partial<FilePayloadMeta>;
  if (typeof parsed.name !== "string" || typeof parsed.size !== "number") {
    throw new Error("invalid LumaDrop envelope metadata");
  }

  const bytes = payload.subarray(bytesStart);
  if (parsed.size !== bytes.length) {
    throw new Error(`metadata size ${parsed.size} does not match payload size ${bytes.length}`);
  }

  const meta: FilePayloadMeta = {
    name: safeFileName(parsed.name),
    size: parsed.size
  };
  if (typeof parsed.type === "string") {
    meta.type = parsed.type;
  }
  if (typeof parsed.modified === "number") {
    meta.modified = parsed.modified;
  }
  if (parsed.kind === "file" || parsed.kind === "text") {
    meta.kind = parsed.kind;
  }

  return { meta, bytes };
}
