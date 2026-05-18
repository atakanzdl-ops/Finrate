import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: '#0d1f38',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Gradient arc — SVG */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Faint background circle */}
          <circle
            cx="16" cy="16" r="11"
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth="2.9"
          />
          {/* Gradient arc — gap center 225° (bottom-left), arc from 260° to 190° clockwise */}
          <circle
            cx="16" cy="16" r="11"
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="2.9"
            strokeLinecap="butt"
            strokeDasharray="55.8 13.4"
            strokeDashoffset="0"
            transform="rotate(260 16 16)"
          />
          {/* Teal dot at arc end (190°) — matches FinrateLogoCanvas arcEnd */}
          <circle cx="5.2" cy="14.1" r="1.8" fill="#0DC4A0" />
          {/* F harfi — 3 rect, SVG path (font'a bağımlı değil, keskin) */}
          {/* Sol dikey çizgi */}
          <rect x="11" y="10" width="3" height="13" fill="#ffffff" />
          {/* Üst yatay bar */}
          <rect x="11" y="10" width="10" height="3" fill="#ffffff" />
          {/* Orta yatay bar */}
          <rect x="11" y="15" width="8" height="3" fill="#ffffff" />
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0DC4A0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    ),
    { ...size },
  )
}
