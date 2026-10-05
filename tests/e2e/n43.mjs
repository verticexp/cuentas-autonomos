// Construye un fichero Norma 43 (cuaderno 43 de la AEB) de prueba: registros de 80 caracteres.
const fecha = (f) => f.slice(2, 4) + f.slice(5, 7) + f.slice(8, 10);
const imp = (n) => String(Math.round(Math.abs(n) * 100)).padStart(14, '0');
const ancho = (s, n) => String(s).slice(0, n).padEnd(n, ' ');
export function norma43({ entidad = '2100', oficina = '0418', cuenta = '0200051332', nombre = 'SONORA EVENTOS', inicial = 0, movimientos }) {
  const desde = movimientos.map((m) => m.fecha).sort()[0], hasta = movimientos.map((m) => m.fecha).sort().at(-1);
  const l = [`11${entidad}${oficina}${cuenta}${fecha(desde)}${fecha(hasta)}${inicial < 0 ? 1 : 2}${imp(inicial)}9783${ancho(nombre, 26)}   `];
  let debe = 0, haber = 0, nd = 0, nh = 0;
  for (const m of movimientos) {
    if (m.importe < 0) { debe += -m.importe; nd++; } else { haber += m.importe; nh++; }
    l.push(`22    ${oficina}${fecha(m.fecha)}${fecha(m.fecha)}02000${m.importe < 0 ? 1 : 2}${imp(m.importe)}${'0'.repeat(10)}${ancho(m.ref1 || '', 12)}${ancho(m.ref2 || '', 16)}`);
    if (m.texto) l.push(`2301${ancho(m.texto, 38)}${ancho(m.texto2 || '', 38)}`);
  }
  const fin = inicial + haber - debe;
  l.push(`33${entidad}${oficina}${cuenta}${String(nd).padStart(5, '0')}${imp(debe)}${String(nh).padStart(5, '0')}${imp(haber)}${fin < 0 ? 1 : 2}${imp(fin)}978    `);
  l.push(`88${'9'.repeat(18)}${String(l.length + 1).padStart(6, '0')}${' '.repeat(54)}`);
  for (const x of l) if (x.length !== 80) throw new Error(`Registro de ${x.length} caracteres: ${x}`);
  return l.join('\r\n') + '\r\n';
}
