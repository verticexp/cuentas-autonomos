import { ImageResponse } from 'next/og';
import { N_TRAZO, N_VISTA } from '@/components/Logo';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS redondea las esquinas solo: fondo a sangre y la N del logo en el centro.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#0F1F1B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="104" height="104" viewBox={N_VISTA}>
          <g transform="translate(0,976) scale(0.1,-0.1)" fill="#FAFAF8"><path d={N_TRAZO} /></g>
        </svg>
      </div>
    ),
    size,
  );
}
