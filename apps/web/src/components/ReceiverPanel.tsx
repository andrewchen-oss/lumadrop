import {
  LTDecoder,
  parseFrame,
  unwrapFilePayload,
  verifyPayloadHash
} from "@lumadrop/core";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { ArrowLeft, Camera, Check, Download, Image, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { decodeFrameText } from "../lib/frame-text";
import { formatBytes, transferCode } from "../lib/format";

type ReceiverPanelProps = {
  onBack: () => void;
};

type ScannerStatus = "idle" | "requesting" | "scanning" | "verifying" | "complete" | "error";

type ReceivedFile = {
  name: string;
  size: number;
  url: string;
};

export function ReceiverPanel({ onBack }: ReceiverPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const decoderRef = useRef<LTDecoder | null>(null);
  const seenSequencesRef = useRef(new Set<number>());
  const completedRef = useRef(false);
  const downloadUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [framesSeen, setFramesSeen] = useState(0);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [message, setMessage] = useState("Ready when you are.");
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setStatus((current) => current === "scanning" ? "idle" : current);
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
      setFramesSeen(seenSequencesRef.current.size);
    }

    const decoderState = decoder.state();
    const nextProgress = Math.round(((decoder.k - decoderState.neededBlocks) / decoder.k) * 100);
    setProgress(nextProgress);
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
      const blob = new Blob([recovered.bytes.slice().buffer], {
        type: recovered.meta.type || "application/octet-stream"
      });
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      setReceivedFile({ name: recovered.meta.name, size: recovered.bytes.length, url });
      setProgress(100);
      setStatus("complete");
      setMessage("File recovered and verified.");
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
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
    setMessage("Requesting camera access…");
    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 70,
        delayBetweenScanSuccess: 35
      });
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        videoRef.current,
        (result) => {
          if (result) {
            void processFrameText(result.getText());
          }
        }
      );
      scannerControlsRef.current = controls;
      setStatus("scanning");
      setMessage("Point the camera at a LumaDrop screen.");
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Camera access is unavailable.");
    }
  };

  const scanImage = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setMessage("Reading QR image…");
    try {
      const reader = new BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      await processFrameText(result.getText());
    } catch {
      setMessage("No readable LumaDrop QR was found in that image.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const reset = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    decoderRef.current = null;
    seenSequencesRef.current.clear();
    completedRef.current = false;
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setFramesSeen(0);
    setSessionCode(null);
    setReceivedFile(null);
    setMessage("Ready when you are.");
  };

  useEffect(() => () => {
    scannerControlsRef.current?.stop();
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
    }
  }, []);

  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;
  const cameraActive = status === "requesting" || status === "scanning" || status === "verifying";

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
              <span className={`status-label status-${status}`}><i />{status === "complete" ? "Complete" : status === "error" ? "Needs attention" : cameraActive ? "Scanning" : "Waiting"}</span>
              <strong>{message}</strong>
              <small>{framesSeen > 0 ? `${framesSeen} unique frames captured` : "Progress appears after the first valid frame."}</small>
            </div>
          </div>

          {sessionCode && (
            <div className="session-confirmation">
              <span>Transfer code</span>
              <strong>{sessionCode}</strong>
              <small>Match this with the sending screen.</small>
            </div>
          )}

          {receivedFile ? (
            <div className="received-file-card">
              <div className="received-check"><Check size={20} /></div>
              <div><strong>{receivedFile.name}</strong><span>{formatBytes(receivedFile.size)} · SHA-256 verified</span></div>
              <a className="primary-button" href={receivedFile.url} download={receivedFile.name}><Download size={17} /> Save file</a>
            </div>
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

          <div className="receiver-tip"><strong>Tip</strong><p>Turn up the sender’s brightness, avoid glare, and hold both devices still.</p></div>
        </aside>
      </section>
    </main>
  );
}
