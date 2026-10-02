import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS redondea las esquinas solo: fondo a sangre y la N algo más pequeña que en el favicon.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#0F1F1B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="132" height="132" viewBox="0 0 100 100">
          <path d="M30 74V30l40 40V26" fill="none" stroke="#FAFAF8" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 18l39 39" stroke="#0F1F1B" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
