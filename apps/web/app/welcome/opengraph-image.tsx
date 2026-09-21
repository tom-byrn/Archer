import { ImageResponse } from "next/og";

export const alt = "Archer: software architecture for your agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Literal colors: the dark-theme tokens from globals.css (no CSS variables here).
const BG = "#0f1012";
const SURFACE = "#161719";
const LINE = "#383c42";
const INK = "#ecebe7";
const INK_2 = "#a5a19a";
const ACCENT = "#23c088";

const box = (left: number, top: number, accent = false) =>
  ({
    position: "absolute",
    left,
    top,
    width: 160,
    height: 120,
    borderRadius: 12,
    background: SURFACE,
    border: `2px solid ${accent ? ACCENT : LINE}`,
  }) as const;

const wire = (left: number, top: number, width: number, height: number) =>
  ({ position: "absolute", left, top, width, height, background: LINE }) as const;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: BG,
          backgroundImage: `radial-gradient(${LINE} 2px, transparent 2.5px)`,
          backgroundSize: "40px 40px",
          color: INK,
        }}
      >
        <div style={{ display: "flex", position: "absolute", left: 700, top: 95, width: 440, height: 440 }}>
          <div style={wire(160, 218, 120, 3)} />
          <div style={wire(358, 120, 3, 40)} />
          <div style={wire(358, 280, 3, 40)} />
          <div style={box(0, 160)} />
          <div style={box(280, 0)} />
          <div style={box(280, 160, true)} />
          <div style={box(280, 320)} />
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>Archer</div>
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Software architecture for your agents.
          </div>
          <div style={{ display: "flex", paddingTop: 24, fontSize: 28, color: INK_2 }}>
            A canvas that compiles to a text file your coding agent reads.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
