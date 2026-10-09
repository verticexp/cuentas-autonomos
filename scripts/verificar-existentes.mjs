// Marca como verificados a los usuarios que ya existen, para poder activar VERIFICAR_EMAIL=activo sin dejar a nadie fuera.
// Las cuentas nuevas nacen con emailVerificado: false (hay que confirmar el email). Las que no tienen el campo valen
// como confirmadas; solo molestaría a quien tenga emailVerificado === false y no haya pulsado el enlace todavía.
// En seco por defecto: solo cuenta y enseña. Con --escribir aplica los cambios.
import { Redis } from '@upstash/redis';

const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const escribir = process.argv.includes('--escribir');

const usuarios = (await r.hgetall('cuentas:usuarios')) || {};
const pendientes = Object.entries(usuarios).filter(([, u]) => u && u.emailVerificado === false);

console.log(`Usuarios: ${Object.keys(usuarios).length}. Sin confirmar (emailVerificado === false): ${pendientes.length}.`);
for (const [id, u] of pendientes) console.log(`  · ${id}  ${u.email || ''}`);

if (!pendientes.length) {
  console.log('Nada que hacer: nadie quedaría fuera al activar VERIFICAR_EMAIL.');
} else if (!escribir) {
  console.log('\nEn seco. Vuelve a ejecutarlo con --escribir para marcarlos como verificados.');
} else {
  const cambios = Object.fromEntries(pendientes.map(([id, u]) => [id, { ...u, emailVerificado: true }]));
  await r.hset('cuentas:usuarios', cambios);
  console.log(`\nHecho: ${pendientes.length} marcados como verificados. Ya puedes activar VERIFICAR_EMAIL=activo.`);
}
