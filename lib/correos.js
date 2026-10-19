// Catálogo de los correos que envía Netto: qué se manda, a quién, cuándo y con qué plantilla. Todos comparten el mismo
// diseño (marco) y salen con versión en HTML y en texto plano (mejor entrega y lectores sin HTML). El panel
// /admin/correos los enseña con sus datos de ejemplo y permite mandarse una prueba.
//
// Cada plantilla devuelve { asunto, previa, bloques, pie? }. Bloques:
//   'texto'                    párrafo (**negrita**; en los de texto libre también enlaces)
//   { boton: { texto, url } }  botón grande y debajo el enlace en texto, por si el botón no funciona
//   { lista: ['…'] }           lista de puntos
//   { datos: [[clave, valor]] } tabla de dos columnas
//   { nota: '…' }              texto pequeño y gris
import { enviarEmail } from './email.js';

export const SOPORTE = 'corporate@nettohq.com';
const soporte = () => process.env.CONTACTO_EMAIL || SOPORTE;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sin saltos de línea en el asunto (cabecera del email).
export const linea = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const nombrePila = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const hola = (n) => (nombrePila(n) ? `Hola, ${nombrePila(n)}:` : 'Hola:');
const negrita = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const enlaces = (s) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#0F1F1B">${u}</a>`);
const sinMarcas = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');

const C = { tinta: '#0F1F1B', fondo: '#FAFAF8', gris: '#646B67', borde: '#E6E8E4' };
const P = `margin:0 0 16px`;

function bloqueHtml(b, libre) {
  if (typeof b === 'string') {
    const t = negrita(esc(b)).replace(/\n/g, '<br>');
    return `<p style="${P}">${libre ? enlaces(t) : t}</p>`;
  }
  if (b.boton) {
    const u = esc(b.boton.url);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr><td align="center" style="border-radius:12px;background:${C.tinta}">
<a href="${u}" style="display:block;padding:16px 24px;color:#FFFFFF;font-size:17px;font-weight:600;text-decoration:none;border-radius:12px">${esc(b.boton.texto)}</a>
</td></tr></table>
<p style="margin:20px 0 6px;font-size:14px;color:${C.gris}">Si el botón no funciona, copia este enlace en el navegador:</p>
<p style="margin:0 0 20px;font-size:14px;word-break:break-all"><a href="${u}" style="color:${C.tinta}">${u}</a></p>`;
  }
  if (b.lista) return `<ul style="margin:0 0 16px;padding-left:20px">${b.lista.map((x) => `<li style="margin:0 0 6px">${negrita(esc(x))}</li>`).join('')}</ul>`;
  if (b.datos) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${b.datos.map(([k, v]) => `<tr><td style="padding:4px 16px 4px 0;color:${C.gris};vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
  if (b.nota) return `<p style="margin:0 0 12px;font-size:14px;color:${C.gris}">${negrita(esc(b.nota))}</p>`;
  return '';
}

function bloqueTexto(b) {
  if (typeof b === 'string') return sinMarcas(b);
  if (b.boton) return `${b.boton.texto}: ${b.boton.url}`;
  if (b.lista) return b.lista.map((x) => `· ${sinMarcas(x)}`).join('\n');
  if (b.datos) return b.datos.map(([k, v]) => `${k}: ${v}`).join('\n');
  if (b.nota) return sinMarcas(b.nota);
  return '';
}

// El marco común. marca: el nombre de arriba («Netto» o la empresa que envía la factura). pixel: imagen de 1 px que
// avisa cuando se abre (solo en facturas y recordatorios a clientes).
export function marco({ marca = 'Netto', previa = '', bloques = [], pie, libre = false, pixel }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${C.fondo}">
${previa ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previa)}</div>` : ''}
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;color:${C.tinta};background:${C.fondo};padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid ${C.borde}">
<tr><td style="padding:28px 24px">
<p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:-0.02em">${esc(marca)}</p>
${bloques.filter(Boolean).map((b) => bloqueHtml(b, libre)).join('\n')}
</td></tr></table>
${pie ? `<p style="max-width:520px;margin:16px auto 0;padding:0 12px;font-size:12px;line-height:1.5;color:${C.gris};text-align:center">${negrita(esc(pie))}</p>` : ''}
</div>${pixel ? `<img src="${esc(pixel)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}</body></html>`;
}

export const textoPlano = ({ bloques = [], pie }) => [...bloques.filter(Boolean).map(bloqueTexto), pie ? `--\n${sinMarcas(pie)}` : ''].filter(Boolean).join('\n\n');

const PIE_NETTO = `Netto · Cuentas para autónomos y pymes · nettohq.com\nSi tienes cualquier duda, responde a este email o escríbenos a ${SOPORTE}.`;
const firma = 'El equipo de Netto';
const fechaLarga = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const euros = (c) => `${(Number(c || 0) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const parrafos = (t) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

// Grupos del catálogo, en el orden en que salen en el panel.
export const GRUPOS = ['Cuenta y acceso', 'Prueba', 'Suscripción', 'Recomienda Netto', 'Seguridad y baja', 'En nombre de la empresa', 'Para el equipo de Netto'];

const avisoPrueba = (aviso) => ({
  grupo: 'Prueba',
  para: 'Administradores de la empresa',
  ejemplo: { nombre: 'Ana López', aviso, plan: 'Esencial', precio: 9, hasta: '2026-11-19', perdidas: ['El asistente IA (12 preguntas)', 'Remesas SEPA'], recomendado: { n: 'Pro', p: 19 }, descuento: 30, url: 'https://www.nettohq.com/ajustes/plan?contratar=1' },
  crear: (d) => {
    const cuando = { semana: 'dentro de una semana', tres: 'dentro de 3 días', ultimo: 'hoy' }[d.aviso];
    const fin = d.aviso === 'fin';
    const usado = d.perdidas?.length ? [
      `Durante la prueba has usado cosas que el plan ${d.plan} no incluye:`,
      { lista: d.perdidas },
      d.recomendado ? `Con el plan **${d.recomendado.n}** (${d.recomendado.p} €/mes + IVA) lo sigues teniendo todo.` : 'Para seguir con todo, escríbenos y te preparamos un plan a medida.',
    ] : [];
    return {
      asunto: fin ? 'Tu prueba de Netto ha terminado: tus datos siguen ahí' : `Tu prueba de Netto acaba ${cuando}`,
      previa: fin ? 'No se ha borrado nada. Elige tu plan para seguir creando facturas.' : `Añade tu tarjeta para seguir sin cortes. Sin permanencia.`,
      bloques: [
        hola(d.nombre),
        fin
          ? `Tu mes de prueba acabó el ${fechaLarga(d.hasta)}. **No se ha borrado nada**: puedes entrar, ver y exportar todo. Para volver a crear facturas y apuntar gastos, elige tu plan.`
          : `Tu mes de prueba del plan ${d.plan} acaba **${cuando}**${d.aviso === 'ultimo' ? '' : ` (el ${fechaLarga(d.hasta)})`}. Para seguir sin cortes, añade tu tarjeta: el plan ${d.plan} cuesta ${d.precio} €/mes + IVA (o un ${d.descuento} % menos si pagas el año), sin permanencia.`,
        ...usado,
        { boton: { texto: fin ? 'Elegir mi plan' : 'Elegir plan y añadir la tarjeta', url: d.url } },
        !fin && { nota: 'Si no haces nada, no se te cobra nada: tu cuenta pasa a solo lectura y tus datos se quedan donde están.' },
        firma,
      ],
    };
  },
});

export const CORREOS = {
  // — Cuenta y acceso —
  'confirmar-email': {
    grupo: 'Cuenta y acceso', nombre: 'Confirmar el email',
    cuando: 'Al registrarse, al aceptar una invitación sin email confirmado y al pulsar «Reenviar el enlace».',
    para: 'La persona que se registra',
    ejemplo: { nombre: 'Laura Martín', url: 'https://www.nettohq.com/api/confirmar?t=ejemplo' },
    crear: (d) => ({
      asunto: 'Confirma tu email en Netto',
      previa: 'Un clic y listo: confirma tu email para seguir usando Netto.',
      bloques: [hola(d.nombre), 'Confirma que este es tu email para seguir usando Netto.', { boton: { texto: 'Confirmar mi email', url: d.url } }, { nota: 'El enlace vale 7 días. Si no has creado una cuenta en Netto, ignora este email.' }],
    }),
  },
  bienvenida: {
    grupo: 'Cuenta y acceso', nombre: 'Bienvenida',
    cuando: 'Justo después de confirmar el email, una sola vez por persona.',
    para: 'Quien acaba de confirmar su cuenta',
    ejemplo: { nombre: 'Laura Martín', empresa: 'Estudio Martín', dias: 30, url: 'https://www.nettohq.com' },
    crear: (d) => ({
      asunto: 'Bienvenida a Netto: tus primeros pasos',
      previa: 'Cuatro pasos para tener tus cuentas al día desde hoy.',
      bloques: [
        hola(d.nombre),
        `Ya tienes ${d.empresa ? `**${d.empresa}** en ` : ''}Netto.${d.dias ? ` Tienes ${d.dias} días de prueba con todo incluido y sin tarjeta.` : ''} Para empezar con buen pie:`,
        { lista: [
          '**Rellena tus datos de facturación** en Ajustes (NIF, dirección e IBAN): salen en tus facturas.',
          '**Crea tu primera factura** y envíala desde Netto: tu cliente la recibe en PDF.',
          '**Apunta tus gastos** haciendo una foto al ticket: Netto lee el importe y el IVA.',
          '**Invita a tu gestoría** para que tenga los trimestres sin pedirte nada.',
        ] },
        { boton: { texto: 'Entrar en Netto', url: d.url } },
        '¿Te atascas en algo? Responde a este email y te ayudamos.',
        firma,
      ],
    }),
  },
  invitacion: {
    grupo: 'Cuenta y acceso', nombre: 'Invitación a una empresa',
    cuando: 'Cuando un administrador añade a alguien en Usuarios y permisos (o le reenvía la invitación).',
    para: 'La persona invitada (responder le escribe a quien invita)',
    ejemplo: { nombre: 'Laura', quien: 'Marc', empresa: 'SONORA EVENTOS', dias: 7, url: 'https://www.nettohq.com/invitacion/ejemplo' },
    crear: (d) => {
      const empresa = linea(d.empresa);
      return {
        asunto: linea(`${d.quien} te ha invitado a ${empresa || 'unirte a su empresa'} en Netto`),
        previa: 'Elige tu contraseña para entrar.',
        bloques: [`Hola, ${d.nombre}:`, `**${d.quien}** te ha invitado a ${empresa ? `**${empresa}**` : 'unirte a su empresa'} en Netto. Elige tu contraseña para entrar.`, { boton: { texto: 'Aceptar la invitación', url: d.url } }, { nota: `El enlace vale ${d.dias || 7} días y solo se puede usar una vez. Si no esperabas este email, ignóralo.` }],
      };
    },
  },
  'recuperar-contrasena': {
    grupo: 'Cuenta y acceso', nombre: 'Recuperar la contraseña',
    cuando: 'Al pedir «He olvidado mi contraseña» con un email que existe (si no existe, no se manda nada).',
    para: 'La persona que lo pide',
    ejemplo: { url: 'https://www.nettohq.com/recuperar?t=ejemplo' },
    crear: (d) => ({
      asunto: 'Recupera tu contraseña de Netto',
      previa: 'El enlace caduca en 30 minutos.',
      bloques: ['Hola:', 'Has pedido recuperar tu contraseña de Netto. Pulsa el botón para elegir una nueva.', { boton: { texto: 'Elegir una contraseña nueva', url: d.url } }, { nota: 'El enlace caduca en 30 minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este email: tu contraseña sigue siendo la misma.' }],
    }),
  },

  // — Prueba —
  'prueba-semana': { ...avisoPrueba('semana'), nombre: 'Prueba: queda una semana', cuando: 'A 7 días del fin de la prueba (cron de las 7:00).' },
  'prueba-tres': { ...avisoPrueba('tres'), nombre: 'Prueba: quedan 3 días', cuando: 'A 3 días del fin de la prueba.' },
  'prueba-ultimo': { ...avisoPrueba('ultimo'), nombre: 'Prueba: último día', cuando: 'El último día de la prueba.' },
  'prueba-fin': { ...avisoPrueba('fin'), nombre: 'Prueba: ha terminado', cuando: 'El día después del fin (solo los 3 primeros días, no a pruebas antiguas).' },

  // — Suscripción (aviso de Stripe) —
  'plan-activado': {
    grupo: 'Suscripción', nombre: 'Plan contratado',
    cuando: 'Cuando Stripe confirma el primer pago de la suscripción (o la reactiva tras cancelarla).',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', empresa: 'Estudio Martín', plan: 'Pro', periodo: 'mensual', url: 'https://www.nettohq.com/ajustes/plan' },
    crear: (d) => ({
      asunto: `Ya tienes el plan ${d.plan} de Netto`,
      previa: 'Gracias por confiar en Netto. Tu suscripción está activa.',
      bloques: [
        hola(d.nombre),
        `Gracias por elegir Netto. El plan **${d.plan}**${d.periodo ? ` (pago ${d.periodo})` : ''}${d.empresa ? ` de ${d.empresa}` : ''} ya está activo: puedes seguir trabajando sin límites de prueba.`,
        'Stripe te manda el recibo de cada cobro. Las facturas, la tarjeta y la baja están siempre en Ajustes › Tu plan.',
        { boton: { texto: 'Ver mi plan', url: d.url } },
        firma,
      ],
    }),
  },
  'pago-fallido': {
    grupo: 'Suscripción', nombre: 'No se ha podido cobrar',
    cuando: 'Cuando falla el cobro de la suscripción (Stripe la pasa a «pendiente de pago»). Stripe lo reintenta solo unos días.',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', plan: 'Pro', url: 'https://www.nettohq.com/ajustes/plan' },
    crear: (d) => ({
      asunto: 'No hemos podido cobrar tu plan de Netto',
      previa: 'Revisa tu tarjeta para no perder el acceso.',
      bloques: [
        hola(d.nombre),
        `No hemos podido cobrar el plan **${d.plan}**. Suele ser una tarjeta caducada o sin saldo. Lo volveremos a intentar en los próximos días.`,
        'Para evitar que tu cuenta pase a solo lectura, revisa o cambia la tarjeta:',
        { boton: { texto: 'Revisar mi forma de pago', url: d.url } },
        { nota: 'Tus datos no se tocan en ningún caso. Si ya lo has solucionado, ignora este email.' },
        firma,
      ],
    }),
  },
  'suscripcion-cancelada': {
    grupo: 'Suscripción', nombre: 'Suscripción cancelada',
    cuando: 'Cuando la suscripción termina (baja desde el portal de Stripe o cobros fallidos agotados).',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', plan: 'Pro', url: 'https://www.nettohq.com/ajustes/plan?contratar=1' },
    crear: (d) => ({
      asunto: 'Tu plan de Netto ha terminado: tus datos siguen ahí',
      previa: 'Tu cuenta pasa a solo lectura. No se ha borrado nada.',
      bloques: [
        hola(d.nombre),
        `Tu plan **${d.plan}** ha terminado y no se te volverá a cobrar. **No se ha borrado nada**: puedes entrar, ver y exportar todo cuando quieras.`,
        'Si quieres volver a crear facturas y apuntar gastos, puedes contratar de nuevo en cualquier momento:',
        { boton: { texto: 'Volver a contratar', url: d.url } },
        '¿Nos cuentas por qué te vas? Responde a este email: lo leemos todo.',
        firma,
      ],
    }),
  },

  // — Recomienda Netto —
  'premio-recomendacion': {
    grupo: 'Recomienda Netto', nombre: 'Has ganado un mes gratis',
    cuando: 'Cuando una empresa que llegó con tu enlace paga por primera vez (máximo 12 meses).',
    para: 'Administradores de la empresa que recomendó',
    ejemplo: { nombre: 'Ana López', tipo: 'abono', centimos: 1089, url: 'https://www.nettohq.com/ajustes/recomienda' },
    crear: (d) => ({
      asunto: 'Has ganado un mes gratis de Netto',
      previa: 'Gracias por recomendarnos.',
      bloques: [
        hola(d.nombre),
        'Una empresa a la que recomendaste Netto acaba de contratar su plan. ¡Gracias por recomendarnos!',
        d.tipo === 'abono'
          ? `Te regalamos un mes: hemos dejado **${euros(d.centimos)}** a tu favor, que se descuentan solos de tu próximo cobro.`
          : `Te regalamos un mes: tu prueba se alarga hasta el **${fechaLarga(d.hasta)}**.`,
        { boton: { texto: 'Ver mis recomendaciones', url: d.url } },
        firma,
      ],
    }),
  },

  // — Seguridad y baja —
  'contrasena-cambiada': {
    grupo: 'Seguridad y baja', nombre: 'Contraseña cambiada',
    cuando: 'Al cambiar la contraseña en Ajustes o al recuperarla con el enlace.',
    para: 'La persona de la cuenta',
    ejemplo: { nombre: 'Laura Martín', fecha: '20 de octubre de 2026, 10:42' },
    crear: (d) => ({
      asunto: 'Tu contraseña de Netto ha cambiado',
      previa: 'Si no has sido tú, avísanos enseguida.',
      bloques: [hola(d.nombre), `La contraseña de tu cuenta de Netto se cambió el ${d.fecha}. Por seguridad, se ha cerrado la sesión en los demás dispositivos.`, `**Si no has sido tú**, recupera tu contraseña ahora y escríbenos a ${SOPORTE}.`, firma],
    }),
  },
  'baja-empresa': {
    grupo: 'Seguridad y baja', nombre: 'Empresa dada de baja',
    cuando: 'Al dar de baja la empresa o eliminar la cuenta (si era su único miembro).',
    para: 'Quien la da de baja',
    ejemplo: { nombre: 'Ana López', empresa: 'Estudio Martín', borrarEl: '2032-10-20' },
    crear: (d) => ({
      asunto: `${linea(d.empresa) || 'Tu empresa'} se ha dado de baja en Netto`,
      previa: 'Confirmación de la baja y de lo que guardamos por ley.',
      bloques: [
        hola(d.nombre),
        `Confirmamos la baja de **${d.empresa || 'tu empresa'}** en Netto. Ya nadie puede entrar en ella, los enlaces enviados a clientes dejan de funcionar y la suscripción no se vuelve a cobrar.`,
        `Las facturas, la contabilidad y los registros que la ley obliga a conservar se guardan bloqueados hasta el **${fechaLarga(d.borrarEl)}**; ese día se borran del todo.`,
        'Si ha sido un error o necesitas una copia de algo, responde a este email.',
        firma,
      ],
    }),
  },
  'cuenta-eliminada': {
    grupo: 'Seguridad y baja', nombre: 'Cuenta eliminada',
    cuando: 'Al eliminar la propia cuenta en Ajustes.',
    para: 'La persona que la elimina',
    ejemplo: { nombre: 'Laura Martín' },
    crear: (d) => ({
      asunto: 'Tu cuenta de Netto se ha eliminado',
      previa: 'Confirmación de la eliminación de tu cuenta.',
      bloques: [hola(d.nombre), 'Confirmamos que tu cuenta de Netto se ha eliminado y ya no se puede entrar con ella.', 'Si eras la única persona de tu empresa, la empresa también se ha dado de baja: lo que la ley obliga a conservar queda bloqueado y se borra al acabar el plazo.', 'Si no lo has hecho tú, escríbenos cuanto antes respondiendo a este email.', firma],
    }),
  },

  // — En nombre de la empresa (el texto lo escribe la empresa en Ajustes › Envío de facturas) —
  factura: {
    grupo: 'En nombre de la empresa', nombre: 'Factura a un cliente', marca: 'empresa',
    cuando: 'Al enviar una factura desde Netto y en cada factura recurrente con envío automático. Lleva el PDF adjunto y enlace de pago si hay Stripe.',
    para: 'El cliente de la empresa (responder le escribe a la empresa)',
    ejemplo: { empresa: 'Estudio Martín', mensaje: 'Hola,\n\nTe adjunto la factura 2026-014 por 1.210,00 €, con vencimiento el 19 de noviembre de 2026.\n\nGracias,\nEstudio Martín', asunto: 'Factura 2026-014 de Estudio Martín' },
    crear: (d) => ({ asunto: d.asunto, previa: '', bloques: parrafos(d.mensaje), libre: true, pie: 'Enviado con Netto' }),
  },
  'recordatorio-cobro': {
    grupo: 'En nombre de la empresa', nombre: 'Recordatorio de factura vencida', marca: 'empresa',
    cuando: 'Cada X días tras el vencimiento de una factura sin cobrar, si la empresa activa los recordatorios en Ajustes.',
    para: 'El cliente de la empresa',
    ejemplo: { empresa: 'Estudio Martín', numero: '2026-014', total: '1.210,00 €', vencio: '19 de noviembre de 2026', iban: 'ES12 3456 7890 1234 5678 9012', urlPago: 'https://www.nettohq.com/pagar/ejemplo' },
    crear: (d) => ({
      asunto: `Recordatorio: factura ${d.numero} pendiente de pago`,
      previa: `La factura ${d.numero} venció el ${d.vencio}.`,
      libre: true, pie: 'Enviado con Netto',
      bloques: [
        'Hola,',
        `Te recordamos que la factura **${d.numero}** por **${d.total}** venció el ${d.vencio} y aún no nos consta el pago.`,
        d.urlPago && { boton: { texto: 'Pagar con tarjeta o Bizum', url: d.urlPago } },
        `${d.urlPago ? 'O por' : 'Puedes pagarla por'} transferencia a ${d.iban}, indicando la factura ${d.numero}.`,
        { nota: 'Si ya la has pagado, ignora este mensaje. Te adjuntamos la factura en PDF.' },
        `Gracias,\n${d.empresa}`,
      ],
    }),
  },
  'paquete-gestoria': {
    grupo: 'En nombre de la empresa', nombre: 'Paquete del trimestre a la gestoría', marca: 'empresa',
    cuando: 'El día 5 tras cada trimestre si está activado el envío automático, o al pulsar «Enviar a mi gestoría».',
    para: 'La gestoría de la empresa (responder le escribe a la empresa)',
    ejemplo: { gestor: 'Carmen', empresa: 'Estudio Martín', nif: 'B12345678', t: 3, anio: 2026, justificantes: true, sinJustificantes: false },
    crear: (d) => ({
      asunto: `Paquete del ${d.t}T ${d.anio} · ${d.empresa}`,
      previa: `Facturas, gastos, nóminas e impuestos del ${d.t}T ${d.anio}.`,
      pie: 'Enviado con Netto desde la cuenta de la empresa',
      bloques: [
        `Hola${d.gestor ? `, ${d.gestor}` : ''}:`,
        `Te mando el paquete del **${d.t}T de ${d.anio}** de ${d.empresa}${d.nif ? ` (NIF ${d.nif})` : ''}: facturas emitidas y recibidas, nóminas e impuestos del trimestre, en Excel y en PDF${d.justificantes ? ', con los justificantes de los gastos' : ''}.`,
        d.sinJustificantes && 'Los justificantes de los gastos no caben en el correo: pídemelos si los necesitas.',
        `Un saludo,\n${d.empresa}`,
      ],
    }),
  },

  // — Para el equipo de Netto —
  'solicitud-acceso': {
    grupo: 'Para el equipo de Netto', nombre: 'Nueva solicitud desde la web', interno: true,
    cuando: 'Cuando alguien rellena el formulario de contacto de la web pública.',
    para: `${SOPORTE} (responder le escribe a quien pide acceso)`,
    ejemplo: { datos: [['Nombre', 'Laura Martín'], ['Email', 'laura@ejemplo.es'], ['Empresa', 'Estudio Martín'], ['Mensaje', 'Me interesa el plan Pro.']], nombre: 'Laura Martín', empresa: 'Estudio Martín' },
    crear: (d) => ({ asunto: `Nueva solicitud de acceso: ${linea(d.nombre)}${d.empresa ? ` (${linea(d.empresa)})` : ''}`, bloques: ['Alguien ha pedido acceso a Netto desde la web.', { datos: d.datos }, { nota: 'Responde a este email para escribirle directamente.' }] }),
  },
  soporte: {
    grupo: 'Para el equipo de Netto', nombre: 'Mensaje de ayuda', interno: true,
    cuando: 'Cuando alguien con sesión escribe desde Ajustes › Ayuda y contacto.',
    para: `${SOPORTE} (responder le escribe a la persona)`,
    ejemplo: { tema: 'Facturas', empresa: 'Estudio Martín', datos: [['Persona', 'Laura <laura@ejemplo.es>'], ['Empresa', 'Estudio Martín'], ['Plan', 'aut Pro'], ['Tema', 'Facturas']], mensaje: 'No sé cómo poner el IRPF en una factura.' },
    crear: (d) => ({ asunto: linea(`[Ayuda] ${d.tema} · ${d.empresa}`), bloques: [{ datos: d.datos }, ...parrafos(d.mensaje)] }),
  },
};

// { asunto, html, texto } de un correo del catálogo con sus datos.
export function componer(id, datos = {}, { pixel } = {}) {
  const c = CORREOS[id];
  if (!c) throw new Error(`No existe el correo «${id}»`);
  const r = c.crear(datos);
  const marca = c.marca === 'empresa' ? linea(datos.empresa) || 'Netto' : 'Netto';
  const pie = r.pie ?? (c.interno ? '' : PIE_NETTO);
  const asunto = linea(r.asunto).slice(0, 200);
  return { asunto, html: marco({ marca, previa: r.previa, bloques: r.bloques, pie, libre: r.libre, pixel }), texto: textoPlano({ bloques: r.bloques, pie }) };
}

// Envía un correo del catálogo. Los de Netto, si no se dice otra cosa, se responden al equipo de soporte.
// Devuelve lo mismo que enviarEmail: { id } o { error }; nunca lanza.
export async function enviarCorreo(id, { para, datos, responderA, adjuntos, pixel, asunto } = {}) {
  try {
    const c = componer(id, datos, { pixel });
    const netto = CORREOS[id].marca !== 'empresa' && !CORREOS[id].interno;
    return await enviarEmail({
      para, asunto: asunto ? linea(asunto).slice(0, 200) : c.asunto, html: c.html, texto: c.texto, etiqueta: id,
      responderA: responderA || (netto ? soporte() : undefined), adjuntos,
    });
  } catch (e) { return { error: `No se pudo enviar el email: ${e.message}` }; }
}

// Para el panel: el catálogo sin funciones, con la vista previa de cada correo.
export const catalogo = () => Object.entries(CORREOS).map(([id, c]) => ({ id, grupo: c.grupo, nombre: c.nombre, cuando: c.cuando, para: c.para, ...componer(id, c.ejemplo) }));
