import { FRAME_FLAG_CYCLE_SHIFT, LTEncoder, sha256, wrapFilePayload } from "@lumadrop/core";
import { ArrowLeft, File, Gauge, MessageSquareText, Pause, Play, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";

import { encodeFrameText } from "../lib/frame-text";
import { formatBytes, formatDuration, transferCode } from "../lib/format";
import {
  estimatedOpticalBytesPerSecond,
  MAX_FILE_BYTES,
  MAX_TEXT_BYTES,
  REPAIR_FRAME_RATIO,
  TURBO_BLOCK_LENGTH,
  TURBO_DEFAULT_FPS,
  TURBO_MAX_FPS,
  TURBO_MIN_FPS
} from "../lib/transfer-config";
import { DropZone } from "./DropZone";

const textEncoder = new TextEncoder();

type PreparedTransfer = {
  encoder: LTEncoder;
  displayName: string;
  kind: "file" | "text";
  size: number;
  sessionId: number;
  cycleFrames: number;
};

type SenderPanelProps = {
  onBack: () => void;
};

export function SenderPanel({ onBack }: SenderPanelProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const sequenceRef = useRef(0);
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [transfer, setTransfer] = useState<PreparedTransfer | null>(null);
  const [renderedSequence, setRenderedSequence] = useState(0);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
  const [speed, setSpeed] = useState(TURBO_DEFAULT_FPS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activateTransfer = async (
    bytes: Uint8Array,
    metadata: { name: string; size: number; modified: number; type: string; kind: "file" | "text" }
  ) => {
    const payload = wrapFilePayload(bytes, metadata);
    const digest = await sha256(payload);
    const sessionId = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const encoder = new LTEncoder(payload, {
      sessionId,
      blockLen: TURBO_BLOCK_LENGTH,
      payloadSha256: digest,
      flags: FRAME_FLAG_CYCLE_SHIFT
    });

    setTransfer({
      encoder,
      displayName: metadata.kind === "text" ? "Text message" : metadata.name,
      kind: metadata.kind,
      size: bytes.length,
      sessionId,
      cycleFrames: encoder.k + Math.max(1, Math.ceil(encoder.k * REPAIR_FRAME_RATIO))
    });
    sequenceRef.current = 0;
    setRenderedSequence(0);
    setHasRenderedFrame(false);
    setIsPlaying(true);
  };

  const prepareFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("Turbo mode supports files up to 8 MB.");
      return;
    }

    setIsPreparing(true);
    setIsPlaying(false);
    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      await activateTransfer(fileBytes, {
        name: file.name,
        size: file.size,
        modified: file.lastModified,
        type: file.type || "application/octet-stream",
        kind: "file"
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be prepared.");
    } finally {
      setIsPreparing(false);
    }
  };

  const textBytes = useMemo(() => textEncoder.encode(text), [text]);

  const prepareText = async () => {
    setError(null);
    if (textBytes.length === 0) {
      setError("Enter some text first.");
      return;
    }
    if (textBytes.length > MAX_TEXT_BYTES) {
      setError("Turbo mode supports text up to 512 KB. Shorten it and try again.");
      return;
    }

    setIsPreparing(true);
    setIsPlaying(false);
    try {
      await activateTransfer(textBytes, {
        name: "LumaDrop Text.txt",
        size: textBytes.length,
        modified: Date.now(),
        type: "text/plain;charset=utf-8",
        kind: "text"
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The text could not be prepared.");
    } finally {
      setIsPreparing(false);
    }
  };

  useEffect(() => {
    if (!isPlaying || !transfer) {
      return;
    }
    let cancelled = false;
    let animationFrame = 0;
    let isRendering = false;
    let nextFrameAt = 0;
    let lastUiUpdateAt = 0;
    const frameInterval = 1000 / speed;

    const renderLoop = (timestamp: number) => {
      if (cancelled) {
        return;
      }

      if (!isRendering && timestamp >= nextFrameAt) {
        const canvas = qrCanvasRef.current;
        if (canvas) {
          isRendering = true;
          const sequence = sequenceRef.current;
          const frame = transfer.encoder.encode(sequence);
          void QRCode.toCanvas(canvas, encodeFrameText(frame), {
            width: 720,
            margin: 2,
            errorCorrectionLevel: "L",
            color: { dark: "#10110f", light: "#ffffff" }
          }).then(() => {
            if (cancelled) {
              return;
            }
            sequenceRef.current = (sequence + 1) >>> 0;
            if (sequence === 0) {
              setHasRenderedFrame(true);
            }
            if (timestamp - lastUiUpdateAt >= 200 || sequence === 0) {
              setRenderedSequence(sequence);
              lastUiUpdateAt = timestamp;
            }
          }).catch((cause: unknown) => {
            if (!cancelled) {
              setError(cause instanceof Error ? cause.message : "A QR frame could not be rendered.");
              setIsPlaying(false);
            }
          }).finally(() => {
            isRendering = false;
          });

          nextFrameAt += frameInterval;
          if (nextFrameAt < timestamp - frameInterval) {
            nextFrameAt = timestamp + frameInterval;
          }
        }
      }

      animationFrame = window.requestAnimationFrame(renderLoop);
    };

    animationFrame = window.requestAnimationFrame((timestamp) => {
      nextFrameAt = timestamp;
      renderLoop(timestamp);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying, speed, transfer]);

  const estimatedDuration = useMemo(() => {
    if (!transfer) {
      return null;
    }
    return formatDuration(transfer.cycleFrames / speed);
  }, [speed, transfer]);

  const estimatedRate = formatBytes(estimatedOpticalBytesPerSecond(speed));

  const reset = () => {
    setTransfer(null);
    sequenceRef.current = 0;
    setRenderedSequence(0);
    setHasRenderedFrame(false);
    setIsPlaying(false);
    setError(null);
    setText("");
  };

  return (
    <main className="page-shell transfer-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Home</button>

      <div className="transfer-heading">
        <div>
          <div className="eyebrow"><span /> Send</div>
          <h1>Turn data into light.</h1>
        </div>
        <p>Keep this screen bright and steady while the other device scans.</p>
      </div>

      {!transfer ? (
        <section className="sender-empty">
          <div className="send-type-tabs" role="group" aria-label="Choose what to send">
            <button
              type="button"
              aria-pressed={inputMode === "file"}
              className={inputMode === "file" ? "is-active" : ""}
              onClick={() => { setInputMode("file"); setError(null); }}
            >
              <File size={16} /> File
            </button>
            <button
              type="button"
              aria-pressed={inputMode === "text"}
              className={inputMode === "text" ? "is-active" : ""}
              onClick={() => { setInputMode("text"); setError(null); }}
            >
              <MessageSquareText size={16} /> Text
            </button>
          </div>

          {inputMode === "file" ? (
            <DropZone disabled={isPreparing} onFile={(file) => void prepareFile(file)} />
          ) : (
            <div className="text-composer">
              <div className="text-composer-heading">
                <label htmlFor="send-text">Paste or type text</label>
                <span>{formatBytes(textBytes.length)} / 512 KB</span>
              </div>
              <textarea
                id="send-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="A note, access code, configuration, recovery instructions…"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={isPreparing}
              />
              <div className="text-composer-footer">
                <p><ShieldAlert size={16} /><span>Private key or recovery phrase? Nothing is uploaded, but anyone who sees the QR may capture it.</span></p>
                <button
                  className="primary-button"
                  type="button"
                  disabled={isPreparing || textBytes.length === 0 || textBytes.length > MAX_TEXT_BYTES}
                  onClick={() => void prepareText()}
                >
                  <MessageSquareText size={17} /> Send text as light
                </button>
              </div>
            </div>
          )}
          {isPreparing && <p className="inline-status"><span className="spinner" /> Preparing optical frames…</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="tip-card">
            <span>Turbo mode</span>
            <p>Up to 8 MB per file. For the fastest transfer, turn brightness up and keep both devices steady.</p>
          </div>
        </section>
      ) : (
        <section className="sender-workspace">
          <div className="sender-sidebar">
            <div className="file-card">
              <div className="file-icon">{transfer.kind === "text" ? <MessageSquareText size={24} /> : <File size={24} />}</div>
              <div className="file-details">
                <strong title={transfer.displayName}>{transfer.displayName}</strong>
                <span>{transfer.kind === "text" ? "Text" : "File"} · {formatBytes(transfer.size)}</span>
              </div>
              <button className="icon-button" onClick={reset} aria-label="Start another transfer"><RefreshCw size={17} /></button>
            </div>

            <div className="transfer-code-card">
              <span>Transfer code</span>
              <strong>{transferCode(transfer.sessionId)}</strong>
              <small>Confirm this code on the receiving device.</small>
            </div>

            <div className="speed-control">
              <label htmlFor="frame-speed"><Gauge size={17} /> Turbo speed <strong>{speed} fps</strong></label>
              <input
                id="frame-speed"
                type="range"
                min={TURBO_MIN_FPS}
                max={TURBO_MAX_FPS}
                step="3"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
              <div><span>Turbo</span><span>Max</span></div>
            </div>

            <div className="sender-stats">
              <div><span>Optical rate</span><strong>~{estimatedRate}/s</strong></div>
              <div><span>One cycle</span><strong>{estimatedDuration}</strong></div>
            </div>

            <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Stays on this device</strong>{transfer.kind === "text" ? "This text never touches a server. Keep the QR away from other cameras." : "This file never touches a server."}</span></div>
          </div>

          <div className="qr-stage">
            <div className="qr-stage-top">
              <span className={`live-indicator${isPlaying ? " is-live" : ""}`}><i />{isPlaying ? "Turbo broadcasting" : "Paused"}</span>
              <span>Frame {(renderedSequence % transfer.cycleFrames) + 1} / {transfer.cycleFrames}</span>
            </div>
            <button className="qr-canvas-wrap" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? "Pause transfer" : "Resume transfer"}>
              <canvas ref={qrCanvasRef} aria-label="Animated LumaDrop transfer frame" />
              {!hasRenderedFrame && (
                <span className="qr-loading"><span className="spinner" /> Preparing frame…</span>
              )}
              {!isPlaying && <span className="paused-overlay"><Play size={22} fill="currentColor" /> Resume</span>}
            </button>
            <button className="playback-button" onClick={() => setIsPlaying((value) => !value)}>
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {isPlaying ? "Pause" : "Resume"}
            </button>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
        </section>
      )}
    </main>
  );
}
