import { describe, expect, it } from "vitest";

import { decodeFrameText, encodeFrameText } from "./frame-text";

describe("optical frame text", () => {
  it("round-trips even and odd binary payloads", () => {
    for (const length of [1, 2, 3, 64, 287, 288]) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 47 + 11) & 0xff);
      expect(decodeFrameText(encodeFrameText(bytes))).toEqual(bytes);
    }
  });

  it("rejects unrelated and malformed QR content", () => {
    expect(decodeFrameText("https://lumadrop.app")).toBeNull();
    expect(decodeFrameText("LD1:ABCX")).toBeNull();
    expect(decodeFrameText("LD1:@@")).toBeNull();
  });
});
