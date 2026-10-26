// PDF de las cuentas anuales (modelo de pymes): portada, balance, pérdidas y ganancias, cambios en el patrimonio neto,
// memoria, formulación por los administradores y certificado de aprobación para el Registro Mercantil.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { limpio } from './pdf.js';
import { fechaCorta } from './formato.js';
import { ESTRUCTURA_BALANCE, LINEAS_PYG, SECCIONES } from './cuentasAnuales.js';

const TINTA = rgb(0.09, 0.125, 0.114), GRIS = rgb(0.42, 0.45, 0.435), RAYA = rgb(0.867, 0.886, 0.875), FONDO = rgb(0.933, 0.953, 0.945);
const num = (n) => (n ? new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : '-');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const largaFecha = (f) => (f ? `${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]} de ${f.slice(0, 4)}` : '____ de __________ de ____');

// d: { anio, empresa: { nombre, nif, domicilio }, datos: { administradores, registro, formulacion, junta }, modelo, bal: [n, n-1], pyg: [n, n-1], ecpn, memoria }
export async function cuentasAnualesPdf(d) {
  const doc = await PDFDocument.create();
  doc.setTitle(limpio(`Cuentas anuales ${d.anio} ${d.empresa.nombre}`));
  doc.setCreator(''); doc.setProducer('');
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 48;
  let p, y;
  const nueva = () => { p = doc.addPage([W, H]); y = H - M; pie(); };
  const pie = () => p.drawText(limpio(`${d.empresa.nombre} · NIF ${d.empresa.nif} · Cuentas anuales del ejercicio ${d.anio}`), { x: M, y: 24, size: 7, font: R, color: GRIS });
  const ancho = (s, f = R, z = 9) => f.widthOfTextAtSize(limpio(s), z);
  const txt = (s, x, yy, { font = R, size = 9, color = TINTA } = {}) => p.drawText(limpio(s), { x, y: yy, font, size, color });
  const sitio = (h) => { if (y - h < M) nueva(); };
  const lineas = (s, max, f = R, z = 9) => {
    const out = [];
    for (const parrafo of String(s).split('\n')) {
      let l = '';
      for (const w of parrafo.split(' ')) { const t = l ? `${l} ${w}` : w; if (ancho(t, f, z) > max && l) { out.push(l); l = w; } else l = t; }
      out.push(l);
    }
    return out;
  };
  const parrafo = (s, { size = 9, font = R, gap = 6 } = {}) => { for (const l of lineas(s, W - 2 * M, font, size)) { sitio(size + 4); txt(l, M, y, { font, size }); y -= size + 4; } y -= gap; };
  const titulo = (s) => { sitio(40); txt(s, M, y, { font: B, size: 13 }); y -= 22; };
  const cab = (cols) => {
    sitio(18);
    p.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 16, color: FONDO });
    cols.forEach(([t, x, der]) => txt(t, der ? x - ancho(t, B, 8) : x, y, { font: B, size: 8 }));
    y -= 17;
  };
  // Fila de importes: texto con sangría y dos columnas a la derecha.
  const C1 = W - M - 92, C2 = W - M;
  const fila = (t, a, b, { nivel = 0, negrita = false } = {}) => {
    const f = negrita ? B : R;
    const ls = lineas(t, C1 - 80 - M - nivel * 10, f, 8.5);
    sitio(ls.length * 11 + 3);
    ls.forEach((l, i) => txt(l, M + nivel * 10, y - i * 11, { font: f, size: 8.5 }));
    for (const [v, x] of [[a, C1], [b, C2]]) if (v !== undefined) { const s = num(v); txt(s, x - ancho(s, f, 8.5), y, { font: f, size: 8.5 }); }
    y -= ls.length * 11 + 2;
    p.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.3, color: RAYA });
  };

  // Portada.
  nueva();
  y = H - 230;
  txt('CUENTAS ANUALES', M, y, { font: B, size: 24 }); y -= 30;
  txt(`Ejercicio cerrado el 31 de diciembre de ${d.anio}`, M, y, { size: 13 }); y -= 50;
  for (const [k, v] of [['Sociedad', d.empresa.nombre], ['NIF', d.empresa.nif], ['Domicilio social', d.empresa.domicilio], ['Datos registrales', d.datos.registro || '—'], ['Modelo', `Plan General de Contabilidad de Pymes (${d.modelo.nombre})`], ['Formuladas el', d.datos.formulacion ? fechaCorta(d.datos.formulacion) : '—']]) {
    txt(k, M, y, { size: 9, color: GRIS }); y -= 13;
    for (const l of lineas(v || '—', W - 2 * M, B, 11)) { txt(l, M, y, { font: B, size: 11 }); y -= 15; }
    y -= 6;
  }

  // Balance.
  const pinta = (nodos, i, nivel = 0) => {
    for (const n of nodos) {
      const a = d.bal[0].v[n.id] || 0, b = d.bal[1].v[n.id] || 0;
      if (!a && !b && nivel > 0) continue;
      fila(n.t, a, b, { nivel, negrita: nivel === 0 || Boolean(n.hijos) && nivel < 2 });
      if (n.hijos) pinta(n.hijos, i, nivel + 1);
    }
  };
  nueva();
  titulo(`Balance de pymes al 31 de diciembre de ${d.anio}`);
  cab([['ACTIVO', M], [String(d.anio), C1, true], [String(d.anio - 1), C2, true]]);
  pinta(ESTRUCTURA_BALANCE.activo);
  fila('TOTAL ACTIVO (A + B)', d.bal[0].activo, d.bal[1].activo, { negrita: true });
  y -= 14;
  cab([['PATRIMONIO NETO Y PASIVO', M], [String(d.anio), C1, true], [String(d.anio - 1), C2, true]]);
  pinta(ESTRUCTURA_BALANCE.pasivo);
  fila('TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)', d.bal[0].pasivo, d.bal[1].pasivo, { negrita: true });

  // Pérdidas y ganancias.
  nueva();
  titulo(`Cuenta de pérdidas y ganancias de pymes del ejercicio ${d.anio}`);
  cab([['', M], [String(d.anio), C1, true], [String(d.anio - 1), C2, true]]);
  const [a, b] = d.pyg;
  // Las líneas del modelo PYMES (lib/cuentasAnuales.js LINEAS_PYG), con sus subapartados a), b), c) un nivel más adentro.
  for (const l of LINEAS_PYG) {
    if (l.id === 13) fila('A) RESULTADO DE EXPLOTACIÓN (1 a 12)', a.A, b.A, { negrita: true });
    if (l.id === 19) { fila('B) RESULTADO FINANCIERO (13 a 18)', a.B, b.B, { negrita: true }); fila('C) RESULTADO ANTES DE IMPUESTOS (A + B)', a.C, b.C, { negrita: true }); }
    if (a.v[l.id] || b.v[l.id] || [1, 6, 7, 8].includes(l.id)) fila(l.t, a.v[l.id], b.v[l.id], { nivel: String(l.id).includes('.') ? 2 : 1 });
  }
  fila('D) RESULTADO DEL EJERCICIO (C + 19)', a.D, b.D, { negrita: true });

  // Cambios en el patrimonio neto.
  nueva();
  titulo(`Estado de cambios en el patrimonio neto del ejercicio ${d.anio}`);
  const COLS = [['capital', 'Capital'], ['reservas', 'Reservas y prima'], ['anteriores', 'Result. ej. anteriores'], ['aportaciones', 'Otras aport. / div. a cuenta'], ['resultado', 'Resultado ejercicio'], ['subvenciones', 'Subvenciones'], ['total', 'TOTAL']];
  const x0 = M + 150, paso = (W - M - x0) / COLS.length;
  sitio(30);
  COLS.forEach(([, t], i) => lineas(t, paso - 4, B, 7).forEach((l, j) => txt(l, x0 + i * paso + paso - 2 - ancho(l, B, 7), y - j * 9, { font: B, size: 7 })));
  y -= 24;
  for (const [t, k, neg] of [[`Saldo a 31-12-${d.anio - 1}`, 'inicial', true], ['I. Total ingresos y gastos reconocidos', 'reconocidos'], ['II. Operaciones con socios o propietarios', 'socios'], ['III. Otras variaciones del patrimonio neto', 'otras'], [`Saldo a 31-12-${d.anio}`, 'final', true]]) {
    sitio(14);
    const f = neg ? B : R;
    lineas(t, 145, f, 7.5).forEach((l, j) => txt(l, M, y - j * 9, { font: f, size: 7.5 }));
    COLS.forEach(([c], i) => { const s = num(d.ecpn[k][c] || 0); txt(s, x0 + i * paso + paso - 2 - ancho(s, f, 7.5), y, { font: f, size: 7.5 }); });
    y -= 20;
    p.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.3, color: RAYA });
  }
  y -= 6;
  parrafo('Otras variaciones recoge la distribución del resultado del ejercicio anterior entre las partidas del patrimonio neto.', { size: 8 });

  // Memoria.
  nueva();
  titulo(`Memoria de pymes del ejercicio ${d.anio}`);
  for (const [n, t] of SECCIONES) {
    sitio(40);
    txt(`${n}. ${t}`, M, y, { font: B, size: 10 }); y -= 15;
    parrafo(d.memoria[n] || '', { size: 9, gap: 10 });
  }

  // Formulación.
  sitio(160); y -= 10;
  titulo('Formulación de las cuentas anuales');
  parrafo(`El órgano de administración de ${d.empresa.nombre} formula, en fecha ${largaFecha(d.datos.formulacion)}, las cuentas anuales del ejercicio cerrado el 31 de diciembre de ${d.anio}, que comprenden el balance, la cuenta de pérdidas y ganancias, el estado de cambios en el patrimonio neto y la memoria precedentes.`);
  y -= 30;
  for (const adm of String(d.datos.administradores || 'Administrador').split('\n').filter(Boolean)) { sitio(50); p.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + 200, y: y + 12 }, thickness: 0.5, color: TINTA }); txt(adm, M, y, { size: 9 }); y -= 44; }

  // Certificado de aprobación.
  nueva();
  titulo('Certificado del acuerdo de aprobación de las cuentas anuales');
  const adm = String(d.datos.administradores || '').split('\n').filter(Boolean)[0] || '[nombre y cargo del administrador]';
  parrafo(`${adm}, de la sociedad ${d.empresa.nombre}, con NIF ${d.empresa.nif}${d.datos.registro ? `, inscrita en el ${d.datos.registro}` : ''},`);
  parrafo('CERTIFICA:', { font: B });
  parrafo(`Que la Junta General de socios, celebrada con carácter universal (o debidamente convocada) en el domicilio social el ${largaFecha(d.datos.junta)}, aprobó por unanimidad las cuentas anuales del ejercicio cerrado el 31 de diciembre de ${d.anio}, formuladas el ${largaFecha(d.datos.formulacion)}, así como la propuesta de aplicación del resultado: ${String(d.memoria[3] || '').replace(/^Propuesta de aplicación del resultado\.\s*/, '')}`);
  parrafo('Que las cuentas anuales que se depositan coinciden con las auditadas, en su caso, y con las aprobadas por la Junta. Que la sociedad no está obligada a someter sus cuentas a auditoría.');
  parrafo(`Y para que conste, a efectos de su depósito en el Registro Mercantil, expide el presente certificado en ${d.empresa.ciudad || '__________'}, a ${largaFecha(d.datos.junta)}.`);
  y -= 40;
  p.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + 200, y: y + 12 }, thickness: 0.5, color: TINTA });
  txt(adm, M, y, { size: 9 });
  return Buffer.from(await doc.save());
}
