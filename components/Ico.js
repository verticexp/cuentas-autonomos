// Iconos de las filas, en un cuadrado menta con el trazo en verde (marca Netto).
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
  datos: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13.5h3" /></>,
  marca: <><circle cx="12" cy="12" r="8.5" /><circle cx="8.5" cy="10" r="1.2" /><circle cx="12" cy="7.5" r="1.2" /><circle cx="15.5" cy="10" r="1.2" /><path d="M12 20.5a2.5 2.5 0 0 1 0-5h1.5" /></>,
  seguridad: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  drive: <path d="M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18z" />,
  conexion: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  presupuesto: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 13l1.5 1.5L15 11" />,
  mas: <g fill="currentColor" stroke="none"><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></g>,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .7 3.2 2.3 3.7 5" /></>,
};
export const COLOR = {
  factura: '#34C759', gasto: '#FF3B30', beneficio: '#007AFF', hacienda: '#FF9500', plazo: '#FF2D55', cobrar: '#FFCC00',
  limite: '#AF52DE', ritmo: '#5AC8FA', actividad: '#5856D6', cliente: '#30B0C7', excel: '#248A3D', aviso: '#FF3B30', usuarios: '#8E8E93',
  datos: '#007AFF', marca: '#FF2D55', seguridad: '#34C759', drive: '#FF9500', conexion: '#5856D6',
};

export default function Ico({ n, solo }) {
  const svg = <svg viewBox="0 0 24 24" aria-hidden>{P[n]}</svg>;
  if (solo) return <span className="ico-solo" style={{ color: COLOR[n] }}>{svg}</span>;
  return <span className="ico-cuadro">{svg}</span>;
}
