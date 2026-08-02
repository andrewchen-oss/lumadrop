import { LTEncoder, sha256, wrapFilePayload } from "@lumadrop/core";
import { ArrowLeft, File, Gauge, Pause, Play, RefreshCw, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { encodeFrameText } from "../lib/frame-text";
import { formatBytes, formatDuration, transferCode } from "../lib/format";
import { DropZone } from "./DropZone";

const MAX_FILE_BYTES = 256 * 1024;
const BLOCK_LENGTH = 128;

type PreparedTransfer = {
  encoder: LTEncoder;
  file: File;
  sessionId: number;
  cycleFrames: number;
};

type SenderPanelProps = {
  onBack: () => void;
};

export function SenderPanel({ onBack }: SenderPanelProps) {
  const [transfer, setTransfer] = useState<PreparedTransfer | null>(null);
  const [sequence, setSequence] = useState(0);
  const [renderedFrame, setRenderedFrame] = useState<{ url: string; sequence: number } | null>(null);
  const [speed, setSpeed] = useState(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepareFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("This lab build supports files up to 256 KB. Try a smaller file for the optical demo.");
      return;
    }

    setIsPreparing(true);
    setIsPlaying(false);
    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const metadata = {
        name: file.name,
        size: file.size,
        modified: file.lastModified
      } as { name: string; size: number; modified: number; type?: string };
      if (file.type) {
        metadata.type = file.type;
      }
      const payload = wrapFilePayload(fileBytes, metadata);
      const digest = await sha256(payload);
      const sessionId = crypto.getRandomValues(new Uint32Array(1))[0]!;
      const encoder = new LTEncoder(payload, {
        sessionId,
        blockLen: BLOCK_LENGTH,
        payloadSha256: digest
      });

      setTransfer({
        encoder,
        file,
        sessionId,
        cycleFrames: encoder.k + Math.max(1, Math.ceil(encoder.k * 0.35))
      });
      setSequence(0);
      setRenderedFrame(null);
      setIsPlaying(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be prepared.");
    } finally {
      setIsPreparing(false);
    }
  };

  useEffect(() => {
    if (!isPlaying || !transfer) {
      return;
    }
    const timer = window.setInterval(() => {
      setSequence((current) => (current + 1) >>> 0);
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, transfer]);

  useEffect(() => {
    if (!transfer) {
      return;
    }

    let cancelled = false;
    const frame = transfer.encoder.encode(sequence);
    void QRCode.toDataURL(encodeFrameText(frame), {
      width: 640,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#10110f", light: "#ffffff" }
    }).then(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!cancelled) {
        setRenderedFrame({ url, sequence });
      }
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "A QR frame could not be rendered.");
        setIsPlaying(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sequence, transfer]);

  const estimatedDuration = useMemo(() => {
    if (!transfer) {
      return null;
    }
    return formatDuration(transfer.cycleFrames / speed);
  }, [speed, transfer]);

  const reset = () => {
    setTransfer(null);
    setSequence(0);
    setRenderedFrame(null);
    setIsPlaying(false);
    setError(null);
  };

  return (
    <main className="page-shell transfer-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Home</button>

      <div className="transfer-heading">
        <div>
          <div className="eyebrow"><span /> Send</div>
          <h1>Turn a file into light.</h1>
        </div>
        <p>Keep this screen bright and steady while the other device scans.</p>
      </div>

      {!transfer ? (
        <section className="sender-empty">
          <DropZone disabled={isPreparing} onFile={(file) => void prepareFile(file)} />
          {isPreparing && <p className="inline-status"><span className="spinner" /> Preparing optical frames…</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="tip-card">
            <span>Best for</span>
            <p>Notes, contacts, keys, small documents and compressed images. Larger files come after we validate scanning throughput.</p>
          </div>
        </section>
      ) : (
        <section className="sender-workspace">
          <div className="sender-sidebar">
            <div className="file-card">
              <div className="file-icon"><File size={24} /></div>
              <div className="file-details">
                <strong title={transfer.file.name}>{transfer.file.name}</strong>
                <span>{formatBytes(transfer.file.size)}</span>
              </div>
              <button className="icon-button" onClick={reset} aria-label="Choose another file"><RefreshCw size={17} /></button>
            </div>

            <div className="transfer-code-card">
              <span>Transfer code</span>
              <strong>{transferCode(transfer.sessionId)}</strong>
              <small>Confirm this code on the receiving device.</small>
            </div>

            <div className="speed-control">
              <label htmlFor="frame-speed"><Gauge size={17} /> Frame speed <strong>{speed} fps</strong></label>
              <input
                id="frame-speed"
                type="range"
                min="3"
                max="12"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
              <div><span>Safer</span><span>Faster</span></div>
            </div>

            <div className="sender-stats">
              <div><span>Blocks</span><strong>{transfer.encoder.k}</strong></div>
              <div><span>One cycle</span><strong>{estimatedDuration}</strong></div>
            </div>

            <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Stays on this device</strong>This file never touches a server.</span></div>
          </div>

          <div className="qr-stage">
            <div className="qr-stage-top">
              <span className={`live-indicator${isPlaying ? " is-live" : ""}`}><i />{isPlaying ? "Broadcasting" : "Paused"}</span>
              <span>Frame {((renderedFrame?.sequence ?? sequence) % transfer.cycleFrames) + 1} / {transfer.cycleFrames}</span>
            </div>
            <button className="qr-canvas-wrap" onClick={() => setIsPlaying((value) => !value)} aria-label={isPlaying ? "Pause transfer" : "Resume transfer"}>
              {renderedFrame ? (
                <img src={renderedFrame.url} alt="Animated LumaDrop transfer frame" />
              ) : (
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
