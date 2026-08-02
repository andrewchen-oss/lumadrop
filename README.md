# LumaDrop

LumaDrop is an offline-first optical transfer app: desktop and phone exchange small files by scanning animated QR frames, then recover the original payload with fountain-code style redundancy.

The repository now includes:

- `packages/core`: file envelope, binary frame protocol, deterministic fountain encoder/decoder and SHA-256 verification
- `apps/web`: responsive installable web MVP with animated QR sending and camera/image receiving
- tests for binary/text frame round trips and recovery under dropped/out-of-order frames

## Web MVP

The current lab build supports files up to 256 KB. The sender wraps the file, splits it into systematic and repair frames, renders Base45-encoded QR images, and repeats the stream. The receiver scans unique frames, reconstructs the payload, verifies its SHA-256 digest, and offers the original file for download.

Everything runs in the browser. There is no account, API, analytics, upload, or backend. Protocol V1 is not encrypted; anyone with a clear view of the sender screen could scan the transfer.

The first usable product target is simple file transfer. Wallet signing can be added later as a different payload type after the transport is stable.

## Commands

```bash
npm install
npm run build
npm test
npm run dev
```

Open `http://localhost:5173` for local development. Camera access works on localhost. Testing between a computer and phone requires an HTTPS deployment because mobile browsers restrict camera access on insecure network URLs.
