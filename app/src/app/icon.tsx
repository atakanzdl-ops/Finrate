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
          {/* Gradient arc — drawn as two colored strokes blended */}
          <circle
            cx="16" cy="16" r="11"
            fill="none"
            stroke="url(#arcGrad)"
            strokeWidth="2.9"
            strokeLinecap="butt"
            strokeDasharray="55 15"
            strokeDashoffset="10"
            transform="rotate(170 16 16)"
          />
          {/* Teal dot at arc end */}
          <circle cx="6.2" cy="19.5" r="1.8" fill="#0DC4A0" />
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#0DC4A0" />
            </linearGradient>
          </defs>
        </svg>

        {/* F letter */}
        <span
          style={{
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
            position: 'relative',
            zIndex: 1,
            marginTop: 1,
          }}
        >
          F
        </span>
      </div>
    ),
    { ...size },
  )
}
