import { ImageResponse } from 'next/og';
import { N_TRAZO, N_VISTA } from '@/components/Logo';

export const alt = 'Kontix · Cuentas para autónomos y pymes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Vista previa al compartir un enlace (WhatsApp, X, LinkedIn…): fondo de la pantalla de inicio, la N y el lema.
export default function ImagenOg() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#0F1F1B', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FAFAF8' }}>
        <svg width="160" height="160" viewBox={N_VISTA}>
          <g transform="translate(0,976) scale(0.1,-0.1)" fill="#FAFAF8"><path d={N_TRAZO} /></g>
        </svg>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 32 }}>Kontix</div>
        <div style={{ fontSize: 40, opacity: 0.8, marginTop: 12 }}>Cuentas para autónomos y pymes</div>
      </div>
    ),
    size,
  );
}
