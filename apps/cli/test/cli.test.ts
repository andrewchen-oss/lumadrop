import assert from "node:assert/strict";
import test from "node:test";

import { encodeFrameText } from "../src/frame-text.js";

test("frame text uses the LumaDrop prefix and Base45 encoding", () => {
  assert.equal(encodeFrameText(new Uint8Array([0, 255, 42])), "LD1:U50.0");
});
