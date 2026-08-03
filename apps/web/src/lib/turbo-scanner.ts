import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import readerWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export type TurboScannerStats = {
  capturedFps: number;
  decodedFps: number;
  averageDecodeMs: number;
  droppedFrames: number;
};

export type TurboScannerControls = {
  stop: () => void;
};

type StartTurboScannerOptions = {
  onText: (text: string) => void;
  onStats: (stats: TurboScannerStats) => void;
  onError: (message: string) => void;
};

type ReaderWorkerMessage =
  | { type: "ready" }
  | { type: "decoded"; id: number; text: string | null; decodeMs: number }
  | { type: "error"; message: string };

type WorkerSlot = {
  worker: Worker;
  busy: boolean;
};

type VideoFrameCallback = (now: DOMHighResTimeStamp, metadata: { mediaTime: number }) => void;
type TurboVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const SCAN_SIZE = 720;
const WORKER_READY_TIMEOUT_MS = 15_000;

prepareZXingModule({
  overrides: {
    locateFile: () => readerWasmUrl
  },
  fireImmediately: false
});

export async function prepareTurboScannerAssets(): Promise<void> {
  await Promise.all([
    prepareZXingModule({
      overrides: { locateFile: () => readerWasmUrl },
      fireImmediately: true
    }),
    warmReaderWorker()
  ]);
}

export async function readQrImage(file: File): Promise<string | null> {
  const results = await readBarcodes(file, {
    formats: ["QRCode"],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    maxNumberOfSymbols: 1
  });
  return results[0]?.text ?? null;
}

export async function startTurboScanner(
  video: HTMLVideoElement,
  options: StartTurboScannerOptions,
  signal?: AbortSignal
): Promise<TurboScannerControls> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, min: 24 }
    }
  });

  const workers: WorkerSlot[] = [];
  let stopped = false;
  let frameCallbackHandle: number | null = null;
  let fallbackFrameHandle: number | null = null;
  let capturePending = false;
  let nextFrameId = 0;
  let capturedThisSecond = 0;
  let completedThisSecond = 0;
  let decodedThisSecond = 0;
  let decodeMsThisSecond = 0;
  let droppedFrames = 0;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    const turboVideo = video as TurboVideoElement;
    if (frameCallbackHandle !== null) {
      turboVideo.cancelVideoFrameCallback?.(frameCallbackHandle);
    }
    if (fallbackFrameHandle !== null) {
      window.cancelAnimationFrame(fallbackFrameHandle);
    }
    window.clearInterval(statsTimer);
    for (const slot of workers) {
      slot.worker.terminate();
    }
    for (const track of stream.getTracks()) {
      track.stop();
    }
    video.pause();
    video.srcObject = null;
    signal?.removeEventListener("abort", stop);
  };

  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) {
    stop();
    throw abortError();
  }

  const statsTimer = window.setInterval(() => {
    options.onStats({
      capturedFps: capturedThisSecond,
      decodedFps: decodedThisSecond,
      averageDecodeMs: completedThisSecond > 0 ? decodeMsThisSecond / completedThisSecond : 0,
      droppedFrames
    });
    capturedThisSecond = 0;
    completedThisSecond = 0;
    decodedThisSecond = 0;
    decodeMsThisSecond = 0;
  }, 1000);

  try {
    video.srcObject = stream;
    await video.play();

    const workerCount = (navigator.hardwareConcurrency ?? 4) >= 8 ? 3 : 2;
    const readyWorkers = Array.from({ length: workerCount }, async () => {
      const worker = createReaderWorker();
      const slot: WorkerSlot = { worker, busy: false };
      workers.push(slot);
      await waitForWorker(worker);
      worker.onmessage = (event: MessageEvent<ReaderWorkerMessage>) => {
        const message = event.data;
        if (message.type === "decoded") {
          slot.busy = false;
          completedThisSecond += 1;
          decodeMsThisSecond += message.decodeMs;
          if (message.text) {
            decodedThisSecond += 1;
            options.onText(message.text);
          }
          return;
        }
        if (message.type === "error") {
          slot.busy = false;
          options.onError(message.message);
        }
      };
      worker.onerror = () => {
        slot.busy = false;
        options.onError("A Turbo decoder worker stopped unexpectedly.");
      };
    });
    await Promise.all(readyWorkers);
    if (stopped || signal?.aborted) {
      throw abortError();
    }

    const captureFrame = () => {
      if (stopped || capturePending || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }
      const slot = workers.find((candidate) => !candidate.busy);
      if (!slot) {
        droppedFrames += 1;
        return;
      }

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const cropSize = Math.min(sourceWidth, sourceHeight);
      if (cropSize <= 0) {
        return;
      }

      capturePending = true;
      slot.busy = true;
      const sourceX = Math.floor((sourceWidth - cropSize) / 2);
      const sourceY = Math.floor((sourceHeight - cropSize) / 2);
      void createImageBitmap(video, sourceX, sourceY, cropSize, cropSize, {
        resizeWidth: SCAN_SIZE,
        resizeHeight: SCAN_SIZE,
        resizeQuality: "medium"
      }).then((bitmap) => {
        if (stopped) {
          bitmap.close();
          return;
        }
        const id = nextFrameId;
        nextFrameId += 1;
        capturedThisSecond += 1;
        slot.worker.postMessage({ type: "decode", id, bitmap }, [bitmap]);
      }).catch((cause: unknown) => {
        slot.busy = false;
        options.onError(cause instanceof Error ? cause.message : "The camera frame could not be captured.");
      }).finally(() => {
        capturePending = false;
      });
    };

    const turboVideo = video as TurboVideoElement;
    if (turboVideo.requestVideoFrameCallback) {
      const onVideoFrame: VideoFrameCallback = () => {
        captureFrame();
        if (!stopped) {
          frameCallbackHandle = turboVideo.requestVideoFrameCallback!(onVideoFrame);
        }
      };
      frameCallbackHandle = turboVideo.requestVideoFrameCallback(onVideoFrame);
    } else {
      const onAnimationFrame = () => {
        captureFrame();
        if (!stopped) {
          fallbackFrameHandle = window.requestAnimationFrame(onAnimationFrame);
        }
      };
      fallbackFrameHandle = window.requestAnimationFrame(onAnimationFrame);
    }

    return { stop };
  } catch (cause) {
    stop();
    throw cause;
  }
}

function createReaderWorker(): Worker {
  return new Worker(new URL("../workers/qr-reader.worker.ts", import.meta.url), { type: "module" });
}

async function warmReaderWorker(): Promise<void> {
  const worker = createReaderWorker();
  try {
    await waitForWorker(worker);
  } finally {
    worker.terminate();
  }
}

function waitForWorker(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("The Turbo decoder took too long to start."));
    }, WORKER_READY_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<ReaderWorkerMessage>) => {
      if (event.data.type === "ready") {
        window.clearTimeout(timeout);
        resolve();
      } else if (event.data.type === "error") {
        window.clearTimeout(timeout);
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("The Turbo decoder worker could not be loaded."));
    };
  });
}

function abortError(): Error {
  const error = new Error("Turbo scanner start was cancelled.");
  error.name = "AbortError";
  return error;
}
