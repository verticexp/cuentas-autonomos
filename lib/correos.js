// Catálogo de los correos que envía Fisquo: qué se manda, a quién, cuándo y con qué plantilla. Todos comparten el mismo
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
import { idiomaAppValido, localeDe, traductor } from './i18n.js';
import { diccionario } from './textos/index.js';
import { traducirPerdida } from './planes.js';

export const SOPORTE = 'corporate@fisquo.com';
const soporte = () => process.env.CONTACTO_EMAIL || SOPORTE;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sin saltos de línea en el asunto (cabecera del email).
export const linea = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const nombrePila = (n) => String(n || '').trim().split(/\s+/)[0] || '';
// tr: el traductor del idioma de quien lo recibe (componer); en castellano, el texto tal cual.
const hola = (n, tr) => (nombrePila(n) ? tr('Hola, {nombre}:', { nombre: nombrePila(n) }) : tr('Hola:'));
const negrita = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const enlaces = (s) => s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" class="c-enlace" style="color:#167A59">${u}</a>`);
const sinMarcas = (s) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');

// Colores de la marca (components/web/web.css): verde oscuro, verde de acción y menta.
const C = { tinta: '#0F1F1B', fondo: '#FAFAF8', gris: '#5B6360', borde: '#E3E7E4', verde: '#167A59', luz: '#7FE3BD', menta: '#E6F2EC' };
const P = `margin:0 0 16px`;

function bloqueHtml(b, libre, tr = (x) => x) {
  if (typeof b === 'string') {
    const t = negrita(esc(b)).replace(/\n/g, '<br>');
    return `<p style="${P}">${libre ? enlaces(t) : t}</p>`;
  }
  if (b.boton) {
    const u = esc(b.boton.url);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr><td align="left">
<a href="${u}" class="c-boton" style="display:inline-block;padding:16px 36px;background:${C.verde};color:#FFFFFF;font-size:17px;font-weight:600;text-decoration:none;text-align:center;border-radius:12px">${esc(b.boton.texto)}</a>
</td></tr></table>
${b.boton.sinEnlace ? '<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>' : `<p class="c-gris" style="margin:20px 0 6px;font-size:14px;color:${C.gris}">${esc(tr('Si el botón no funciona, copia este enlace en el navegador:'))}</p>
<p style="margin:0 0 20px;font-size:14px;word-break:break-all"><a href="${u}" class="c-enlace" style="color:${C.verde}">${u}</a></p>`}`;
  }
  if (b.lista) return `<ul style="margin:0 0 16px;padding-left:20px">${b.lista.map((x) => `<li style="margin:0 0 6px">${negrita(esc(x))}</li>`).join('')}</ul>`;
  if (b.datos) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">${b.datos.map(([k, v]) => `<tr><td class="c-gris" style="padding:4px 16px 4px 0;color:${C.gris};vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
  if (b.nota) return `<p class="c-gris" style="margin:0 0 12px;font-size:14px;color:${C.gris}">${negrita(esc(b.nota))}</p>`;
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

// El marco común. marca: el nombre de arriba («Fisquo» o la empresa que envía la factura). pixel: imagen de 1 px que
// avisa cuando se abre (solo en facturas y recordatorios a clientes).
// Logo y enlaces: PNG servidos por la web (public/correo/, los genera scripts/logo-correo.mjs). Los clientes de correo no
// muestran SVG ni imágenes en data:. Sin fondos oscuros en el HTML: Gmail en modo oscuro los «aclara» a un menta raro.
// La cabecera es el icono (cuadrado oscuro propio, que ningún cliente invierte) y «Fisquo» en texto, que sí se adapta.
const WEB = () => (process.env.APP_URL || 'https://www.fisquo.com').replace(/\/$/, '');
const icono = (px) => `<img src="${WEB()}/correo/fisquo-icono.png" width="${px}" height="${px}" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:${Math.round(px * 0.22)}px">`;
const raya = `<div class="c-raya" style="height:3px;width:44px;background:${C.verde};border-radius:2px;margin:16px 0 0;font-size:0;line-height:0">&nbsp;</div>`;
const cabeceraFisquo = () => `<tr><td class="c-cab" style="padding:32px 40px 0">
<a href="${WEB()}" class="c-tinta" style="text-decoration:none;color:${C.tinta};font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:40px">${icono(40)}<span style="vertical-align:middle">&nbsp;&nbsp;Fisquo</span></a>
${raya}</td></tr>`;
const cabeceraEmpresa = (marca) => `<tr><td class="c-cab" style="padding:32px 40px 0"><p class="c-tinta" style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.02em">${esc(marca)}</p>${raya}</td></tr>`;
const pieHtml = (pie, fisquo) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:24px auto 0"><tr><td align="center" class="c-gris" style="padding:0 16px;font-size:13px;line-height:1.6;color:${C.gris}">
${fisquo
    ? `<p style="margin:0 0 8px"><a href="${WEB()}" class="c-tinta" style="text-decoration:none;color:${C.tinta};font-weight:700;font-size:15px">${icono(24)}<span style="vertical-align:middle">&nbsp; Fisquo</span></a></p>`
    : `<p style="margin:0 0 4px"><a href="${WEB()}" class="c-gris" style="text-decoration:none;color:${C.gris}">${icono(18)}<span style="vertical-align:middle">&nbsp; Enviado con <strong class="c-tinta" style="color:${C.tinta}">Fisquo</strong></span></a></p>`}
${pie ? `<p style="margin:0">${negrita(esc(pie)).replace(/\n/g, '<br>')}</p>` : ''}
</td></tr></table>`;

// Móvil: menos margen y botón a todo el ancho. Modo oscuro: Apple Mail e iOS respetan estos colores; Gmail y Outlook
// aplican su propia inversión, que con un diseño claro queda bien.
const ESTILO = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (max-width:660px){.c-cab{padding:24px 20px 0!important}.c-cuerpo{padding:20px 20px 8px!important}a.c-boton{display:block!important;box-sizing:border-box}.c-fuera{padding:12px 8px!important}}
@media (prefers-color-scheme:dark){.c-fondo{background:#0E1513!important}.c-tarjeta{background:#16201D!important;border-color:#26332E!important}.c-tinta{color:#EEF2F0!important}.c-gris{color:#A3ADA8!important}.c-raya{background:${C.luz}!important}.c-fondo a.c-enlace{color:${C.luz}!important}}
</style>`;

// El marco común. fisquo: correo de Fisquo (cabecera con su logo); si no, va en nombre de la empresa (marca) y Fisquo solo
// firma abajo. pixel: imagen de 1 px que avisa cuando se abre (facturas y recordatorios a clientes).
export function marco({ marca = 'Fisquo', fisquo = true, previa = '', bloques = [], pie, libre = false, pixel, idioma = 'es', tr = (x) => x }) {
  return `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">${ESTILO}</head>
<body class="c-fondo" style="margin:0;padding:0;background:${C.fondo}">
${previa ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(previa)}</div>` : ''}
<div class="c-fondo c-fuera c-tinta" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:17px;line-height:1.55;color:${C.tinta};background:${C.fondo};padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="c-tarjeta" style="max-width:640px;margin:0 auto;background:#FFFFFF;border-radius:16px;border:1px solid ${C.borde};border-collapse:separate">
${fisquo ? cabeceraFisquo() : cabeceraEmpresa(marca)}
<tr><td class="c-cuerpo" style="padding:28px 40px 16px">
${bloques.filter(Boolean).map((b) => bloqueHtml(b, libre, tr)).join('\n')}
</td></tr></table>
${pieHtml(pie, fisquo)}
</div>${pixel ? `<img src="${esc(pixel)}" width="1" height="1" alt="" style="display:block;border:0">` : ''}</body></html>`;
}

export const textoPlano = ({ bloques = [], pie }) => [...bloques.filter(Boolean).map(bloqueTexto), pie ? `--\n${sinMarcas(pie)}` : ''].filter(Boolean).join('\n\n');

const pieFisquo = (tr) => [tr('Cuentas para autónomos y pymes · fisquo.com'), tr('Si tienes cualquier duda, responde a este email o escríbenos a {soporte}.', { soporte: SOPORTE })].join('\n');
const firma = (tr) => tr('El equipo de Fisquo');
const fechaLarga = (d, idioma = 'es') => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString(localeDe(idioma), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const euros = (c) => `${(Number(c || 0) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const parrafos = (t) => String(t || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);

// Grupos del catálogo, en el orden en que salen en el panel.
export const GRUPOS = ['Cuenta y acceso', 'Prueba', 'Suscripción', 'Recomienda Fisquo', 'Seguridad y baja', 'En nombre de la empresa', 'Para el equipo de Fisquo'];

const avisoPrueba = (aviso) => ({
  grupo: 'Prueba',
  para: 'Administradores de la empresa',
  ejemplo: { nombre: 'Ana López', aviso, plan: 'Esencial', precio: 9, hasta: '2026-11-19', perdidas: ['El asistente IA (12 preguntas)', 'Remesas SEPA'], recomendado: { n: 'Pro', p: 19 }, descuento: 30, url: 'https://www.fisquo.com/ajustes/plan?contratar=1' },
  crear: (d, tr, idioma) => {
    const cuando = tr({ semana: 'dentro de una semana', tres: 'dentro de 3 días', ultimo: 'hoy' }[d.aviso]);
    const fin = d.aviso === 'fin';
    const usado = d.perdidas?.length ? [
      tr('Durante la prueba has usado cosas que el plan {plan} no incluye:', { plan: d.plan }),
      { lista: d.perdidas.map((x) => traducirPerdida(x, tr)) },
      d.recomendado ? tr('Con el plan **{plan}** ({precio} €/mes + IVA) lo sigues teniendo todo.', { plan: d.recomendado.n, precio: d.recomendado.p }) : tr('Para seguir con todo, escríbenos y te preparamos un plan a medida.'),
    ] : [];
    return {
      asunto: fin ? tr('Tu prueba de Fisquo ha terminado: tus datos siguen ahí') : tr('Tu prueba de Fisquo acaba {cuando}', { cuando }),
      previa: fin ? tr('No se ha borrado nada. Elige tu plan para seguir creando facturas.') : tr('Añade tu tarjeta para seguir sin cortes. Sin permanencia.'),
      bloques: [
        hola(d.nombre, tr),
        fin
          ? tr('Tu prueba acabó el {fecha}. **No se ha borrado nada**: puedes entrar, ver y exportar todo. Para volver a crear facturas y apuntar gastos, elige tu plan.', { fecha: fechaLarga(d.hasta, idioma) })
          : tr(d.aviso === 'ultimo' ? 'Tu prueba del plan {plan} acaba **{cuando}**. Para seguir sin cortes, añade tu tarjeta: el plan {plan} cuesta {precio} €/mes + IVA (o un {descuento} % menos si pagas el año), sin permanencia.' : 'Tu prueba del plan {plan} acaba **{cuando}** (el {fecha}). Para seguir sin cortes, añade tu tarjeta: el plan {plan} cuesta {precio} €/mes + IVA (o un {descuento} % menos si pagas el año), sin permanencia.', { plan: d.plan, cuando, fecha: fechaLarga(d.hasta, idioma), precio: d.precio, descuento: d.descuento }),
        ...usado,
        { boton: { texto: tr(fin ? 'Elegir mi plan' : 'Elegir plan y añadir la tarjeta'), url: d.url } },
        !fin && { nota: tr('Si no haces nada, no se te cobra nada: tu cuenta pasa a solo lectura y tus datos se quedan donde están.') },
        firma(tr),
      ],
    };
  },
});

// El botón y la nota del área de cliente en el correo de una factura, en el idioma de la factura (lib/idiomas.js).
// Botón para pagar la factura con tarjeta (solo si la empresa cobra en su cuenta de Stripe).
const PAGAR = { es: 'Pagar con tarjeta', en: 'Pay by card', ca: 'Pagar amb targeta', fr: 'Payer par carte', de: 'Mit Karte bezahlen', it: 'Paga con carta', pt: 'Pagar com cartão' };
const PORTAL = {
  es: { boton: 'Ver mis facturas', nota: (em) => `En tu área de cliente tienes todas las facturas y presupuestos de ${em}, para verlos y descargarlos cuando quieras. Sin contraseñas.` },
  en: { boton: 'View my invoices', nota: (em) => `Your client area has all the invoices and quotes from ${em}, to view and download whenever you like. No passwords.` },
  ca: { boton: 'Veure les meves factures', nota: (em) => `A la teva àrea de client tens totes les factures i pressupostos de ${em}, per veure'ls i descarregar-los quan vulguis. Sense contrasenyes.` },
  fr: { boton: 'Voir mes factures', nota: (em) => `Votre espace client contient toutes les factures et tous les devis de ${em}, à consulter et télécharger quand vous voulez. Sans mot de passe.` },
  de: { boton: 'Meine Rechnungen ansehen', nota: (em) => `In Ihrem Kundenbereich finden Sie alle Rechnungen und Angebote von ${em} zum Ansehen und Herunterladen. Ohne Passwort.` },
  it: { boton: 'Vedi le mie fatture', nota: (em) => `Nella tua area cliente trovi tutte le fatture e i preventivi di ${em}, da vedere e scaricare quando vuoi. Senza password.` },
  pt: { boton: 'Ver as minhas faturas', nota: (em) => `Na sua área de cliente tem todas as faturas e orçamentos de ${em}, para ver e descarregar quando quiser. Sem palavras-passe.` },
};

export const CORREOS = {
  // — Cuenta y acceso —
  'confirmar-email': {
    grupo: 'Cuenta y acceso', nombre: 'Confirmar el email',
    cuando: 'Al registrarse, al aceptar una invitación sin email confirmado y al pulsar «Reenviar el enlace».',
    para: 'La persona que se registra',
    ejemplo: { nombre: 'Laura Martín', url: 'https://www.fisquo.com/api/confirmar?t=ejemplo' },
    crear: (d, tr) => ({
      asunto: tr('Confirma tu email en Fisquo'),
      previa: tr('Un clic y listo: confirma tu email para seguir usando Fisquo.'),
      bloques: [hola(d.nombre, tr), tr('Confirma que este es tu email para seguir usando Fisquo.'), { boton: { texto: tr('Confirmar mi email'), url: d.url } }, { nota: tr('El enlace vale 7 días. Si no has creado una cuenta en Fisquo, ignora este email.') }],
    }),
  },
  bienvenida: {
    grupo: 'Cuenta y acceso', nombre: 'Bienvenida',
    cuando: 'Justo después de confirmar el email, una sola vez por persona.',
    para: 'Quien acaba de confirmar su cuenta',
    ejemplo: { nombre: 'Laura Martín', empresa: 'Estudio Martín', dias: 30, url: 'https://www.fisquo.com' },
    crear: (d, tr) => ({
      asunto: tr('Bienvenida a Fisquo: tus primeros pasos'),
      previa: tr('Cuatro pasos para tener tus cuentas al día desde hoy.'),
      bloques: [
        hola(d.nombre, tr),
        [d.empresa ? tr('Ya tienes **{empresa}** en Fisquo.', { empresa: d.empresa }) : tr('Ya tienes Fisquo.'), d.dias && tr('Tienes {dias} días de prueba con todo incluido y sin tarjeta.', { dias: d.dias }), tr('Para empezar con buen pie:')].filter(Boolean).join(' '),
        { lista: [
          tr('**Rellena tus datos de facturación** en Ajustes (NIF, dirección e IBAN): salen en tus facturas.'),
          tr('**Crea tu primera factura** y envíala desde Fisquo: tu cliente la recibe en PDF.'),
          tr('**Apunta tus gastos** haciendo una foto al ticket: Fisquo lee el importe y el IVA.'),
          tr('**Invita a tu gestoría** para que tenga los trimestres sin pedirte nada.'),
        ] },
        { boton: { texto: tr('Entrar en Fisquo'), url: d.url } },
        tr('¿Te atascas en algo? Responde a este email y te ayudamos.'),
        firma(tr),
      ],
    }),
  },
  invitacion: {
    grupo: 'Cuenta y acceso', nombre: 'Invitación a una empresa',
    cuando: 'Cuando un administrador añade a alguien en Usuarios y permisos (o le reenvía la invitación).',
    para: 'La persona invitada (responder le escribe a quien invita)',
    ejemplo: { nombre: 'Laura', quien: 'Marc', empresa: 'SONORA EVENTOS', dias: 7, url: 'https://www.fisquo.com/invitacion/ejemplo' },
    crear: (d, tr) => {
      const empresa = linea(d.empresa);
      return {
        asunto: linea(empresa ? tr('{quien} te ha invitado a {empresa} en Fisquo', { quien: d.quien, empresa }) : tr('{quien} te ha invitado a unirte a su empresa en Fisquo', { quien: d.quien })),
        previa: tr('Elige tu contraseña para entrar.'),
        bloques: [tr('Hola, {nombre}:', { nombre: d.nombre }), empresa ? tr('**{quien}** te ha invitado a **{empresa}** en Fisquo. Elige tu contraseña para entrar.', { quien: d.quien, empresa }) : tr('**{quien}** te ha invitado a unirte a su empresa en Fisquo. Elige tu contraseña para entrar.', { quien: d.quien }), { boton: { texto: tr('Aceptar la invitación'), url: d.url } }, { nota: tr('El enlace vale {dias} días y solo se puede usar una vez. Si no esperabas este email, ignóralo.', { dias: d.dias || 7 }) }],
      };
    },
  },
  'recuperar-contrasena': {
    grupo: 'Cuenta y acceso', nombre: 'Recuperar la contraseña',
    cuando: 'Al pedir «He olvidado mi contraseña» con un email que existe (si no existe, no se manda nada).',
    para: 'La persona que lo pide',
    ejemplo: { url: 'https://www.fisquo.com/recuperar?t=ejemplo' },
    crear: (d, tr) => ({
      asunto: tr('Recupera tu contraseña de Fisquo'),
      previa: tr('El enlace caduca en 30 minutos.'),
      bloques: [tr('Hola:'), tr('Has pedido recuperar tu contraseña de Fisquo. Pulsa el botón para elegir una nueva.'), { boton: { texto: tr('Elegir una contraseña nueva'), url: d.url } }, { nota: tr('El enlace caduca en 30 minutos y solo se puede usar una vez. Si no lo has pedido tú, ignora este email: tu contraseña sigue siendo la misma.') }],
    }),
  },

  // — Prueba —
  'prueba-semana': { ...avisoPrueba('semana'), nombre: 'Prueba: queda una semana', cuando: 'A 7 días del fin de la prueba (cron de las 7:00).' },
  'prueba-tres': { ...avisoPrueba('tres'), nombre: 'Prueba: quedan 3 días', cuando: 'A 3 días del fin de la prueba.' },
  'prueba-ultimo': { ...avisoPrueba('ultimo'), nombre: 'Prueba: último día', cuando: 'El último día de la prueba.' },
  'prueba-fin': { ...avisoPrueba('fin'), nombre: 'Prueba: ha terminado', cuando: 'El día después del fin (solo los 3 primeros días, no a pruebas antiguas).' },

  // — Suscripción (aviso de Stripe) —
  'fin-oferta-despacho': {
    grupo: 'Suscripción', nombre: 'Acaba la oferta de lanzamiento del despacho',
    cuando: 'Una vez, 60 días antes de que acaben los 2 años de precio de lanzamiento de un despacho con el cobro activo.',
    para: 'Titular del despacho',
    ejemplo: { nombre: 'Asesoría Norte', hasta: '2028-10-22', aut: '7 €', pym: '20 €', url: 'https://www.fisquo.com/despacho/ajustes' },
    crear: (d, tr, idioma) => ({
      asunto: tr('Tu precio de lanzamiento de Fisquo acaba en 2 meses'),
      previa: tr('Hasta el {fecha} sigues con el precio de lanzamiento.', { fecha: fechaLarga(d.hasta, idioma) }),
      bloques: [
        tr('Hola:'),
        tr('Gracias por estar desde el principio. El precio de lanzamiento de **{nombre}** dura hasta el **{fecha}**.', { nombre: d.nombre, fecha: fechaLarga(d.hasta, idioma) }),
        tr('Desde el día siguiente, cada licencia pasa a la tarifa normal: **{aut}** al mes por autónomo y **{pym}** por pyme, sin IVA (menos a partir de 25 clientes). No tienes que hacer nada: el cobro se ajusta solo.', { aut: d.aut, pym: d.pym }),
        { boton: { texto: tr('Ver mis licencias'), url: d.url } },
        { nota: tr('Puedes quitar Fisquo de la cuota de cualquier cliente cuando quieras, en su ficha.') },
        firma(tr),
      ],
    }),
  },
  'plan-activado': {
    grupo: 'Suscripción', nombre: 'Plan contratado',
    cuando: 'Cuando Stripe confirma el primer pago de la suscripción (o la reactiva tras cancelarla).',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', empresa: 'Estudio Martín', plan: 'Pro', periodo: 'mensual', url: 'https://www.fisquo.com/ajustes/plan' },
    crear: (d, tr) => ({
      asunto: tr('Ya tienes el plan {plan} de Fisquo', { plan: d.plan }),
      previa: tr('Gracias por confiar en Fisquo. Tu suscripción está activa.'),
      bloques: [
        hola(d.nombre, tr),
        tr('Gracias por elegir Fisquo. El plan **{plan}**{pago}{empresa} ya está activo: puedes seguir trabajando sin límites de prueba.', {
          plan: d.plan, pago: d.periodo ? ` ${tr(d.periodo === 'anual' ? '(pago anual)' : d.periodo === 'mensual' ? '(pago mensual)' : `(pago ${d.periodo})`)}` : '', empresa: d.empresa ? ` ${tr('de {empresa}', { empresa: d.empresa })}` : '',
        }),
        tr('Stripe te manda el recibo de cada cobro. Las facturas, la tarjeta y la baja están siempre en Ajustes › Tu plan.'),
        { boton: { texto: tr('Ver mi plan'), url: d.url } },
        firma(tr),
      ],
    }),
  },
  'pago-fallido': {
    grupo: 'Suscripción', nombre: 'No se ha podido cobrar',
    cuando: 'Cuando falla el cobro de la suscripción (Stripe la pasa a «pendiente de pago»). Stripe lo reintenta solo unos días.',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', plan: 'Pro', url: 'https://www.fisquo.com/ajustes/plan' },
    crear: (d, tr) => ({
      asunto: tr('No hemos podido cobrar tu plan de Fisquo'),
      previa: tr('Revisa tu tarjeta para no perder el acceso.'),
      bloques: [
        hola(d.nombre, tr),
        tr('No hemos podido cobrar el plan **{plan}**. Suele ser una tarjeta caducada o sin saldo. Lo volveremos a intentar en los próximos días.', { plan: d.plan }),
        tr('Para evitar que tu cuenta pase a solo lectura, revisa o cambia la tarjeta:'),
        { boton: { texto: tr('Revisar mi forma de pago'), url: d.url } },
        { nota: tr('Tus datos no se tocan en ningún caso. Si ya lo has solucionado, ignora este email.') },
        firma(tr),
      ],
    }),
  },
  'suscripcion-cancelada': {
    grupo: 'Suscripción', nombre: 'Suscripción cancelada',
    cuando: 'Cuando la suscripción termina (baja desde el portal de Stripe o cobros fallidos agotados).',
    para: 'Administradores de la empresa',
    ejemplo: { nombre: 'Ana López', plan: 'Pro', url: 'https://www.fisquo.com/ajustes/plan?contratar=1' },
    crear: (d, tr) => ({
      asunto: tr('Tu plan de Fisquo ha terminado: tus datos siguen ahí'),
      previa: tr('Tu cuenta pasa a solo lectura. No se ha borrado nada.'),
      bloques: [
        hola(d.nombre, tr),
        tr('Tu plan **{plan}** ha terminado y no se te volverá a cobrar. **No se ha borrado nada**: puedes entrar, ver y exportar todo cuando quieras.', { plan: d.plan }),
        tr('Si quieres volver a crear facturas y apuntar gastos, puedes contratar de nuevo en cualquier momento:'),
        { boton: { texto: tr('Volver a contratar'), url: d.url } },
        tr('¿Nos cuentas por qué te vas? Responde a este email: lo leemos todo.'),
        firma(tr),
      ],
    }),
  },

  // — Recomienda Fisquo —
  'premio-recomendacion': {
    grupo: 'Recomienda Fisquo', nombre: 'Has ganado un mes gratis',
    cuando: 'Cuando una empresa que llegó con tu enlace paga por primera vez (máximo 12 meses).',
    para: 'Administradores de la empresa que recomendó',
    ejemplo: { nombre: 'Ana López', tipo: 'abono', centimos: 1089, url: 'https://www.fisquo.com/ajustes/recomienda' },
    crear: (d, tr, idioma) => ({
      asunto: tr('Has ganado un mes gratis de Fisquo'),
      previa: tr('Gracias por recomendarnos.'),
      bloques: [
        hola(d.nombre, tr),
        tr('Una empresa a la que recomendaste Fisquo acaba de contratar su plan. ¡Gracias por recomendarnos!'),
        d.tipo === 'abono'
          ? tr('Te regalamos un mes: hemos dejado **{importe}** a tu favor, que se descuentan solos de tu próximo cobro.', { importe: euros(d.centimos) })
          : tr('Te regalamos un mes: tu prueba se alarga hasta el **{fecha}**.', { fecha: fechaLarga(d.hasta, idioma) }),
        { boton: { texto: tr('Ver mis recomendaciones'), url: d.url } },
        firma(tr),
      ],
    }),
  },

  // — Seguridad y baja —
  'contrasena-cambiada': {
    grupo: 'Seguridad y baja', nombre: 'Contraseña cambiada',
    cuando: 'Al cambiar la contraseña en Ajustes o al recuperarla con el enlace.',
    para: 'La persona de la cuenta',
    ejemplo: { nombre: 'Laura Martín', fecha: '20 de octubre de 2026, 10:42' },
    crear: (d, tr) => ({
      asunto: tr('Tu contraseña de Fisquo ha cambiado'),
      previa: tr('Si no has sido tú, avísanos enseguida.'),
      bloques: [hola(d.nombre, tr), tr('La contraseña de tu cuenta de Fisquo se cambió el {fecha}. Por seguridad, se ha cerrado la sesión en los demás dispositivos.', { fecha: d.fecha }), tr('**Si no has sido tú**, recupera tu contraseña ahora y escríbenos a {soporte}.', { soporte: SOPORTE }), firma(tr)],
    }),
  },
  'baja-empresa': {
    grupo: 'Seguridad y baja', nombre: 'Empresa dada de baja',
    cuando: 'Al dar de baja la empresa o eliminar la cuenta (si era su único miembro).',
    para: 'Quien la da de baja',
    ejemplo: { nombre: 'Ana López', empresa: 'Estudio Martín', borrarEl: '2032-10-20' },
    crear: (d, tr, idioma) => ({
      asunto: linea(d.empresa) ? tr('{empresa} se ha dado de baja en Fisquo', { empresa: linea(d.empresa) }) : tr('Tu empresa se ha dado de baja en Fisquo'),
      previa: tr('Confirmación de la baja y de lo que guardamos por ley.'),
      bloques: [
        hola(d.nombre, tr),
        d.empresa ? tr('Confirmamos la baja de **{empresa}** en Fisquo. Ya nadie puede entrar en ella, los enlaces enviados a clientes dejan de funcionar y la suscripción no se vuelve a cobrar.', { empresa: d.empresa }) : tr('Confirmamos la baja de **tu empresa** en Fisquo. Ya nadie puede entrar en ella, los enlaces enviados a clientes dejan de funcionar y la suscripción no se vuelve a cobrar.'),
        tr('Las facturas, la contabilidad y los registros que la ley obliga a conservar se guardan bloqueados hasta el **{fecha}**; ese día se borran del todo.', { fecha: fechaLarga(d.borrarEl, idioma) }),
        tr('Si ha sido un error o necesitas una copia de algo, responde a este email.'),
        firma(tr),
      ],
    }),
  },
  'cuenta-eliminada': {
    grupo: 'Seguridad y baja', nombre: 'Cuenta eliminada',
    cuando: 'Al eliminar la propia cuenta en Ajustes.',
    para: 'La persona que la elimina',
    ejemplo: { nombre: 'Laura Martín' },
    crear: (d, tr) => ({
      asunto: tr('Tu cuenta de Fisquo se ha eliminado'),
      previa: tr('Confirmación de la eliminación de tu cuenta.'),
      bloques: [hola(d.nombre, tr), tr('Confirmamos que tu cuenta de Fisquo se ha eliminado y ya no se puede entrar con ella.'), tr('Si eras la única persona de tu empresa, la empresa también se ha dado de baja: lo que la ley obliga a conservar queda bloqueado y se borra al acabar el plazo.'), tr('Si no lo has hecho tú, escríbenos cuanto antes respondiendo a este email.'), firma(tr)],
    }),
  },

  // — En nombre de la empresa (el texto lo escribe la empresa en Ajustes › Envío de facturas) —
  factura: {
    grupo: 'En nombre de la empresa', nombre: 'Factura a un cliente', marca: 'empresa',
    cuando: 'Al enviar una factura desde Fisquo y en cada factura recurrente con envío automático. Lleva el PDF adjunto y un botón al área del cliente (portal con todas sus facturas y presupuestos).',
    para: 'El cliente de la empresa (responder le escribe a la empresa)',
    ejemplo: { empresa: 'Estudio Martín', mensaje: 'Hola,\n\nTe adjunto la factura 2026-014 por 1.210,00 €, con vencimiento el 19 de noviembre de 2026.\n\nGracias,\nEstudio Martín', asunto: 'Factura 2026-014 de Estudio Martín', urlPortal: 'https://www.fisquo.com/portal/ejemplo' },
    crear: (d) => ({
      asunto: d.asunto, previa: '', libre: true, pie: '',
      bloques: [
        ...parrafos(d.mensaje),
        d.urlPago && { boton: { texto: PAGAR[d.idioma] || PAGAR.es, url: d.urlPago, sinEnlace: true } },
        d.urlPortal && { boton: { texto: (PORTAL[d.idioma] || PORTAL.es).boton, url: d.urlPortal, sinEnlace: true } },
        d.urlPortal && { nota: (PORTAL[d.idioma] || PORTAL.es).nota(d.empresa) },
      ],
    }),
  },
  presupuesto: {
    grupo: 'En nombre de la empresa', nombre: 'Presupuesto a un cliente', marca: 'empresa',
    cuando: 'Al enviar un presupuesto desde su pantalla o desde Fisquo por WhatsApp. Lleva el PDF adjunto y un botón para verlo y aceptarlo en línea.',
    para: 'El cliente de la empresa (responder le escribe a la empresa)',
    ejemplo: { empresa: 'Estudio Martín', numero: 'P2026-7', total: '1.089,00 €', validoHasta: '5 de diciembre de 2026', urlPresupuesto: 'https://www.fisquo.com/p/ejemplo' },
    crear: (d) => ({
      asunto: `Presupuesto ${d.numero} de ${d.empresa}`,
      previa: `Presupuesto por ${d.total}, válido hasta el ${d.validoHasta}.`,
      libre: true, pie: '',
      // mensaje: el que escribe la empresa al enviarlo; sin él, el texto de siempre.
      bloques: d.mensaje ? [
        ...parrafos(d.mensaje),
        d.urlPresupuesto && { boton: { texto: 'Ver y aceptar el presupuesto', url: d.urlPresupuesto, sinEnlace: true } },
      ] : [
        'Hola,',
        `Te enviamos el presupuesto **${d.numero}** por **${d.total}**, válido hasta el ${d.validoHasta}. Lo tienes adjunto en PDF.`,
        d.urlPresupuesto && { boton: { texto: 'Ver y aceptar el presupuesto', url: d.urlPresupuesto, sinEnlace: true } },
        'Para cualquier pregunta, contesta a este correo.',
        `Gracias,\n${d.empresa}`,
      ],
    }),
  },
  'recordatorio-cobro': {
    grupo: 'En nombre de la empresa', nombre: 'Recordatorio de factura vencida', marca: 'empresa',
    cuando: 'Cada X días tras el vencimiento de una factura sin cobrar, si la empresa activa los recordatorios en Ajustes.',
    para: 'El cliente de la empresa',
    ejemplo: { empresa: 'Estudio Martín', numero: '2026-014', total: '1.210,00 €', vencio: '19 de noviembre de 2026', iban: 'ES12 3456 7890 1234 5678 9012', bizum: '600 123 456' },
    crear: (d) => ({
      asunto: `Recordatorio: factura ${d.numero} pendiente de pago`,
      previa: `La factura ${d.numero} venció el ${d.vencio}.`,
      libre: true, pie: '',
      bloques: [
        'Hola,',
        `Te recordamos que la factura **${d.numero}** por **${d.total}** venció el ${d.vencio} y aún no nos consta el pago.`,
        // Sin IBAN (es opcional) no se habla de transferencia; con Bizum solo, va primero.
        d.iban && `Puedes pagarla por transferencia a **${d.iban}**, indicando la factura ${d.numero}.`,
        d.bizum && (d.iban ? `O por Bizum al **${d.bizum}**.` : `Puedes pagarla por Bizum al **${d.bizum}**, indicando la factura ${d.numero}.`),
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
      pie: '',
      bloques: [
        `Hola${d.gestor ? `, ${d.gestor}` : ''}:`,
        `Te mando el paquete del **${d.t}T de ${d.anio}** de ${d.empresa}${d.nif ? ` (NIF ${d.nif})` : ''}: facturas emitidas y recibidas, nóminas e impuestos del trimestre, en Excel y en PDF${d.justificantes ? ', con los justificantes de los gastos' : ''}.`,
        d.sinJustificantes && 'Los justificantes de los gastos no caben en el correo: pídemelos si los necesitas.',
        `Un saludo,\n${d.empresa}`,
      ],
    }),
  },

  // — Para el equipo de Fisquo —
  'solicitud-acceso': {
    grupo: 'Para el equipo de Fisquo', nombre: 'Nueva solicitud desde la web', interno: true,
    cuando: 'Cuando alguien rellena el formulario de contacto de la web pública.',
    para: `${SOPORTE} (responder le escribe a quien pide acceso)`,
    ejemplo: { datos: [['Nombre', 'Laura Martín'], ['Email', 'laura@ejemplo.es'], ['Empresa', 'Estudio Martín'], ['Mensaje', 'Me interesa el plan Pro.']], nombre: 'Laura Martín', empresa: 'Estudio Martín' },
    crear: (d) => ({ asunto: `Nueva solicitud de acceso: ${linea(d.nombre)}${d.empresa ? ` (${linea(d.empresa)})` : ''}`, bloques: ['Alguien ha pedido acceso a Fisquo desde la web.', { datos: d.datos }, { nota: 'Responde a este email para escribirle directamente.' }] }),
  },
  soporte: {
    grupo: 'Para el equipo de Fisquo', nombre: 'Mensaje de ayuda', interno: true,
    cuando: 'Cuando alguien con sesión escribe desde Ajustes › Ayuda y contacto.',
    para: `${SOPORTE} (responder le escribe a la persona)`,
    ejemplo: { tema: 'Facturas', empresa: 'Estudio Martín', datos: [['Persona', 'Laura <laura@ejemplo.es>'], ['Empresa', 'Estudio Martín'], ['Plan', 'aut Pro'], ['Tema', 'Facturas']], mensaje: 'No sé cómo poner el IRPF en una factura.' },
    crear: (d) => ({ asunto: linea(`[Ayuda] ${d.tema} · ${d.empresa}`), bloques: [{ datos: d.datos }, ...parrafos(d.mensaje)] }),
  },
};

// { asunto, html, texto } de un correo del catálogo con sus datos. idioma: el de quien lo recibe (lib/i18n.js), en los
// correos de Fisquo a una persona de la app; los que van en nombre de la empresa y los internos, siempre en castellano
// (las facturas ya llevan el idioma de su cliente, lib/idiomas.js).
export function componer(id, datos = {}, { pixel, idioma } = {}) {
  const c = CORREOS[id];
  if (!c) throw new Error(`No existe el correo «${id}»`);
  const lengua = c.marca === 'empresa' || c.interno || !idiomaAppValido(idioma) ? 'es' : idioma;
  const tr = traductor(diccionario(lengua), lengua);
  const r = c.crear(datos, tr, lengua);
  const marca = c.marca === 'empresa' ? linea(datos.empresa) || 'Fisquo' : 'Fisquo';
  const pie = r.pie ?? (c.interno ? '' : pieFisquo(tr));
  const asunto = linea(r.asunto).slice(0, 200);
  return { asunto, html: marco({ marca, fisquo: c.marca !== 'empresa', previa: r.previa, bloques: r.bloques, pie, libre: r.libre, pixel, idioma: lengua, tr }), texto: textoPlano({ bloques: r.bloques, pie }) };
}

// Envía un correo del catálogo. Los de Fisquo, si no se dice otra cosa, se responden al equipo de soporte.
// Devuelve lo mismo que enviarEmail: { id } o { error }; nunca lanza.
export async function enviarCorreo(id, { para, datos, responderA, adjuntos, pixel, asunto, idioma } = {}) {
  try {
    const c = componer(id, datos, { pixel, idioma });
    const fisquo = CORREOS[id].marca !== 'empresa' && !CORREOS[id].interno;
    return await enviarEmail({
      para, asunto: asunto ? linea(asunto).slice(0, 200) : c.asunto, html: c.html, texto: c.texto, etiqueta: id,
      responderA: responderA || (fisquo ? soporte() : undefined), adjuntos,
    });
  } catch (e) { console.error('[email] No se ha podido enviar:', e); return { error: 'No se ha podido enviar el email. Inténtalo de nuevo en unos minutos.' }; }
}

// Para el panel: el catálogo sin funciones, con la vista previa de cada correo.
export const catalogo = () => Object.entries(CORREOS).map(([id, c]) => ({ id, grupo: c.grupo, nombre: c.nombre, cuando: c.cuando, para: c.para, ...componer(id, c.ejemplo) }));
