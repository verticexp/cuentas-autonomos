// node scripts/simulacro.mjs copia.json[.enc]
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { Redis } from '@upstash/redis';
import { hacerCopia, copiaDeDatos, descifrar, verificarCopia, restaurar, seleccionarParaRestaurar, datosIntegridad } from '../lib/copias.js';
import { comprobarIntegridad } from '../lib/integridad.js';
import { arrancar } from '../tests/apoyo/upstash-mem.mjs';

function soloLocal() {
  const url = process.env.KV_REST_API_URL;
  if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('Simulacro cancelado: KV_REST_API_URL debe apuntar a 127.0.0.1/localhost o estar ausente');
  }
}

// PTTL y el reloj de las peticiones pueden introducir unos milisegundos.
// Solo tras comprobar esa tolerancia se normaliza la caducidad a la original.
function comparar(esperados, recibidos) {
  const ahora = Date.now();
  const caducadas = new Set(Object.entries(esperados)
    .filter(([, d]) => d.caduca !== undefined && d.caduca <= ahora).map(([k]) => k));
  const datos = (original) => Object.fromEntries(Object.entries(original)
    .filter(([k]) => !caducadas.has(k)));
  const a = datos(esperados), b = datos(recibidos);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), 'No coinciden las claves restauradas');
  for (const k of Object.keys(a)) {
    const antes = esperados[k].caduca, despues = recibidos[k].caduca;
    if (antes === undefined) assert.equal(despues, undefined, `Caducidad inesperada: ${k}`);
    else {
      assert.ok(despues !== undefined && Math.abs(antes - despues) <= 1000, `Caducidad alterada: ${k}`);
      b[k] = { ...b[k], caduca: antes };
    }
  }
  const huella = copiaDeDatos(a).huella;
  assert.equal(copiaDeDatos(b).huella, huella, 'No coincide la huella de los datos restaurados');
  return { claves: Object.keys(a).length, huella, caducadas: [...caducadas].sort() };
}

function integridad(copia) {
  const empresas = copiaDeDatos(copia.datos).resumen.empresas;
  const resultados = {};
  for (const id of empresas) {
    const incidencias = comprobarIntegridad(datosIntegridad(copia.datos, id));
    const errores = incidencias.filter((x) => !['sin-instantanea', 'contador-atrasado'].includes(x.tipo));
    assert.equal(errores.length, 0, `Integridad ${id}: ${JSON.stringify(errores)}`);
    resultados[id] = { errores: 0, avisos: incidencias };
  }
  return resultados;
}

export async function simulacro(rutaOCopia, { clave = process.env.COPIA_CLAVE } = {}) {
  const inicio = performance.now();
  const informe = { ok: false, fecha: new Date().toISOString(), pasos: {} };
  const servidores = [];
  async function paso(nombre, ejecutar) {
    const t = performance.now();
    try { return await ejecutar(); }
    finally { informe.pasos[nombre] = { ms: Number((performance.now() - t).toFixed(2)) }; }
  }
  try {
    soloLocal();
    const copia = await paso('leerYVerificar', async () => {
      let c = rutaOCopia;
      if (typeof c === 'string') {
        const contenido = await readFile(c);
        c = c.endsWith('.enc') ? descifrar(contenido, clave) : JSON.parse(contenido.toString('utf8'));
      }
      const v = verificarCopia(c, { tolerarIncidencias: true });
      if (!v.ok) throw new Error(`La copia no verifica: ${v.errores.join('; ')}`);
      informe.incidencias = v.incidencias.length;
      if (c.resumen?.inconsistentes?.length) throw new Error('La copia contiene empresas inconsistentes');
      informe.avisos = v.avisos;
      informe.fechaCopia = c.fecha;
      return c;
    });
    await paso('arrancarSimuladores', async () => {
      // Siempre servidores nuevos propios; nunca se utiliza la URL ni el token del entorno.
      servidores.push(await arrancar());
      servidores.push(await arrancar());
    });
    const clientes = servidores.map((s) => new Redis({ url: s.url, token: 'simulacro-local', automaticDeserialization: false }));
    informe.restauracion = await paso('restaurarTodo', () => restaurar(clientes[0], copia, { escribir: true }));
    const completa = await paso('volverACopiar', () => hacerCopia(clientes[0]));
    await paso('comprobarTodo', async () => {
      informe.completa = comparar(copia.datos, completa.datos);
      informe.integridad = integridad(completa);
    });
    const empresa = copiaDeDatos(copia.datos).resumen.empresas.find((id) => Object.keys(copia.datos[`cuentas:facturas:${id}`]?.valor || {}).length);
    if (empresa) {
      informe.empresa = empresa;
      informe.restauracionEmpresa = await paso('restaurarEmpresa', () => restaurar(clientes[1], copia, { empresa, escribir: true }));
      const parcial = await paso('copiarEmpresa', () => hacerCopia(clientes[1]));
      await paso('comprobarEmpresa', async () => {
        // Comparar todo el ámbito detecta también contaminación de otras empresas/usuarios.
        const seleccion = Object.fromEntries(Object.entries(seleccionarParaRestaurar(copia, empresa))
          .filter(([k, d]) => !['cuentas:empresas', 'cuentas:usuarios', 'cuentas:emails'].includes(k) || Object.keys(d.valor).length));
        informe.parcial = comparar(seleccion, parcial.datos);
        informe.integridadEmpresa = integridad(parcial);
      });
    } else {
      informe.empresa = null;
      informe.avisos.push('No hay empresas con facturas: restauración parcial no aplicable');
    }
    informe.ok = true;
    return informe;
  } catch (error) {
    informe.error = error.message;
    throw error;
  } finally {
    await paso('cerrarSimuladores', () => Promise.all(servidores.map((s) => s.cerrar())));
    informe.totalMs = Number((performance.now() - inicio).toFixed(2));
    console.log(JSON.stringify(informe, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Uso: node scripts/simulacro.mjs copia.json[.enc]');
    await simulacro(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
