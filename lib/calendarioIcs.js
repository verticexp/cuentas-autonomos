const escapar = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const fecha = (v) => v.replaceAll('-', '');
const siguiente = (v) => new Date(Date.parse(`${v}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// Hash estable de la identidad del plazo, independiente de sus clientes y sus marcas.
function uidDe(p) {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify([p.fecha, p.modelo, p.periodo, p.hacienda, p.nombre]))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  }
  return `${hash.toString(16).padStart(16, '0')}@fisquo`;
}

// El espacio de continuación también cuenta dentro de los 75 octetos.
function plegar(linea) {
  const partes = [];
  let actual = '', octetos = 0;
  for (const caracter of linea) {
    const n = new TextEncoder().encode(caracter).length;
    if (octetos + n > 75) { partes.push(actual); actual = ' '; octetos = 1; }
    actual += caracter;
    octetos += n;
  }
  return [...partes, actual].join('\r\n');
}

export function icsPlazos(plazos, { nombre, hoy }) {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fisquo//Plazos//ES', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapar(`Plazos · ${nombre}`)}`, 'X-WR-TIMEZONE:Europe/Madrid',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H'];
  for (const p of plazos.filter((p) => !p.vencido)) {
    const resumen = `${p.modelo} · ${p.nombre} · ${p.periodo} (${p.clientes.length} ${p.clientes.length === 1 ? 'cliente' : 'clientes'})`;
    const descripcion = [p.hacienda, ...p.clientes.map((c) => `${c.nombre}${c.presentado === true ? ' (presentado)' : ''}`)].join('\n');
    lineas.push('BEGIN:VEVENT', `UID:${uidDe(p)}`, `DTSTAMP:${fecha(hoy)}T000000Z`,
      `DTSTART;VALUE=DATE:${fecha(p.fecha)}`, `DTEND;VALUE=DATE:${fecha(siguiente(p.fecha))}`,
      `SUMMARY:${escapar(resumen)}`, `DESCRIPTION:${escapar(descripcion)}`, 'BEGIN:VALARM', 'TRIGGER:-P3D',
      'ACTION:DISPLAY', `DESCRIPTION:${escapar(resumen)}`, 'END:VALARM', 'END:VEVENT');
  }
  return [...lineas, 'END:VCALENDAR'].map(plegar).join('\r\n') + '\r\n';
}
