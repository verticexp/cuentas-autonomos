import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const linea = (w, top) => <div style={{ position: 'absolute', left: 22, top, width: w, height: 10, borderRadius: 5, background: '#C9D0DC' }} />;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#16213A', display: 'flex', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 38, top: 26, width: 92, height: 124, borderRadius: 12, background: '#fff', display: 'flex' }}>
          <div style={{ position: 'absolute', right: 0, top: 0, width: 28, height: 28, background: '#C9D0DC', borderBottomLeftRadius: 10 }} />
          {linea(48, 44)}
          {linea(32, 64)}
        </div>
        <div style={{ position: 'absolute', left: 90, top: 90, width: 70, height: 70, borderRadius: 35, background: '#1F9D74', border: '8px solid #16213A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 38, fontWeight: 700 }}>€</div>
      </div>
    ),
    size,
  );
}
