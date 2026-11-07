// Oráculo de posiciones externo al serializador: DR 2025 y extracción fiscal de DR 2026.
// Las fuentes se conservan en fixtures; estas pruebas no descargan nada ni leen constantes de lib/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fichero390 } from '../lib/ficheroAeat.js';
import { modelo390 } from '../lib/modelos.js';

const fuente = (nombre) => readFileSync(new URL(`./fixtures/aeat/${nombre}`, import.meta.url), 'utf8');
const tablas2025 = {};
for (const [, hoja, contenido] of fuente('dr390e2025.txt').matchAll(/===== HOJA: Pág\. (.*?) =====\n([\s\S]*?)(?=\n===== HOJA:|$)/g)) {
  if (hoja === '0') continue;
  const id = hoja === '2 bis' ? '02B' : hoja.padStart(2, '0');
  const campos = contenido.split('\n').flatMap((linea) => {
    const columnas = linea.split('|').map((c) => c.trim());
    if (!columnas.slice(0, 3).every((v) => /^\d+$/.test(v))) return [];
    return [{ pos: Number(columnas[1]), lon: Number(columnas[2]), tipo: columnas[3],
      descripcion: columnas[['05', '07'].includes(id) ? 5 : 4], soloCero: /Nota 2/.test(linea) }];
  });
  tablas2025[id] = { longitud: Number(contenido.match(/TOTAL \|\s*\| (\d+)/)[1]), campos };
}
const tablas2026 = { ...tablas2025, ...JSON.parse(fuente('dr390e2026-posiciones.json')).paginas };
const orden = ['01', '02', '02B', '03', '04', '05', '06', '07', '08'];
const yo = { nif: '12345678Z', nombre: 'Ana García López' };
const campo = (s, pos, lon) => s.slice(pos - 1, pos - 1 + lon);
const casilla = (f) => f.descripcion.match(/\[(\d+)\]/)?.[1];
const actividades = Array.from({ length: 6 }, (_, i) => ({ nombre: `ACTIVIDAD ${i + 1}`, iae: `${9650 + i}` }));

function paginas(contenido, anio, tablas) {
  assert.equal(contenido.slice(0, 17), `<T3900${anio}0A0000>`);
  assert.equal(contenido.slice(17, 22), '<AUX>');
  assert.equal(contenido.slice(322, 328), '</AUX>');
  const p = {};
  let offset = 328;
  for (const id of orden) {
    const tabla = tablas[id];
    p[id] = contenido.slice(offset, offset + tabla.longitud);
    assert.equal(Buffer.byteLength(p[id], 'latin1'), tabla.longitud, `longitud ${id}`);
    assert.equal(p[id].slice(0, 11), `<T390${id.padEnd(5, '0')}>`);
    assert.equal(p[id].slice(-12), `</T390${id.padEnd(5, '0')}>`);
    // La tabla debe cubrir la página completa sin huecos ni solapamientos.
    let siguiente = 1;
    for (const f of tabla.campos) {
      assert.equal(f.pos, siguiente, `tabla ${id}: ${f.descripcion}`);
      siguiente += f.lon;
      const v = campo(p[id], f.pos, f.lon);
      // El DR llama Num al identificador 02B00; las constantes de cabecera se comprueban arriba.
      if (f.tipo === 'Num' && f.pos > 12) assert.match(v, /^\d+$/, `${id}:${f.pos}`);
      if (f.tipo === 'N') assert.match(v, /^(?:N\d+|\d+)$/, `${id}:${f.pos}`);
      if (/RESERVADO|Reservado/.test(f.descripcion)) assert.equal(v, ' '.repeat(f.lon), `${id}:${f.pos}`);
    }
    assert.equal(siguiente, tabla.longitud + 1);
    offset += tabla.longitud;
  }
  assert.equal(contenido.slice(offset), `</T3900${anio}0A0000>`, 'nueve páginas, sin bytes sobrantes');
  return p;
}

// Valores distintos por casilla: un desplazamiento o un intercambio no puede pasar por tener todo a cero.
function importesDePrueba() {
  const c = {};
  for (const id of orden.filter((id) => !['01', '05'].includes(id))) {
    for (const f of tablas2025[id].campos) {
      const k = casilla(f);
      if (!k || !['Num', 'N'].includes(f.tipo) || f.soloCero) continue;
      c[k] = (Number(k) + 0.37) * (f.tipo === 'N' && Number(k) % 2 ? -1 : 1);
    }
  }
  c['117'] = 'G'; c['118'] = 60;
  return { c, resultado: -123.45 };
}

for (const anio of [2025, 2026, 2027]) {
  const tablas = anio === 2025 ? tablas2025 : tablas2026;
  test(`390 ${anio}: posiciones y longitudes de todas las páginas contra las tablas AEAT conservadas`, () => {
    const m = importesDePrueba();
    const copia = structuredClone(m);
    const r = fichero390(yo, anio, m, { actividades, criterioCaja: true, destinatarioCaja: true, declara347: true });
    assert.deepEqual(m, copia, 'el formato no modifica los importes');
    assert.equal(r.resultado, m.resultado);
    const p = paginas(r.contenido, anio, tablas);
    for (const id of orden) for (const f of tablas[id].campos) {
      const k = casilla(f);
      if (!k || !['Num', 'N'].includes(f.tipo)) continue;
      const foral = id === '06' && f.descripcion.startsWith('8.');
      const otraProrrata = id === '07' && /Prorratas - [2-5] -/.test(f.descripcion);
      const esperado = id === '05' || foral || otraProrrata || k === '112' || k === '659' ? 0 : (m.c[k] || 0);
      const centimos = Math.round(Math.abs(esperado) * 100);
      const texto = `${esperado < 0 ? 'N' : ''}${String(centimos).padStart(f.lon - (esperado < 0 ? 1 : 0), '0')}`;
      assert.equal(campo(p[id], f.pos, f.lon), texto, `${anio} página ${id}, casilla ${k}, posición ${f.pos}`);
    }
    const cambios = anio >= 2026;
    assert.equal(campo(p['01'], 131, 2), '11');
    assert.equal(campo(p['01'], cambios ? 134 : 133, 2), '00');
    if (cambios) assert.equal(campo(p['01'], 133, 1), '2', 'No según DR (no N)');
    assert.equal(campo(p['01'], cambios ? 431 : 430, 1), '1');
    const nombres = tablas['01'].campos.filter((f) => f.descripcion.includes('Datos estadísticos - A - Actividades'));
    const iae = tablas['01'].campos.filter((f) => f.descripcion.includes('Epígrafe I.A.E.'));
    assert.equal(nombres.length, 6); assert.equal(iae.length, 6);
    actividades.forEach((a, i) => {
      assert.equal(campo(p['01'], nombres[i].pos, nombres[i].lon).trimEnd(), a.nombre);
      assert.equal(campo(p['01'], iae[i].pos, iae[i].lon), a.iae);
    });
    for (const f of tablas['01'].campos.filter((f) => f.descripcion.includes('Fecha Poder'))) {
      assert.equal(campo(p['01'], f.pos, f.lon), '00000000');
    }
    for (const f of tablas['07'].campos.filter((f) => casilla(f) === '114')) {
      assert.equal(f.lon, cambios ? 4 : 3);
      assert.equal(campo(p['07'], f.pos, f.lon), ' '.repeat(f.lon));
    }
    assert.equal(campo(p['07'], cambios ? 278 : 277, 1), 'G');
  });

  test(`390 ${anio}: sin actividad conserva ceros y marcas en el diseño de su ejercicio`, () => {
    const p = paginas(fichero390(yo, anio, modelo390([], [], anio)).contenido, anio, tablas);
    assert.equal(campo(p['01'], 131, 2), '22');
    if (anio >= 2026) {
      assert.equal(campo(p['01'], 133, 1), '2');
      for (const pos of [81, 225]) assert.equal(campo(p['06'], pos, 17), '0'.repeat(17));
    }
  });
}

test('390: rechaza pagos de carburantes no soportados y ejercicios sin diseño', () => {
  assert.throws(() => fichero390(yo, 2026, { c: { 112: 1 } }), /112.*debe ser cero/);
  assert.throws(() => fichero390(yo, 2026, { c: { 112: -1 } }), /112.*debe ser cero/);
  assert.throws(() => fichero390(yo, 2024, { c: {} }), /desde el ejercicio 2025/);
});
