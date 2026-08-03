export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_WRAPPED_PAYLOAD_BYTES = MAX_FILE_BYTES + 64 * 1024;

export const TURBO_BLOCK_LENGTH = 1400;
export const TURBO_DEFAULT_FPS = 30;
export const TURBO_MIN_FPS = 18;
export const TURBO_MAX_FPS = 45;

export const REPAIR_FRAME_RATIO = 0.35;

export function estimatedOpticalBytesPerSecond(fps: number): number {
  return (TURBO_BLOCK_LENGTH * fps) / (1 + REPAIR_FRAME_RATIO);
}
