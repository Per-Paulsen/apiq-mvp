import { ImageResponse } from "next/og";

export const alt = "APIQ — API Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "#71717a",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
            Live MVP
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 144,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              marginBottom: 36,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            APIQ
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              color: "#a78bfa",
              marginBottom: 40,
            }}
          >
            API Intelligence
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: "#a1a1aa",
              maxWidth: 980,
              lineHeight: 1.3,
            }}
          >
            A knowledgeable second opinion for your OpenAPI specs.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#71717a",
          }}
        >
          <div style={{ display: "flex" }}>by Per Paulsen</div>
          <div
            style={{
              display: "flex",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            apiq-mvp.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
