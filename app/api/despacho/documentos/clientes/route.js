import { cuerpo, error } from '@/lib/api';
import { redis } from '@/lib/redis';
import { INVITACION_DIAS, tokenEmail } from '@/lib/auth';
import { pasado, respuesta429 } from '@/lib/limite';
import { clienteDelDespacho, miDespacho } from '@/lib/despachoApi';
import { clientesVisibles, registrarAcceso } from '@/lib/despachos';
import { enviarInvitacionDocumentos } from '@/lib/invitacion';
import { gratisDe, panelActivo, puedeDarDeAlta, sincronizarPanel, soloDocumentosDe } from '@/lib/panelDocumentos';
import { GRATIS, TRAMOS, tramoDe } from '@/lib/tarifasDocumentos';
import { altaSoloDocumentos, clientesDocumentos, nuevaInvitacion, pasarACompleto } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';

const enlace = (req, codigo) => new URL(`/invitacion/${codigo}`, req.url).toString();
async function invitar(req, d, quien, usuario, codigo) {
  const url = enlace(req, codigo);
  const r = await enviarInvitacionDocumentos({ para: usuario.email, nombre: usuario.nombre, despacho: d.nombre, url: `${url}?v=${await tokenEmail(usuario.id)}`, responderA: d.email || quien.email, dias: INVITACION_DIAS });
  return { enlace: url, ...r };
}

// GET: los clientes «solo documentos» que ve esta persona, con el tramo del panel.
export async function GET() {
  const { u, d, res } = await miDespacho();
  if (res) return res;
  const [clientes, n, gratis] = await Promise.all([clientesVisibles(d, u.id).then((v) => clientesDocumentos(d, v)), soloDocumentosDe(d), gratisDe(d)]);
  return Response.json({ clientes: clientes.map((c) => ({ ...c, abierto: panelActivo(d) || gratis.includes(c.id) })), cuenta: n, gratis: GRATIS, tramo: tramoDe(n), panel: { activo: panelActivo(d), ...(d.panel ? { estado: d.panel.estado, finPrueba: d.panel.finPrueba, pruebaUsada: d.panel.pruebaUsada } : {}) } }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { accion: 'alta', nombre, nif, email, contacto, tipo } · { accion: 'reenviar', empresa } · { accion: 'completo', empresa }.
// Dar de alta y pasar a Fisquo completo cambian la cuota del despacho: solo el titular.
export async function POST(req) {
  const b = await cuerpo(req);
  if (b.accion === 'alta') {
    const { d, quien, res } = await miDespacho({ titular: true });
    if (res) return res;
    if (d.demo) return error('Es un despacho de demostración: no admite clientes de verdad', 403);
    const antes = await soloDocumentosDe(d);
    // Los GRATIS primeros, sin suscripción; desde el siguiente hay que activarla (lib/tarifasDocumentos.js).
    if (!puedeDarDeAlta(d, antes)) return Response.json({ error: `Tienes ${GRATIS} clientes «solo documentos» gratis. Para dar de alta más, activa la suscripción del panel.`, sinPanel: true }, { status: 402 });
    if (await pasado('alta-documentos', d.id, 60, 3600)) return respuesta429(3600, 'Has dado de alta muchos clientes seguidos. Espera un poco.');
    // Con la suscripción activa, pasar de tramo se confirma en la pantalla (subirTramo): no se cobra más sin que lo vea.
    if (panelActivo(d) && tramoDe(antes + 1) > tramoDe(antes) && b.subirTramo !== true) return Response.json({ error: `Con este cliente pasas al tramo de ${TRAMOS[tramoDe(antes + 1)].cent / 100} € al mes.`, subirTramo: TRAMOS[tramoDe(antes + 1)].cent }, { status: 409 });
    const r = await altaSoloDocumentos(d, quien, { nombre: b.nombre, nif: b.nif, email: b.email, contacto: b.contacto, tipo: b.tipo });
    if (r.error) return error(r.error, r.status || 400);
    await registrarAcceso(r.empresa.id, quien, 'Te dio de alta para enviar documentos');
    const sinc = await sincronizarPanel(d.id, antes + 1).catch((e) => ({ error: e.message }));
    if (sinc.error) console.warn('[panel]', d.id, sinc.error);
    return Response.json({ ok: true, empresa: { id: r.empresa.id, nombre: r.empresa.nombre }, ...(await invitar(req, d, quien, r.usuario, r.codigo)) });
  }
  if (b.accion === 'reenviar') {
    const { d, e, quien, res } = await clienteDelDespacho(b.empresa);
    if (res) return res;
    if (!e.documentos?.usuario || e.documentos.despacho !== d.id) return error('Este cliente no es «solo documentos»');
    if (await pasado('reenviar-documentos', d.id, 20, 3600)) return respuesta429(3600, 'Has reenviado muchas invitaciones. Espera un poco.');
    const usuario = await redis.hget('usuarios', e.documentos.usuario);
    const codigo = usuario && (await nuevaInvitacion(usuario.id));
    if (!codigo) return error('Ya ha entrado en Fisquo: no hace falta otra invitación', 409);
    return Response.json({ ok: true, ...(await invitar(req, d, quien, usuario, codigo)) });
  }
  if (b.accion === 'completo') {
    const { d, e, quien, res } = await clienteDelDespacho(b.empresa, { titular: true });
    if (res) return res;
    const r = await pasarACompleto(e.id, d.id);
    if (r.error) return error(r.error, r.status || 400);
    await registrarAcceso(e.id, quien, 'Te pasó a Fisquo completo', 'Tus documentos siguen guardados');
    await sincronizarPanel(d.id, await soloDocumentosDe(d)).catch(() => null);
    return Response.json({ ok: true });
  }
  return error('Acción no válida');
}
