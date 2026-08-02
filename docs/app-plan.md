# LumaDrop App Plan

## Goal

Build a desktop + mobile app for short-range, offline-capable transfer using animated QR frames.

The first version should prove one thing clearly: a sender can show a file as flashing QR frames, and a receiver can scan enough frames to reconstruct and save the file.

## Why It Can Work

It does not require the phone to connect to the computer over LAN, Wi-Fi, Bluetooth, or the public internet. The optical channel is the link:

1. sender encodes bytes into fountain frames
2. sender renders frames as fast QR codes
3. receiver camera scans any subset of frames
4. decoder recovers the original payload once enough independent frames arrive

The app still needs local camera permission and enough screen/camera quality. It does not need both devices to be on the same network.

## MVP Scope

Desktop sender:

- choose file
- wrap file with metadata envelope
- encode into frames
- display animated QR
- show progress and transfer code

Mobile receiver:

- camera scanner
- parse frames
- recover payload
- verify hash
- save/share received file

Reverse direction comes after this works.

## Technical Shape

- `packages/core`: pure TypeScript protocol, frame format, envelope, fountain encoder/decoder
- later `apps/desktop`: Tauri or Electron
- later `apps/mobile`: React Native/Expo or native Swift/Kotlin

For speed, start with Tauri desktop + Expo mobile if camera QR throughput is acceptable. If scanning performance becomes the bottleneck, replace the mobile scanner with native code.

## Protocol V1

Frame header is a fixed 64-byte binary prefix:

- magic: `LD01`
- version: `1`
- frame type
- header length
- session id
- sequence number
- source block count `k`
- source block length
- total payload length
- flags
- SHA-256 of full payload

Frame body contains one fountain-coded block.

File payload envelope:

- magic: `LDE1`
- metadata JSON length
- metadata JSON
- raw file bytes

## Security

V1 is transport only. It must not pretend to be secure.

Next security layer:

- pair devices using a human-visible short code
- encrypt payload with X25519 + AEAD
- include replay protection and transfer expiry

Wallet signing is possible, but should be treated as a separate protocol mode:

- desktop creates an unsigned transaction / SIWE / typed-data request
- phone receives optical request
- phone signs with local wallet key
- phone returns signature optically

This cannot directly "replace MetaMask clicking sign" unless integrated as a wallet, wallet connector, browser extension, or local signing bridge.

## First Engineering Milestones

1. ✅ Core package with deterministic protocol tests
2. ✅ Browser MVP using the core package
3. Desktop sender shell
4. Mobile scanner receiver
5. Encrypted transfer
6. Wallet signing prototype

## Browser MVP Decisions

- responsive React/Vite PWA so the optical flow can be validated before native packaging
- Base45 QR text encoding to take advantage of QR alphanumeric mode
- 128-byte source blocks and QR error correction level M for camera reliability
- systematic source frames followed by 35% repair frames in a repeating cycle
- 256 KB file cap while real-device throughput and thermal behavior are measured
- camera scan plus saved-image scan for accessibility and testing
