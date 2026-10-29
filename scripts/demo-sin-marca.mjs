// Solo en local: quita (o vuelve a poner) la marca de demostración de la Gestoría Ferrer para probar lo que la demo no
// deja hacer, como dar de alta clientes «solo documentos» y activar la suscripción del panel (lib/panelDocumentos.js).
// Se niega a funcionar contra una base que no sea la del propio ordenador: la demo de producción no se toca.
// Uso: KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x node scripts/demo-sin-marca.mjs [--volver]
import { Redis } from '@upstash/redis';

const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token } = process.env;
if (!url || !token) throw new Error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN');
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error(`Solo para la base local, no para ${new URL(url).hostname}`);
const r = new Redis({ url, token });
const P = 'cuentas:';
const volver = process.argv.includes('--volver');

const id = await r.hget(`${P}despacho-codigos`, 'DEMO-FERRER');
const d = id && (await r.hget(`${P}despachos`, String(id)));
if (!d) throw new Error('No está la Gestoría Ferrer: ejecuta antes scripts/demo.mjs y scripts/demo-despacho.mjs');
if (volver) {
  // Vuelve a ser demo, sin la suscripción que se haya activado en la prueba.
  const { panel: _p, ...resto } = d;
  await r.hset(`${P}despachos`, { [id]: { ...resto, demo: true } });
  console.log('Gestoría Ferrer: otra vez de demostración.');
} else {
  const { demo: _d, ...resto } = d;
  await r.hset(`${P}despachos`, { [id]: resto });
  console.log('Gestoría Ferrer: sin la marca de demo. Entra con gestoria-demo@verticexp.com y ve a /despacho/solo-documentos.');
}
