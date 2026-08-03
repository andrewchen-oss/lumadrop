import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import readerWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

type DecodeMessage = {
  type: "decode";
  id: number;
  bitmap: ImageBitmap;
};

type WorkerResponse =
  | { type: "ready" }
  | { type: "decoded"; id: number; text: string | null; decodeMs: number }
  | { type: "error"; message: string };

const moduleReady = prepareZXingModule({
  overrides: {
    locateFile: () => readerWasmUrl
  },
  fireImmediately: true
});
let scanCanvas: OffscreenCanvas | null = null;
let scanContext: OffscreenCanvasRenderingContext2D | null = null;

void moduleReady.then(() => {
  post({ type: "ready" });
}).catch((cause: unknown) => {
  post({
    type: "error",
    message: cause instanceof Error ? cause.message : "The Turbo decoder could not start."
  });
});

self.onmessage = (event: MessageEvent<DecodeMessage>) => {
  if (event.data.type !== "decode") {
    return;
  }
  void decodeBitmap(event.data.id, event.data.bitmap);
};

async function decodeBitmap(id: number, bitmap: ImageBitmap): Promise<void> {
  const startedAt = performance.now();
  try {
    await moduleReady;
    if (!scanCanvas || scanCanvas.width !== bitmap.width || scanCanvas.height !== bitmap.height) {
      scanCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (!scanContext || !scanCanvas) {
      throw new Error("The camera frame could not be prepared.");
    }
    scanContext.drawImage(bitmap, 0, 0);
    bitmap.close();

    const results = await readBarcodes(
      scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height),
      {
        formats: ["QRCode"],
        tryHarder: false,
        tryRotate: false,
        tryInvert: false,
        tryDownscale: false,
        maxNumberOfSymbols: 1,
        binarizer: "LocalAverage"
      }
    );
    post({
      type: "decoded",
      id,
      text: results[0]?.text ?? null,
      decodeMs: performance.now() - startedAt
    });
  } catch (cause) {
    bitmap.close();
    post({
      type: "error",
      message: cause instanceof Error ? cause.message : "A camera frame could not be decoded."
    });
  }
}

function post(message: WorkerResponse): void {
  self.postMessage(message);
}
