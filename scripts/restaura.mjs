// Por defecto verifica y simula. Solo --escribir permite modificar Redis.
import { readFile, writeFile } from 'node:fs/promises';
import { Redis } from '@upstash/redis';
import { hacerCopia, copiaDeDatos, seleccionarDatos, cifrar, descifrar, verificarCopia, restaurar, datosIntegridad } from '../lib/copias.js';
import { comprobarIntegridad } from '../lib/integridad.js';

try {
  const [archivo, ...opciones] = process.argv.slice(2);
  if (!archivo || archivo.startsWith('--') || opciones.some((x) => !['--escribir', '--sobrescribir', '--forzar'].includes(x) && !x.startsWith('--empresa='))) {
    throw new Error('Uso: node scripts/restaura.mjs copia.json[.enc] [--empresa=<id>] [--sobrescribir] [--escribir] [--forzar]');
  }
  if (opciones.filter((x) => x.startsWith('--empresa=')).length > 1) throw new Error('Solo se admite una opción --empresa');
  const empresa = opciones.find((x) => x.startsWith('--empresa='))?.slice('--empresa='.length);
  const escribir = opciones.includes('--escribir'), sobrescribir = opciones.includes('--sobrescribir');
  const contenido = await readFile(archivo);
  const copia = archivo.endsWith('.enc') ? descifrar(contenido, process.env.COPIA_CLAVE) : JSON.parse(contenido.toString('utf8'));
  const v = verificarCopia(copia);
  for (const aviso of v.avisos) console.warn(`Aviso: ${aviso}`);
  if (!v.ok) {
    console.error(`La copia no verifica:\n${v.errores.join('\n')}`);
    if (!opciones.includes('--forzar')) throw new Error('Restauración cancelada. Revisa la copia; --forzar permite omitir la verificación.');
    console.warn('Se continúa por petición explícita (--forzar).');
  }
  const seleccion = seleccionarDatos(copia, empresa);
  const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false });
  const plan = await restaurar(r, copia, { empresa, sobrescribir });
  if (escribir && sobrescribir) {
    if (!process.env.COPIA_CLAVE) throw new Error('Para sobrescribir se necesita COPIA_CLAVE: la copia previa debe estar cifrada.');
    // Guarda el ámbito completo, incluidos los datos necesarios para comprobar su cadena.
    const anterior = await hacerCopia(r);
    const previa = copiaDeDatos(seleccionarDatos(anterior, empresa), { ahora: anterior.fecha,
      inconsistentes: (anterior.resumen.inconsistentes || []).filter((id) => empresa === undefined || id === empresa) });
    if (previa.resumen.inconsistentes?.length) throw new Error('El destino cambia durante la copia previa. Detén las escrituras y repite la restauración.');
    const nombre = `antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, '-')}.json.enc`;
    await writeFile(nombre, cifrar(previa, process.env.COPIA_CLAVE), { mode: 0o600, flag: 'wx' });
    console.log(`Copia previa cifrada guardada en ${nombre} (${previa.resumen.claves} claves del ámbito afectado).`);
  }
  const informe = escribir ? await restaurar(r, copia, { empresa, sobrescribir, escribir }) : plan;
  console.log(JSON.stringify({ fecha: copia.fecha, modo: escribir ? 'escritura' : 'simulación', ...informe }, null, 2));
  if (escribir) {
    const ids = new Set();
    for (const c of informe.claves.filter((c) => ['nueva', 'sobrescribir'].includes(c.accion))) {
      const id = /^cuentas:[^:]+:([^:]+)$/.exec(c.clave)?.[1];
      if (id) ids.add(id);
      if (c.clave === 'cuentas:empresas') for (const f of c.camposEscritos || Object.keys(seleccion[c.clave].valor)) ids.add(f);
    }
    for (const id of [...ids].sort()) {
      const datos = {};
      for (const n of ['facturas', 'facturasBorradas', 'registros', 'numeracion']) {
        datos[`cuentas:${n}:${id}`] = { tipo: 'hash', valor: (await r.hgetall(`cuentas:${n}:${id}`)) || {} };
      }
      datos[`cuentas:verifactu:${id}`] = { tipo: 'string', valor: (await r.get(`cuentas:verifactu:${id}`)) || '' };
      const incidencias = comprobarIntegridad(datosIntegridad(datos, id));
      console.log(`Integridad ${id}: ${incidencias.length ? JSON.stringify(incidencias) : 'sin incidencias'}`);
      if (incidencias.some((x) => !['sin-instantanea', 'contador-atrasado'].includes(x.tipo))) process.exitCode = 1;
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
