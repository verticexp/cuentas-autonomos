// Fisquo por WhatsApp: lo que se hace con facturas y presupuestos que ya existen («ya me ha pagado la 12», «recuérdale a
// Pepe que me debe», «reenvíale la factura», «pásame la de Ana», «el presupuesto de Ana está aceptado, hazle la factura»).
// Marcar cobrada, recordar y reenviar se hacen al momento (lo ha pedido y no cambian ninguna factura); facturar un
// presupuesto prepara un borrador que se enseña y se confirma como cualquier otra factura.
import { leer, leerUno } from './redis.js';
import { puede } from './permisos.js';
import { importes, numeroFactura } from './calculos.js';
import { eur, fechaCorta, hoy } from './formato.js';
import { emailValido } from './email.js';
import { limiteEnvios } from './limite.js';
import { cobrarFactura } from './cobroManual.js';
import { secundarios } from './trabajos.js';
import { enviarFactura, enviarPresupuesto, enviarRecordatorio, nombrePdf } from './envio.js';
import { facturaPdf } from './pdf.js';
import { identidadDoc } from './documento.js';
import { numeroPresupuesto } from './presupuestos.js';
import { facturaDePresupuesto } from './presupuestosServidor.js';
import { elegirDocumento, enviarDocumento, enviarTexto } from './whatsapp.js';

const NO_ENCUENTRO = {
  factura: 'No encuentro esa factura 🤔 ¿Me dices el número o a qué cliente era?',
  presupuesto: 'No encuentro ese presupuesto 🤔 ¿Me dices el número o a qué cliente era?',
};
const castellano = (t, v) => (v ? t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '') : t);

// Email al que mandar algo del cliente: el que dice la persona, el del documento o el de su ficha.
async function emailDe(u, doc, pedido) {
  if (emailValido(pedido || '')) return pedido.toLowerCase();
  if (emailValido(doc.cliente?.email || '')) return doc.cliente.email;
  const ficha = (await leer(u, 'clientes') || []).find((c) => c.nombre === doc.cliente?.nombre);
  return emailValido(ficha?.email || '') ? ficha.email : '';
}

// d: { que, doc, numero, cliente, email } (herramienta «documento»). → texto de respuesta, o { borrador } para facturar un
// presupuesto (lo enseña y lo guarda el servidor, como cualquier borrador).
export async function documento(u, d, { de, origen, intro }) {
  // u.tr: el traductor del idioma de la persona (lib/whatsappServidor.js); sin él, castellano.
  const tr = u.tr || castellano;
  if (!puede(u, 'facturar')) return tr('Tu usuario no tiene permiso para facturas ni presupuestos.');
  const pres = d.doc === 'presupuesto';
  const todos = (await leer(u, pres ? 'presupuestos' : 'facturas')) || [];
  const pendientes = ['cobrada', 'recordar'].includes(d.que);
  const lista = d.que === 'facturar_presupuesto' ? todos.filter((p) => !p.facturas?.some((f) => f.tipo !== 'senal') && p.estado !== 'rechazado') : todos;
  const { doc, varios } = elegirDocumento(lista, d, { pendientes, presupuesto: pres });
  if (varios) return tr('Tengo {n} que encajan: {lista}. ¿Cuál?', { n: varios.length, lista: varios.join(', ') });
  if (!doc) {
    if (pendientes && elegirDocumento(todos, d).doc) return d.cliente ? tr('{cliente} no tiene nada pendiente de cobro 🙂', { cliente: d.cliente }) : tr('Esa ya está cobrada 🙂');
    return tr(NO_ENCUENTRO[pres ? 'presupuesto' : 'factura']);
  }
  const num = pres ? numeroPresupuesto(doc) : numeroFactura(doc);
  const total = eur(importes(doc).total);
  const quien = doc.cliente?.nombre || tr('el cliente');
  const decir = (t) => (intro ? `${intro}\n\n${t}` : t);

  if (d.que === 'cobrada') {
    const r = await cobrarFactura(u, doc.id, {}, hoy());
    if (r.error) return tr('No la he podido marcar: {error}.', { error: tr(r.error) });
    await secundarios(u, { facturas: [doc.id] });
    return decir(tr('✅ Apuntado: la {num} de {quien} ({total}) ya está cobrada.', { num, quien, total }));
  }

  if (d.que === 'recordar' || d.que === 'reenviar') {
    const para = await emailDe(u, doc, d.email);
    if (!para) return tr(pres ? 'No tengo el email de {quien}. ¿Me lo dices y se lo mando?' : 'No tengo el email de {quien}. ¿Me lo dices y se la mando?', { quien });
    const tope = await limiteEnvios(u);
    if (tope) return tr(tope.error);
    const r = d.que === 'recordar'
      ? await enviarRecordatorio(u, doc, { origen, para })
      : await (pres ? enviarPresupuesto : enviarFactura)(u, doc, { para, origen, responderA: u.email });
    if (r.error) return tr('No he podido enviarlo: {error}.', { error: tr(r.error) });
    const v = { quien, para, num, total };
    return decir(d.que === 'recordar'
      ? tr('📩 Le he mandado a {quien} ({para}) un recordatorio de la {num} ({total}), con la factura adjunta.', v)
      : tr(pres ? '📩 Reenviado el presupuesto {num} a {quien} ({para}).' : '📩 Reenviada la factura {num} a {quien} ({para}).', v));
  }

  if (d.que === 'pdf') {
    const { emisor: e, marca } = pres ? { emisor: u.emisor || {}, marca: u.marca } : await identidadDoc(u, doc);
    const pdf = await facturaPdf(doc, e, marca, { presupuesto: pres });
    const v = { num, quien, total, fecha: fechaCorta(doc.fecha) };
    await enviarTexto(de, decir(tr(pres ? 'Aquí tienes el presupuesto {num} de {quien} ({total}, {fecha}) 👇' : 'Aquí tienes la factura {num} de {quien} ({total}, {fecha}) 👇', v)));
    const ok = await enviarDocumento(de, pdf, nombrePdf(doc, pres), `${tr(pres ? 'Presupuesto' : 'Factura')} ${num} · ${quien}`).catch(() => false);
    return ok ? '' : tr('No he podido mandarte el PDF por aquí; lo tienes en Fisquo.');
  }

  // facturar_presupuesto: la factura de lo que falta (todo, si no hubo señal), como el botón de la pantalla de presupuestos.
  const fresco = await leerUno(u, 'presupuestos', doc.id);
  const r = facturaDePresupuesto(fresco || doc, 'resto');
  if (r.error) return tr('No puedo facturarlo: {error}.', { error: tr(r.error).toLowerCase() });
  return { borrador: { tipo: 'factura', presupuesto: doc.id, cuerpo: r.datos, email: await emailDe(u, doc), nueva: false }, numero: num };
}
