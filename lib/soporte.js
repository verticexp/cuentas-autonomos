// Ayuda y contacto: temas del formulario (components/Ayuda.js y app/api/soporte), preguntas frecuentes, horario del
// equipo y la conversación con el asistente de soporte (lib/soporteServidor.js, app/api/soporte/chat).
export const TEMAS_SOPORTE = ['Duda', 'Algo no funciona', 'Idea o sugerencia', 'Mi plan o mi factura de Fisquo'];

// Preguntas frecuentes: cortas y con el camino en la app. href: dónde se hace.
export const PREGUNTAS = [
  { p: '¿Cómo hago una factura?', r: 'Pulsa el «+» y elige «Nueva factura». Elige el cliente (o créalo ahí mismo), añade las líneas y emítela: el IVA y la retención salen solos según tu actividad.', href: '/facturas/nueva', ir: 'Nueva factura' },
  { p: 'Me he equivocado en una factura ya emitida', r: 'Hacienda no deja cambiar ni borrar una factura enviada: abre la factura y pulsa «Rectificar». Fisquo crea la rectificativa (serie R) con su número.', href: '/facturas', ir: 'Ir a Facturas' },
  { p: '¿Cómo apunto un gasto o un ticket?', r: 'En Gastos, haz una foto del ticket o sube el PDF: Fisquo lee el proveedor, la fecha, la base y el IVA. Revisa y guarda. Con «Varios tickets» los subes de golpe.', href: '/gastos', ir: 'Ir a Gastos' },
  { p: '¿Qué impuestos me tocan y cuándo?', r: 'En Impuestos ves cada modelo (303, 130, 111, 115…) con su importe calculado y su plazo. Los plazos también te llegan como aviso al móvil si los activas.', href: '/modelos', ir: 'Ver impuestos' },
  { p: '¿Qué es Verifactu y tengo que activarlo?', r: 'Es el sistema de Hacienda para que cada factura quede registrada y lleve un código QR. Actívalo en Ajustes › Verifactu; puedes probarlo antes en modo pruebas.', href: '/ajustes/verifactu', ir: 'Verifactu' },
  { p: '¿Cómo le paso las cuentas a mi gestoría?', r: 'En Ajustes › Tu gestoría puedes mandarle el paquete de cada trimestre (Excel, PDF y justificantes) o invitarla a Fisquo con su propio usuario.', href: '/ajustes/gestoria', ir: 'Tu gestoría' },
  { p: 'Vengo de otro programa o de un Excel', r: 'En Ajustes › Importar datos subes clientes, facturas, gastos y productos desde Holded o desde un Excel. Si ya llevabas numeración este año, sigue con ella en Series y numeración.', href: '/ajustes/importar', ir: 'Importar datos' },
  { p: '¿Cómo cobro con tarjeta o Bizum?', r: 'El pago con tarjeta desde la factura llegará pronto. Mientras, en Ajustes › Cobros pones tu cuenta, tu Bizum y otras formas de pago para que salgan en cada factura, y al cobrar la marcas como cobrada (o se empareja sola con el extracto del banco).', href: '/ajustes/cobros', ir: 'Cobros' },
  { p: '¿Quién más puede entrar en mi empresa?', r: 'En Ajustes › Usuarios y permisos invitas a quien quieras y eliges qué ve: facturar, gastos, nóminas… Cada persona entra con su email.', href: '/usuarios', ir: 'Usuarios' },
  { p: '¿Puedo llevarme mis datos?', r: 'Sí, cuando quieras: en Ajustes › Descargar todos los datos tienes un .zip con todo. Tus datos son tuyos.', href: null },
];

// Horario de atención de personas: de lunes a sábado, de 9:00 a 22:00 (hora de Madrid). Fuera de él responde el asistente
// y lo que no resuelva queda como incidencia para la siguiente apertura.
export const HORARIO = { dias: [1, 2, 3, 4, 5, 6], abre: 9, cierra: 22 };
export const TEXTO_HORARIO = 'De lunes a sábado, de 9:00 a 22:00';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Día de la semana y hora (decimal) en Madrid.
function enMadrid(d) {
  const [fecha, hora] = d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ');
  const [h, m] = hora.split(':').map(Number);
  return { dia: new Date(`${fecha}T12:00:00Z`).getUTCDay(), hora: h + m / 60 };
}

export function enHorario(d = new Date(), h = HORARIO) {
  const { dia, hora } = enMadrid(d);
  return h.dias.includes(dia) && hora >= h.abre && hora < h.cierra;
}

// Cuándo vuelve a haber alguien, para el aviso: «hoy a las 9:00», «mañana a las 9:00», «el lunes a las 9:00».
export function proximaApertura(d = new Date(), h = HORARIO) {
  if (enHorario(d, h)) return 'ahora';
  const { dia, hora } = enMadrid(d);
  for (let n = 0; n < 8; n++) {
    const dd = (dia + n) % 7;
    if (!h.dias.includes(dd) || (n === 0 && hora >= h.abre)) continue;
    const a = `a las ${h.abre}:00`;
    return n === 0 ? `hoy ${a}` : n === 1 ? `mañana ${a}` : `el ${DIAS[dd]} ${a}`;
  }
  return 'en cuanto podamos';
}

// --- Conversación de soporte (una abierta por persona) ---
// estado: 'ia' (responde el asistente), 'persona' (pasada al equipo: el asistente calla), 'cerrada'.
export const MAX_MENSAJE = 2000;
export const MAX_MENSAJES = 80;

export const nuevaConversacion = (u, ahora = new Date().toISOString()) => ({
  id: String(u.id), usuario: String(u.id), nombre: u.nombre || '', email: u.email || '', empresa: u.empresa || '', empresaNombre: u.empresaNombre || '',
  estado: 'ia', mensajes: [], creada: ahora, actualizada: ahora,
});

// de: 'cliente' | 'ia' | 'equipo'. Guarda los últimos MAX_MENSAJES.
export function anadir(c, de, texto, ahora = new Date().toISOString()) {
  const t = String(texto || '').trim().slice(0, MAX_MENSAJE);
  if (!t) return c;
  return { ...c, mensajes: [...c.mensajes, { de, texto: t, t: ahora }].slice(-MAX_MENSAJES), actualizada: ahora, ...(de === 'cliente' ? { leidaEquipo: false } : {}), ...(de === 'equipo' ? { leidaCliente: false } : {}) };
}

export const pasarAPersona = (c, motivo, ahora = new Date().toISOString()) => (c.estado === 'persona' ? c : { ...c, estado: 'persona', motivo: String(motivo || '').slice(0, 300), pasada: ahora, leidaEquipo: false });

// Historial para la IA: solo los turnos de cliente y asistente, alternados como pide la API (los seguidos se juntan).
export function historialIA(c, max = 12) {
  const out = [];
  for (const m of c.mensajes.slice(-max)) {
    const role = m.de === 'cliente' ? 'user' : 'assistant';
    if (out.at(-1)?.role === role) out.at(-1).content += `\n${m.texto}`;
    else out.push({ role, content: m.texto });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

// Lo que ve el cliente (sin datos internos como el motivo).
export const vistaCliente = (c) => c && { estado: c.estado, mensajes: c.mensajes, actualizada: c.actualizada };

// ¿Hay que avisar al equipo? Al pasarla y, después, si el cliente vuelve a escribir y hace más de 30 min del último aviso.
export const avisarEquipo = (c, ahora = Date.now()) => c.estado === 'persona' && (!c.avisada || ahora - Date.parse(c.avisada) > 30 * 60000);
