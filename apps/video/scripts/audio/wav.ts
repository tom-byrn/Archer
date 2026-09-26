/** WAV encoding: 32-bit float PCM, which keeps the master's headroom exact for the video encoder. */

/** Interleaves two channels into a WAVE_FORMAT_IEEE_FLOAT file. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Uint8Array {
  if (left.length !== right.length) throw new Error("channels differ in length");
  const frames = left.length;
  const dataBytes = frames * 2 * 4;
  const header = 58; // RIFF, an 18-byte fmt chunk, fact, and the data chunk's header
  const buf = new ArrayBuffer(header + dataBytes);
  const view = new DataView(buf);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buf.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 18, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2 * 4, true);
  view.setUint16(32, 2 * 4, true);
  view.setUint16(34, 32, true);
  view.setUint16(36, 0, true); // no extension
  // Non-PCM formats carry a fact chunk with the frame count.
  text(38, "fact");
  view.setUint32(42, 4, true);
  view.setUint32(46, frames, true);
  text(50, "data");
  view.setUint32(54, dataBytes, true);
  for (let i = 0, o = header; i < frames; i++, o += 8) {
    view.setFloat32(o, left[i]!, true);
    view.setFloat32(o + 4, right[i]!, true);
  }
  return new Uint8Array(buf);
}
