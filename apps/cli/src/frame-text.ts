const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function encodeFrameText(bytes: Uint8Array): string {
  let output = "LD1:";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 < bytes.length) {
      let value = bytes[index]! * 256 + bytes[index + 1]!;
      const first = value % 45;
      value = Math.floor(value / 45);
      output += BASE45[first]! + BASE45[value % 45]! + BASE45[Math.floor(value / 45)]!;
    } else {
      const value = bytes[index]!;
      output += BASE45[value % 45]! + BASE45[Math.floor(value / 45)]!;
    }
  }
  return output;
}
