# LumaDrop

LumaDrop is an offline-first optical transfer app: desktop and phone exchange files by scanning animated QR frames, then recover the original payload with fountain-code style redundancy.

Try it at [lumadrop.app](https://lumadrop.app). No account, pairing, upload, or backend is required.

The repository now includes:

- `packages/core`: file envelope, binary frame protocol, deterministic fountain encoder/decoder and SHA-256 verification
- `apps/web`: responsive installable web MVP with animated QR sending and camera/image receiving
- tests for binary/text frame round trips and recovery under dropped/out-of-order frames

## Features

- Send files up to 8 MB or text up to 512 KB through animated QR frames
- Install the web app once, then use it offline
- Recover from dropped or out-of-order frames with fountain-code style redundancy
- Scan on-device with ZXing-C++ WebAssembly workers
- Verify recovered payloads with SHA-256 before saving or copying

## How it works

Turbo mode wraps the payload, splits it into 1,400-byte systematic and repair frames, renders Base45-encoded QR images at 18–45 FPS, and repeats the stream. The receiver scans unique frames, reconstructs the payload, verifies its SHA-256 digest, and offers the original file or text.

Everything runs in the browser. There is no account, API, analytics, upload, or backend. Protocol V1 is not encrypted: anyone with a clear view of the sender screen could scan the transfer. Treat the animated QR display like the sensitive content itself.

## Commands

```bash
npm install
npm run build
npm test
npm run dev
```

Open `http://localhost:5173` for local development. Camera access works on localhost. Testing between a computer and phone requires an HTTPS deployment because mobile browsers restrict camera access on insecure network URLs.

## License

[MIT](LICENSE) © 2026 [0xajc](https://x.com/0xajc)
