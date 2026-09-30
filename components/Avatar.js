// Iniciales del cliente o del gasto sobre un color estable (el mismo nombre, siempre el mismo color).
const TONOS = ['#5B7FDB', '#3BA38A', '#D9853B', '#B85C9E', '#6C7A92', '#C9524F', '#4E9CC7', '#8C6BD1'];

export default function Avatar({ nombre = '', size = 40 }) {
  const limpio = String(nombre).trim();
  const partes = limpio.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
  const ini = ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
  let h = 0;
  for (const c of limpio) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const tono = TONOS[h % TONOS.length];
  return (
    <span className="avatar" aria-hidden style={{ width: size, height: size, background: `color-mix(in srgb, ${tono} 16%, var(--surface))`, color: tono, fontSize: size * 0.38 }}>
      {ini}
    </span>
  );
}
