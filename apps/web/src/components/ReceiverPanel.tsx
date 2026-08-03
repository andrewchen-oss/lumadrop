import {
  LTDecoder,
  parseFrame,
  unwrapFilePayload,
  verifyPayloadHash
} from "@lumadrop/core";
import { ArrowLeft, Camera, Check, Copy, Download, Image, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { decodeFrameText } from "../lib/frame-text";
import { formatBytes, transferCode } from "../lib/format";
import { MAX_WRAPPED_PAYLOAD_BYTES } from "../lib/transfer-config";
import {
  readQrImage,
  startTurboScanner,
  type TurboScannerControls,
  type TurboScannerStats
} from "../lib/turbo-scanner";

type ReceiverPanelProps = {
  onBack: () => void;
};

type ScannerStatus = "idle" | "requesting" | "scanning" | "verifying" | "complete" | "error";

type ReceivedTransfer =
  | { kind: "file"; name: string; size: number; url: string }
  | { kind: "text"; name: string; size: number; text: string; url: string };

export function ReceiverPanel({ onBack }: ReceiverPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<TurboScannerControls | null>(null);
  const scannerAbortRef = useRef<AbortController | null>(null);
  const decoderRef = useRef<LTDecoder | null>(null);
  const seenSequencesRef = useRef(new Set<number>());
  const completedRef = useRef(false);
  const downloadUrlRef = useRef<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const lastProgressUpdateRef = useRef(0);
  const activeBlockLengthRef = useRef(0);

  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [framesSeen, setFramesSeen] = useState(0);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [message, setMessage] = useState("Ready when you are.");
  const [receivedTransfer, setReceivedTransfer] = useState<ReceivedTransfer | null>(null);
  const [copied, setCopied] = useState(false);
  const [scannerStats, setScannerStats] = useState<TurboScannerStats | null>(null);

  const stopScanner = useCallback(() => {
    scannerAbortRef.current?.abort();
    scannerAbortRef.current = null;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setStatus((current) => current === "requesting" || current === "scanning" ? "idle" : current);
    setMessage("Camera stopped. Ready when you are.");
  }, []);

  const processFrameText = useCallback(async (text: string) => {
    if (completedRef.current) {
      return;
    }

    const frameBytes = decodeFrameText(text);
    if (!frameBytes) {
      setMessage("That QR code is not a LumaDrop frame.");
      return;
    }

    const parsed = parseFrame(frameBytes);
    if (!parsed) {
      setMessage("A LumaDrop frame was seen, but it was incomplete.");
      return;
    }
    if (parsed.header.totalLen > MAX_WRAPPED_PAYLOAD_BYTES) {
      setMessage("This transfer is larger than the 8 MB Turbo limit.");
      return;
    }
    activeBlockLengthRef.current = parsed.header.blockLen;

    let decoder = decoderRef.current;
    if (!decoder) {
      decoder = new LTDecoder(parsed);
      decoderRef.current = decoder;
      seenSequencesRef.current.add(parsed.header.seq);
      setSessionCode(transferCode(parsed.header.sessionId));
      setFramesSeen(1);
    } else {
      if (parsed.header.sessionId !== decoder.sessionId) {
        setMessage("Another transfer is in view. Keep the expected QR centered.");
        return;
      }
      if (seenSequencesRef.current.has(parsed.header.seq)) {
        return;
      }
      seenSequencesRef.current.add(parsed.header.seq);
      decoder.addParsedFrame(parsed);
    }

    const decoderState = decoder.state();
    const nextProgress = Math.round(((decoder.k - decoderState.neededBlocks) / decoder.k) * 100);
    const now = performance.now();
    if (decoderState.complete || now - lastProgressUpdateRef.current >= 100) {
      setFramesSeen(seenSequencesRef.current.size);
      setProgress(nextProgress);
      lastProgressUpdateRef.current = now;
    }
    setMessage(decoderState.complete ? "All blocks received. Verifying…" : "Receiving light frames…");

    if (!decoderState.complete) {
      return;
    }

    completedRef.current = true;
    setStatus("verifying");
    const payload = decoder.assemble();
    if (!payload || !(await verifyPayloadHash(payload, decoder.payloadSha256))) {
      completedRef.current = false;
      setStatus("error");
      setMessage("Integrity check failed. Reset and scan the transfer again.");
      return;
    }

    try {
      const recovered = unwrapFilePayload(payload);
      const isText = recovered.meta.kind === "text";
      const text = isText ? new TextDecoder("utf-8", { fatal: true }).decode(recovered.bytes) : null;
      const blob = new Blob([recovered.bytes.slice().buffer], { type: recovered.meta.type || "application/octet-stream" });
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setReceivedTransfer(isText && text !== null
        ? { kind: "text", name: recovered.meta.name, size: recovered.bytes.length, text, url }
        : { kind: "file", name: recovered.meta.name, size: recovered.bytes.length, url });
      setProgress(100);
      setStatus("complete");
      setMessage(isText ? "Text recovered and verified." : "File recovered and verified.");
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      scannerAbortRef.current = null;
    } catch (cause) {
      completedRef.current = false;
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "The recovered file could not be opened.");
    }
  }, []);

  const startScanner = async () => {
    if (!videoRef.current) {
      return;
    }
    setStatus("requesting");
    setMessage("Starting the Turbo camera decoder…");
    const abortController = new AbortController();
    scannerAbortRef.current?.abort();
    scannerAbortRef.current = abortController;
    try {
      const controls = await startTurboScanner(videoRef.current, {
        onText: (text) => {
          void processFrameText(text).catch((cause: unknown) => {
            setStatus("error");
            setMessage(cause instanceof Error ? cause.message : "A Turbo frame could not be processed.");
          });
        },
        onStats: setScannerStats,
        onError: (errorMessage) => {
          setMessage(errorMessage);
        }
      }, abortController.signal);
      if (abortController.signal.aborted) {
        controls.stop();
        return;
      }
      scannerControlsRef.current = controls;
      setStatus("scanning");
      setMessage("Turbo scanner ready. Fill the guide with the QR code.");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        return;
      }
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Camera access is unavailable.");
    } finally {
      if (scannerAbortRef.current === abortController && (abortController.signal.aborted || !scannerControlsRef.current)) {
        scannerAbortRef.current = null;
      }
    }
  };

  const scanImage = async (file: File) => {
    setMessage("Reading QR image…");
    try {
      const text = await readQrImage(file);
      if (!text) {
        throw new Error("No QR code found.");
      }
      await processFrameText(text);
    } catch {
      setMessage("No readable LumaDrop QR was found in that image.");
    }
  };

  const reset = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    scannerAbortRef.current?.abort();
    scannerAbortRef.current = null;
    decoderRef.current = null;
    seenSequencesRef.current.clear();
    completedRef.current = false;
    lastProgressUpdateRef.current = 0;
    activeBlockLengthRef.current = 0;
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setFramesSeen(0);
    setSessionCode(null);
    setReceivedTransfer(null);
    setCopied(false);
    setScannerStats(null);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = null;
    }
    setMessage("Ready when you are.");
  };

  const copyReceivedText = async () => {
    if (receivedTransfer?.kind !== "text") {
      return;
    }
    try {
      await navigator.clipboard.writeText(receivedTransfer.text);
      setCopied(true);
      setMessage("Text copied to clipboard.");
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimerRef.current = null;
      }, 1800);
    } catch {
      setMessage("Copy was blocked. Select the received text and copy it manually.");
    }
  };

  useEffect(() => () => {
    scannerAbortRef.current?.abort();
    scannerControlsRef.current?.stop();
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
    }
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
  }, []);

  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;
  const cameraActive = status === "requesting" || status === "scanning" || status === "verifying";
  const showLiveScannerStats = status === "scanning" && (scannerStats?.decodedFps ?? 0) > 0;
  const liveOpticalRate = showLiveScannerStats && scannerStats && activeBlockLengthRef.current > 0
    ? formatBytes(scannerStats.decodedFps * activeBlockLengthRef.current)
    : null;

  return (
    <main className="page-shell transfer-page">
      <button className="back-button" onClick={() => { stopScanner(); onBack(); }}><ArrowLeft size={17} /> Home</button>

      <div className="transfer-heading">
        <div>
          <div className="eyebrow"><span /> Receive</div>
          <h1>Catch the light.</h1>
        </div>
        <p>Use the rear camera and fill the frame with the sender’s QR code.</p>
      </div>

      <section className="receiver-workspace">
        <div className={`camera-stage status-${status}`}>
          <video ref={videoRef} muted playsInline />
          {!cameraActive && status !== "complete" && (
            <div className="camera-placeholder">
              <div className="scanner-orb"><ScanLine size={34} /></div>
              <strong>Camera is off</strong>
              <p>Nothing is recorded or uploaded.</p>
            </div>
          )}
          {cameraActive && (
            <div className="scan-overlay" aria-hidden="true">
              <i className="corner corner-a" /><i className="corner corner-b" />
              <i className="corner corner-c" /><i className="corner corner-d" />
              <span className="scan-line" />
            </div>
          )}
          {status === "complete" && (
            <div className="complete-visual">
              <span><Check size={38} strokeWidth={2.5} /></span>
              <strong>Received</strong>
            </div>
          )}
          <div className="camera-badge"><ShieldCheck size={14} /> On-device only</div>
        </div>

        <aside className="receiver-sidebar">
          <div className="receive-progress-card">
            <div className="progress-ring" style={progressStyle}>
              <div><strong>{progress}%</strong><span>recovered</span></div>
            </div>
            <div className="progress-copy">
              <span className={`status-label status-${status}`}><i />{status === "complete" ? "Complete" : status === "error" ? "Needs attention" : cameraActive ? "Turbo scanning" : "Waiting"}</span>
              <strong>{message}</strong>
              <small>{framesSeen > 0
                ? `${framesSeen} unique frames${showLiveScannerStats ? ` · ${scannerStats?.decodedFps ?? 0} fps` : ""}${liveOpticalRate ? ` · ~${liveOpticalRate}/s` : ""}`
                : "Progress appears after the first valid frame."}</small>
            </div>
          </div>

          {sessionCode && (
            <div className="session-confirmation">
              <span>Transfer code</span>
              <strong>{sessionCode}</strong>
              <small>Match this with the sending screen.</small>
            </div>
          )}

          {receivedTransfer ? (
            receivedTransfer.kind === "text" ? (
              <div className="received-text-card">
                <div className="received-text-heading">
                  <span><Check size={16} /> Received text</span>
                  <small>{formatBytes(receivedTransfer.size)} · verified</small>
                </div>
                <textarea aria-label="Received text" value={receivedTransfer.text} readOnly spellCheck={false} />
                <div className="received-text-actions">
                  <button className="primary-button" type="button" onClick={() => void copyReceivedText()}>
                    {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copied" : "Copy text"}
                  </button>
                  <a className="secondary-button" href={receivedTransfer.url} download={receivedTransfer.name}><Download size={17} /> Save .txt</a>
                </div>
                <p>Keep sensitive text away from nearby people and cameras.</p>
              </div>
            ) : (
              <div className="received-file-card">
                <div className="received-check"><Check size={20} /></div>
                <div><strong>{receivedTransfer.name}</strong><span>{formatBytes(receivedTransfer.size)} · SHA-256 verified</span></div>
                <a className="primary-button" href={receivedTransfer.url} download={receivedTransfer.name}><Download size={17} /> Save file</a>
              </div>
            )
          ) : (
            <div className="receiver-actions">
              {!cameraActive ? (
                <button className="primary-button" onClick={() => void startScanner()}><Camera size={18} /> Start camera</button>
              ) : (
                <button className="secondary-button" onClick={stopScanner}>Stop camera</button>
              )}
              <label className="secondary-button file-scan-button">
                <Image size={17} /> Scan a saved image
                <input type="file" accept="image/*" hidden onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void scanImage(file);
                  }
                  event.target.value = "";
                }} />
              </label>
            </div>
          )}

          {(framesSeen > 0 || status === "error" || status === "complete") && (
            <button className="reset-button" onClick={reset}><RefreshCw size={15} /> Reset receiver</button>
          )}

          <div className="receiver-tip"><strong>Turbo</strong><p>Turn up the sender’s brightness, fill the guide with the QR, and hold both devices still.</p></div>
        </aside>
      </section>
    </main>
  );
}
