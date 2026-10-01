// Iconos de las filas, en un cuadrado de color como en Ajustes del iPhone.
const P = {
  factura: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  gasto: <><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10h17" /></>,
  beneficio: <path d="M4 17l5-5 4 3 7-8M15 7h5v5" />,
  hacienda: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />,
  plazo: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  cobrar: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  limite: <path d="M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z" />,
  ritmo: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  actividad: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  cliente: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></>,
  excel: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  aviso: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .7 3.2 2.3 3.7 5" /></>,
};
export const COLOR = {
  factura: '#34C759', gasto: '#FF3B30', beneficio: '#007AFF', hacienda: '#FF9500', plazo: '#FF2D55', cobrar: '#FFCC00',
  limite: '#AF52DE', ritmo: '#5AC8FA', actividad: '#5856D6', cliente: '#30B0C7', excel: '#248A3D', aviso: '#FF3B30', usuarios: '#8E8E93',
};

export default function Ico({ n, solo }) {
  const svg = <svg viewBox="0 0 24 24" aria-hidden>{P[n]}</svg>;
  if (solo) return <span className="ico-solo" style={{ color: COLOR[n] }}>{svg}</span>;
  return <span className="ico-cuadro" style={{ background: COLOR[n] }}>{svg}</span>;
}
