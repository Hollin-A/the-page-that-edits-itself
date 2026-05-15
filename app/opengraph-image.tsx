import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'The page that edits itself'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0e0e14',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Accent glow */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 700,
            height: 700,
            borderRadius: '50%',
            background: '#00EFFF',
            filter: 'blur(160px)',
            opacity: 0.12,
          }}
        />

        <p
          style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            margin: '0 0 24px',
          }}
        >
          agent / edit
        </p>

        <h1
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#00EFFF',
            lineHeight: 1.05,
            margin: '0 0 32px',
            maxWidth: 900,
          }}
        >
          The page that edits itself
        </h1>

        <p
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
            maxWidth: 820,
            lineHeight: 1.5,
          }}
        >
          Suggest a change. AI moderates, generates a patch, opens a GitHub PR, and ships it — in 30–90 seconds.
        </p>
      </div>
    ),
    { ...size },
  )
}
